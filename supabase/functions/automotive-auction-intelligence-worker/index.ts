import {createClient} from "npm:@supabase/supabase-js@2.110.8";
import {AUCTION_EXTRACTION_SCHEMA,evaluateAuctionDecision,type AuctionComparable,type AuctionHistoryRow,type AuctionSheetExtraction} from "../../../src/modules/automotive/auction-intelligence.ts";

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});}
function serviceDb(){
  const url=Deno.env.get("SUPABASE_URL")??"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  if(!url||!key)throw new Error("Service database is not configured");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function authenticate(req:Request){
  const expected=Deno.env.get("OMNIQORA_INTELLIGENCE_WORKER_SECRET")??"";
  const provided=req.headers.get("x-omniqora-worker-secret")??"";
  return expected.length>=32&&provided===expected;
}
const enums={
  repairHistory:new Set(["none","suspected","declared","unknown"]),
  structuralRepair:new Set(["none","minor","major","unknown"]),
  flood:new Set(["none","suspected","declared","unknown"]),
  severity:new Set(["none","light","moderate","severe","unknown"]),
  odometerStatus:new Set(["verified","questionable","unknown"]),
};
function optString(value:unknown){return typeof value==="string"?value:null;}
function optBool(value:unknown){return typeof value==="boolean"?value:null;}
function optInt(value:unknown){return Number.isInteger(value)&&Number(value)>=0?Number(value):null;}
function stringArray(value:unknown){return Array.isArray(value)?value.filter(v=>typeof v==="string").slice(0,200):[];}
function extraction(value:any):AuctionSheetExtraction{
  if(!value||typeof value!=="object")throw new Error("Structured extraction object is required");
  const confidence=Number(value.confidence);
  if(!Number.isFinite(confidence)||confidence<0||confidence>1)throw new Error("confidence must be between 0 and 1");
  const enumValue=(name:keyof typeof enums,raw:unknown,fallback:string)=>{
    const v=typeof raw==="string"?raw:fallback;
    if(!enums[name].has(v))throw new Error(name+" has an invalid value");
    return v;
  };
  const bounded=(raw:unknown)=>{
    if(raw===null||raw===undefined)return null;
    const n=Number(raw);if(!Number.isFinite(n)||n<0||n>1)throw new Error("confidence component must be between 0 and 1");return n;
  };
  return {
    rawGrade:optString(value.rawGrade),interiorGrade:optString(value.interiorGrade),exteriorGrade:optString(value.exteriorGrade),
    inspectorCommentsJapanese:optString(value.inspectorCommentsJapanese),inspectorCommentsEnglish:optString(value.inspectorCommentsEnglish),
    damageCodes:stringArray(value.damageCodes),
    repairHistory:enumValue("repairHistory",value.repairHistory,"unknown") as AuctionSheetExtraction["repairHistory"],
    structuralRepair:enumValue("structuralRepair",value.structuralRepair,"unknown") as AuctionSheetExtraction["structuralRepair"],
    flood:enumValue("flood",value.flood,"unknown") as AuctionSheetExtraction["flood"],
    corrosion:enumValue("severity",value.corrosion,"unknown") as AuctionSheetExtraction["corrosion"],
    rust:enumValue("severity",value.rust,"unknown") as AuctionSheetExtraction["rust"],
    oilLeak:optBool(value.oilLeak),warningLights:optBool(value.warningLights),airbagIssue:optBool(value.airbagIssue),
    chassisNumber:optString(value.chassisNumber),odometerKm:optInt(value.odometerKm),
    odometerStatus:enumValue("odometerStatus",value.odometerStatus,"unknown") as AuctionSheetExtraction["odometerStatus"],
    options:stringArray(value.options),notes:stringArray(value.notes),sourceRefs:stringArray(value.sourceRefs),
    confidence,translationConfidence:bounded(value.translationConfidence),damageMapConfidence:bounded(value.damageMapConfidence),
  };
}
async function contextForJob(db:any,job:any){
  const lotId=String(job.input?.auctionLotId??"");
  if(!lotId)throw new Error("Auction intelligence job has no auctionLotId");
  const lot=await db.from("automotive_auction_lots").select("*").eq("tenant_id",job.tenant_id).eq("id",lotId).single();
  if(lot.error)throw lot.error;
  let vehicle:any=null;
  if(lot.data.vehicle_id){
    const v=await db.from("automotive_vehicles").select("*").eq("tenant_id",job.tenant_id).eq("id",lot.data.vehicle_id).maybeSingle();
    if(v.error)throw v.error;vehicle=v.data;
  }
  let history:any[]=[];
  const chassis=vehicle?.chassis_number??lot.data.auction_sheet?.chassisNumber??null;
  if(chassis){
    const h=await db.from("automotive_auction_observations").select("*").eq("tenant_id",job.tenant_id).eq("chassis_number",chassis).order("observed_at",{ascending:true}).limit(500);
    if(h.error)throw h.error;history=h.data??[];
  }else{
    const h=await db.from("automotive_auction_observations").select("*").eq("tenant_id",job.tenant_id).eq("auction_lot_id",lotId).order("observed_at",{ascending:true}).limit(500);
    if(h.error)throw h.error;history=h.data??[];
  }
  const comps=await db.from("automotive_auction_comparables").select("*").eq("tenant_id",job.tenant_id).eq("auction_lot_id",lotId).order("observed_at",{ascending:false}).limit(100);
  if(comps.error)throw comps.error;
  const cost=await db.from("automotive_bid_cost_models_v2").select("*").eq("tenant_id",job.tenant_id).eq("auction_lot_id",lotId)
    .in("status",["approved","review","draft"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(cost.error)throw cost.error;
  return {lot:lot.data,vehicle,history,comparables:comps.data??[],costModel:cost.data};
}
function decisionInput(ctx:any,extractionValue:AuctionSheetExtraction|null){
  const lotSheet=ctx.lot.auction_sheet??{};
  const history:AuctionHistoryRow[]=(ctx.history??[]).map((h:any)=>({
    observedAt:h.observed_at,auctionHouse:h.auction_house,externalLotId:h.external_lot_id,grade:h.grade,odometerKm:h.odometer_km,
    finalPriceMinor:h.final_price_minor,currentPriceMinor:h.current_price_minor,startingPriceMinor:h.starting_price_minor,currency:h.currency,
  }));
  const comparables:AuctionComparable[]=(ctx.comparables??[]).filter((c:any)=>c.currency==="GBP").map((c:any)=>({
    evidenceType:c.evidence_type,priceGbpMinor:Number(c.price_minor),year:c.model_year,mileageKm:c.mileage_km,source:c.source,externalRef:c.external_ref,
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
    extraction:extractionValue,history,comparables,economics,
  };
}

Deno.serve(async req=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  if(!authenticate(req))return json({error:"Worker authentication failed"},401);
  let body:any={};try{body=await req.json();}catch{return json({error:"Invalid JSON"},400);}
  const action=String(body.action??"");
  const workerKey=String(body.workerKey??"auction-intelligence-worker").slice(0,120);
  try{
    const db=serviceDb();
    if(action==="claim"){
      const claimed=await db.rpc("automotive_claim_auction_intelligence_job",{_worker_key:workerKey});
      if(claimed.error)throw claimed.error;
      const job=claimed.data;
      if(!job?.id)return json({ok:true,job:null});
      const ctx=await contextForJob(db,job);
      return json({ok:true,job:{
        id:job.id,tenantId:job.tenant_id,productKey:job.product_key,jobType:job.job_type,attempts:job.attempts,
        extractionSchema:AUCTION_EXTRACTION_SCHEMA,
        subject:{vehicleId:ctx.vehicle?.id??null,auctionLotId:ctx.lot.id,chassisNumber:ctx.vehicle?.chassis_number??ctx.lot.auction_sheet?.chassisNumber??null},
        sourceEvidence:{providerKey:ctx.lot.provider_key,externalLotId:ctx.lot.external_lot_id,auctionHouse:ctx.lot.auction_house,
          auctionAt:ctx.lot.auction_at,providerGrade:ctx.lot.grade,providerOdometerKm:ctx.lot.odometer_km,
          structuredAuctionSheet:ctx.lot.auction_sheet,imageRefs:ctx.lot.images},
        history:ctx.history,comparables:ctx.comparables,costModel:ctx.costModel,
      }});
    }
    if(action==="complete"){
      const jobId=String(body.jobId??"");if(!jobId)throw new Error("jobId is required");
      const job=await db.from("intelligence_jobs").select("*").eq("id",jobId).eq("job_type","automotive.auction_assessment").single();
      if(job.error)throw job.error;
      if(job.data.status!=="processing")throw new Error("Auction intelligence job is not in processing state");
      const structured=extraction(body.extraction);
      const ctx=await contextForJob(db,job.data);
      await db.from("automotive_auction_sheet_extractions").update({status:"superseded",updated_at:new Date().toISOString()})
        .eq("tenant_id",job.data.tenant_id).eq("auction_lot_id",ctx.lot.id).in("status",["proposed","reviewed","approved"]);
      const inserted=await db.from("automotive_auction_sheet_extractions").insert({
        tenant_id:job.data.tenant_id,product_key:job.data.product_key,auction_lot_id:ctx.lot.id,vehicle_id:ctx.vehicle?.id??null,
        intelligence_job_id:job.data.id,source_kind:"ai_vision",source_ref:String(body.sourceRef??workerKey),schema_version:AUCTION_EXTRACTION_SCHEMA.version,
        raw_text:typeof body.rawText==="string"?body.rawText:null,extraction:structured,confidence:structured.confidence,status:"proposed"
      }).select("*").single();
      if(inserted.error)throw inserted.error;
      const result=evaluateAuctionDecision(decisionInput(ctx,structured));
      await db.from("automotive_auction_decisions").update({status:"superseded",updated_at:new Date().toISOString()})
        .eq("tenant_id",job.data.tenant_id).eq("auction_lot_id",ctx.lot.id).in("status",["proposed","reviewed"]);
      const decision=await db.from("automotive_auction_decisions").insert({
        tenant_id:job.data.tenant_id,product_key:job.data.product_key,auction_lot_id:ctx.lot.id,vehicle_id:ctx.vehicle?.id??null,
        extraction_id:inserted.data.id,cost_model_v2_id:ctx.costModel?.id??null,score:result.score,recommendation:result.recommendation,
        confidence:result.confidence,blockers:result.blockers,warnings:result.warnings,reasons:result.reasons,subscores:result.subscores,
        market:result.market,history:result.history,calculation:result,status:"proposed"
      }).select("*").single();
      if(decision.error)throw decision.error;
      if(ctx.vehicle?.id){
        const finding=await db.from("automotive_ai_findings").insert({
          tenant_id:job.data.tenant_id,product_key:job.data.product_key,vehicle_id:ctx.vehicle.id,finding_type:"auction_decision",
          summary:`Auction decision: ${result.recommendation.toUpperCase()} · score ${result.score}/100`,
          details:{auctionLotId:ctx.lot.id,decisionId:decision.data.id,blockers:result.blockers,warnings:result.warnings,reasons:result.reasons},
          evidence_ids:[],confidence:result.confidence,risk:result.recommendation==="do_not_bid"?"high":result.recommendation==="review"?"review":"low",status:"proposed"
        });
        if(finding.error)throw finding.error;
      }
      const updated=await db.from("intelligence_jobs").update({
        status:"waiting_review",result:{extractionId:inserted.data.id,decisionId:decision.data.id,recommendation:result.recommendation,score:result.score,confidence:result.confidence},
        completed_at:new Date().toISOString(),updated_at:new Date().toISOString(),last_error:null
      }).eq("id",jobId);
      if(updated.error)throw updated.error;
      return json({ok:true,extraction:inserted.data,decision:decision.data});
    }
    if(action==="fail"){
      const jobId=String(body.jobId??"");if(!jobId)throw new Error("jobId is required");
      const job=await db.from("intelligence_jobs").select("attempts").eq("id",jobId).single();if(job.error)throw job.error;
      const retry=Number(job.data.attempts??0)<3;
      const next=new Date(Date.now()+5*60*1000).toISOString();
      const failed=await db.from("intelligence_jobs").update({
        status:retry?"queued":"failed",next_attempt_at:retry?next:new Date().toISOString(),locked_at:null,
        last_error:String(body.error??"Auction intelligence worker failed").slice(0,3000),updated_at:new Date().toISOString(),
        completed_at:retry?null:new Date().toISOString()
      }).eq("id",jobId);
      if(failed.error)throw failed.error;
      return json({ok:true,retry,nextAttemptAt:retry?next:null});
    }
    return json({error:"Unsupported action"},400);
  }catch(error){
    return json({error:error instanceof Error?error.message:String(error)},500);
  }
});
