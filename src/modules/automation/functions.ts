import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement, requireAdminTenantRole } from "@/modules/platform/module-access";

const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()});
const node=z.object({
 id:z.string().min(1).max(100),kind:z.enum(["trigger","condition","ai_decision","action","delay","branch","approval","outcome"]),
 name:z.string().min(1).max(200),moduleKey:z.string().max(160).optional().nullable(),
 actionKey:z.string().max(160).optional().nullable(),config:z.record(z.string(),z.unknown()).default({})
});
const workflow=scope.extend({
 name:z.string().min(2).max(200),description:z.string().max(2000).optional().nullable(),
 triggerEvent:z.string().min(1).max(200),nodes:z.array(node).min(1).max(500),
 edges:z.array(z.object({from:z.string().max(100),to:z.string().max(100),condition:z.string().max(500).optional().nullable()})).max(1000)
});

function validateGraph(nodes:z.infer<typeof node>[],edges:Array<{from:string;to:string}>){
 const ids=new Set(nodes.map(n=>n.id));
 if(ids.size!==nodes.length)throw new Error("Workflow node IDs must be unique");
 for(const edge of edges)if(!ids.has(edge.from)||!ids.has(edge.to))throw new Error("Workflow edge references an unknown node");
 const triggers=nodes.filter(n=>n.kind==="trigger");
 if(triggers.length!==1)throw new Error("Workflow requires exactly one trigger node");

 // Automation v1 is intentionally acyclic. Repetition belongs in schedules/events,
 // not unbounded graph loops.
 const adjacency=new Map<string,string[]>();
 for(const id of ids)adjacency.set(id,[]);
 for(const edge of edges)adjacency.get(edge.from)!.push(edge.to);
 const visiting=new Set<string>();const visited=new Set<string>();
 function visit(id:string){
  if(visiting.has(id))throw new Error("Automation workflow cycles are not supported in v1");
  if(visited.has(id))return;
  visiting.add(id);
  for(const next of adjacency.get(id)??[])visit(next);
  visiting.delete(id);visited.add(id);
 }
 visit(triggers[0]!.id);
 if(visited.size!==nodes.length)throw new Error("Every workflow node must be reachable from the trigger");
}

export const createAutomationWorkflow=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof workflow>)=>workflow.parse(i))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"automation.core"});
 requireAdminTenantRole(access.role);validateGraph(data.nodes,data.edges);
 const db=context.supabase as any;
 const{data:w,error}=await db.from("automation_workflows").insert({
  tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,name:data.name,
  description:data.description??null,trigger_event:data.triggerEvent,status:"draft",created_by:context.userId
 }).select("id").single();
 if(error||!w)throw new Error(error?.message??"Workflow could not be created");
 const{error:ve}=await db.from("automation_workflow_versions").insert({
  workflow_id:w.id,tenant_id:data.tenantId,version:1,nodes:data.nodes,edges:data.edges,created_by:context.userId
 });
 if(ve)throw new Error(ve.message);return{id:w.id,version:1};
});

export const publishAutomationWorkflow=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof scope>&{workflowId:string;version:number})=>scope.extend({workflowId:z.string().uuid(),version:z.number().int().positive()}).parse(i))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"automation.core"});
 requireAdminTenantRole(access.role);const db=context.supabase as any;
 const{data:version}=await db.from("automation_workflow_versions").select("workflow_id,version").eq("workflow_id",data.workflowId)
  .eq("tenant_id",data.tenantId).eq("version",data.version).maybeSingle();
 if(!version)throw new Error("Workflow version not found");
 const{error}=await db.from("automation_workflows").update({status:"active",active_version:data.version})
  .eq("id",data.workflowId).eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId);
 if(error)throw new Error(error.message);return{ok:true};
});


export const listAutomationWorkflows=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{
  await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"automation.core"});
  const db=context.supabase as any;
  const{data:workflows,error}=await db.from("automation_workflows")
    .select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .order("updated_at",{ascending:false}).limit(500);
  if(error)throw new Error(error.message);
  const ids=(workflows??[]).map((row:any)=>row.id);
  const versions=ids.length
    ?await db.from("automation_workflow_versions").select("workflow_id,version,nodes,edges,created_at,created_by")
      .eq("tenant_id",data.tenantId).in("workflow_id",ids).order("version",{ascending:false})
    :{data:[],error:null};
  if(versions.error)throw new Error(versions.error.message);
  const runs=ids.length
    ?await db.from("automation_runs").select("id,workflow_id,workflow_version,event_id,status,current_node_id,started_at,completed_at,created_at,updated_at")
      .eq("tenant_id",data.tenantId).in("workflow_id",ids).order("created_at",{ascending:false}).limit(1000)
    :{data:[],error:null};
  if(runs.error)throw new Error(runs.error.message);
  return(workflows??[]).map((workflow:any)=>{
    const allVersions=(versions.data??[]).filter((v:any)=>v.workflow_id===workflow.id);
    const activeVersion=allVersions.find((v:any)=>v.version===workflow.active_version)??allVersions[0]??null;
    const workflowRuns=(runs.data??[]).filter((r:any)=>r.workflow_id===workflow.id);
    return{
      ...workflow,
      versions:allVersions,
      activeVersion,
      runs:workflowRuns,
      runCounts:{
        total:workflowRuns.length,
        active:workflowRuns.filter((r:any)=>["queued","running","waiting","approval"].includes(r.status)).length,
        completed:workflowRuns.filter((r:any)=>r.status==="completed").length,
        failed:workflowRuns.filter((r:any)=>r.status==="failed").length
      }
    };
  });
});

export const setAutomationWorkflowStatus=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>&{workflowId:string;status:"active"|"paused"|"archived"})=>scope.extend({
  workflowId:z.string().uuid(),status:z.enum(["active","paused","archived"])
}).parse(input))
.handler(async({context,data})=>{
  const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"automation.core"});
  requireAdminTenantRole(access.role);
  const db=context.supabase as any;
  const{data:workflow}=await db.from("automation_workflows").select("id,active_version")
    .eq("id",data.workflowId).eq("tenant_id",data.tenantId)
    .eq("tenant_product_id",data.tenantProductId).maybeSingle();
  if(!workflow)throw new Error("Workflow not found");
  if(data.status==="active"&&!workflow.active_version)throw new Error("Publish a workflow version before activating it");
  const{data:row,error}=await db.from("automation_workflows").update({status:data.status})
    .eq("id",data.workflowId).select("*").single();
  if(error||!row)throw new Error(error?.message??"Workflow status could not be updated");
  return row;
});
