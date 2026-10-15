/* eslint-disable @typescript-eslint/no-explicit-any -- routed DB migrations are source-authoritative. */
import type{RoutingJob,RoutingResource} from "./service.server";
/** Same authoritative source snapshot for road matrix queueing and VRP execution. */
export async function sourceRoutingWorkload(db:any,tenantId:string,productKey:string,requireFreshPosition:boolean){
 const [jobsR,agentsR,vehiclesR,positionsR,shiftsR]=await Promise.all([
  db.from("dispatch_jobs").select("*,stops:dispatch_job_stops(*)").eq("tenant_id",tenantId).eq("product_key",productKey).eq("status","unassigned").order("priority").limit(500),
  db.from("dispatch_agents").select("*").eq("tenant_id",tenantId).eq("product_key",productKey).eq("status","available"),
  db.from("dispatch_vehicles").select("*").eq("tenant_id",tenantId).eq("product_key",productKey).eq("status","available"),
  db.from("dispatch_agent_positions").select("*").eq("tenant_id",tenantId).eq("product_key",productKey).order("observed_at",{ascending:false}).limit(2000),
  db.from("fleet_shifts").select("*").eq("tenant_id",tenantId).eq("product_key",productKey).in("status",["scheduled","active"]).lte("starts_at",new Date().toISOString()).gte("ends_at",new Date().toISOString())
 ]);
 for(const r of[jobsR,agentsR,vehiclesR,positionsR,shiftsR])if(r.error)throw new Error(r.error.message);

 const positions=new Map<string,any>();
 for(const p of positionsR.data??[])if(!positions.has(p.agent_id))positions.set(p.agent_id,p);
 const shifts=new Map<string,any>();
 for(const s of shiftsR.data??[])if(!shifts.has(s.agent_id))shifts.set(s.agent_id,s);
 const vehicles=[...(vehiclesR.data??[])].sort((x:any,y:any)=>String(x.id).localeCompare(String(y.id))),usedVehicles=new Set<string>();
 const resources:RoutingResource[]=[];
 for(const a of [...(agentsR.data??[])].sort((x:any,y:any)=>String(x.id).localeCompare(String(y.id)))){
  const pos=positions.get(a.id),homeLat=Number(a.metadata?.homeLat),homeLng=Number(a.metadata?.homeLng);
  const observed=Date.parse(String(pos?.observed_at??""));
  if(requireFreshPosition&&(!Number.isFinite(observed)||observed>Date.now()||
    Date.now()-observed>15*60_000))continue;
  const lat=pos?.latitude??(!requireFreshPosition&&Number.isFinite(homeLat)?homeLat:null),
   lng=pos?.longitude??(!requireFreshPosition&&Number.isFinite(homeLng)?homeLng:null);
  if(lat==null||lng==null)continue;
  let vehicle:any=null;
  const preferred=typeof a.metadata?.currentVehicleId==="string"?vehicles.find(v=>v.id===a.metadata.currentVehicleId&&!usedVehicles.has(v.id)):null;
  vehicle=preferred??vehicles.find(v=>!usedVehicles.has(v.id))??null;if(vehicle)usedVehicles.add(vehicle.id);
  resources.push({agentId:a.id,vehicleId:vehicle?.id??null,skills:a.skills??[],vehicleType:vehicle?.vehicle_type??null,
   capacity:vehicle?.capacity??a.capacity??null,start:{lat:Number(lat),lng:Number(lng)},shiftEnd:shifts.get(a.id)?.ends_at??null});
 }
 const jobs:RoutingJob[]=[...(jobsR.data??[])].sort((x:any,y:any)=>String(x.id).localeCompare(String(y.id))).map((j:any)=>({
  jobId:j.id,priority:j.priority,demand:Number(j.capacity_demand??0),requiredSkills:j.required_skills??[],
  requiredVehicleTypes:j.required_vehicle_types??[],scheduledAt:j.scheduled_at??null,
  stops:[...(j.stops??[])].sort((a:any,b:any)=>a.position-b.position).map((s:any)=>({
   lat:Number(s.latitude),lng:Number(s.longitude),windowStart:s.window_start??null,windowEnd:s.window_end??null,
   serviceSeconds:s.service_seconds??0,stopId:s.id
  }))
 }));
 if(!resources.length||!jobs.length)throw new Error("Routing requires eligible drivers and unassigned jobs");
 return{jobs,resources};
}
