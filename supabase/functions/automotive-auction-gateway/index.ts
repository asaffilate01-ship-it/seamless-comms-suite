import {createClient} from "npm:@supabase/supabase-js@2.110.8";
import {calculateJapanUkBidCost} from "../../../src/modules/automotive/landed-cost-v2.ts";
import {evaluateAuctionDecision,type AuctionComparable,type AuctionHistoryRow,type AuctionSheetExtraction} from "../../../src/modules/automotive/auction-intelligence.ts";
import {extractionDiff,matchesWatchCriteria,predictHammerPrice,type AuctionOutcome} from "../../../src/modules/automotive/auction-learning.ts";
import {
  auctionProviderReadiness,
  compareAuctionLotSamples,
  getAuctionProviderLot,
  searchAuctionProvider,
  searchAuctionProvidersWithFailover,
} from "../../../src/modules/automotive/auction-providers.ts";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type,x-oq-timestamp,x-oq-signature",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
};

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
}
function hex(bytes:ArrayBuffer){
  return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function hmac(secret:string,payload:string){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(payload)));
}
function constantTimeEqual(a:string,b:string){
  if(a.length!==b.length)return false;
  let diff=0; for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i); return diff===0;
}
async function verify(req:Request,raw:string){
  const secret=Deno.env.get("OQ_BRIDGE_AUTOHASHI_A")??"";
  if(secret.length<32)return {ok:false,error:"AutoHashi bridge secret is not configured"};
  const timestamp=req.headers.get("x-oq-timestamp")??"";
  const signature=req.headers.get("x-oq-signature")??"";
  const ts=Number(timestamp);
  if(!Number.isFinite(ts)||Math.abs(Date.now()-ts)>5*60*1000)return {ok:false,error:"Bridge timestamp is invalid or expired"};
  const expected=await hmac(secret,timestamp+"."+raw);
  if(!signature||!constantTimeEqual(expected,signature.toLowerCase()))return {ok:false,error:"Bridge signature is invalid"};
  return {ok:true as const};
}
type ReadProvider={providerKey:"vehicle.auction.thecarapi"|"vehicle.auction.carstack";secret:string};
function providerCandidates(requested:unknown):ReadProvider[]{
  const wanted=typeof requested==="string"?requested:"auto";
  const providers:ReadProvider[]=[];
  const theCar=Deno.env.get("THECARAPI_API_KEY")??"";
  const carStack=Deno.env.get("CARSTACK_API_TOKEN")??"";
  if(theCar)providers.push({providerKey:"vehicle.auction.thecarapi",secret:theCar});
  if(carStack)providers.push({providerKey:"vehicle.auction.carstack",secret:carStack});
  if(wanted==="auto"){
    if(!providers.length)throw new Error("No Japanese auction read provider is configured");
    return providers;
  }
  if(wanted!=="vehicle.auction.thecarapi"&&wanted!=="vehicle.auction.carstack")throw new Error("Unsupported auction read provider");
  const match=providers.find(provider=>provider.providerKey===wanted);
  if(!match)throw new Error((wanted==="vehicle.auction.thecarapi"?"TheCarAPI":"CarStack")+" is not configured");
  return [match];
}
function providerConfig(requested:unknown){return providerCandidates(requested)[0];}
function serviceDb(){
  const url=Deno.env.get("SUPABASE_URL")??"";
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  if(!url||!key)throw new Error("Omniqora service database is not configured");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function autohashiTenant(){
  const tenantId=Deno.env.get("AUTOHASHI_OMNIQORA_TENANT_ID")??"";
  if(!/^[0-9a-f-]{36}$/i.test(tenantId))throw new Error("AUTOHASHI_OMNIQORA_TENANT_ID is not configured");
  return tenantId;
}
async function importLot(lot:any){
  if(!lot||typeof lot!=="object"||!lot.providerKey||!lot.externalLotId||!lot.make||!lot.model)throw new Error("Normalized auction lot is required");
  const db=serviceDb(),tenantId=autohashiTenant(),productKey="autohashi";
  let vehicle:any=null;
  if(lot.chassisNumber){
    const found=await db.from("automotive_vehicles").select("*").eq("tenant_id",tenantId).eq("product_key",productKey).eq("chassis_number",String(lot.chassisNumber)).limit(1).maybeSingle();
    if(found.error)throw found.error;
    vehicle=found.data;
    if(!vehicle){
      const created=await db.from("automotive_vehicles").insert({
        tenant_id:tenantId,product_key:productKey,origin:"japan",chassis_number:String(lot.chassisNumber),model_code:lot.modelCode??null,
        make:String(lot.make),model:String(lot.model),specification:{year:lot.year??null,grade:lot.grade??null,odometerKm:lot.odometerKm??null},
        provenance:{sourceProvider:lot.providerKey,sourceSite:lot.sourceSite??null,firstExternalLotId:lot.externalLotId},status:"active"
      }).select("*").single();
      if(created.error)throw created.error;vehicle=created.data;
    }
  }
  const saved=await db.from("automotive_auction_lots").upsert({
    tenant_id:tenantId,product_key:productKey,vehicle_id:vehicle?.id??null,provider_key:String(lot.providerKey),external_lot_id:String(lot.externalLotId),
    auction_house:lot.auctionHouse??null,auction_at:lot.auctionAt??null,status:String(lot.status??"open")==="ended"?"ended":"open",
    grade:lot.grade??null,odometer_km:lot.odometerKm??null,starting_price_minor:lot.startingPriceMinor??null,current_price_minor:lot.currentPriceMinor??null,
    currency:lot.currency??"JPY",auction_sheet:{...(lot.auctionSheet??{}),priceSemantics:lot.priceSemantics??"unknown",provenance:lot.provenance??{},
      make:lot.make,model:lot.model,year:lot.year??null,chassisNumber:lot.chassisNumber??null,modelCode:lot.modelCode??null,finalPriceMinor:lot.finalPriceMinor??null},
    images:Array.isArray(lot.images)?lot.images:[],updated_at:new Date().toISOString()
  },{onConflict:"tenant_id,provider_key,external_lot_id"}).select("*").single();
  if(saved.error)throw saved.error;
  const observed=await db.from("automotive_auction_observations").upsert({
    tenant_id:tenantId,product_key:productKey,auction_lot_id:saved.data.id,vehicle_id:vehicle?.id??null,provider_key:String(lot.providerKey),
    external_lot_id:String(lot.externalLotId),source_site:lot.sourceSite??null,source_vehicle_id:lot.sourceVehicleId??null,chassis_number:lot.chassisNumber??null,
    model_code:lot.modelCode??null,make:String(lot.make),model:String(lot.model),model_year:lot.year??null,auction_house:lot.auctionHouse??null,
    auction_at:lot.auctionAt??null,status:String(lot.status??"open"),grade:lot.grade??null,odometer_km:lot.odometerKm??null,
    starting_price_minor:lot.startingPriceMinor??null,current_price_minor:lot.currentPriceMinor??null,final_price_minor:lot.finalPriceMinor??null,
    currency:lot.currency??"JPY",price_semantics:lot.priceSemantics??"unknown",source_ref:String(lot.providerKey)+":"+String(lot.externalLotId),
    observed_at:lot.observedAt??new Date().toISOString()
  },{onConflict:"tenant_id,provider_key,external_lot_id,observed_at"}).select("*").single();
  if(observed.error)throw observed.error;
  let job:any=null;
  if(vehicle?.id){
    const queued=await db.from("intelligence_jobs").insert({
      tenant_id:tenantId,product_key:productKey,job_type:"automotive.auction_assessment",subject_type:"vehicle",subject_id:vehicle.id,
      input:{vehicleId:vehicle.id,auctionLotId:saved.data.id,providerKey:lot.providerKey,externalLotId:lot.externalLotId,
        goals:["auction_sheet_interpretation","provenance","relisting_detection","mileage_consistency","valuation_factors","max_bid_review"]},
      requirements:{service:"omniqora.automotive",visionAllowed:true,reviewRequired:true,noGeolocation:true,failClosedOnMissingProviderEvidence:true}
    }).select("*").single();
    if(queued.error)throw queued.error;job=queued.data;
  }
  return {auctionLotId:saved.data.id,vehicleId:vehicle?.id??null,observationId:observed.data.id,intelligenceJobId:job?.id??null,intelligenceQueued:!!job};
}
async function history(chassisNumber:string,days=90){
  const db=serviceDb(),tenantId=autohashiTenant();
  const since=new Date(Date.now()-Math.min(3650,Math.max(1,days))*86400000).toISOString();
  const result=await db.from("automotive_auction_observations").select("*").eq("tenant_id",tenantId).eq("product_key","autohashi")
    .eq("chassis_number",chassisNumber).gte("observed_at",since).order("observed_at",{ascending:true}).limit(500);
  if(result.error)throw result.error;
  const rows=result.data??[];let previous:number|null=null,mileageRegression=false;
  for(const row of rows){if(typeof row.odometer_km==="number"){if(previous!==null&&row.odometer_km<previous)mileageRegression=true;previous=row.odometer_km;}}
  return {rows,flags:{relisted:rows.length>1,mileageRegression},days};
}


async function auctionIntelligenceContext(lotId:string){
  const db=serviceDb(),tenantId=autohashiTenant();
  const lot=await db.from("automotive_auction_lots").select("*").eq("tenant_id",tenantId).eq("product_key","autohashi").eq("id",lotId).single();
  if(lot.error)throw lot.error;
  let vehicle:any=null;
  if(lot.data.vehicle_id){
    const v=await db.from("automotive_vehicles").select("*").eq("tenant_id",tenantId).eq("id",lot.data.vehicle_id).maybeSingle();
    if(v.error)throw v.error;vehicle=v.data;
  }
  const chassis=vehicle?.chassis_number??lot.data.auction_sheet?.chassisNumber??null;
  let historyRows:any[]=[];
  if(chassis){
    const h=await db.from("automotive_auction_observations").select("*").eq("tenant_id",tenantId).eq("chassis_number",chassis).order("observed_at",{ascending:true}).limit(500);
    if(h.error)throw h.error;historyRows=h.data??[];
  }
  const extraction=await db.from("automotive_auction_sheet_extractions").select("*").eq("tenant_id",tenantId).eq("auction_lot_id",lotId)
    .in("status",["approved","reviewed","proposed"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(extraction.error)throw extraction.error;
  const comps=await db.from("automotive_auction_comparables").select("*").eq("tenant_id",tenantId).eq("auction_lot_id",lotId).order("observed_at",{ascending:false}).limit(100);
  if(comps.error)throw comps.error;
  const cost=await db.from("automotive_bid_cost_models_v2").select("*").eq("tenant_id",tenantId).eq("auction_lot_id",lotId)
    .in("status",["approved","review","draft"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(cost.error)throw cost.error;
  return {db,tenantId,lot:lot.data,vehicle,historyRows,extraction:extraction.data,comparables:comps.data??[],costModel:cost.data};
}
function decisionPayload(ctx:any){
  const lotSheet=ctx.lot.auction_sheet??{};
  const history:AuctionHistoryRow[]=(ctx.historyRows??[]).map((h:any)=>({
    observedAt:h.observed_at,auctionHouse:h.auction_house,externalLotId:h.external_lot_id,grade:h.grade,odometerKm:h.odometer_km,
    finalPriceMinor:h.final_price_minor,currentPriceMinor:h.current_price_minor,startingPriceMinor:h.starting_price_minor,currency:h.currency,
  }));
  const comparables:AuctionComparable[]=(ctx.comparables??[]).filter((x:any)=>x.currency==="GBP").map((x:any)=>({
    evidenceType:x.evidence_type,priceGbpMinor:Number(x.price_minor),year:x.model_year,mileageKm:x.mileage_km,source:x.source,externalRef:x.external_ref,
  }));
  const cm=ctx.costModel;
  const economics=cm?{
    targetRetailGbpMinor:Number(cm.target_retail_gbp_minor),targetMarginGbpMinor:Number(cm.target_margin_gbp_minor),
    estimatedLandedGbpMinor:cm.estimated_landed_gbp_minor===null?null:Number(cm.estimated_landed_gbp_minor),
    estimatedGrossMarginGbpMinor:cm.estimated_gross_margin_gbp_minor===null?null:Number(cm.estimated_gross_margin_gbp_minor),
    proposedHammerJpy:cm.proposed_hammer_jpy===null?null:Number(cm.proposed_hammer_jpy),maxHammerJpy:Number(cm.max_hammer_jpy),
  }:null;
  return {
    lot:{chassisNumber:ctx.vehicle?.chassis_number??lotSheet.chassisNumber??null,grade:ctx.lot.grade,odometerKm:ctx.lot.odometer_km,
      make:lotSheet.make??ctx.vehicle?.make??null,model:lotSheet.model??ctx.vehicle?.model??null,year:lotSheet.year??ctx.vehicle?.specification?.year??null},
    extraction:(ctx.extraction?.extraction??null) as AuctionSheetExtraction|null,history,comparables,economics,
  };
}
async function recalculateAuctionDecision(lotId:string){
  const ctx=await auctionIntelligenceContext(lotId);
  const result=evaluateAuctionDecision(decisionPayload(ctx));
  const revoked=await ctx.db.from("automotive_bid_instructions").update({
    status:"draft",authorised_actor_ref:null,authorised_at:null,admin_approval_note:null,updated_at:new Date().toISOString()
  }).eq("tenant_id",ctx.tenantId).eq("auction_lot_id",lotId).eq("status","authorised");
  if(revoked.error)throw revoked.error;
  await ctx.db.from("automotive_auction_decisions").update({status:"superseded",updated_at:new Date().toISOString()})
    .eq("tenant_id",ctx.tenantId).eq("auction_lot_id",lotId).in("status",["proposed","reviewed","approved"]);
  const decision=await ctx.db.from("automotive_auction_decisions").insert({
    tenant_id:ctx.tenantId,product_key:"autohashi",auction_lot_id:lotId,vehicle_id:ctx.vehicle?.id??null,
    extraction_id:ctx.extraction?.id??null,cost_model_v2_id:ctx.costModel?.id??null,score:result.score,recommendation:result.recommendation,
    confidence:result.confidence,blockers:result.blockers,warnings:result.warnings,reasons:result.reasons,subscores:result.subscores,
    market:result.market,history:result.history,calculation:result,status:"proposed"
  }).select("*").single();
  if(decision.error)throw decision.error;
  return {decision:decision.data,extraction:ctx.extraction,comparableCount:ctx.comparables.length,costModel:ctx.costModel};
}
async function intelligenceStatus(body:any){
  const lotId=String(body.auctionLotId??"");if(!lotId)throw new Error("auctionLotId is required");
  const ctx=await auctionIntelligenceContext(lotId);
  const job=await ctx.db.from("intelligence_jobs").select("*").eq("tenant_id",ctx.tenantId).eq("job_type","automotive.auction_assessment")
    .filter("input->>auctionLotId","eq",lotId).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(job.error)throw job.error;
  const decision=await ctx.db.from("automotive_auction_decisions").select("*").eq("tenant_id",ctx.tenantId).eq("auction_lot_id",lotId)
    .neq("status","superseded").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(decision.error)throw decision.error;
  return {job:job.data,extraction:ctx.extraction,decision:decision.data,comparables:ctx.comparables,costModel:ctx.costModel};
}
async function syncMarketEvidence(body:any){
  const lotId=String(body.auctionLotId??"");if(!lotId)throw new Error("auctionLotId is required");
  const rows=Array.isArray(body.comparables)?body.comparables.slice(0,100):[];
  const db=serviceDb(),tenantId=autohashiTenant();
  const lot=await db.from("automotive_auction_lots").select("id").eq("tenant_id",tenantId).eq("id",lotId).single();if(lot.error)throw lot.error;
  let imported=0;
  for(const row of rows){
    const type=String(row?.evidenceType??"");
    if(!["asking","sold","auction_result"].includes(type))continue;
    const price=Number(row?.priceGbpMinor);
    const externalRef=String(row?.externalRef??"");
    if(!Number.isInteger(price)||price<0||!externalRef)continue;
    const saved=await db.from("automotive_auction_comparables").upsert({
      tenant_id:tenantId,product_key:"autohashi",auction_lot_id:lotId,market_country:"GB",evidence_type:type,
      source:String(row?.source??"autohashi_internal").slice(0,160),external_ref:externalRef.slice(0,300),
      make:typeof row?.make==="string"?row.make:null,model:typeof row?.model==="string"?row.model:null,
      model_year:Number.isInteger(row?.year)?row.year:null,mileage_km:Number.isInteger(row?.mileageKm)?row.mileageKm:null,
      price_minor:price,currency:"GBP",observed_at:typeof row?.observedAt==="string"?row.observedAt:new Date().toISOString(),
      metadata:row?.metadata&&typeof row.metadata==="object"?row.metadata:{}
    },{onConflict:"tenant_id,auction_lot_id,evidence_type,source,external_ref"});
    if(saved.error)throw saved.error;imported++;
  }
  const recalculated=await recalculateAuctionDecision(lotId);
  return {imported,...recalculated};
}
async function requeueAuctionIntelligence(body:any){
  const who=actor(body);
  if(!who.roles.some(role=>["super_admin","tenant_admin","compliance","ops"].includes(role)))throw new Error("Operations/compliance role is required");
  const lotId=String(body.auctionLotId??"");if(!lotId)throw new Error("auctionLotId is required");
  const ctx=await auctionIntelligenceContext(lotId);
  const active=await ctx.db.from("intelligence_jobs").select("*").eq("tenant_id",ctx.tenantId).eq("job_type","automotive.auction_assessment")
    .filter("input->>auctionLotId","eq",lotId).in("status",["queued","processing"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(active.error)throw active.error;if(active.data)return {job:active.data,reused:true};
  const job=await ctx.db.from("intelligence_jobs").insert({
    tenant_id:ctx.tenantId,product_key:"autohashi",job_type:"automotive.auction_assessment",subject_type:"vehicle",
    subject_id:ctx.vehicle?.id??lotId,priority:"high",
    input:{vehicleId:ctx.vehicle?.id??null,auctionLotId:lotId,providerKey:ctx.lot.provider_key,externalLotId:ctx.lot.external_lot_id,
      goals:["auction_sheet_interpretation","damage_map","provenance","relisting_detection","mileage_consistency","uk_market_comparables","max_bid_review"]},
    requirements:{service:"omniqora.automotive",visionAllowed:true,reviewRequired:true,noGeolocation:true,failClosedOnMissingProviderEvidence:true}
  }).select("*").single();
  if(job.error)throw job.error;return {job:job.data,reused:false};
}
async function reviewAuctionDecision(body:any){
  const who=actor(body);
  if(!who.roles.some(role=>["super_admin","tenant_admin","compliance"].includes(role)))throw new Error("Compliance/admin review role is required");
  const lotId=String(body.auctionLotId??""),decisionId=String(body.decisionId??""),review=String(body.review??"");
  if(!lotId||!decisionId||!["approved","rejected"].includes(review))throw new Error("auctionLotId, decisionId and approved/rejected review are required");
  const db=serviceDb(),tenantId=autohashiTenant(),now=new Date().toISOString();
  const current=await db.from("automotive_auction_decisions").select("*").eq("tenant_id",tenantId).eq("auction_lot_id",lotId).eq("id",decisionId).single();
  if(current.error)throw current.error;if(!["proposed","reviewed"].includes(current.data.status))throw new Error("Auction decision is not reviewable");
  const updated=await db.from("automotive_auction_decisions").update({
    status:review,reviewed_actor_ref:"autohashi:user:"+who.userId,reviewed_at:now,review_note:typeof body.note==="string"?body.note:null,updated_at:now
  }).eq("id",decisionId).select("*").single();
  if(updated.error)throw updated.error;
  let reviewedJobId:string|null=null;
  if(current.data.extraction_id){
    const extraction=await db.from("automotive_auction_sheet_extractions").select("intelligence_job_id").eq("tenant_id",tenantId).eq("id",current.data.extraction_id).single();
    if(extraction.error)throw extraction.error;reviewedJobId=extraction.data.intelligence_job_id??null;
    const ex=await db.from("automotive_auction_sheet_extractions").update({
      status:review==="approved"?"approved":"reviewed",reviewed_at:now,review_note:typeof body.note==="string"?body.note:null,updated_at:now
    }).eq("tenant_id",tenantId).eq("id",current.data.extraction_id);
    if(ex.error)throw ex.error;
  }
  if(reviewedJobId){
    const jobs=await db.from("intelligence_jobs").update({
      status:"completed",completed_at:now,updated_at:now,result:{decisionId,recommendation:current.data.recommendation,score:current.data.score,humanReview:review}
    }).eq("tenant_id",tenantId).eq("id",reviewedJobId).eq("status","waiting_review");
    if(jobs.error)throw jobs.error;
  }
  return updated.data;
}


function correctionPayload(original:any,patch:any){
  const allowed=new Set([
    "rawGrade","interiorGrade","exteriorGrade","inspectorCommentsJapanese","inspectorCommentsEnglish","damageCodes",
    "repairHistory","structuralRepair","flood","corrosion","rust","oilLeak","warningLights","airbagIssue",
    "chassisNumber","odometerKm","odometerStatus","options","notes","sourceRefs","translationConfidence","damageMapConfidence"
  ]);
  const corrected={...(original&&typeof original==="object"?original:{})};
  for(const [key,value] of Object.entries(patch&&typeof patch==="object"?patch:{})){
    if(allowed.has(key))corrected[key]=value;
  }
  corrected.confidence=1;
  return corrected;
}
async function correctAuctionExtraction(body:any){
  const who=actor(body);
  if(!who.roles.some((role:string)=>["super_admin","tenant_admin","compliance"].includes(role)))throw new Error("Compliance/admin role is required for extraction corrections");
  const lotId=String(body.auctionLotId??"");if(!lotId)throw new Error("auctionLotId is required");
  const ctx=await auctionIntelligenceContext(lotId);
  if(!ctx.extraction?.id)throw new Error("There is no auction-sheet extraction to correct");
  const original=ctx.extraction.extraction??{};
  const corrected=correctionPayload(original,body.corrected);
  const changed=extractionDiff(original,corrected).filter(field=>field!=="confidence");
  if(!changed.length)throw new Error("No extraction fields changed");
  const now=new Date().toISOString();
  const correction=await ctx.db.from("automotive_auction_review_corrections").insert({
    tenant_id:ctx.tenantId,product_key:"autohashi",auction_lot_id:lotId,extraction_id:ctx.extraction.id,
    correction_type:"sheet_extraction",original_payload:original,corrected_payload:corrected,changed_fields:changed,
    note:typeof body.note==="string"?body.note:null,reviewed_actor_ref:"autohashi:user:"+who.userId
  }).select("*").single();
  if(correction.error)throw correction.error;
  const superseded=await ctx.db.from("automotive_auction_sheet_extractions").update({status:"superseded",updated_at:now})
    .eq("tenant_id",ctx.tenantId).eq("auction_lot_id",lotId).neq("status","superseded");
  if(superseded.error)throw superseded.error;
  const human=await ctx.db.from("automotive_auction_sheet_extractions").insert({
    tenant_id:ctx.tenantId,product_key:"autohashi",auction_lot_id:lotId,vehicle_id:ctx.vehicle?.id??null,
    intelligence_job_id:null,source_kind:"human",source_ref:"autohashi:user:"+who.userId,
    schema_version:"autohashi-auction-sheet-v1",raw_text:ctx.extraction.raw_text??null,extraction:corrected,
    confidence:1,status:"approved",reviewed_at:now,review_note:typeof body.note==="string"?body.note:null
  }).select("*").single();
  if(human.error)throw human.error;
  const recalculated=await recalculateAuctionDecision(lotId);
  return {correction:correction.data,extraction:human.data,...recalculated};
}
async function predictionForLot(lotId:string){
  const ctx=await auctionIntelligenceContext(lotId);
  const sheet=ctx.lot.auction_sheet??{};
  const target={
    make:String(sheet.make??ctx.vehicle?.make??""),
    model:String(sheet.model??ctx.vehicle?.model??""),
    modelCode:String(sheet.modelCode??ctx.vehicle?.model_code??"")||null,
    year:Number.isInteger(sheet.year)?Number(sheet.year):(Number.isInteger(ctx.vehicle?.specification?.year)?Number(ctx.vehicle.specification.year):null),
    grade:ctx.extraction?.extraction?.rawGrade??ctx.lot.grade??null,
    mileageKm:typeof ctx.extraction?.extraction?.odometerKm==="number"?Number(ctx.extraction.extraction.odometerKm):ctx.lot.odometer_km,
  };
  if(!target.make||!target.model)throw new Error("Vehicle make/model is required for hammer prediction");
  const outcomes=await ctx.db.from("automotive_auction_price_outcomes").select("*").eq("tenant_id",ctx.tenantId)
    .eq("make",target.make).eq("model",target.model).order("outcome_at",{ascending:false}).limit(1000);
  if(outcomes.error)throw outcomes.error;
  const rows:AuctionOutcome[]=(outcomes.data??[]).map((row:any)=>({
    make:row.make,model:row.model,modelCode:row.model_code,year:row.model_year,grade:row.grade,mileageKm:row.mileage_km,
    hammerJpy:Number(row.hammer_jpy),outcomeAt:row.outcome_at
  }));
  const result=predictHammerPrice({target,outcomes:rows});
  await ctx.db.from("automotive_auction_price_predictions").update({status:"superseded"})
    .eq("tenant_id",ctx.tenantId).eq("auction_lot_id",lotId).eq("status","predicted");
  const saved=await ctx.db.from("automotive_auction_price_predictions").insert({
    tenant_id:ctx.tenantId,product_key:"autohashi",auction_lot_id:lotId,prediction_version:"hierarchical-median-v1",
    predicted_hammer_jpy:result.predictedHammerJpy,low_jpy:result.lowJpy,high_jpy:result.highJpy,sample_count:result.sampleCount,
    confidence:result.confidence,method:result.method,context:{target}
  }).select("*").single();
  if(saved.error)throw saved.error;
  return {prediction:saved.data,result};
}
function watchCriteria(body:any){
  const raw=body?.criteria??{};
  const num=(key:string)=>raw[key]===null||raw[key]===undefined||raw[key]===""?null:Number(raw[key]);
  const text=(key:string)=>typeof raw[key]==="string"&&raw[key].trim()?raw[key].trim():null;
  return {
    make:text("make"),model:text("model"),modelCode:text("modelCode"),yearMin:num("yearMin"),yearMax:num("yearMax"),
    gradeMin:num("gradeMin"),odometerMaxKm:num("odometerMaxKm"),maxOpeningJpy:num("maxOpeningJpy"),
    maxPredictedHammerJpy:num("maxPredictedHammerJpy"),minScore:num("minScore")
  };
}
async function saveWatchRule(body:any){
  const who=actor(body);
  if(!who.roles.some((role:string)=>["super_admin","tenant_admin","ops","sales"].includes(role)))throw new Error("Operations/sales role is required to save auction watches");
  const name=String(body.name??"").trim();if(name.length<2)throw new Error("Watch name is required");
  const criteria=watchCriteria(body);
  if(!criteria.make&&!criteria.model&&!criteria.modelCode)throw new Error("Watch needs at least make, model or model code");
  const db=serviceDb(),tenantId=autohashiTenant();
  const saved=await db.from("automotive_auction_watch_rules").upsert({
    tenant_id:tenantId,product_key:"autohashi",name:name.slice(0,160),enabled:body.enabled!==false,criteria,
    provider_preference:["auto","vehicle.auction.thecarapi","vehicle.auction.carstack"].includes(String(body.providerPreference))?String(body.providerPreference):"auto",
    max_results_per_run:Math.min(200,Math.max(1,Number(body.maxResultsPerRun??50))),cadence:body.cadence==="daily"?"daily":"hourly",
    alert_channels:["in_app"],created_actor_ref:"autohashi:user:"+who.userId,updated_at:new Date().toISOString()
  },{onConflict:"tenant_id,product_key,name"}).select("*").single();
  if(saved.error)throw saved.error;return saved.data;
}
async function listWatchRules(){
  const db=serviceDb(),tenantId=autohashiTenant();
  const rules=await db.from("automotive_auction_watch_rules").select("*").eq("tenant_id",tenantId).eq("product_key","autohashi").order("updated_at",{ascending:false});
  if(rules.error)throw rules.error;return rules.data??[];
}
async function updateWatchRule(body:any){
  const who=actor(body);
  if(!who.roles.some((role:string)=>["super_admin","tenant_admin","ops","sales"].includes(role)))throw new Error("Operations/sales role is required");
  const id=String(body.watchRuleId??"");if(!id)throw new Error("watchRuleId is required");
  const db=serviceDb(),tenantId=autohashiTenant();
  const values:any={updated_at:new Date().toISOString()};
  if(typeof body.enabled==="boolean")values.enabled=body.enabled;
  if(typeof body.name==="string"&&body.name.trim())values.name=body.name.trim().slice(0,160);
  const updated=await db.from("automotive_auction_watch_rules").update(values).eq("tenant_id",tenantId).eq("id",id).select("*").single();
  if(updated.error)throw updated.error;return updated.data;
}
async function listWatchMatches(body:any){
  const db=serviceDb(),tenantId=autohashiTenant();
  let q=db.from("automotive_auction_watch_matches").select("*, automotive_auction_watch_rules(name)")
    .eq("tenant_id",tenantId).order("last_seen_at",{ascending:false}).limit(Math.min(200,Math.max(1,Number(body.limit??50))));
  if(body.onlyNew!==false)q=q.eq("status","new");
  if(body.qualifiedOnly!==false)q=q.eq("stage","qualified");
  if(typeof body.watchRuleId==="string"&&body.watchRuleId)q=q.eq("watch_rule_id",body.watchRuleId);
  const rows=await q;if(rows.error)throw rows.error;return rows.data??[];
}
async function markWatchMatch(body:any){
  const id=String(body.matchId??"");if(!id)throw new Error("matchId is required");
  const status=String(body.status??"seen");if(!["seen","dismissed"].includes(status))throw new Error("Invalid watch match status");
  const db=serviceDb(),tenantId=autohashiTenant();
  const row=await db.from("automotive_auction_watch_matches").update({status}).eq("tenant_id",tenantId).eq("id",id).select("*").single();
  if(row.error)throw row.error;return row.data;
}

function actor(body:any){
  const raw=body?.actor??{};
  const userId=typeof raw.userId==="string"?raw.userId:"";
  const roles=Array.isArray(raw.roles)?raw.roles.filter((r:any)=>typeof r==="string"):[];
  if(!userId)throw new Error("Authenticated AutoHashi actor is required");
  return {userId,roles,tenantId:typeof raw.tenantId==="string"?raw.tenantId:null};
}
function isApprovalActor(roles:string[]){
  return roles.some(role=>["super_admin","tenant_admin","finance"].includes(role));
}
function whole(name:string,value:any,min=0){
  const n=Number(value);
  if(!Number.isInteger(n)||n<min)throw new Error(name+" must be an integer >= "+min);
  return n;
}
function positive(name:string,value:any){
  const n=Number(value);
  if(!Number.isFinite(n)||n<=0)throw new Error(name+" must be positive");
  return n;
}
function executionEnabled(){
  return (Deno.env.get("AUTOHASHI_AUCTION_EXECUTION_ENABLED")??"").toLowerCase()==="true";
}
async function bidModel(body:any){
  const db=serviceDb(),tenantId=autohashiTenant(),productKey="autohashi";
  const current=await db.from("automotive_bid_instructions").select("*")
    .eq("tenant_id",tenantId).eq("idempotency_key",String(body.idempotencyKey??"")).maybeSingle();
  if(current.error)throw current.error;
  if(current.data){
    const model=current.data.cost_model_v2_id
      ? await db.from("automotive_bid_cost_models_v2").select("*").eq("tenant_id",tenantId).eq("id",current.data.cost_model_v2_id).single()
      : {data:null,error:null};
    if(model.error)throw model.error;
    return {instruction:current.data,costModel:model.data,reused:true,executionEnabled:executionEnabled()};
  }
  const lotId=String(body.auctionLotId??"");
  if(!lotId)throw new Error("auctionLotId is required");
  const lot=await db.from("automotive_auction_lots").select("*").eq("tenant_id",tenantId).eq("product_key",productKey).eq("id",lotId).single();
  if(lot.error)throw lot.error;
  const cost=body.cost??{};
  const proposed=whole("proposedHammerJpy",body.proposedHammerJpy);
  const input={
    fxJpyPerGbp:positive("fxJpyPerGbp",cost.fxJpyPerGbp),
    fxSource:typeof cost.fxSource==="string"?cost.fxSource:null,
    fxAsOf:typeof cost.fxAsOf==="string"?cost.fxAsOf:null,
    targetRetailGbpMinor:whole("targetRetailGbpMinor",cost.targetRetailGbpMinor),
    targetMarginGbpMinor:whole("targetMarginGbpMinor",cost.targetMarginGbpMinor),
    auctionFeesJpy:whole("auctionFeesJpy",cost.auctionFeesJpy),
    inlandTransportJpy:whole("inlandTransportJpy",cost.inlandTransportJpy),
    freightGbpMinor:whole("freightGbpMinor",cost.freightGbpMinor),
    insuranceGbpMinor:whole("insuranceGbpMinor",cost.insuranceGbpMinor),
    clearanceGbpMinor:whole("clearanceGbpMinor",cost.clearanceGbpMinor),
    complianceGbpMinor:whole("complianceGbpMinor",cost.complianceGbpMinor),
    registrationGbpMinor:whole("registrationGbpMinor",cost.registrationGbpMinor),
    deliveryGbpMinor:whole("deliveryGbpMinor",cost.deliveryGbpMinor),
    otherGbpMinor:whole("otherGbpMinor",cost.otherGbpMinor),
    dutyRateBps:whole("dutyRateBps",cost.dutyRateBps),
    taxRateBps:whole("taxRateBps",cost.taxRateBps),
    proposedHammerJpy:proposed,
  };
  const calculation=calculateJapanUkBidCost(input);
  if(proposed>calculation.maxHammerJpy)throw new Error("Proposed hammer bid exceeds the calculated reviewed maximum");
  const externalReference=typeof body.externalReference==="string"?body.externalReference:null;
  if(externalReference){
    const prior=await db.from("automotive_bid_instructions").select("id,cost_model_v2_id").eq("tenant_id",tenantId)
      .eq("external_reference",externalReference).eq("status","draft").is("customer_authorised_at",null);
    if(prior.error)throw prior.error;
    const priorRows=prior.data??[];
    if(priorRows.length){
      const cancelled=await db.from("automotive_bid_instructions").update({status:"cancelled",updated_at:new Date().toISOString()})
        .eq("tenant_id",tenantId).eq("external_reference",externalReference).eq("status","draft").is("customer_authorised_at",null);
      if(cancelled.error)throw cancelled.error;
      const modelIds=priorRows.map((row:any)=>row.cost_model_v2_id).filter(Boolean);
      if(modelIds.length){
        const superseded=await db.from("automotive_bid_cost_models_v2").update({status:"superseded"}).eq("tenant_id",tenantId).in("id",modelIds);
        if(superseded.error)throw superseded.error;
      }
    }
  }
  const insertedModel=await db.from("automotive_bid_cost_models_v2").insert({
    tenant_id:tenantId,product_key:productKey,auction_lot_id:lotId,destination_country:"GB",
    fx_jpy_per_gbp:input.fxJpyPerGbp,fx_source:input.fxSource,fx_as_of:input.fxAsOf,
    target_retail_gbp_minor:input.targetRetailGbpMinor,target_margin_gbp_minor:input.targetMarginGbpMinor,
    auction_fees_jpy:input.auctionFeesJpy,inland_transport_jpy:input.inlandTransportJpy,
    freight_gbp_minor:input.freightGbpMinor,insurance_gbp_minor:input.insuranceGbpMinor,clearance_gbp_minor:input.clearanceGbpMinor,
    compliance_gbp_minor:input.complianceGbpMinor,registration_gbp_minor:input.registrationGbpMinor,delivery_gbp_minor:input.deliveryGbpMinor,
    other_gbp_minor:input.otherGbpMinor,duty_rate_bps:input.dutyRateBps,tax_rate_bps:input.taxRateBps,proposed_hammer_jpy:proposed,
    max_hammer_jpy:calculation.maxHammerJpy,estimated_landed_gbp_minor:calculation.proposedLandedGbpMinor,
    estimated_gross_margin_gbp_minor:calculation.proposedGrossMarginGbpMinor,calculation,
    assumptions:{...calculation.assumptions,rateInputsUserReviewed:true},status:"review"
  }).select("*").single();
  if(insertedModel.error)throw insertedModel.error;
  const idempotencyKey=String(body.idempotencyKey??"");
  if(idempotencyKey.length<12)throw new Error("idempotencyKey must be at least 12 characters");
  const expiresAt=typeof body.expiresAt==="string"?body.expiresAt:null;
  const instruction=await db.from("automotive_bid_instructions").insert({
    tenant_id:tenantId,product_key:productKey,auction_lot_id:lotId,bid_model_id:null,cost_model_v2_id:insertedModel.data.id,
    execution_provider_key:"vehicle.auction.agent",max_bid_minor:proposed,currency:"JPY",status:"draft",
    external_reference:externalReference,idempotency_key:idempotencyKey,
    expires_at:expiresAt,result_payload:{reviewedMaxHammerJpy:calculation.maxHammerJpy}
  }).select("*").single();
  if(instruction.error)throw instruction.error;
  const intelligence=await recalculateAuctionDecision(lotId);
  return {instruction:instruction.data,costModel:insertedModel.data,calculation,intelligenceDecision:intelligence.decision,reused:false,executionEnabled:executionEnabled()};
}
async function customerAuthorise(body:any){
  const who=actor(body),db=serviceDb(),tenantId=autohashiTenant();
  const instructionId=String(body.instructionId??"");
  const current=await db.from("automotive_bid_instructions").select("*").eq("tenant_id",tenantId).eq("id",instructionId).single();
  if(current.error)throw current.error;
  if(current.data.status!=="draft")throw new Error("Only a draft bid can receive customer authorisation");
  if(current.data.customer_authorised_at)return current.data;
  if(current.data.expires_at&&new Date(current.data.expires_at).getTime()<=Date.now())throw new Error("Bid instruction has expired");
  const acknowledged=whole("acknowledgedMaxBidJpy",body.acknowledgedMaxBidJpy);
  if(acknowledged!==Number(current.data.max_bid_minor))throw new Error("Acknowledged maximum bid does not match the reviewed bid");
  const termsVersion=String(body.termsVersion??"");
  if(termsVersion.length<3)throw new Error("termsVersion is required");
  const updated=await db.from("automotive_bid_instructions").update({
    customer_actor_ref:"autohashi:user:"+who.userId,customer_authorised_at:new Date().toISOString(),
    customer_authorisation:{termsVersion,acknowledgedMaxBidJpy:acknowledged,acknowledgements:body.acknowledgements??{},actorRoles:who.roles},
    updated_at:new Date().toISOString()
  }).eq("tenant_id",tenantId).eq("id",instructionId).select("*").single();
  if(updated.error)throw updated.error;
  return updated.data;
}
async function adminAuthorise(body:any){
  const who=actor(body);
  if(!isApprovalActor(who.roles))throw new Error("Admin/finance approval role is required");
  const db=serviceDb(),tenantId=autohashiTenant(),instructionId=String(body.instructionId??"");
  const current=await db.from("automotive_bid_instructions").select("*").eq("tenant_id",tenantId).eq("id",instructionId).single();
  if(current.error)throw current.error;
  if(current.data.status!=="draft")throw new Error("Only a draft bid can be authorised");
  if(!current.data.customer_authorised_at)throw new Error("Customer authorisation is required before admin approval");
  if(current.data.expires_at&&new Date(current.data.expires_at).getTime()<=Date.now())throw new Error("Bid instruction has expired");
  const intelligence=await db.from("automotive_auction_decisions").select("*").eq("tenant_id",tenantId).eq("auction_lot_id",current.data.auction_lot_id)
    .eq("status","approved").order("reviewed_at",{ascending:false}).limit(1).maybeSingle();
  if(intelligence.error)throw intelligence.error;
  if(!intelligence.data)throw new Error("Human-approved auction intelligence is required before admin approval");
  if(intelligence.data.recommendation==="do_not_bid")throw new Error("Approved auction intelligence says DO NOT BID");
  const now=new Date().toISOString();
  if(current.data.cost_model_v2_id){
    const model=await db.from("automotive_bid_cost_models_v2").update({status:"approved",reviewed_actor_ref:"autohashi:user:"+who.userId,reviewed_at:now})
      .eq("tenant_id",tenantId).eq("id",current.data.cost_model_v2_id);
    if(model.error)throw model.error;
  }
  const updated=await db.from("automotive_bid_instructions").update({
    status:"authorised",authorised_actor_ref:"autohashi:user:"+who.userId,authorised_at:now,
    admin_approval_note:typeof body.note==="string"?body.note:null,updated_at:now
  }).eq("tenant_id",tenantId).eq("id",instructionId).select("*").single();
  if(updated.error)throw updated.error;
  return {...updated.data,executionEnabled:executionEnabled()};
}
async function bidStatus(body:any){
  const db=serviceDb(),tenantId=autohashiTenant(),instructionId=String(body.instructionId??"");
  const instruction=await db.from("automotive_bid_instructions").select("*").eq("tenant_id",tenantId).eq("id",instructionId).single();
  if(instruction.error)throw instruction.error;
  const [model,lot,events]=await Promise.all([
    instruction.data.cost_model_v2_id?db.from("automotive_bid_cost_models_v2").select("*").eq("tenant_id",tenantId).eq("id",instruction.data.cost_model_v2_id).maybeSingle():Promise.resolve({data:null,error:null}),
    db.from("automotive_auction_lots").select("*").eq("tenant_id",tenantId).eq("id",instruction.data.auction_lot_id).maybeSingle(),
    db.from("automotive_bid_provider_events").select("*").eq("tenant_id",tenantId).eq("bid_instruction_id",instructionId).order("received_at",{ascending:false}).limit(100)
  ]);
  if(model.error)throw model.error;if(lot.error)throw lot.error;if(events.error)throw events.error;
  return {instruction:instruction.data,costModel:model.data,auctionLot:lot.data,events:events.data??[],executionEnabled:executionEnabled()};
}
async function submitBid(body:any){
  const who=actor(body);
  if(!isApprovalActor(who.roles))throw new Error("Admin/finance approval role is required");
  if(!executionEnabled())throw new Error("Live auction execution is disabled");
  const baseUrl=(Deno.env.get("AUTOHASHI_AUCTION_AGENT_URL")??"").replace(/\/$/,"");
  const token=Deno.env.get("AUTOHASHI_AUCTION_AGENT_TOKEN")??"";
  const callbackBase=(Deno.env.get("OMNIQORA_PUBLIC_URL")??"").replace(/\/$/,"");
  if(!baseUrl||!token||!callbackBase)throw new Error("Auction execution provider is not fully configured");
  const db=serviceDb(),tenantId=autohashiTenant(),instructionId=String(body.instructionId??"");
  const current=await db.from("automotive_bid_instructions").select("*").eq("tenant_id",tenantId).eq("id",instructionId).single();
  if(current.error)throw current.error;
  if(!["authorised","error"].includes(current.data.status))throw new Error("Bid must be admin-authorised before submission");
  if(!current.data.customer_authorised_at||!current.data.authorised_at)throw new Error("Required authorisations are incomplete");
  if(current.data.expires_at&&new Date(current.data.expires_at).getTime()<=Date.now())throw new Error("Bid instruction has expired");
  const intelligence=await db.from("automotive_auction_decisions").select("*").eq("tenant_id",tenantId).eq("auction_lot_id",current.data.auction_lot_id)
    .eq("status","approved").order("reviewed_at",{ascending:false}).limit(1).maybeSingle();
  if(intelligence.error)throw intelligence.error;
  if(!intelligence.data)throw new Error("Human-approved auction intelligence is required before live submission");
  if(intelligence.data.recommendation==="do_not_bid")throw new Error("Approved auction intelligence says DO NOT BID");
  const lot=await db.from("automotive_auction_lots").select("*").eq("tenant_id",tenantId).eq("id",current.data.auction_lot_id).single();
  if(lot.error)throw lot.error;
  const payload={
    idempotency_key:current.data.idempotency_key,instruction_id:current.data.id,provider_lot_id:lot.data.external_lot_id,
    auction_house:lot.data.auction_house,auction_date:lot.data.auction_at,max_bid_jpy:Number(current.data.max_bid_minor),
    customer_authorised_at:current.data.customer_authorised_at,autohashi_reference:current.data.external_reference,
    callback_url:callbackBase+"/functions/v1/automotive-auction-agent-webhook"
  };
  const attempt=Number(current.data.submission_attempts??0)+1,now=new Date().toISOString();
  try{
    const response=await fetch(baseUrl+"/v1/bids",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json","Idempotency-Key":current.data.idempotency_key},body:JSON.stringify(payload)});
    const raw=await response.text();let result:any={};
    try{result=raw?JSON.parse(raw):{};}catch{result={message:raw.slice(0,1000)}}
    const providerStatus=String(result.status??(response.ok?"accepted":"rejected")).toLowerCase();
    const acceptedMax=(result.accepted_max_bid_jpy??result.max_bid_jpy)==null?Number(current.data.max_bid_minor):Number(result.accepted_max_bid_jpy??result.max_bid_jpy);
    if(!Number.isFinite(acceptedMax)||acceptedMax>Number(current.data.max_bid_minor)){
      const violated=await db.from("automotive_bid_instructions").update({
        status:"error",limit_violation:true,last_error:"Execution provider acknowledged a bid ceiling above the authorised maximum",
        result_payload:{...current.data.result_payload,submissionResponse:result},submission_attempts:attempt,last_provider_status_at:now,updated_at:now
      }).eq("tenant_id",tenantId).eq("id",instructionId).select("*").single();
      if(violated.error)throw violated.error;
      throw new Error("Execution provider maximum-bid safety violation");
    }
    const nextStatus=providerStatus==="rejected"?"rejected":response.ok&&providerStatus==="accepted"?"accepted":response.ok?"submitted":"rejected";
    const updated=await db.from("automotive_bid_instructions").update({
      status:nextStatus,provider_reference:typeof result.provider_reference==="string"?result.provider_reference:current.data.provider_reference,
      submitted_at:current.data.submitted_at??now,result_payload:{...current.data.result_payload,submissionResponse:result},
      submission_attempts:attempt,last_provider_status_at:now,last_error:response.ok?null:String(result.reason??result.message??"Provider rejected bid"),
      updated_at:now
    }).eq("tenant_id",tenantId).eq("id",instructionId).select("*").single();
    if(updated.error)throw updated.error;
    return updated.data;
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    if(!message.includes("safety violation")){
      await db.from("automotive_bid_instructions").update({
        status:"error",submission_attempts:attempt,last_error:message,last_provider_status_at:now,updated_at:now
      }).eq("tenant_id",tenantId).eq("id",instructionId);
    }
    throw error;
  }
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const raw=await req.text();
  const verified=await verify(req,raw);
  if(!verified.ok)return json({error:verified.error},401);
  let body:any={};
  try{body=raw?JSON.parse(raw):{};}catch{return json({error:"Invalid JSON"},400);}
  try{
    if(body.action==="health"){
      const readiness=auctionProviderReadiness({
        THECARAPI_API_KEY:Deno.env.get("THECARAPI_API_KEY"),
        CARSTACK_API_TOKEN:Deno.env.get("CARSTACK_API_TOKEN"),
      }).filter(p=>p.stage==="built_read").map(p=>({key:p.key,name:p.name,configured:p.configured,capabilities:p.capabilities}));
      return json({ok:true,executionEnabled:executionEnabled(),executionConfigured:!!Deno.env.get("AUTOHASHI_AUCTION_AGENT_URL")&&!!Deno.env.get("AUTOHASHI_AUCTION_AGENT_TOKEN"),intelligenceImportConfigured:!!Deno.env.get("AUTOHASHI_OMNIQORA_TENANT_ID"),providers:readiness});
    }
    if(body.action==="search"){
      const candidates=providerCandidates(body.providerKey);
      const filters={
        query:body.filters?.query??null,make:body.filters?.make??null,model:body.filters?.model??null,
        yearMin:body.filters?.yearMin??null,yearMax:body.filters?.yearMax??null,odometerMaxKm:body.filters?.odometerMaxKm??null,
        grade:body.filters?.grade??null,steering:body.filters?.steering??"rhd",page:body.filters?.page??1,pageSize:Math.min(50,body.filters?.pageSize??24),
      };
      const result=body.providerKey==="auto"||!body.providerKey
        ? await searchAuctionProvidersWithFailover({candidates,filters})
        : await searchAuctionProvider({providerKey:candidates[0].providerKey,secret:candidates[0].secret,filters});
      return json({ok:true,executionEnabled:false,...result});
    }
    if(body.action==="compare"){
      const candidates=providerCandidates("auto");
      const theCar=candidates.find(p=>p.providerKey==="vehicle.auction.thecarapi"),carStack=candidates.find(p=>p.providerKey==="vehicle.auction.carstack");
      if(!theCar||!carStack)return json({error:"Comparison requires both TheCarAPI and CarStack credentials"},409);
      const sampleSize=Math.min(500,Math.max(100,Number(body.sampleSize??200)));
      const filters={query:body.filters?.query??null,make:body.filters?.make??null,model:body.filters?.model??null,
        yearMin:body.filters?.yearMin??null,yearMax:body.filters?.yearMax??null,odometerMaxKm:body.filters?.odometerMaxKm??null,
        grade:body.filters?.grade??null,steering:body.filters?.steering??"rhd"};
      async function collect(provider:ReadProvider){
        const lots:any[]=[];const started=Date.now();let page=1,totalPages:number|null=null;
        while(lots.length<sampleSize){
          const result=await searchAuctionProvider({providerKey:provider.providerKey,secret:provider.secret,filters:{...filters,page,pageSize:Math.min(50,sampleSize-lots.length)}});
          lots.push(...result.lots);totalPages=result.totalPages;
          if(!result.lots.length||(totalPages!==null&&page>=totalPages))break;page++;
        }
        return {lots:lots.slice(0,sampleSize),latencyMs:Date.now()-started,pagesRead:page};
      }
      const a=await collect(theCar),b=await collect(carStack);
      return json({ok:true,requestedSampleSize:sampleSize,collected:{thecarapi:a.lots.length,carstack:b.lots.length},
        latencyMs:{thecarapi:a.latencyMs,carstack:b.latencyMs},pagesRead:{thecarapi:a.pagesRead,carstack:b.pagesRead},
        comparison:compareAuctionLotSamples(a.lots,b.lots),
        note:"Comparison reports coverage and overlap only; Japanese opening/current prices are not treated as verified hammer prices."});
    }
    if(body.action==="detail"){
      if(!body.externalLotId)return json({error:"externalLotId is required"},400);
      const provider=providerConfig(body.providerKey);
      const lot=await getAuctionProviderLot({providerKey:provider.providerKey,secret:provider.secret,externalLotId:String(body.externalLotId)});
      return json({ok:true,executionEnabled:false,lot});
    }
    if(body.action==="intelligence.import")return json({ok:true,...await importLot(body.lot)});
    if(body.action==="intelligence.status")return json({ok:true,...await intelligenceStatus(body)});
    if(body.action==="intelligence.market_sync")return json({ok:true,...await syncMarketEvidence(body)});
    if(body.action==="intelligence.evaluate")return json({ok:true,...await recalculateAuctionDecision(String(body.auctionLotId??""))});
    if(body.action==="intelligence.requeue")return json({ok:true,...await requeueAuctionIntelligence(body)});
    if(body.action==="intelligence.review")return json({ok:true,decision:await reviewAuctionDecision(body)});
    if(body.action==="learning.correct_extraction")return json({ok:true,...await correctAuctionExtraction(body)});
    if(body.action==="prediction.refresh")return json({ok:true,...await predictionForLot(String(body.auctionLotId??""))});
    if(body.action==="watch.save")return json({ok:true,watch:await saveWatchRule(body)});
    if(body.action==="watch.list")return json({ok:true,watches:await listWatchRules()});
    if(body.action==="watch.update")return json({ok:true,watch:await updateWatchRule(body)});
    if(body.action==="watch.matches")return json({ok:true,matches:await listWatchMatches(body)});
    if(body.action==="watch.match_status")return json({ok:true,match:await markWatchMatch(body)});
    if(body.action==="history"){
      if(!body.chassisNumber)return json({error:"chassisNumber is required"},400);
      return json({ok:true,...await history(String(body.chassisNumber),Number(body.days??90))});
    }
    if(body.action==="bid.model")return json({ok:true,...await bidModel(body)});
    if(body.action==="bid.customer_authorise")return json({ok:true,instruction:await customerAuthorise(body),executionEnabled:executionEnabled()});
    if(body.action==="bid.admin_authorise")return json({ok:true,instruction:await adminAuthorise(body),executionEnabled:executionEnabled()});
    if(body.action==="bid.status")return json({ok:true,...await bidStatus(body)});
    if(body.action==="bid.submit")return json({ok:true,instruction:await submitBid(body),executionEnabled:executionEnabled()});
    return json({error:"Unsupported action"},400);
  }catch(error){
    return json({error:error instanceof Error?error.message:String(error)},502);
  }
});
