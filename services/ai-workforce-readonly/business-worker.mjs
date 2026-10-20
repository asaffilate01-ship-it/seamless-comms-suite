#!/usr/bin/env node
/**
 * Manually started, one-pass, first-party aggregate CRM employee worker.
 * No scheduler, dynamic SQL, web browsing, MCP tools or external write actions.
 * A real provider call is allowed only when independent DB/operator gates pass.
 */
import {pathToFileURL} from "node:url";
import {performReadOnlyCrmModelCall,validateCrmReadOnlyClaim} from "./business-crm.mjs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY=/^[A-Za-z0-9_-]{8,80}$/;
const FIXED_PRODUCT="omniqora";

function assertScope(scope){
 if(scope.enabled!==true||!UUID.test(scope.tenantId??"")||
    scope.productKey!==FIXED_PRODUCT||!KEY.test(scope.workerRef??"")||
    typeof scope.modelId!=="string"||!/^[-.A-Za-z0-9_]{3,100}$/.test(scope.modelId))
   throw new Error("Real CRM read-only pilot scope was not explicitly authorised");
 if(typeof scope.providerToken!=="string"||scope.providerToken.length<32)
   throw new Error("Server-only provider token missing");
}
async function rpc(db,fn,args){
 if(!db||typeof db.rpc!=="function")throw new Error("Missing trusted database session");
 const result=await db.rpc(fn,args);
 if(result.error)throw new Error("Scoped CRM worker operation refused: "+
   String(result.error.message).slice(0,180));
 return result.data;
}
/**
 * Maximum one model call per run. No unattended retry: once a provider might
 * have been contacted, failure keeps the reservation held for reconciliation.
 */
export async function runReadOnlyCrmPass({db,scope,fetcher=fetch}){
 assertScope(scope);
 const claims=await rpc(db,"claim_ai_workforce_readonly_jobs",{
  _tenant:scope.tenantId,_product:FIXED_PRODUCT,_worker_ref:scope.workerRef,_limit:1,
 });
 if(!Array.isArray(claims)||claims.length>1)throw new Error("Invalid worker claim count");
 const events=[];
 let modelRequestsAttempted=0;
 for(const claim of claims){
  const expected={tenantId:scope.tenantId,productKey:FIXED_PRODUCT,modelId:scope.modelId};
  let receipt=null;
  try{
   validateCrmReadOnlyClaim(claim,expected);
   modelRequestsAttempted+=1;
   receipt=await performReadOnlyCrmModelCall({
    claim,expected,providerToken:scope.providerToken,fetcher,
   });
   const result=await rpc(db,"finish_ai_workforce_readonly_job",{
    _tenant:scope.tenantId,_product:FIXED_PRODUCT,
    _admission:claim.admissionId,_worker_ref:scope.workerRef,_receipt:receipt,
   });
   if(result?.status!=="waiting_review"||result.reviewRequired!==true||
      result.modelCalls!==1||result.toolCalls!==0||result.customerActions!==0){
    throw new Error("Model settlement returned an unauthorised state");
   }
   events.push({admissionId:claim.admissionId,status:"waiting_review"});
  }catch(err){
   // A provider might have accepted and charged a request even if a network
   // timeout or post-response DB validation failed. NEVER settle as £0.
   try{
    await rpc(db,"flag_ai_workforce_readonly_reconciliation",{
     _tenant:scope.tenantId,_product:FIXED_PRODUCT,
     _admission:claim?.admissionId,_worker_ref:scope.workerRef,
     _reason:"Provider outcome requires manual metering review",
    });
   }catch{ /* preserve error; operator must inspect held reservation */ }
   events.push({admissionId:claim?.admissionId??null,status:"reconciliation_required"});
  }
 }
 return {
  firstPartyCrm:true,modelCallsAttempted:modelRequestsAttempted,toolCalls:0,customerActions:0,
  claimed:claims.length,waitingReview:events.filter(x=>x.status==="waiting_review").length,
  reconciliationRequired:events.filter(x=>x.status==="reconciliation_required").length,
  events,
 };
}
function dbOrigin(url,allowedHost){
 const value=new URL(url);
 if(value.protocol!=="https:"||value.port||value.username||value.password||
  !value.hostname.endsWith(".supabase.co")||value.hostname!==allowedHost||
  value.pathname!=="/"||value.search||value.hash){
  throw new Error("Explicit staging HTTPS Supabase database host required");
 }
 return value.toString();
}
export async function main(env=process.env){
 if(env.AI_WORKFORCE_READONLY_PILOT_ENABLED!=="true"||
   env.AI_WORKFORCE_READONLY_CONFIRM!=="CONSENTED_AGGREGATE_APPROVED"||
   env.NODE_ENV==="production"){
  throw new Error("Read-only CRM model worker is disabled outside the approved staging pilot");
 }
 const approvedDb=dbOrigin(env.SUPABASE_URL??"",
   env.AI_WORKFORCE_ALLOWED_DATABASE_HOST??"");
 const token=env.SUPABASE_SERVICE_ROLE_KEY??"";
 if(token.length<32)throw new Error("Trusted service-role database token required");
 const scope={
  tenantId:env.AI_WORKFORCE_TENANT_ID,
  productKey:env.AI_WORKFORCE_PRODUCT_KEY,
  workerRef:env.AI_WORKFORCE_WORKER_REF,
  modelId:env.AI_WORKFORCE_MODEL_ID,
  providerToken:env.AI_WORKFORCE_PROVIDER_TOKEN,
  enabled:true,
 };
 assertScope(scope);
 const {createClient}=await import("@supabase/supabase-js");
 const db=createClient(approvedDb,token,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:(input,opts)=>fetch(input,{...opts,redirect:"error"})},
 });
 const result=await runReadOnlyCrmPass({db,scope});
 // Only controlled counters, never raw CRM data, AI output, tokens or secrets.
 process.stdout.write(JSON.stringify({
  mode:"read_only_first_party_crm",claimed:result.claimed,
  reviewQueue:result.waitingReview,reconciliationRequired:result.reconciliationRequired,
 })+"\n");
 if(result.reconciliationRequired)process.exitCode=1;
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(err=>{
  process.stderr.write("AI Workforce CRM worker refused: "+
   (err instanceof Error?err.message:"unknown error").slice(0,180)+"\n");
  process.exitCode=1;
 });
}
