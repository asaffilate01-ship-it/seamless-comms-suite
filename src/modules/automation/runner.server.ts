import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { automationActionDefinition } from "./action-registry";

type Node={
  id:string;kind:"trigger"|"condition"|"ai_decision"|"action"|"delay"|"branch"|"approval"|"outcome";
  name:string;moduleKey?:string|null;actionKey?:string|null;config:Record<string,unknown>;
};
type Edge={from:string;to:string;condition?:string|null};
type ClaimedRun={
  id:string;tenantId:string;workflowId:string;workflowVersion:number;
  eventId?:string|null;currentNodeId?:string|null;context:Record<string,unknown>;
  stepCount:number;attempts:number;
};

function authorised(request:Request){
  const expected=process.env.OMNIQORA_WORKER_TOKEN??"";
  if(expected.length<32)return false;
  const header=request.headers.get("authorization")??"";
  if(!header.startsWith("Bearer "))return false;
  const supplied=header.slice(7);
  const a=Buffer.from(expected);const b=Buffer.from(supplied);
  return a.length===b.length&&timingSafeEqual(a,b);
}

function getPath(value:unknown,path:string):unknown{
  if(!path)return value;
  let current:any=value;
  for(const part of path.split(".")){
    if(current===null||current===undefined||typeof current!=="object")return undefined;
    current=current[part];
  }
  return current;
}

function evaluateCondition(config:Record<string,unknown>,context:Record<string,unknown>):boolean{
  const path=String(config.path??"");
  const op=String(config.operator??"eq");
  const actual=getPath(context,path);
  const expected=config.value;
  switch(op){
    case"eq":return actual===expected;
    case"neq":return actual!==expected;
    case"exists":return actual!==undefined&&actual!==null;
    case"not_exists":return actual===undefined||actual===null;
    case"gt":return Number(actual)>Number(expected);
    case"gte":return Number(actual)>=Number(expected);
    case"lt":return Number(actual)<Number(expected);
    case"lte":return Number(actual)<=Number(expected);
    case"contains":return Array.isArray(actual)?actual.includes(expected):String(actual??"").includes(String(expected??""));
    case"in":return Array.isArray(expected)&&expected.includes(actual);
    default:throw new Error("Unsupported automation condition operator: "+op);
  }
}

function outgoing(edges:Edge[],nodeId:string){return edges.filter((edge)=>edge.from===nodeId);}

function nextForBoolean(edges:Edge[],nodeId:string,result:boolean):string|null{
  const list=outgoing(edges,nodeId);
  const expected=result?"true":"false";
  return list.find((edge)=>edge.condition===expected)?.to
    ??list.find((edge)=>!edge.condition)?.to
    ??null;
}

function nextSingle(edges:Edge[],nodeId:string):string|null{
  const list=outgoing(edges,nodeId);
  if(list.length>1)throw new Error("Node requires explicit branch selection: "+nodeId);
  return list[0]?.to??null;
}

async function loadWorkflow(db:any,run:ClaimedRun){
  const{data:version,error}=await db.from("automation_workflow_versions")
    .select("nodes,edges").eq("workflow_id",run.workflowId).eq("tenant_id",run.tenantId)
    .eq("version",run.workflowVersion).maybeSingle();
  if(error||!version)throw new Error("Automation workflow version not found");
  const nodes=z.array(z.object({
    id:z.string(),kind:z.enum(["trigger","condition","ai_decision","action","delay","branch","approval","outcome"]),
    name:z.string(),moduleKey:z.string().optional().nullable(),actionKey:z.string().optional().nullable(),
    config:z.record(z.string(),z.unknown()).default({})
  })).parse(version.nodes) as Node[];
  const edges=z.array(z.object({
    from:z.string(),to:z.string(),condition:z.string().optional().nullable()
  })).parse(version.edges) as Edge[];
  return{nodes,edges};
}

async function queueAction(db:any,run:ClaimedRun,node:Node,forceApproval=false){
  const actionKey=node.kind==="ai_decision"?"intelligence.decision":String(node.actionKey??"");
  const definition=automationActionDefinition(actionKey);
  if(!definition)throw new Error("Unregistered automation action: "+actionKey);
  if(node.moduleKey&&node.moduleKey!==definition.moduleKey)throw new Error("Automation action module mismatch");
  const requiresApproval=forceApproval||definition.requiresApproval||node.kind==="approval";
  const{data:existing,error:existingError}=await db.from("automation_action_queue")
    .select("id,state,result,error").eq("run_id",run.id).eq("node_id",node.id).maybeSingle();
  if(existingError)throw new Error(existingError.message);
  if(existing)return existing;
  const{data:created,error}=await db.from("automation_action_queue").insert({
    tenant_id:run.tenantId,run_id:run.id,workflow_id:run.workflowId,node_id:node.id,
    module_key:definition.moduleKey,action_key:definition.key,risk:definition.risk,
    requires_approval:requiresApproval,state:requiresApproval?"approval":"queued",
    input:node.config
  }).select("id,state,result,error").single();
  if(error||!created)throw new Error(error?.message??"Automation action could not be queued");
  return created;
}

async function saveRun(db:any,run:ClaimedRun,input:{
  status:"running"|"waiting"|"approval"|"completed"|"failed"|"cancelled";
  nodeId:string|null;context:Record<string,unknown>;nextRunAt?:string|null;stepCount:number;error?:string|null;
}){
  const{error}=await db.rpc("finish_automation_run_step",{
    _run:run.id,_status:input.status,_node:input.nodeId,_context:input.context,
    _next_run_at:input.nextRunAt??new Date().toISOString(),_step_count:input.stepCount,_error:input.error??null
  });
  if(error)throw new Error(error.message);
}

async function processRun(db:any,run:ClaimedRun){
  const{nodes,edges}=await loadWorkflow(db,run);
  const nodeById=new Map(nodes.map((node)=>[node.id,node]));
  let nodeId=run.currentNodeId??nodes.find((node)=>node.kind==="trigger")?.id??null;
  let context={...(run.context??{})};
  let steps=run.stepCount??0;

  for(let localSteps=0;localSteps<25;localSteps+=1){
    if(!nodeId){
      await saveRun(db,run,{status:"completed",nodeId:null,context,stepCount:steps});
      return{runId:run.id,status:"completed"};
    }
    if(steps>=200)throw new Error("Automation maximum step count exceeded");
    const node=nodeById.get(nodeId);
    if(!node)throw new Error("Automation node not found: "+nodeId);
    steps+=1;

    if(node.kind==="trigger"){
      nodeId=nextSingle(edges,node.id);
      continue;
    }
    if(node.kind==="condition"||node.kind==="branch"){
      const result=evaluateCondition(node.config,context);
      context={...context,lastDecision:{nodeId:node.id,result}};
      nodeId=nextForBoolean(edges,node.id,result);
      continue;
    }
    if(node.kind==="delay"){
      const minutes=Number(node.config.minutes??0);
      if(!Number.isFinite(minutes)||minutes<1||minutes>525600)throw new Error("Invalid automation delay");
      const nextRunAt=new Date(Date.now()+minutes*60000).toISOString();
      const next=nextSingle(edges,node.id);
      await saveRun(db,run,{status:"waiting",nodeId:next,context,nextRunAt,stepCount:steps});
      return{runId:run.id,status:"waiting",nextRunAt};
    }
    if(node.kind==="outcome"){
      context={...context,outcome:{nodeId:node.id,name:node.name,config:node.config}};
      await saveRun(db,run,{status:"completed",nodeId:node.id,context,stepCount:steps});
      return{runId:run.id,status:"completed"};
    }

    const action=await queueAction(db,run,node,node.kind==="approval");
    if(action.state==="completed"){
      context={...context,actions:{...(context.actions as Record<string,unknown>??{}),[node.id]:action.result??{}}};
      nodeId=nextSingle(edges,node.id);
      continue;
    }
    if(action.state==="failed"||action.state==="rejected"){
      throw new Error(action.error??("Automation action "+action.state));
    }
    const status=action.state==="approval"?"approval":"waiting";
    await saveRun(db,run,{status,nodeId:node.id,context,stepCount:steps,nextRunAt:new Date(Date.now()+60000).toISOString()});
    return{runId:run.id,status,actionId:action.id};
  }

  await saveRun(db,run,{status:"running",nodeId,context,stepCount:steps,nextRunAt:new Date().toISOString()});
  return{runId:run.id,status:"running"};
}

export async function runAutomationBatch(limit=20){
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
  const{data:claimed,error}=await db.rpc("claim_automation_runs",{_limit:limit});
  if(error)throw new Error(error.message);
  const results:Array<Record<string,unknown>>=[];
  for(const raw of claimed??[]){
    const run=raw as ClaimedRun;
    try{results.push(await processRun(db,run));}
    catch(error){
      const message=error instanceof Error?error.message:"Automation failed";
      try{await saveRun(db,run,{status:"failed",nodeId:run.currentNodeId??null,context:run.context??{},stepCount:run.stepCount??0,error:message});}catch{/* preserve original */}
      results.push({runId:run.id,status:"failed",error:message});
    }
  }
  return results;
}

export async function serveAutomationWorker(request:Request){
  if(!authorised(request))return Response.json({error:"Worker authorization refused"},{status:401,headers:{"cache-control":"no-store"}});
  let input:unknown={};try{const raw=await request.text();input=raw?JSON.parse(raw):{};}catch{return Response.json({error:"Invalid JSON"},{status:400});}
  const parsed=z.object({limit:z.number().int().min(1).max(100).default(20)}).parse(input);
  try{
    const results=await runAutomationBatch(parsed.limit);
    return Response.json({processed:results.length,results},{headers:{"cache-control":"no-store"}});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"Automation worker failed"},{status:503,headers:{"cache-control":"no-store"}});
  }
}
