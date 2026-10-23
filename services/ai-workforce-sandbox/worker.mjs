#!/usr/bin/env node
/**
 * Omniqora Phase 4B worker — one bounded, manually invoked pass.
 * Only fetches pre-authorised, synthetic-only jobs from Supabase.
 * There are NO AI model calls, arbitrary reads, tool definitions, URLs, or app actions.
 * Disabled by default; no scheduler or deployment is created by this file.
 */
import {pathToFileURL} from "node:url";
import {createSyntheticReceipt} from "./fixtures.mjs";

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const product=/^[a-z0-9][a-z0-9.-]{1,80}$/;
const worker=/^[A-Za-z0-9_-]{8,80}$/;

function checkScope({tenantId,productKey,workerRef,enabled,limit}){
 if(enabled!==true)throw new Error("Sandbox runner must be explicitly enabled by operator");
 if(!uuid.test(tenantId)||!product.test(productKey)||!worker.test(workerRef)||
    !Number.isInteger(limit)||limit<1||limit>5)throw new Error("Invalid sandbox worker scope");
}
async function call(db,method,args){
 if(!db||typeof db.rpc!=="function")throw new Error("A server-side trusted database client is required");
 const result=await db.rpc(method,args);
 if(result.error)throw new Error("Sandbox database operation refused: "+String(result.error.message).slice(0,180));
 return result.data;
}
function checkClaim(claim,scope){
 if(!claim||claim.tenantId!==scope.tenantId||claim.productKey!==scope.productKey||
   claim.syntheticOnly!==true||!uuid.test(claim.admissionId||"")||
   !uuid.test(claim.jobId||"")||!uuid.test(claim.employeeId||"")||
   !uuid.test(claim.taskId||""))throw new Error("Cross-scope or forged sandbox claim refused");
}
/** Not a continuous or scheduled worker. Execution requires explicit caller enable. */
export async function runFixtureSandboxPass({
 db,tenantId,productKey,workerRef,limit=2,enabled=false,
}){
 const scope={tenantId,productKey,workerRef,limit,enabled};
 checkScope(scope);
 const claims=await call(db,"claim_ai_workforce_fixture_rehearsals",{
   _tenant:tenantId,_product:productKey,_worker_ref:workerRef,_limit:limit,
 });
 if(!Array.isArray(claims))throw new Error("Sandbox service returned a non-list of claims");
 if(claims.length>limit)throw new Error("Sandbox service exceeded worker limit");
 const results=[];
 for(const claim of claims){
  // Failed claim validation must not be turned into an external tool/action.
  checkClaim(claim,scope);
  let receipt=null;
  try {
    receipt=createSyntheticReceipt(claim);
    const done=await call(db,"finish_ai_workforce_fixture_rehearsal",{
      _tenant:tenantId,_product:productKey,_admission:claim.admissionId,
      _worker_ref:workerRef,_success:true,_result:receipt,_error:null,
    });
    if(!done||done.status!=="completed"||done.syntheticOnly!==true||done.costMinor!==0){
       throw new Error("Invalid sandbox finalisation receipt");
    }
    results.push({admissionId:claim.admissionId,status:"completed",fixtureKey:claim.fixtureKey});
  }catch(e) {
    // A revoked pilot can reject success; make the recorded job terminal-failed
    // via the same server-only RPC. Do not claim that an action succeeded.
    try{
      await call(db,"finish_ai_workforce_fixture_rehearsal",{
        _tenant:tenantId,_product:productKey,_admission:claim.admissionId,
        _worker_ref:workerRef,_success:false,_result:{},_error:"synthetic rehearsal failed",
      });
    }catch{
      // Keep failures observable, not masked by fabricated success.
    }
    results.push({admissionId:claim.admissionId,status:"failed"});
  }
 }
 return {scope:{tenantId,productKey},syntheticOnly:true,modelCalls:0,toolCalls:0,costMinor:0,
   claimed:claims.length,completed:results.filter(x=>x.status==="completed").length,
   failed:results.filter(x=>x.status==="failed").length,results};
}
function validateDbUrl(value,allowedHost){
 const url=new URL(value);
 if(url.protocol!=="https:"||url.port||url.username||url.password||
    !url.hostname.endsWith(".supabase.co")||
    url.hostname!==allowedHost||url.pathname!=="/"||url.search||url.hash){
   throw new Error("Sandbox database endpoint must be an explicitly approved HTTPS Supabase host");
 }
 return url.toString();
}
/** CLI is dormant unless every deployment/operator switch is supplied. */
export async function main(env=process.env){
 if(env.AI_WORKFORCE_SANDBOX_RUNNER_ENABLED!=="true"){
   throw new Error("Sandbox worker is disabled. Explicit operator rollout required.");
 }
 const dbUrl=validateDbUrl(env.SUPABASE_URL||"",env.AI_WORKFORCE_ALLOWED_DATABASE_HOST||"");
 const token=env.SUPABASE_SERVICE_ROLE_KEY||"";
 if(token.length<32)throw new Error("Server-only Supabase service credential required");
 const scope={tenantId:env.AI_WORKFORCE_TENANT_ID,productKey:env.AI_WORKFORCE_PRODUCT_KEY,
   workerRef:env.AI_WORKFORCE_WORKER_REF,enabled:true,limit:2};
 checkScope(scope);
 // This is the ONLY networking in this worker. Never follow redirects.
 const {createClient}=await import("@supabase/supabase-js");
 const db=createClient(dbUrl,token,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:(input,init)=>fetch(input,{...init,redirect:"error"})},
 });
 const result=await runFixtureSandboxPass({db,...scope});
 // No raw job payloads, tokens, business data, provider URLs or receipt details in logs.
 process.stdout.write(JSON.stringify({
  sandboxOnly:true,processed:result.claimed,completed:result.completed,failed:result.failed,
 })+"\n");
 if(result.failed)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(e=>{
   process.stderr.write("Synthetic AI Workforce sandbox refused: "+
     (e instanceof Error?e.message:"unknown error").slice(0,220)+"\n");
   process.exitCode=1;
 });
}
