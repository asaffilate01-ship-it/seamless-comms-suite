import { timingSafeEqual, randomUUID } from "node:crypto";
import { z } from "zod";

type ClaimedAction={
  id:string;tenantId:string;runId:string;workflowId:string;nodeId:string;
  moduleKey?:string|null;actionKey:string;risk:string;input:Record<string,unknown>;attempts:number;
};

function authorised(request:Request){
 const expected=process.env.OMNIQORA_WORKER_TOKEN??"";
 if(expected.length<32)return false;
 const header=request.headers.get("authorization")??"";
 if(!header.startsWith("Bearer "))return false;
 const supplied=header.slice(7);const a=Buffer.from(expected);const b=Buffer.from(supplied);
 return a.length===b.length&&timingSafeEqual(a,b);
}

async function tenantProductForRun(db:any,action:ClaimedAction){
 const{data:workflow,error}=await db.from("automation_workflows")
  .select("tenant_product_id").eq("id",action.workflowId).eq("tenant_id",action.tenantId).maybeSingle();
 if(error||!workflow)throw new Error("Automation workflow scope not found");
 return workflow.tenant_product_id as string|null;
}

async function emitInternalEvent(db:any,action:ClaimedAction,type:string,payload:Record<string,unknown>){
 const tenantProductId=await tenantProductForRun(db,action);
 const{data:tp}=tenantProductId
  ?await db.from("tenant_products").select("product_key").eq("id",tenantProductId).eq("tenant_id",action.tenantId).maybeSingle()
  :{data:null};
 const productKey=String(tp?.product_key??"omniqora");
 const id=randomUUID();
 const{error}=await db.from("platform_events").insert({
  id,tenant_id:action.tenantId,tenant_product_id:tenantProductId,product_key:productKey,
  event_type:type,event_version:1,occurred_at:new Date().toISOString(),environment:"production",
  subject_type:"automation_run",subject_id:action.runId,
  correlation_id:action.runId,causation_id:null,idempotency_key:"automation:"+action.id,
  data_classification:"internal",payload
 });
 if(error)throw new Error(error.message);return{id};
}

async function executeAction(db:any,action:ClaimedAction){
 const input=action.input??{};
 const tenantProductId=await tenantProductForRun(db,action);

 if(action.actionKey==="crm.task.create"){
  const parsed=z.object({
   title:z.string().min(1).max(240),description:z.string().max(4000).optional().nullable(),
   priority:z.enum(["low","normal","high","urgent"]).default("normal"),
   dueAt:z.string().datetime().optional().nullable(),assigneeUserId:z.string().uuid().optional().nullable(),
   relatedType:z.enum(["person","company","lead","opportunity","case","conversation","external"]).optional().nullable(),
   relatedId:z.string().max(240).optional().nullable()
  }).parse(input);
  const{data:row,error}=await db.from("crm_tasks").insert({
   tenant_id:action.tenantId,title:parsed.title,description:parsed.description??null,status:"open",
   priority:parsed.priority,due_at:parsed.dueAt??null,assignee_user_id:parsed.assigneeUserId??null,
   related_type:parsed.relatedType??null,related_id:parsed.relatedId??null,
   source_product_key:"omniqora-automation",external_ref:"automation:"+action.id,
   metadata:{automationRunId:action.runId},created_by:null
  }).select("id").single();
  if(error||!row)throw new Error(error?.message??"CRM task action failed");return{taskId:row.id};
 }

 if(action.actionKey==="creative.brief.create"){
  if(!tenantProductId)throw new Error("Creative action requires tenant product scope");
  const parsed=z.object({
   objective:z.string().min(1).max(2000),audience:z.string().min(1).max(2000),
   channels:z.array(z.string().max(80)).min(1).max(20),assetTypes:z.array(z.string().max(80)).min(1).max(50),
   message:z.string().min(1).max(5000),offer:z.string().max(1000).optional().nullable(),
   callToAction:z.string().max(500).optional().nullable(),brandKitId:z.string().uuid().optional().nullable()
  }).parse(input);
  const{data:row,error}=await db.from("creative_briefs").insert({
   tenant_id:action.tenantId,tenant_product_id:tenantProductId,brand_kit_id:parsed.brandKitId??null,
   campaign_ref:null,objective:parsed.objective,audience:parsed.audience,channels:parsed.channels,
   asset_types:parsed.assetTypes,message:parsed.message,offer:parsed.offer??null,call_to_action:parsed.callToAction??null,
   status:"draft"
  }).select("id").single();
  if(error||!row)throw new Error(error?.message??"Creative brief action failed");return{briefId:row.id};
 }

 if(action.actionKey==="loyalty.entry.apply"){
  if(!tenantProductId)throw new Error("Loyalty action requires tenant product scope");
  const parsed=z.object({
   programmeId:z.string().uuid(),customerRef:z.string().min(1).max(200),
   entryType:z.enum(["earn","redeem","adjust","expire","reverse"]),quantity:z.number(),
   reason:z.string().max(1000).optional().nullable()
  }).parse(input);
  const{data:program}=await db.from("loyalty_programmes").select("id")
   .eq("id",parsed.programmeId).eq("tenant_id",action.tenantId).eq("tenant_product_id",tenantProductId).eq("active",true).maybeSingle();
  if(!program)throw new Error("Active loyalty programme not found");
  const{data:id,error}=await db.rpc("apply_loyalty_entry",{
   _tenant:action.tenantId,_programme:parsed.programmeId,_customer_ref:parsed.customerRef,
   _entry_type:parsed.entryType,_quantity:parsed.quantity,_source_ref:"automation:"+action.id,
   _reason:parsed.reason??("Automation "+action.runId),_occurred_at:new Date().toISOString()
  });
  if(error||!id)throw new Error(error?.message??"Loyalty action failed");return{ledgerId:id};
 }

 if(action.actionKey==="dispatch.job.create"){
  if(!tenantProductId)throw new Error("Dispatch action requires tenant product scope");
  const parsed=z.object({
   jobType:z.string().min(1).max(120),priority:z.enum(["low","normal","high","urgent"]).default("normal"),
   locationId:z.string().uuid().optional().nullable(),scheduledAt:z.string().datetime().optional().nullable(),
   requiredSkills:z.array(z.string().max(120)).max(100).default([]),
   requiredVehicleTypes:z.array(z.string().max(120)).max(100).default([]),
   externalRef:z.string().max(200).optional().nullable(),metadata:z.record(z.string(),z.unknown()).default({})
  }).parse(input);
  const{data:tp}=await db.from("tenant_products").select("product_key").eq("id",tenantProductId).maybeSingle();
  const{data:row,error}=await db.from("dispatch_jobs").insert({
   tenant_id:action.tenantId,tenant_product_id:tenantProductId,location_id:parsed.locationId??null,
   product_key:String(tp?.product_key??"unknown"),job_type:parsed.jobType,status:"unassigned",priority:parsed.priority,
   required_skills:parsed.requiredSkills,required_vehicle_types:parsed.requiredVehicleTypes,
   scheduled_at:parsed.scheduledAt??null,external_ref:parsed.externalRef??("automation:"+action.id),
   metadata:{...parsed.metadata,automationRunId:action.runId}
  }).select("id").single();
  if(error||!row)throw new Error(error?.message??"Dispatch job action failed");return{jobId:row.id};
 }

 if(["feedback.request.create","connect.message.request","compliance.review.request","intelligence.decision"].includes(action.actionKey)){
  const eventType={
   "feedback.request.create":"feedback.requested",
   "connect.message.request":"connect.message.requested",
   "compliance.review.request":"compliance.review.requested",
   "intelligence.decision":"intelligence.decision.requested"
  }[action.actionKey]!;
  return await emitInternalEvent(db,action,eventType,{...input,automationActionId:action.id});
 }

 throw new Error("Automation action executor not implemented: "+action.actionKey);
}

export async function runAutomationActionBatch(limit=20){
 const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
 const{data:claimed,error}=await db.rpc("claim_automation_actions",{_limit:limit});
 if(error)throw new Error(error.message);
 const results:Array<Record<string,unknown>>=[];
 for(const raw of claimed??[]){
  const action=raw as ClaimedAction;
  try{
   const result=await executeAction(db,action);
   const{error:finishError}=await db.rpc("finish_automation_action",{_action:action.id,_success:true,_result:result,_error:null});
   if(finishError)throw new Error(finishError.message);
   results.push({actionId:action.id,status:"completed",result});
  }catch(error){
   const message=error instanceof Error?error.message:"Action failed";
   await db.rpc("finish_automation_action",{_action:action.id,_success:false,_result:{},_error:message});
   results.push({actionId:action.id,status:"failed",error:message});
  }
 }
 return results;
}

export async function serveAutomationActionWorker(request:Request){
 if(!authorised(request))return Response.json({error:"Worker authorization refused"},{status:401,headers:{"cache-control":"no-store"}});
 let input:unknown={};try{const raw=await request.text();input=raw?JSON.parse(raw):{};}catch{return Response.json({error:"Invalid JSON"},{status:400});}
 const parsed=z.object({limit:z.number().int().min(1).max(100).default(20)}).parse(input);
 try{
  const results=await runAutomationActionBatch(parsed.limit);
  return Response.json({processed:results.length,results},{headers:{"cache-control":"no-store"}});
 }catch(error){
  return Response.json({error:error instanceof Error?error.message:"Automation action worker failed"},{status:503,headers:{"cache-control":"no-store"}});
 }
}
