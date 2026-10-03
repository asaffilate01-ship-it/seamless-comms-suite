import {z} from "zod";
import {authoriseServiceScope,parseServiceAuthorization,verifyServiceSecret,type ServiceCredentialRecord} from "@/modules/platform/service-identity";

const uuid=z.string().uuid();
const scope=z.object({tenantId:uuid,productKey:z.string().min(2).max(80)});
const request=z.discriminatedUnion("operation",[
 scope.extend({operation:z.literal("job.claim"),limit:z.number().int().min(1).max(50).default(10),jobTypes:z.array(z.string().max(120)).max(50).optional()}),
 scope.extend({operation:z.literal("job.finish"),jobId:uuid,success:z.boolean(),result:z.record(z.string(),z.unknown()).default({}),
  providerKey:z.string().max(120).nullish(),model:z.string().max(200).nullish(),error:z.string().max(2000).nullish(),waitingReview:z.boolean().default(false)}),
 scope.extend({operation:z.literal("agent.step"),runId:uuid,stepNo:z.number().int().min(1).max(64),stepType:z.enum(["model","tool","observation","proposal","final"]),
  toolKey:z.string().max(160).nullish(),request:z.record(z.string(),z.unknown()).default({}),response:z.record(z.string(),z.unknown()).default({}),
  sourceRefs:z.array(z.string().max(500)).max(200).default([])}),
 scope.extend({operation:z.literal("action.propose"),runId:uuid.nullish(),actionKey:z.string().min(2).max(160),targetType:z.string().min(1).max(100),
  targetId:z.string().max(200).nullish(),payload:z.record(z.string(),z.unknown()).default({}),rationale:z.string().min(4).max(5000)})
]);

function reply(body:unknown,status=200){return Response.json(body,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});}

async function auth(request:Request){
 const {keyId,secret}=parseServiceAuthorization(request.headers.get("authorization"));
 const {supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
 const {data:row,error}=await db.from("platform_service_credentials").select("id,key_id,secret_hash,status,expires_at,scopes").eq("key_id",keyId).maybeSingle();
 if(error||!row||!verifyServiceSecret(secret,row.secret_hash))throw new Error("Service credential refused");
 const scopes=z.array(z.object({tenantId:uuid,productKey:z.string().min(2),brandIds:z.array(uuid).optional(),locationIds:z.array(uuid).optional(),capabilities:z.array(z.string())})).parse(row.scopes);
 const credential:ServiceCredentialRecord={id:row.id,keyId:row.key_id,secretHash:row.secret_hash,status:row.status,expiresAt:row.expires_at,scopes};
 return{db,credential,keyId};
}

export async function serveIntelligenceService(httpRequest:Request){
 try{
  const raw=await httpRequest.text();if(raw.length>524288)return reply({error:"Payload too large"},413);
  let json:unknown;try{json=JSON.parse(raw);}catch{return reply({error:"Invalid JSON"},400);}
  const input=request.parse(json);const {db,credential,keyId}=await auth(httpRequest);
  const capability=input.operation==="job.claim"?"intelligence.jobs":
   input.operation==="job.finish"?"intelligence.results":
   input.operation==="agent.step"?"intelligence.steps":"ai.proposals";
  authoriseServiceScope(credential,{tenantId:input.tenantId,productKey:input.productKey,capability});
  const ent=await db.rpc("has_tenant_entitlement",{_tenant:input.tenantId,_service:"omniqora.intelligence-runtime"});
  if(ent.error||!ent.data)throw new Error("Omniqora intelligence entitlement required");

  if(input.operation==="job.claim"){
   const r=await db.rpc("claim_intelligence_jobs_for_scope",{_tenant:input.tenantId,_product:input.productKey,_limit:input.limit,
    _job_types:input.jobTypes??null,_worker_key:keyId});if(r.error)throw new Error(r.error.message);
   await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
   return reply({jobs:r.data??[]});
  }
  if(input.operation==="job.finish"){
   const r=await db.rpc("finish_intelligence_job",{_job:input.jobId,_success:input.success,_result:input.result,_provider_key:input.providerKey??null,
    _model:input.model??null,_error:input.error??null,_waiting_review:input.waitingReview});if(r.error)throw new Error(r.error.message);
   const job=await db.from("intelligence_jobs").select("subject_type,subject_id,status").eq("id",input.jobId).eq("tenant_id",input.tenantId).maybeSingle();
   if(job.error)throw new Error(job.error.message);
   if(job.data?.subject_type==="ai_agent_run"){
    await db.from("ai_agent_runs").update({status:input.success?(input.waitingReview?"waiting_review":"completed"):"failed",
     result:input.result,provider_key:input.providerKey??null,model:input.model??null,completed_at:input.success&&!input.waitingReview?new Date().toISOString():null,
     updated_at:new Date().toISOString()}).eq("id",job.data.subject_id).eq("tenant_id",input.tenantId);
   }
   return reply({ok:true});
  }
  if(input.operation==="agent.step"){
   const run=await db.from("ai_agent_runs").select("id,status,max_steps").eq("id",input.runId).eq("tenant_id",input.tenantId).eq("product_key",input.productKey).maybeSingle();
   if(run.error||!run.data)throw new Error("Agent run not found");
   if(["cancelled","failed","completed","stale"].includes(run.data.status))throw new Error("Agent run is not active");
   if(input.stepNo>run.data.max_steps)throw new Error("Agent step limit exceeded");
   const {data:step,error}=await db.from("ai_agent_steps").upsert({run_id:input.runId,tenant_id:input.tenantId,step_no:input.stepNo,step_type:input.stepType,
    tool_key:input.toolKey??null,request:input.request,response:input.response,source_refs:input.sourceRefs,status:"complete"},{onConflict:"run_id,step_no"}).select("*").single();
   if(error)throw new Error(error.message);
   await db.from("ai_agent_runs").update({status:input.stepType==="final"?"completed":"running",current_step:input.stepNo,
    completed_at:input.stepType==="final"?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq("id",input.runId);
   return reply(step,201);
  }
  const {data:proposal,error}=await db.from("ai_action_proposals").insert({tenant_id:input.tenantId,product_key:input.productKey,run_id:input.runId??null,
   action_key:input.actionKey,target_type:input.targetType,target_id:input.targetId??null,payload:input.payload,rationale:input.rationale,
   proposed_by:"ai",status:"pending"}).select("*").single();if(error)throw new Error(error.message);return reply(proposal,201);
 }catch(error){
  if(error instanceof z.ZodError)return reply({error:"Invalid intelligence service contract"},422);
  const message=error instanceof Error?error.message:"Intelligence service refused";
  if(/credential|scope|entitlement|authorization|expired|access/i.test(message))return reply({error:message},403);
  return reply({error:message},503);
 }
}
