/* eslint-disable @typescript-eslint/no-explicit-any -- data shapes are owned by versioned Fleetora migrations. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireService, requireAdminRole } from "@/modules/platform/access";

const uuid = z.string().uuid();
const scope = z.object({tenantId:uuid}).strict();
const jobScope = scope.extend({jobId:uuid});

export const listMyAgentJobs = createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:unknown)=>scope.parse(input))
.handler(async({context,data})=>{
  await requireService(context,data.tenantId,"omniqora.agent");
  const db=context.supabase as any;
  const agents=await db.from("dispatch_agents")
    .select("id,name,product_key,agent_role,status")
    .eq("tenant_id",data.tenantId).eq("user_id",context.userId);
  if(agents.error)throw new Error(agents.error.message);
  const active=(agents.data??[]).filter((x:any)=>x.status!=="suspended");
  if(active.length===0)return{agents:[],jobs:[]};
  const ids=active.map((agent:any)=>agent.id);
  const jobs=await db.from("dispatch_jobs")
    .select("id,product_key,job_type,status,priority,scheduled_at,external_ref,assigned_agent_id,stops:dispatch_job_stops(id,position,stop_kind,address,latitude,longitude,instructions)")
    .eq("tenant_id",data.tenantId).in("assigned_agent_id",ids)
    .not("status","in","(completed,failed,cancelled)")
    .order("scheduled_at",{ascending:true}).limit(100);
  if(jobs.error)throw new Error(jobs.error.message);
  return{agents:active,jobs:jobs.data??[]};
});

export const progressAgentJob = createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:unknown)=>jobScope.extend({
  status:z.enum(["accepted","en_route","arrived","in_progress","collected",
    "en_route_dropoff","arrived_dropoff","completed","failed"])
}).parse(input))
.handler(async({context,data})=>{
  await requireService(context,data.tenantId,"omniqora.agent");
  const {data:result,error}=await(context.supabase as any)
    .rpc("agent_portal_status",{_job:data.jobId,_new_status:data.status});
  if(error)throw new Error(error.message);return result;
});

export const shareAgentLocation = createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:unknown)=>jobScope.extend({
  latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),
  accuracy:z.number().min(0).max(100000).nullish(),
  observedAt:z.string().datetime()
}).parse(input))
.handler(async({context,data})=>{
  await requireService(context,data.tenantId,"omniqora.agent");
  const {data:result,error}=await(context.supabase as any)
    .rpc("agent_portal_position",{_job:data.jobId,_lat:data.latitude,
      _lng:data.longitude,_observed:data.observedAt,_accuracy:data.accuracy??null});
  if(error)throw new Error(error.message);return result;
});

export const attestAgentDelivery = createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:unknown)=>jobScope.extend({
  recipient:z.string().trim().min(2).max(160),note:z.string().max(1000).nullish()
}).parse(input))
.handler(async({context,data})=>{
  await requireService(context,data.tenantId,"omniqora.agent");
  const {data:result,error}=await(context.supabase as any)
    .rpc("agent_portal_pod",{_job:data.jobId,_recipient:data.recipient,_note:data.note??null});
  if(error)throw new Error(error.message);return result;
});

export const linkAgentToUser = createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:unknown)=>scope.extend({agentId:uuid,userId:uuid}).parse(input))
.handler(async({context,data})=>{
  const access=await requireService(context,data.tenantId,"omniqora.dispatch");
  requireAdminRole(access.role);
  const db=context.supabase as any;
  const agent=await db.from("dispatch_agents").select("id")
    .eq("tenant_id",data.tenantId).eq("id",data.agentId).maybeSingle();
  if(agent.error||!agent.data)throw new Error("Agent is not in the selected tenant");
  const {error}=await db.rpc("agent_portal_bind_user",
    {_agent:data.agentId,_user:data.userId});
  if(error)throw new Error(error.message);
  return{ok:true};
});
