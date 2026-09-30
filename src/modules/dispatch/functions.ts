import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement, requireWritableTenantRole } from "@/modules/platform/module-access";

const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()});
const stop=z.object({kind:z.enum(["pickup","dropoff","service","return"]),lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180),address:z.string().max(500).optional().nullable(),contactName:z.string().max(160).optional().nullable(),contactPhone:z.string().max(30).optional().nullable(),instructions:z.string().max(2000).optional().nullable(),windowStart:z.string().datetime().optional().nullable(),windowEnd:z.string().datetime().optional().nullable(),serviceSeconds:z.number().int().min(0).max(86400).default(0),metadata:z.record(z.string(),z.unknown()).default({})});
const createSchema=scope.extend({productKey:z.string().min(1).max(80),locationId:z.string().uuid().optional().nullable(),jobType:z.string().min(1).max(120),priority:z.enum(["low","normal","high","urgent"]).default("normal"),requiredSkills:z.array(z.string().max(120)).max(50).default([]),requiredVehicleTypes:z.array(z.string().max(120)).max(50).default([]),capacityDemand:z.number().nonnegative().optional().nullable(),scheduledAt:z.string().datetime().optional().nullable(),externalRef:z.string().max(200).optional().nullable(),metadata:z.record(z.string(),z.unknown()).default({}),stops:z.array(stop).min(1).max(100)});

export const listDispatchJobs=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof scope>)=>scope.parse(input)).handler(async({context,data})=>{
 await requireModuleEntitlement(context,{...data,moduleKey:"dispatch.core"});const db=context.supabase as any;
 const{data:jobs,error}=await db.from("dispatch_jobs").select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).order("created_at",{ascending:false}).limit(500);if(error)throw new Error(error.message);
 const ids=(jobs??[]).map((j:any)=>j.id);let stops:any[]=[];if(ids.length){const res=await db.from("dispatch_job_stops").select("*").eq("tenant_id",data.tenantId).in("job_id",ids).order("position");if(res.error)throw new Error(res.error.message);stops=res.data??[];}
 return(jobs??[]).map((j:any)=>({...j,stops:stops.filter((s:any)=>s.job_id===j.id)}));
});

export const createDispatchJob=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof createSchema>)=>createSchema.parse(input)).handler(async({context,data})=>{
 await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"dispatch.core"});const db=context.supabase as any;
 const{data:id,error}=await db.rpc("create_dispatch_job",{_tenant:data.tenantId,_tenant_product:data.tenantProductId,_product_key:data.productKey,_location:data.locationId??null,_job_type:data.jobType,_priority:data.priority,_required_skills:data.requiredSkills,_required_vehicle_types:data.requiredVehicleTypes,_capacity:data.capacityDemand??null,_scheduled_at:data.scheduledAt??null,_external_ref:data.externalRef??null,_metadata:data.metadata,_stops:data.stops});
 if(error||!id)throw new Error(error?.message??"Dispatch job could not be created");return{id};
});

const statusSchema=scope.extend({jobId:z.string().uuid(),status:z.enum(["unassigned","offered","assigned","accepted","en_route","arrived","in_progress","en_route_pickup","arrived_pickup","collected","en_route_dropoff","arrived_dropoff","completed","failed","cancelled"])});
export const updateDispatchJobStatus=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof statusSchema>)=>statusSchema.parse(input)).handler(async({context,data})=>{await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"dispatch.core"});const db=context.supabase as any;const{error}=await db.rpc("update_dispatch_job_status",{_job:data.jobId,_status:data.status});if(error)throw new Error(error.message);return{ok:true};});

const podSchema=scope.extend({jobId:z.string().uuid(),methods:z.array(z.enum(["photo","signature","pin","barcode","gps","note"])).min(1),evidenceRefs:z.array(z.string().max(1000)).max(50).default([]),recipientName:z.string().max(200).optional().nullable(),note:z.string().max(2000).optional().nullable()});
export const recordDispatchPod=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof podSchema>)=>podSchema.parse(input)).handler(async({context,data})=>{await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"dispatch.core"});const db=context.supabase as any;const{data:id,error}=await db.rpc("record_dispatch_pod",{_job:data.jobId,_methods:data.methods,_evidence_refs:data.evidenceRefs,_recipient_name:data.recipientName??null,_note:data.note??null});if(error||!id)throw new Error(error?.message??"Proof could not be recorded");return{id};});

export const listDispatchAgents=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof scope>)=>scope.parse(input)).handler(async({context,data})=>{await requireModuleEntitlement(context,{...data,moduleKey:"dispatch.core"});const db=context.supabase as any;const [agents,vehicles]=await Promise.all([db.from("dispatch_agents").select("*").eq("tenant_id",data.tenantId).order("display_name"),db.from("dispatch_vehicles").select("*").eq("tenant_id",data.tenantId).order("vehicle_type")]);if(agents.error)throw new Error(agents.error.message);if(vehicles.error)throw new Error(vehicles.error.message);return{agents:agents.data??[],vehicles:vehicles.data??[]};});

async function dispatchWriteScope(context:any,data:z.infer<typeof scope>){
  const access=await requireModuleEntitlement(context,{...data,moduleKey:"dispatch.core"});
  requireWritableTenantRole(access.role);
  return access;
}

export const getDispatchFleetWorkspace=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{
  await requireModuleEntitlement(context,{...data,moduleKey:"dispatch.core"});
  const db=context.supabase as any;
  const[shifts,attendance,wallet,maintenance,positions,behaviour,idle,geofences,geofenceEvents,utilisation]=await Promise.all([
    db.from("dispatch_agent_shifts").select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).order("starts_at",{ascending:false}).limit(500),
    db.from("dispatch_attendance_events").select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).order("observed_at",{ascending:false}).limit(500),
    db.from("dispatch_agent_wallet_entries").select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).order("occurred_at",{ascending:false}).limit(500),
    db.from("dispatch_vehicle_maintenance").select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).order("due_at",{ascending:true}).limit(500),
    db.from("dispatch_agent_positions").select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).order("observed_at",{ascending:false}).limit(1000),
    db.from("dispatch_driver_behaviour_events").select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).order("observed_at",{ascending:false}).limit(500),
    db.from("dispatch_idle_periods").select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).order("starts_at",{ascending:false}).limit(500),
    db.from("dispatch_geofences").select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).order("name").limit(500),
    db.from("dispatch_geofence_events").select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).order("observed_at",{ascending:false}).limit(500),
    db.from("dispatch_fleet_utilisation_daily").select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).order("day",{ascending:false}).limit(1000),
  ]);
  for(const result of[shifts,attendance,wallet,maintenance,positions,behaviour,idle,geofences,geofenceEvents,utilisation]){
    if(result.error)throw new Error(result.error.message);
  }
  return{
    shifts:shifts.data??[],attendance:attendance.data??[],wallet:wallet.data??[],
    maintenance:maintenance.data??[],positions:positions.data??[],behaviour:behaviour.data??[],
    idle:idle.data??[],geofences:geofences.data??[],geofenceEvents:geofenceEvents.data??[],
    utilisation:utilisation.data??[]
  };
});

const shiftSchema=scope.extend({
  id:z.string().uuid().optional(),agentId:z.string().uuid(),startsAt:z.string().datetime(),endsAt:z.string().datetime(),
  status:z.enum(["scheduled","active","completed","missed","cancelled"]).default("scheduled"),
  attendanceStatus:z.enum(["expected","present","late","absent","excused"]).default("expected"),
  breakMinutes:z.number().int().min(0).max(1440).default(0),notes:z.string().max(2000).optional().nullable(),
  metadata:z.record(z.string(),z.unknown()).default({})
});
export const saveDispatchShift=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof shiftSchema>)=>shiftSchema.parse(input))
.handler(async({context,data})=>{
  await dispatchWriteScope(context,data);
  if(Date.parse(data.endsAt)<=Date.parse(data.startsAt))throw new Error("Shift end must be after start");
  const db=context.supabase as any;
  const values={
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,agent_id:data.agentId,
    starts_at:data.startsAt,ends_at:data.endsAt,status:data.status,attendance_status:data.attendanceStatus,
    break_minutes:data.breakMinutes,notes:data.notes??null,metadata:data.metadata
  };
  const q=data.id
    ?db.from("dispatch_agent_shifts").update(values).eq("id",data.id).eq("tenant_id",data.tenantId)
    :db.from("dispatch_agent_shifts").insert(values);
  const{data:row,error}=await q.select("*").single();
  if(error||!row)throw new Error(error?.message??"Shift could not be saved");
  return row;
});

const attendanceSchema=scope.extend({
  agentId:z.string().uuid(),shiftId:z.string().uuid().optional().nullable(),
  eventKind:z.enum(["clock_in","clock_out","break_start","break_end","absence","late","override"]),
  observedAt:z.string().datetime().optional(),source:z.enum(["app","admin","import","system"]).default("app"),
  lat:z.number().min(-90).max(90).optional().nullable(),lng:z.number().min(-180).max(180).optional().nullable(),
  note:z.string().max(2000).optional().nullable(),metadata:z.record(z.string(),z.unknown()).default({})
});
export const recordDispatchAttendance=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof attendanceSchema>)=>attendanceSchema.parse(input))
.handler(async({context,data})=>{
  await dispatchWriteScope(context,data);
  const db=context.supabase as any;const observedAt=data.observedAt??new Date().toISOString();
  const{data:row,error}=await db.from("dispatch_attendance_events").insert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,agent_id:data.agentId,
    shift_id:data.shiftId??null,event_kind:data.eventKind,observed_at:observedAt,source:data.source,
    latitude:data.lat??null,longitude:data.lng??null,note:data.note??null,metadata:data.metadata
  }).select("*").single();
  if(error||!row)throw new Error(error?.message??"Attendance event could not be recorded");
  if(data.shiftId&&["clock_in","clock_out","absence","late"].includes(data.eventKind)){
    const patch:any={};
    if(data.eventKind==="clock_in"){patch.clocked_in_at=observedAt;patch.status="active";patch.attendance_status="present";}
    if(data.eventKind==="clock_out"){patch.clocked_out_at=observedAt;patch.status="completed";}
    if(data.eventKind==="absence"){patch.attendance_status="absent";patch.status="missed";}
    if(data.eventKind==="late"){patch.attendance_status="late";}
    const{error:shiftError}=await db.from("dispatch_agent_shifts").update(patch)
      .eq("id",data.shiftId).eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId);
    if(shiftError)throw new Error(shiftError.message);
  }
  return row;
});

const walletSchema=scope.extend({
  agentId:z.string().uuid(),jobId:z.string().uuid().optional().nullable(),
  entryKind:z.enum(["credit","debit","adjustment"]),category:z.string().min(1).max(120),
  amountMinor:z.number().int(),currency:z.string().regex(/^[A-Z]{3}$/),
  status:z.enum(["pending","posted","reversed"]).default("posted"),sourceRef:z.string().max(200).optional().nullable(),
  description:z.string().max(2000).optional().nullable(),metadata:z.record(z.string(),z.unknown()).default({})
});
export const postDispatchWalletEntry=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof walletSchema>)=>walletSchema.parse(input))
.handler(async({context,data})=>{
  await dispatchWriteScope(context,data);
  if(data.entryKind!=="adjustment"&&data.amountMinor<0)throw new Error("Credit/debit amount must be non-negative");
  const db=context.supabase as any;
  const{data:row,error}=await db.from("dispatch_agent_wallet_entries").insert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,agent_id:data.agentId,job_id:data.jobId??null,
    entry_kind:data.entryKind,category:data.category,amount_minor:data.amountMinor,currency:data.currency,
    status:data.status,source_ref:data.sourceRef??null,description:data.description??null,metadata:data.metadata
  }).select("*").single();
  if(error||!row)throw new Error(error?.message??"Wallet entry could not be posted");
  return row;
});

const maintenanceSchema=scope.extend({
  id:z.string().uuid().optional(),vehicleId:z.string().uuid(),maintenanceKind:z.string().min(1).max(120),
  title:z.string().min(1).max(240),dueAt:z.string().datetime().optional().nullable(),
  dueOdometer:z.number().nonnegative().optional().nullable(),completedAt:z.string().datetime().optional().nullable(),
  completedOdometer:z.number().nonnegative().optional().nullable(),
  status:z.enum(["scheduled","due","overdue","in_progress","completed","cancelled"]).default("scheduled"),
  costMinor:z.number().int().nonnegative().optional().nullable(),currency:z.string().regex(/^[A-Z]{3}$/).optional().nullable(),
  provider:z.string().max(200).optional().nullable(),notes:z.string().max(4000).optional().nullable(),
  evidenceRefs:z.array(z.string().max(1000)).max(100).default([]),metadata:z.record(z.string(),z.unknown()).default({})
});
export const saveVehicleMaintenance=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof maintenanceSchema>)=>maintenanceSchema.parse(input))
.handler(async({context,data})=>{
  await dispatchWriteScope(context,data);
  const db=context.supabase as any;
  const values={
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,vehicle_id:data.vehicleId,
    maintenance_kind:data.maintenanceKind,title:data.title,due_at:data.dueAt??null,due_odometer:data.dueOdometer??null,
    completed_at:data.completedAt??null,completed_odometer:data.completedOdometer??null,status:data.status,
    cost_minor:data.costMinor??null,currency:data.currency??null,provider:data.provider??null,notes:data.notes??null,
    evidence_refs:data.evidenceRefs,metadata:data.metadata
  };
  const q=data.id
    ?db.from("dispatch_vehicle_maintenance").update(values).eq("id",data.id).eq("tenant_id",data.tenantId)
    :db.from("dispatch_vehicle_maintenance").insert(values);
  const{data:row,error}=await q.select("*").single();
  if(error||!row)throw new Error(error?.message??"Maintenance record could not be saved");
  return row;
});

const positionSchema=scope.extend({
  agentId:z.string().uuid(),jobId:z.string().uuid().optional().nullable(),
  lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180),
  accuracyMetres:z.number().nonnegative().optional().nullable(),speedKph:z.number().nonnegative().optional().nullable(),
  headingDegrees:z.number().min(0).lt(360).optional().nullable(),
  source:z.enum(["agent_app","vehicle_telematics","provider","import"]).default("agent_app"),
  observedAt:z.string().datetime(),metadata:z.record(z.string(),z.unknown()).default({})
});
export const recordDispatchPosition=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof positionSchema>)=>positionSchema.parse(input))
.handler(async({context,data})=>{
  await dispatchWriteScope(context,data);
  const db=context.supabase as any;
  const{data:row,error}=await db.from("dispatch_agent_positions").insert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,agent_id:data.agentId,job_id:data.jobId??null,
    latitude:data.lat,longitude:data.lng,accuracy_metres:data.accuracyMetres??null,speed_kph:data.speedKph??null,
    heading_degrees:data.headingDegrees??null,source:data.source,observed_at:data.observedAt,metadata:data.metadata
  }).select("id,observed_at").single();
  if(error||!row)throw new Error(error?.message??"Position could not be recorded");
  await db.from("dispatch_agents").update({
    latitude:data.lat,longitude:data.lng,position_observed_at:data.observedAt
  }).eq("id",data.agentId).eq("tenant_id",data.tenantId);
  return row;
});

const behaviourSchema=scope.extend({
  agentId:z.string().uuid(),vehicleId:z.string().uuid().optional().nullable(),jobId:z.string().uuid().optional().nullable(),
  eventKind:z.enum(["speeding","harsh_acceleration","harsh_braking","harsh_cornering","excessive_idle","route_deviation","other"]),
  severity:z.enum(["info","low","medium","high","critical"]).default("info"),
  value:z.number().optional().nullable(),threshold:z.number().optional().nullable(),
  lat:z.number().min(-90).max(90).optional().nullable(),lng:z.number().min(-180).max(180).optional().nullable(),
  observedAt:z.string().datetime(),metadata:z.record(z.string(),z.unknown()).default({})
});
export const recordDriverBehaviourEvent=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof behaviourSchema>)=>behaviourSchema.parse(input))
.handler(async({context,data})=>{
  await dispatchWriteScope(context,data);
  const db=context.supabase as any;
  const{data:row,error}=await db.from("dispatch_driver_behaviour_events").insert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,agent_id:data.agentId,
    vehicle_id:data.vehicleId??null,job_id:data.jobId??null,event_kind:data.eventKind,severity:data.severity,
    value:data.value??null,threshold:data.threshold??null,latitude:data.lat??null,longitude:data.lng??null,
    observed_at:data.observedAt,metadata:data.metadata
  }).select("*").single();
  if(error||!row)throw new Error(error?.message??"Driver behaviour event could not be recorded");
  return row;
});

const geofenceSchema=scope.extend({
  id:z.string().uuid().optional(),locationId:z.string().uuid().optional().nullable(),
  name:z.string().min(1).max(200),kind:z.enum(["circle","polygon"]),shape:z.record(z.string(),z.unknown()),
  active:z.boolean().default(true),eventRules:z.array(z.enum(["enter","exit","dwell"])).min(1).max(3).default(["enter","exit"]),
  metadata:z.record(z.string(),z.unknown()).default({})
});
export const saveDispatchGeofence=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof geofenceSchema>)=>geofenceSchema.parse(input))
.handler(async({context,data})=>{
  await dispatchWriteScope(context,data);
  const db=context.supabase as any;
  const values={
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,location_id:data.locationId??null,
    name:data.name,geofence_kind:data.kind,shape:data.shape,active:data.active,event_rules:data.eventRules,metadata:data.metadata
  };
  const q=data.id
    ?db.from("dispatch_geofences").update(values).eq("id",data.id).eq("tenant_id",data.tenantId)
    :db.from("dispatch_geofences").insert(values);
  const{data:row,error}=await q.select("*").single();
  if(error||!row)throw new Error(error?.message??"Geofence could not be saved");
  return row;
});
