import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireAdminRole,requireService,requireTenantMembership,requireWriteRole} from "@/modules/platform/access";
import {optimiseNativeRoutes,type RoutingJob,type RoutingResource} from "@/modules/routing/service.server";

const uuid=z.string().uuid();
const product=z.string().min(2).max(80);
const scope=z.object({tenantId:uuid,productKey:product});

export const getRoutingWorkspace=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const rs=await Promise.all([
  db.from("routing_policies").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("policy_key"),
  db.from("routing_optimisation_jobs").select("*,routes:routing_route_plans(*,stops:routing_route_plan_stops(*))").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(30),
  db.from("routing_matrix_jobs").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(50),
  db.from("routing_assignment_recommendations").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("generated_at",{ascending:false}).limit(100),
  db.from("routing_provider_observations").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("observed_at",{ascending:false}).limit(200),
  db.from("dispatch_jobs").select("*,stops:dispatch_job_stops(*)").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(200)
 ]);
 for(const r of rs)if(r.error)throw new Error(r.error.message);
 const ranked=await db.rpc("routing_rank_providers",{_tenant:data.tenantId,_product:data.productKey,_operation:"matrix",_lookback_hours:168});
 if(ranked.error)throw new Error(ranked.error.message);
 return{policies:rs[0].data??[],optimisations:rs[1].data??[],matrixJobs:rs[2].data??[],
  recommendations:rs[3].data??[],providerObservations:rs[4].data??[],jobs:rs[5].data??[],providerRanking:ranked.data??[]};
});

const policy=scope.extend({
 policyKey:z.string().regex(/^[a-z0-9_.-]{2,100}$/).default("default"),
 objective:z.enum(["distance","duration","cost","balanced","sla"]).default("balanced"),
 providerOrder:z.array(z.string().min(2).max(120)).min(1).max(20).default(["maps.google","maps.mapbox","maps.openrouteservice"]),
 allowHaversineFallback:z.boolean().default(true),maxStopsPerRoute:z.number().int().min(1).max(500).default(100),
 reoptimiseTriggers:z.array(z.string().max(80)).max(30).default(["job_added","job_cancelled","agent_unavailable","vehicle_unavailable","sla_risk","traffic_change"])
});
export const saveRoutingPolicy=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof policy>)=>policy.parse(i)).handler(async({context,data})=>{
 const access=await requireService(context,data.tenantId,"omniqora.routing-engine");requireAdminRole(access.role);
 const{data:row,error}=await(context.supabase as any).from("routing_policies").upsert({
  tenant_id:data.tenantId,product_key:data.productKey,policy_key:data.policyKey,objective:data.objective,
  provider_order:data.providerOrder,allow_haversine_fallback:data.allowHaversineFallback,max_stops_per_route:data.maxStopsPerRoute,
  reoptimise_triggers:data.reoptimiseTriggers,status:"active",updated_at:new Date().toISOString()
 },{onConflict:"tenant_id,product_key,policy_key"}).select("*").single();
 if(error)throw new Error(error.message);return row;
});

const matrix=scope.extend({
 travelMode:z.enum(["driving","cycling","walking","truck","motorcycle"]).default("driving"),
 origins:z.array(z.object({lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180)})).min(1).max(100),
 destinations:z.array(z.object({lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180)})).min(1).max(100),
 options:z.record(z.string(),z.unknown()).default({})
});
export const createRoutingMatrixJob=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof matrix>)=>matrix.parse(i)).handler(async({context,data})=>{
 const access=await requireService(context,data.tenantId,"omniqora.routing-engine");requireWriteRole(access.role);
 const db=context.supabase as any;
 const ranked=await db.rpc("routing_rank_providers",{_tenant:data.tenantId,_product:data.productKey,_operation:"matrix",_lookback_hours:168});
 if(ranked.error)throw new Error(ranked.error.message);
 const providerKey=ranked.data?.[0]?.provider_key??"routing.native";
 const{data:row,error}=await db.from("routing_matrix_jobs").insert({
  tenant_id:data.tenantId,product_key:data.productKey,provider_key:providerKey,travel_mode:data.travelMode,
  origins:data.origins,destinations:data.destinations,options:data.options,status:"queued",requested_by:context.userId
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

export const createRoutingOptimisation=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;productKey:string;reason?:string;objective?:string})=>scope.extend({
 reason:z.enum(["manual","scheduled","job_added","job_cancelled","agent_unavailable","vehicle_unavailable","sla_risk","traffic_change"]).default("manual"),
 objective:z.enum(["distance","duration","cost","balanced","sla"]).default("balanced")
}).parse(i)).handler(async({context,data})=>{
 const access=await requireService(context,data.tenantId,"omniqora.routing-engine");requireWriteRole(access.role);
 const r=await(context.supabase as any).rpc("routing_create_optimisation",{_tenant:data.tenantId,_product:data.productKey,_reason:data.reason,_objective:data.objective});
 if(r.error)throw new Error(r.error.message);return{optimisationId:r.data as string};
});

export const runNativeRoutingOptimisation=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;optimisationId:string})=>z.object({tenantId:uuid,optimisationId:uuid}).parse(i))
.handler(async({context,data})=>{
 const db=context.supabase as any;
 const{data:opt,error:optError}=await db.from("routing_optimisation_jobs").select("*,policy:routing_policies(*)").eq("id",data.optimisationId).eq("tenant_id",data.tenantId).single();
 if(optError||!opt)throw new Error(optError?.message??"Routing optimisation not found");
 const access=await requireService(context,data.tenantId,"omniqora.routing-engine");requireWriteRole(access.role);
 if(!["queued","failed","review"].includes(opt.status))throw new Error("Routing optimisation is not runnable");
 await db.from("routing_optimisation_jobs").update({status:"running"}).eq("id",opt.id);

 const [jobsR,agentsR,vehiclesR,positionsR,shiftsR]=await Promise.all([
  db.from("dispatch_jobs").select("*,stops:dispatch_job_stops(*)").eq("tenant_id",data.tenantId).eq("product_key",opt.product_key).eq("status","unassigned").order("priority").limit(500),
  db.from("dispatch_agents").select("*").eq("tenant_id",data.tenantId).eq("product_key",opt.product_key).eq("status","available"),
  db.from("dispatch_vehicles").select("*").eq("tenant_id",data.tenantId).eq("product_key",opt.product_key).eq("status","available"),
  db.from("dispatch_agent_positions").select("*").eq("tenant_id",data.tenantId).eq("product_key",opt.product_key).order("observed_at",{ascending:false}).limit(2000),
  db.from("dispatch_shifts").select("*").eq("tenant_id",data.tenantId).eq("product_key",opt.product_key).in("planned_status",["scheduled","confirmed"]).lte("starts_at",new Date().toISOString()).gte("ends_at",new Date().toISOString())
 ]);
 for(const r of[jobsR,agentsR,vehiclesR,positionsR,shiftsR])if(r.error)throw new Error(r.error.message);

 const positions=new Map<string,any>();
 for(const p of positionsR.data??[])if(!positions.has(p.agent_id))positions.set(p.agent_id,p);
 const shifts=new Map<string,any>();
 for(const s of shiftsR.data??[])if(!shifts.has(s.agent_id))shifts.set(s.agent_id,s);
 const vehicles=[...(vehiclesR.data??[])],usedVehicles=new Set<string>();
 const resources:RoutingResource[]=[];
 for(const a of agentsR.data??[]){
  const pos=positions.get(a.id),homeLat=Number(a.metadata?.homeLat),homeLng=Number(a.metadata?.homeLng);
  const lat=pos?.latitude??(Number.isFinite(homeLat)?homeLat:null),lng=pos?.longitude??(Number.isFinite(homeLng)?homeLng:null);
  if(lat==null||lng==null)continue;
  let vehicle:any=null;
  const preferred=typeof a.metadata?.currentVehicleId==="string"?vehicles.find(v=>v.id===a.metadata.currentVehicleId&&!usedVehicles.has(v.id)):null;
  vehicle=preferred??vehicles.find(v=>!usedVehicles.has(v.id))??null;if(vehicle)usedVehicles.add(vehicle.id);
  resources.push({agentId:a.id,vehicleId:vehicle?.id??null,skills:a.skills??[],vehicleType:vehicle?.vehicle_type??null,
   capacity:vehicle?.capacity??a.capacity??null,start:{lat:Number(lat),lng:Number(lng)},shiftEnd:shifts.get(a.id)?.ends_at??null});
 }
 const jobs:RoutingJob[]=(jobsR.data??[]).map((j:any)=>({
  jobId:j.id,priority:j.priority,demand:Number(j.capacity_demand??0),requiredSkills:j.required_skills??[],
  requiredVehicleTypes:j.required_vehicle_types??[],scheduledAt:j.scheduled_at??null,
  stops:[...(j.stops??[])].sort((a:any,b:any)=>a.position-b.position).map((s:any)=>({
   lat:Number(s.latitude),lng:Number(s.longitude),windowStart:s.window_start??null,windowEnd:s.window_end??null,
   serviceSeconds:s.service_seconds??0,stopId:s.id
  }))
 }));
 const result=optimiseNativeRoutes({jobs,resources,startedAt:new Date().toISOString(),maxStopsPerRoute:opt.policy?.max_stops_per_route??100});

 await db.from("routing_route_plans").delete().eq("optimisation_job_id",opt.id);
 for(const route of result.routes){
  const{data:plan,error:planError}=await db.from("routing_route_plans").insert({
   tenant_id:data.tenantId,product_key:opt.product_key,optimisation_job_id:opt.id,route_no:route.routeNo,
   agent_id:route.agentId,vehicle_id:route.vehicleId??null,planned_distance_metres:route.plannedDistanceMetres,
   planned_duration_seconds:route.plannedDurationSeconds,planned_load:route.plannedLoad,capacity:route.capacity??null,
   planned_finish_at:route.plannedFinishAt,status:"review",metadata:{algorithm:"native_greedy_2opt"}
  }).select("*").single();
  if(planError)throw new Error(planError.message);
  if(route.stops.length){
   const sr=await db.from("routing_route_plan_stops").insert(route.stops.map(s=>({
    tenant_id:data.tenantId,route_plan_id:plan.id,sequence:s.sequence,job_id:s.jobId,dispatch_stop_id:s.stopId??null,
    latitude:s.lat,longitude:s.lng,planned_arrival_at:s.plannedArrivalAt,planned_departure_at:s.plannedDepartureAt,
    distance_from_previous_metres:s.distanceFromPreviousMetres,duration_from_previous_seconds:s.durationFromPreviousSeconds,
    service_seconds:s.serviceSeconds??0,constraint_state:s.constraintState,constraint_detail:s.constraintDetail
   })));if(sr.error)throw new Error(sr.error.message);
  }
 }
 const{error:updateError}=await db.from("routing_optimisation_jobs").update({
  status:"review",score:result.score,warnings:result.warnings,completed_at:new Date().toISOString()
 }).eq("id",opt.id);if(updateError)throw new Error(updateError.message);
 return{routeCount:result.routes.length,unassignedJobIds:result.unassignedJobIds,warnings:result.warnings,score:result.score};
});

export const applyRoutingOptimisation=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;optimisationId:string})=>z.object({tenantId:uuid,optimisationId:uuid}).parse(i))
.handler(async({context,data})=>{
 const access=await requireTenantMembership(context,data.tenantId);requireAdminRole(access.role);
 const r=await(context.supabase as any).rpc("routing_apply_optimisation",{_optimisation:data.optimisationId});
 if(r.error)throw new Error(r.error.message);return{ok:true};
});

export const generateDispatchRecommendations=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;productKey:string;jobId:string;limit?:number})=>scope.extend({jobId:uuid,limit:z.number().int().min(1).max(20).default(5)}).parse(i))
.handler(async({context,data})=>{
 const access=await requireService(context,data.tenantId,"omniqora.routing-engine");requireWriteRole(access.role);
 const r=await(context.supabase as any).rpc("dispatch_generate_assignment_recommendations",{
  _tenant:data.tenantId,_product:data.productKey,_job:data.jobId,_limit:data.limit
 });if(r.error)throw new Error(r.error.message);return{count:r.data as number};
});

export const applyDispatchRecommendation=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;recommendationId:string})=>z.object({tenantId:uuid,recommendationId:uuid}).parse(i))
.handler(async({context,data})=>{
 const access=await requireService(context,data.tenantId,"omniqora.routing-engine");requireWriteRole(access.role);
 const r=await(context.supabase as any).rpc("dispatch_apply_assignment_recommendation",{_recommendation:data.recommendationId});
 if(r.error)throw new Error(r.error.message);return{ok:true};
});
