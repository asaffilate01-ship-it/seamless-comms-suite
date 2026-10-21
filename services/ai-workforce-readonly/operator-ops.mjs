#!/usr/bin/env node
/**
 * AI Workforce 4E: explicit, ONE-PASS staging operator commands.
 * No cron, provider model calls, arbitrary endpoints, customer or financial writes.
 * Only calls the privileged allowlist/quarantine/emergency-stop RPCs.
 */
import {pathToFileURL} from "node:url";

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const WORKER=/^[A-Za-z0-9_-]{8,80}$/;
const MODEL=/^[A-Za-z0-9][A-Za-z0-9._-]{2,99}$/;

function assertScope(scope){
 if(scope.enabled!==true||!UUID.test(scope.tenantId??"")||
    scope.productKey!=="omniqora"||
    !["allow","disable","quarantine","stop"].includes(scope.action)) {
  throw new Error("Operator mode or tenant/product scope refused");
 }
 if(["allow","disable"].includes(scope.action)){
  if(!WORKER.test(scope.workerRef??"")||!MODEL.test(scope.modelKey??"")||
    !Number.isInteger(scope.maxClaims)||scope.maxClaims<1||scope.maxClaims>8||
    typeof scope.operatorReference!=="string"||scope.operatorReference.trim().length<16||
    typeof scope.evidenceReference!=="string"||
    !scope.evidenceReference.startsWith("https://")||
    scope.evidenceReference.length<20||scope.evidenceReference.length>500){
    throw new Error("Incomplete operator worker approval evidence");
  }
 }
 if(scope.action==="quarantine" &&
    (!Number.isInteger(scope.minimumAgeMinutes)||scope.minimumAgeMinutes<15||
      scope.minimumAgeMinutes>1440||!Number.isInteger(scope.limit)||
      scope.limit<1||scope.limit>20)){
   throw new Error("Unbounded reconciliation watchdog request");
 }
 if(scope.action==="stop" &&
   (typeof scope.operatorReference!=="string"||
     scope.operatorReference.trim().length<16)){
   throw new Error("Emergency stop requires operator evidence");
 }
}
async function checkedRpc(db,fn,args){
 if(!db||typeof db.rpc!=="function")throw new Error("Trusted service-role database required");
 const r=await db.rpc(fn,args);
 if(r.error)throw new Error("Operator action refused: "+String(r.error.message).slice(0,180));
 return r.data;
}
/**
 * Testable pure orchestration around privileged RPCs.
 * A successful RPC is NOT a claim that a model was called or charges cleared.
 */
export async function executeOperatorAction({db,scope}){
 assertScope(scope);
 const base={_tenant:scope.tenantId,_product:"omniqora"};
 if(scope.action==="quarantine"){
  const r=await checkedRpc(db,"quarantine_stale_ai_workforce_readonly",{
   ...base,_minutes:scope.minimumAgeMinutes,_limit:scope.limit,
  });
  if(!r||!Number.isInteger(r.quarantined)||r.reservationsReleased!==0){
   throw new Error("Untrusted watchdog result");
  }
  return {action:"quarantine",quarantined:r.quarantined,reservationsReleased:0};
 }
 if(scope.action==="stop"){
  const r=await checkedRpc(db,"emergency_stop_ai_workforce_readonly",{
   ...base,_operator_reference:scope.operatorReference.trim(),
  });
  if(!r||r.pilotEnabled!==false||r.reservationsReleased!==0){
   throw new Error("Emergency stop not confirmed");
  }
  return {action:"stop",pilotEnabled:false,
   workerPermitsRevoked:r.workerPermitsRevoked,reservationsReleased:0};
 }
 const allow=scope.action==="allow";
 const expiresAt=new Date(Date.now()+(allow?30:1)*60_000).toISOString();
 const r=await checkedRpc(db,"configure_ai_workforce_worker_allowlist",{
   ...base,_worker_ref:scope.workerRef,_model_key:scope.modelKey,
   _enabled:allow,_expires_at:expiresAt,
   _max_claims:scope.maxClaims,
   _operator_reference:scope.operatorReference.trim(),
   _evidence_reference:scope.evidenceReference,
 });
 if(!r||r.status!==(allow?"active":"disabled")){
   throw new Error("Operator worker permit state unconfirmed");
 }
 return {action:scope.action,status:r.status,workerRef:scope.workerRef,
   maxClaims:r.max_claims,usedClaims:r.used_claims};
}
function checkHost(raw,approvedHost){
 const url=new URL(raw);
 if(url.protocol!=="https:"||url.port||url.username||url.password||
   !url.hostname.endsWith(".supabase.co")||url.hostname!==approvedHost||
   url.pathname!=="/"||url.search||url.hash){
  throw new Error("Exact approved staging Supabase HTTPS host required");
 }
 return url.toString();
}
export async function main(env=process.env){
 if(env.AI_WORKFORCE_OPS_ENABLED!=="true"||
   env.AI_WORKFORCE_OPS_CONFIRM!=="MANUAL_STAGING_APPROVED"||
   env.NODE_ENV==="production"){
   throw new Error("AI Workforce operator actions are disabled outside approved staging");
 }
 const url=checkHost(env.SUPABASE_URL??"",env.AI_WORKFORCE_ALLOWED_DATABASE_HOST??"");
 const token=env.SUPABASE_SERVICE_ROLE_KEY??"";
 if(token.length<32)throw new Error("Server-only service-role token required");
 const scope={
  enabled:true,action:env.AI_WORKFORCE_OPS_ACTION,
  tenantId:env.AI_WORKFORCE_TENANT_ID,
  productKey:env.AI_WORKFORCE_PRODUCT_KEY,
  workerRef:env.AI_WORKFORCE_WORKER_REF,
  modelKey:env.AI_WORKFORCE_MODEL_ID,
  maxClaims:Number(env.AI_WORKFORCE_MAX_WORKER_CLAIMS??1),
  operatorReference:env.AI_WORKFORCE_OPERATOR_REFERENCE,
  evidenceReference:env.AI_WORKFORCE_EVIDENCE_URL,
  minimumAgeMinutes:Number(env.AI_WORKFORCE_STALE_MINUTES??15),
  limit:Number(env.AI_WORKFORCE_QUARANTINE_LIMIT??10),
 };
 assertScope(scope);
 const {createClient}=await import("@supabase/supabase-js");
 const db=createClient(url,token,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:(input,options)=>fetch(input,{...options,redirect:"error"})},
 });
 const result=await executeOperatorAction({db,scope});
 // Never print secrets or raw business, provider, budget or patient data.
 process.stdout.write(JSON.stringify({
   action:result.action,completed:true,
   quarantined:result.quarantined??0,
   operatorConfirmed:true,reservationsReleased:result.reservationsReleased??0,
 })+"\n");
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(err=>{
  process.stderr.write("AI Workforce operator control refused: "+
   (err instanceof Error?err.message:"unknown").slice(0,180)+"\n");
  process.exitCode=1;
 });
}
