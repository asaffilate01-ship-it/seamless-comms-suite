import {z} from "zod";
import {createHash,timingSafeEqual} from "node:crypto";
import {authoriseServiceScope,parseServiceAuthorization,verifyServiceSecret,type ServiceCredentialRecord} from "@/modules/platform/service-identity";

const uuid=z.string().uuid();
const scope=z.object({tenantId:uuid,productKey:z.string().min(2).max(80)});
const requestSchema=z.discriminatedUnion("operation",[
 scope.extend({operation:z.literal("run.start"),serviceKey:z.string().regex(/^[a-z0-9][a-z0-9.-]{1,100}$/).optional(),profile:z.enum(["discovery","finance","technical","compliance","product","transaction","accounting","tax","operations"]),
  goal:z.string().min(4).max(5000),maxSteps:z.number().int().min(1).max(32).default(8),providerKey:z.string().max(120).nullish(),model:z.string().max(200).nullish(),
  inputVersion:z.string().max(200).nullish(),context:z.record(z.string(),z.unknown()).default({}),sourceRefs:z.array(z.string().max(500)).max(200).default([])}),
 scope.extend({operation:z.literal("run.get"),runId:uuid}),
 scope.extend({operation:z.literal("job.claim"),limit:z.number().int().min(1).max(50).default(10),jobTypes:z.array(z.string().max(120)).max(50).optional()}),
 scope.extend({operation:z.literal("job.finish"),jobId:uuid,success:z.boolean(),result:z.record(z.string(),z.unknown()).default({}),
  providerKey:z.string().max(120).nullish(),model:z.string().max(200).nullish(),error:z.string().max(2000).nullish(),waitingReview:z.boolean().default(false)}),
 scope.extend({operation:z.literal("agent.step"),runId:uuid,stepNo:z.number().int().min(1).max(64),stepType:z.enum(["model","tool","observation","proposal","final"]),
  toolKey:z.string().max(160).nullish(),request:z.record(z.string(),z.unknown()).default({}),response:z.record(z.string(),z.unknown()).default({}),
  sourceRefs:z.array(z.string().max(500)).max(200).default([])}),
 scope.extend({operation:z.literal("action.propose"),runId:uuid.nullish(),actionKey:z.string().min(2).max(160),targetType:z.string().min(1).max(100),
  targetId:z.string().max(200).nullish(),payload:z.record(z.string(),z.unknown()).default({}),rationale:z.string().min(4).max(5000)}),
 scope.extend({operation:z.literal("action.list"),runId:uuid.nullish(),status:z.enum(["pending","approved","rejected"]).nullish(),
  limit:z.number().int().min(1).max(100).default(50)}),
 scope.extend({operation:z.literal("action.review"),proposalId:uuid,decision:z.enum(["approved","rejected"]),actorRef:z.string().min(1).max(200)}),
 scope.extend({operation:z.literal("action.claim"),destinationRef:z.string().min(2).max(160).default("dishbee.runtime"),workerKey:z.string().min(4).max(200),limit:z.number().int().min(1).max(50).default(20)}),
 scope.extend({operation:z.literal("action.finish"),actionRequestId:uuid,claimToken:uuid,workerKey:z.string().min(4).max(200),success:z.boolean(),executionRef:z.string().max(300).nullish(),
  result:z.record(z.string(),z.unknown()).default({}),error:z.string().max(2000).nullish()})
]);

function reply(body:unknown,status=200){return Response.json(body,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});}

async function auth(request:Request,input:z.infer<typeof requestSchema>){
 const header=request.headers.get("authorization")??"";
 const bearer=header.startsWith("Bearer ")?header.slice(7):"";
 const {supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;

 if(bearer.startsWith("oqcp_")){
  if(!["run.start","run.get","action.review","action.claim","action.finish"].includes(input.operation)){
    throw new Error("Connector credential cannot perform this operation");
  }
  const digest=createHash("sha256").update(bearer).digest("hex");
  const {data:row,error}=await db.from("product_connections")
   .select("id,tenant_id,product_key,status,capabilities,credential_hash,credential_expires_at")
   .eq("credential_hash",digest).maybeSingle();
  if(error||!row?.credential_hash)throw new Error("Connector credential refused");
  const actual=Buffer.from(digest,"hex"),expected=Buffer.from(row.credential_hash,"hex");
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error("Connector credential refused");
  if(!["configured","connected","degraded"].includes(row.status))throw new Error("Connector credential is inactive");
  if(row.credential_expires_at&&Date.parse(row.credential_expires_at)<=Date.now())throw new Error("Connector credential expired");
  if(row.tenant_id!==input.tenantId||row.product_key!==input.productKey)throw new Error("Connector tenant scope refused");
  const capability=
    input.operation==="run.start"?"intelligence.run.start":
    input.operation==="run.get"?"intelligence.run.read":
    input.operation==="action.review"?"intelligence.action.review":
    input.operation==="action.claim"?"intelligence.action.claim":
    "intelligence.action.finish";
  if(!Array.isArray(row.capabilities)||!row.capabilities.includes(capability))throw new Error("Connector capability refused");
  return{db,connectorId:row.id,keyId:null as string|null,credential:null as ServiceCredentialRecord|null};
 }

 const {keyId,secret}=parseServiceAuthorization(header);
 const {data:row,error}=await db.from("platform_service_credentials").select("id,key_id,secret_hash,status,expires_at,scopes").eq("key_id",keyId).maybeSingle();
 if(error||!row||!verifyServiceSecret(secret,row.secret_hash))throw new Error("Service credential refused");
 const scopes=z.array(z.object({tenantId:uuid,productKey:z.string().min(2),brandIds:z.array(uuid).optional(),locationIds:z.array(uuid).optional(),capabilities:z.array(z.string())})).parse(row.scopes);
 const credential:ServiceCredentialRecord={id:row.id,keyId:row.key_id,secretHash:row.secret_hash,status:row.status,expiresAt:row.expires_at,scopes};
 return{db,credential,keyId,connectorId:null as string|null};
}

export async function serveIntelligenceService(httpRequest:Request){
 try{
  const raw=await httpRequest.text();if(raw.length>524288)return reply({error:"Payload too large"},413);
  let json:unknown;try{json=JSON.parse(raw);}catch{return reply({error:"Invalid JSON"},400);}
  const input=requestSchema.parse(json);const {db,credential,keyId,connectorId}=await auth(httpRequest,input);
  const capability=input.operation==="run.start"?"intelligence.run.start":
   input.operation==="run.get"?"intelligence.run.read":
   input.operation==="job.claim"?"intelligence.jobs":
   input.operation==="job.finish"?"intelligence.results":
   input.operation==="agent.step"?"intelligence.steps":
   input.operation==="action.list"?"intelligence.run.read":
   input.operation==="action.review"?"intelligence.action.review":
   input.operation==="action.claim"?"intelligence.action.claim":
   input.operation==="action.finish"?"intelligence.action.finish":"ai.proposals";
  const permittedScope=credential?authoriseServiceScope(credential,{tenantId:input.tenantId,productKey:input.productKey,capability}):null;
  if(["action.review","action.claim","action.finish"].includes(input.operation)){
   // This execution contract is product-wide. Restricted location/brand keys
   // cannot silently acquire broader authority through an omitted location.
   if(input.productKey!=="dishbee"||permittedScope?.locationIds?.length||permittedScope?.brandIds?.length){
    throw new Error("Action execution requires explicit product-wide scope");
   }
  }
  const executionWorker=(worker:string)=>`${connectorId?"connector:"+connectorId:"service:"+credential?.id}:${worker}`;
  const ent=await db.rpc("has_tenant_entitlement",{_tenant:input.tenantId,_service:"omniqora.intelligence-runtime"});
  if(ent.error||!ent.data)throw new Error("Omniqora intelligence entitlement required");
  if(input.operation==="run.start"&&input.serviceKey){
   const service=await db.from("service_catalogue").select("service_key,status").eq("service_key",input.serviceKey).maybeSingle();
   if(service.error||!service.data||!["active","beta","internal"].includes(service.data.status))throw new Error("Requested intelligence service is unavailable");
   const entitlement=await db.rpc("has_tenant_entitlement",{_tenant:input.tenantId,_service:input.serviceKey});
   if(entitlement.error||!entitlement.data)throw new Error("Requested intelligence service entitlement required");
  }
  if(input.productKey==="haccora"&&(input.operation==="run.start"||input.operation==="run.get")){
   const haccora=await db.rpc("has_tenant_entitlement",{_tenant:input.tenantId,_service:"haccora.ai-copilot"});
   if(haccora.error||!haccora.data)throw new Error("Haccora AI Copilot entitlement required");
  }

  if(input.operation==="run.start"){
   const {data:run,error:runError}=await db.from("ai_agent_runs").insert({tenant_id:input.tenantId,product_key:input.productKey,
    profile:input.profile,goal:input.goal,status:"queued",max_steps:input.maxSteps,provider_key:input.providerKey??null,model:input.model??null,
    input_version:input.inputVersion??null,initiated_by:null}).select("*").single();
   if(runError)throw new Error(runError.message);
   const {data:job,error:jobError}=await db.from("intelligence_jobs").insert({tenant_id:input.tenantId,product_key:input.productKey,job_type:"agent.run",
    subject_type:"ai_agent_run",subject_id:run.id,priority:"normal",input:{runId:run.id,profile:input.profile,goal:input.goal,maxSteps:input.maxSteps,
    providerKey:input.providerKey,model:input.model,inputVersion:input.inputVersion,serviceKey:input.serviceKey??null,context:input.context,sourceRefs:input.sourceRefs},
    requirements:{boundedTools:true,approvalForWrites:true,citationsRequired:input.productKey==="haccora"}}).select("id").single();
   if(jobError){
    await db.from("ai_agent_runs").update({status:"failed",updated_at:new Date().toISOString()}).eq("id",run.id);
    throw new Error(jobError.message);
   }
   if(credential)await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
   if(connectorId)await db.from("product_connections").update({last_verified_at:new Date().toISOString(),status:"connected",updated_at:new Date().toISOString()}).eq("id",connectorId);
   return reply({runId:run.id,jobId:job.id,status:run.status},202);
  }
  if(input.operation==="run.get"){
   const run=await db.from("ai_agent_runs").select("id,status,profile,goal,result,provider_key,model,token_usage,created_at,updated_at,completed_at")
    .eq("id",input.runId).eq("tenant_id",input.tenantId).eq("product_key",input.productKey).maybeSingle();
   if(run.error||!run.data)throw new Error("Agent run not found");
   const [steps,proposals]=await Promise.all([
    db.from("ai_agent_steps").select("step_no,step_type,tool_key,response,source_refs,status,created_at").eq("run_id",input.runId).eq("tenant_id",input.tenantId).order("step_no"),
    db.from("ai_action_proposals").select("id,action_key,target_type,target_id,payload,rationale,status,action_request_id,reviewed_at,executed_at,execution_result,created_at").eq("run_id",input.runId).eq("tenant_id",input.tenantId).order("created_at")
   ]);
   if(steps.error||proposals.error)throw new Error("Agent run details unavailable");
   if(credential)await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
   if(connectorId)await db.from("product_connections").update({last_verified_at:new Date().toISOString(),status:"connected",updated_at:new Date().toISOString()}).eq("id",connectorId);
   return reply({run:run.data,steps:steps.data??[],proposals:proposals.data??[]});
  }

  if(input.operation==="job.claim"){
   const r=await db.rpc("claim_intelligence_jobs_for_scope",{_tenant:input.tenantId,_product:input.productKey,_limit:input.limit,
    _job_types:input.jobTypes??null,_worker_key:keyId});if(r.error)throw new Error(r.error.message);
   if(credential)await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
   if(connectorId)await db.from("product_connections").update({last_verified_at:new Date().toISOString(),status:"connected",updated_at:new Date().toISOString()}).eq("id",connectorId);
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
  if(input.operation==="action.list"){
   let query=db.from("ai_action_proposals")
    .select("id,run_id,action_key,target_type,target_id,payload,rationale,proposed_by,status,reviewed_by,reviewed_at,created_at")
    .eq("tenant_id",input.tenantId).eq("product_key",input.productKey)
    .order("created_at",{ascending:false}).limit(input.limit);
   if(input.runId)query=query.eq("run_id",input.runId);
   if(input.status)query=query.eq("status",input.status);
   const result=await query;
   if(result.error)throw new Error(result.error.message);
   if(credential)await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
   return reply({proposals:result.data??[]});
  }

  if(input.operation==="action.claim"){
   const r=await db.rpc("claim_product_action_requests",{
    _tenant:input.tenantId,_product:input.productKey,_destination:input.destinationRef,
    _worker:executionWorker(input.workerKey),_limit:input.limit,
   });
   if(r.error)throw new Error(r.error.message);
   if(credential)await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
   if(connectorId)await db.from("product_connections").update({last_verified_at:new Date().toISOString(),status:"connected",updated_at:new Date().toISOString()}).eq("id",connectorId);
   return reply({actions:r.data??[]});
  }

  if(input.operation==="action.finish"){
   const r=await db.rpc("finish_product_action_request",{
    _tenant:input.tenantId,_product:input.productKey,_destination:"dishbee.runtime",
    _worker:executionWorker(input.workerKey),_claim_token:input.claimToken,
    _action:input.actionRequestId,_success:input.success,
    _execution_ref:input.executionRef??null,_result:input.result,_error:input.error??null,
   });
   if(r.error)throw new Error(r.error.message);
   if(credential)await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
   if(connectorId)await db.from("product_connections").update({last_verified_at:new Date().toISOString(),status:"connected",updated_at:new Date().toISOString()}).eq("id",connectorId);
   return reply({ok:true});
  }

  if(input.operation==="action.review"){
   const reviewed=await db.rpc("review_product_action_proposal",{
    _tenant:input.tenantId,_product:input.productKey,_proposal:input.proposalId,
    _decision:input.decision,_actor_ref:input.actorRef,
   });
   if(reviewed.error)throw new Error(reviewed.error.message);
   return reply(reviewed.data);
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
