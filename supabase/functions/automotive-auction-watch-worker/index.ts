import {createClient} from "npm:@supabase/supabase-js@2.110.8";
import {matchesWatchCriteria,predictHammerPrice,type AuctionOutcome} from "../../../src/modules/automotive/auction-learning.ts";
import {searchAuctionProvider,searchAuctionProvidersWithFailover,type NormalizedAuctionLot} from "../../../src/modules/automotive/auction-providers.ts";

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});}
function db(){
  const url=Deno.env.get("SUPABASE_URL")??"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  if(!url||!key)throw new Error("Service database is not configured");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function watchTenants(client:any,requested:unknown){
  const explicit=String(requested??"");
  if(/^[0-9a-f-]{36}$/i.test(explicit)){
    const allowed=await client.from("tenant_products").select("tenant_id").eq("tenant_id",explicit).eq("product_key","autohashi")
      .in("status",["requested","provisioning","active"]).maybeSingle();
    if(allowed.error)throw allowed.error;
    if(!allowed.data)throw new Error("Requested tenant is not an enabled AutoHashi tenant");
    return [explicit];
  }
  const mapped=await client.from("tenant_products").select("tenant_id").eq("product_key","autohashi")
    .in("status",["requested","provisioning","active"]).not("external_tenant_id","is",null).limit(50);
  if(mapped.error)throw mapped.error;
  const ids=[...new Set((mapped.data??[]).map((row:any)=>String(row.tenant_id)).filter(Boolean))];
  if(ids.length)return ids;
  const fallback=Deno.env.get("AUTOHASHI_OMNIQORA_TENANT_ID")??"";
  return /^[0-9a-f-]{36}$/i.test(fallback)?[fallback]:[];
}
function auth(req:Request){
  const expected=Deno.env.get("AUTOHASHI_AUCTION_WATCH_WORKER_SECRET")??"";
  return expected.length>=32&&(req.headers.get("x-autohashi-watch-secret")??"")===expected;
}
type Provider={providerKey:"vehicle.auction.thecarapi"|"vehicle.auction.carstack";secret:string};
function providers():Provider[]{
  const rows:Provider[]=[];
  const a=Deno.env.get("THECARAPI_API_KEY")??"",b=Deno.env.get("CARSTACK_API_TOKEN")??"";
  if(a)rows.push({providerKey:"vehicle.auction.thecarapi",secret:a});
  if(b)rows.push({providerKey:"vehicle.auction.carstack",secret:b});
  return rows;
}
function choose(preference:string){
  const rows=providers();if(!rows.length)throw new Error("No Japanese auction read provider is configured");
  if(preference==="auto")return rows;
  const one=rows.find(r=>r.providerKey===preference);if(!one)throw new Error("Preferred auction provider is not configured");
  return [one];
}
async function upsertLot(client:any,tenantId:string,lot:NormalizedAuctionLot){
  let vehicle:any=null;
  if(lot.chassisNumber){
    const found=await client.from("automotive_vehicles").select("*").eq("tenant_id",tenantId).eq("product_key","autohashi")
      .eq("chassis_number",lot.chassisNumber).limit(1).maybeSingle();
    if(found.error)throw found.error;vehicle=found.data;
    if(!vehicle){
      const created=await client.from("automotive_vehicles").insert({
        tenant_id:tenantId,product_key:"autohashi",origin:"japan",chassis_number:lot.chassisNumber,model_code:lot.modelCode,
        make:lot.make,model:lot.model,specification:{year:lot.year,grade:lot.grade,odometerKm:lot.odometerKm},
        provenance:{sourceProvider:lot.providerKey,sourceSite:lot.sourceSite,firstExternalLotId:lot.externalLotId},status:"active"
      }).select("*").single();
      if(created.error)throw created.error;vehicle=created.data;
    }
  }
  const saved=await client.from("automotive_auction_lots").upsert({
    tenant_id:tenantId,product_key:"autohashi",vehicle_id:vehicle?.id??null,provider_key:lot.providerKey,external_lot_id:lot.externalLotId,
    auction_house:lot.auctionHouse,auction_at:lot.auctionAt,status:lot.status==="ended"?"ended":"open",grade:lot.grade,odometer_km:lot.odometerKm,
    starting_price_minor:lot.startingPriceMinor,current_price_minor:lot.currentPriceMinor,currency:lot.currency,
    auction_sheet:{...lot.auctionSheet,priceSemantics:lot.priceSemantics,provenance:lot.provenance,make:lot.make,model:lot.model,year:lot.year,
      chassisNumber:lot.chassisNumber,modelCode:lot.modelCode,finalPriceMinor:lot.finalPriceMinor},
    images:lot.images,updated_at:new Date().toISOString()
  },{onConflict:"tenant_id,provider_key,external_lot_id"}).select("*").single();
  if(saved.error)throw saved.error;
  const observed=await client.from("automotive_auction_observations").upsert({
    tenant_id:tenantId,product_key:"autohashi",auction_lot_id:saved.data.id,vehicle_id:vehicle?.id??null,provider_key:lot.providerKey,
    external_lot_id:lot.externalLotId,source_site:lot.sourceSite,source_vehicle_id:lot.sourceVehicleId,chassis_number:lot.chassisNumber,
    model_code:lot.modelCode,make:lot.make,model:lot.model,model_year:lot.year,auction_house:lot.auctionHouse,auction_at:lot.auctionAt,status:lot.status,
    grade:lot.grade,odometer_km:lot.odometerKm,starting_price_minor:lot.startingPriceMinor,current_price_minor:lot.currentPriceMinor,
    final_price_minor:lot.finalPriceMinor,currency:lot.currency,price_semantics:lot.priceSemantics,
    source_ref:lot.providerKey+":"+lot.externalLotId,observed_at:lot.observedAt
  },{onConflict:"tenant_id,provider_key,external_lot_id,observed_at"});
  if(observed.error)throw observed.error;
  return {lot:saved.data,vehicle};
}
async function prediction(client:any,tenantId:string,lot:NormalizedAuctionLot,lotId:string){
  const outcomes=await client.from("automotive_auction_price_outcomes").select("*").eq("tenant_id",tenantId)
    .eq("make",lot.make).eq("model",lot.model).order("outcome_at",{ascending:false}).limit(1000);
  if(outcomes.error)throw outcomes.error;
  const rows:AuctionOutcome[]=(outcomes.data??[]).map((r:any)=>({
    make:r.make,model:r.model,modelCode:r.model_code,year:r.model_year,grade:r.grade,mileageKm:r.mileage_km,
    hammerJpy:Number(r.hammer_jpy),outcomeAt:r.outcome_at
  }));
  const target={make:lot.make,model:lot.model,modelCode:lot.modelCode,year:lot.year,grade:lot.grade,mileageKm:lot.odometerKm};
  const result=predictHammerPrice({target,outcomes:rows});
  if(result.predictedHammerJpy!==null){
    let curveQuery=client.from("automotive_auction_price_curves").select("*").eq("tenant_id",tenantId).eq("make",lot.make).eq("model",lot.model)
      .eq("method",result.method).gte("as_of",new Date(Date.now()-24*60*60*1000).toISOString()).order("as_of",{ascending:false}).limit(1);
    curveQuery=lot.modelCode?curveQuery.eq("model_code",lot.modelCode):curveQuery.is("model_code",null);
    const recentCurve=await curveQuery.maybeSingle();if(recentCurve.error)throw recentCurve.error;
    const same=recentCurve.data&&Number(recentCurve.data.median_jpy)===Number(result.predictedHammerJpy)&&
      Number(recentCurve.data.p25_jpy)===Number(result.lowJpy)&&Number(recentCurve.data.p75_jpy)===Number(result.highJpy)&&
      Number(recentCurve.data.sample_count)===Number(result.sampleCount);
    if(!same){
      const curve=await client.from("automotive_auction_price_curves").insert({
        tenant_id:tenantId,product_key:"autohashi",make:lot.make,model:lot.model,model_code:lot.modelCode,
        model_year:lot.year,grade:lot.grade,mileage_band_km:typeof lot.odometerKm==="number"?Math.floor(lot.odometerKm/20000)*20000:null,
        method:result.method,sample_count:result.sampleCount,p25_jpy:result.lowJpy,median_jpy:result.predictedHammerJpy,p75_jpy:result.highJpy,
        confidence:result.confidence,source_window_days:730,metadata:{auctionLotId:lotId,watchWorker:true}
      });
      if(curve.error)throw curve.error;
    }
  }
  const latest=await client.from("automotive_auction_price_predictions").select("*").eq("tenant_id",tenantId).eq("auction_lot_id",lotId)
    .eq("status","predicted").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(latest.error)throw latest.error;
  if(latest.data&&Number(latest.data.predicted_hammer_jpy??-1)===Number(result.predictedHammerJpy??-1)&&latest.data.method===result.method)return latest.data;
  await client.from("automotive_auction_price_predictions").update({status:"superseded"}).eq("tenant_id",tenantId).eq("auction_lot_id",lotId).eq("status","predicted");
  const saved=await client.from("automotive_auction_price_predictions").insert({
    tenant_id:tenantId,product_key:"autohashi",auction_lot_id:lotId,prediction_version:"hierarchical-median-v1",
    predicted_hammer_jpy:result.predictedHammerJpy,low_jpy:result.lowJpy,high_jpy:result.highJpy,
    sample_count:result.sampleCount,confidence:result.confidence,method:result.method,context:{target:{make:lot.make,model:lot.model,modelCode:lot.modelCode,year:lot.year,grade:lot.grade,mileageKm:lot.odometerKm}}
  }).select("*").single();
  if(saved.error)throw saved.error;return saved.data;
}
async function latestDecision(client:any,tenantId:string,lotId:string){
  const r=await client.from("automotive_auction_decisions").select("*").eq("tenant_id",tenantId).eq("auction_lot_id",lotId)
    .neq("status","superseded").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(r.error)throw r.error;return r.data;
}
function watchEvidenceScore(decision:any){
  const s=decision?.subscores??{};
  if(typeof s.condition!=="number"||typeof s.provenance!=="number"||typeof s.evidence!=="number")return null;
  return Math.round(s.condition*.45+s.provenance*.4+s.evidence*.15);
}
async function ensureIntelligence(client:any,tenantId:string,lot:any,vehicle:any){
  if(!vehicle?.id)return null;
  const existing=await client.from("intelligence_jobs").select("*").eq("tenant_id",tenantId).eq("job_type","automotive.auction_assessment")
    .filter("input->>auctionLotId","eq",lot.id).in("status",["queued","processing","waiting_review"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(existing.error)throw existing.error;if(existing.data)return existing.data;
  const job=await client.from("intelligence_jobs").insert({
    tenant_id:tenantId,product_key:"autohashi",job_type:"automotive.auction_assessment",subject_type:"vehicle",subject_id:vehicle.id,priority:"normal",
    input:{vehicleId:vehicle.id,auctionLotId:lot.id,providerKey:lot.provider_key,externalLotId:lot.external_lot_id,
      goals:["auction_sheet_interpretation","damage_map","provenance","mileage_consistency","watch_rule_qualification"]},
    requirements:{service:"omniqora.automotive",visionAllowed:true,reviewRequired:true,noGeolocation:true,failClosedOnMissingProviderEvidence:true}
  }).select("*").single();
  if(job.error)throw job.error;return job.data;
}
function filters(criteria:any){
  return {
    make:criteria.make??null,model:criteria.model??null,yearMin:criteria.yearMin??null,yearMax:criteria.yearMax??null,
    odometerMaxKm:criteria.odometerMaxKm??null,grade:null,steering:"rhd" as const,page:1,pageSize:50
  };
}
async function runRule(client:any,tenantId:string,rule:any){
  const criteria=rule.criteria??{},max=Math.min(200,Math.max(1,Number(rule.max_results_per_run??50))),candidates=choose(rule.provider_preference??"auto");
  const lots:NormalizedAuctionLot[]=[];let page=1,providerKey:string|null=null;
  while(lots.length<max){
    const pageSize=Math.min(50,max-lots.length);
    const result=rule.provider_preference==="auto"
      ? await searchAuctionProvidersWithFailover({candidates,filters:{...filters(criteria),page,pageSize}})
      : await searchAuctionProvider({providerKey:candidates[0].providerKey,secret:candidates[0].secret,filters:{...filters(criteria),page,pageSize}});
    providerKey=result.providerKey;lots.push(...result.lots);
    if(!result.lots.length||(result.totalPages!==null&&page>=result.totalPages))break;
    page++;
  }
  let qualified=0,pending=0,seen=0;
  for(const lot of lots.slice(0,max)){
    const basic={...criteria,minScore:null,maxPredictedHammerJpy:null};
    if(!matchesWatchCriteria(basic,{make:lot.make,model:lot.model,modelCode:lot.modelCode,year:lot.year,grade:lot.grade,odometerKm:lot.odometerKm,openingJpy:lot.startingPriceMinor??lot.currentPriceMinor}))continue;
    const saved=await upsertLot(client,tenantId,lot),pred=await prediction(client,tenantId,lot,saved.lot.id),decision=await latestDecision(client,tenantId,saved.lot.id);
    const evidenceScore=watchEvidenceScore(decision);
    const candidate={make:lot.make,model:lot.model,modelCode:lot.modelCode,year:lot.year,grade:lot.grade,odometerKm:lot.odometerKm,
      openingJpy:lot.startingPriceMinor??lot.currentPriceMinor,predictedHammerJpy:pred.predicted_hammer_jpy===null?null:Number(pred.predicted_hammer_jpy),score:evidenceScore};
    let stage="disqualified";
    if(typeof criteria.minScore==="number"&&!decision){
      await ensureIntelligence(client,tenantId,saved.lot,saved.vehicle);stage="pending_intelligence";pending++;
    }else if(matchesWatchCriteria(criteria,candidate)){stage="qualified";qualified++;}
    const matchKey=lot.providerKey+":"+lot.externalLotId;
    const match=await client.from("automotive_auction_watch_matches").upsert({
      tenant_id:tenantId,product_key:"autohashi",watch_rule_id:rule.id,auction_lot_id:saved.lot.id,match_key:matchKey,
      provider_key:lot.providerKey,external_lot_id:lot.externalLotId,stage,score:evidenceScore,recommendation:decision?.recommendation??null,
      predicted_hammer_jpy:pred.predicted_hammer_jpy,predicted_low_jpy:pred.low_jpy,predicted_high_jpy:pred.high_jpy,
      snapshot:{lot,prediction:{predictedHammerJpy:pred.predicted_hammer_jpy,lowJpy:pred.low_jpy,highJpy:pred.high_jpy,confidence:pred.confidence,method:pred.method},criteria,
        watchEvidenceScore:evidenceScore,fullDecisionScore:decision?.score??null},
      last_seen_at:new Date().toISOString()
    },{onConflict:"tenant_id,watch_rule_id,match_key"});
    if(match.error)throw match.error;seen++;
  }
  return {seen,qualified,pending,providerKey,pagesRead:page};
}
Deno.serve(async req=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  if(!auth(req))return json({error:"Watch worker authentication failed"},401);
  try{
    const client=db();let body:any={};try{body=await req.json();}catch{body={};}
    const tenantIds=await watchTenants(client,body.tenantId),outputs:any[]=[],manual=!!body.watchRuleId;
    for(const tenantId of tenantIds){
      let q=client.from("automotive_auction_watch_rules").select("*").eq("tenant_id",tenantId).eq("product_key","autohashi").eq("enabled",true);
      if(body.watchRuleId)q=q.eq("id",String(body.watchRuleId));
      const rules=await q.order("updated_at",{ascending:true}).limit(50);if(rules.error)throw rules.error;
      for(const rule of rules.data??[]){
        const now=new Date().toISOString();
        if(!manual&&rule.last_run_at){
          const age=Date.now()-new Date(rule.last_run_at).getTime();
          const minimum=rule.cadence==="daily"?20*60*60*1000:45*60*1000;
          if(age<minimum){outputs.push({tenantId,watchRuleId:rule.id,name:rule.name,ok:true,skipped:"not_due"});continue;}
        }
        try{
          const result=await runRule(client,tenantId,rule);
          await client.from("automotive_auction_watch_rules").update({last_run_at:now,last_success_at:now,last_error:null}).eq("id",rule.id);
          outputs.push({tenantId,watchRuleId:rule.id,name:rule.name,ok:true,...result});
        }catch(error){
          const message=error instanceof Error?error.message:String(error);
          await client.from("automotive_auction_watch_rules").update({last_run_at:now,last_error:message.slice(0,2000)}).eq("id",rule.id);
          outputs.push({tenantId,watchRuleId:rule.id,name:rule.name,ok:false,error:message});
        }
      }
    }
    return json({ok:true,tenants:tenantIds.length,processed:outputs.length,results:outputs});
  }catch(error){return json({error:error instanceof Error?error.message:String(error)},500);}
});
