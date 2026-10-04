export type RoutingPoint={lat:number;lng:number;windowStart?:string|null;windowEnd?:string|null;serviceSeconds?:number|null;stopId?:string|null};
export type RoutingJob={
 jobId:string;priority:"low"|"normal"|"high"|"urgent";demand:number;
 requiredSkills:string[];requiredVehicleTypes:string[];scheduledAt?:string|null;stops:RoutingPoint[];
};
export type RoutingResource={
 agentId:string;vehicleId?:string|null;skills:string[];vehicleType?:string|null;capacity?:number|null;
 start:RoutingPoint;shiftEnd?:string|null;
};
export type PlannedStop=RoutingPoint&{
 jobId:string;sequence:number;distanceFromPreviousMetres:number;durationFromPreviousSeconds:number;
 plannedArrivalAt:string;plannedDepartureAt:string;constraintState:"ok"|"warning"|"breach";constraintDetail:Record<string,unknown>;
};
export type NativeRoute={
 routeNo:number;agentId:string;vehicleId?:string|null;plannedDistanceMetres:number;plannedDurationSeconds:number;
 plannedLoad:number;capacity?:number|null;plannedFinishAt:string;stops:PlannedStop[];
};
export type NativeOptimisationResult={
 routes:NativeRoute[];unassignedJobIds:string[];warnings:string[];
 score:{distanceMetres:number;durationSeconds:number;assignedJobs:number;unassignedJobs:number;constraintBreaches:number};
};

const R=6371000;
const rad=(x:number)=>x*Math.PI/180;
export function haversineMetres(a:RoutingPoint,b:RoutingPoint){
 const dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng);
 const x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;
 return Math.round(2*R*Math.asin(Math.sqrt(Math.max(0,Math.min(1,x)))));
}
function travelSeconds(distanceMetres:number){return Math.max(30,Math.round(distanceMetres/11.11));}
const priorityWeight=(p:RoutingJob["priority"])=>p==="urgent"?0:p==="high"?1:p==="normal"?2:3;
function feasible(resource:RoutingResource,job:RoutingJob,currentLoad:number){
 if(job.requiredSkills.some(s=>!resource.skills.includes(s)))return false;
 if(job.requiredVehicleTypes.length&&(!resource.vehicleType||!job.requiredVehicleTypes.includes(resource.vehicleType)))return false;
 if(resource.capacity!=null&&currentLoad+Math.max(0,job.demand)>resource.capacity)return false;
 return true;
}
function chainDistance(start:RoutingPoint,job:RoutingJob){
 if(!job.stops.length)return Number.POSITIVE_INFINITY;
 let d=haversineMetres(start,job.stops[0]);
 for(let i=1;i<job.stops.length;i++)d+=haversineMetres(job.stops[i-1],job.stops[i]);
 return d;
}
function jobBlockDistance(start:RoutingPoint,jobs:RoutingJob[]){
 let d=0,p=start;
 for(const job of jobs){
  if(!job.stops.length)continue;
  d+=haversineMetres(p,job.stops[0]);
  for(let i=1;i<job.stops.length;i++)d+=haversineMetres(job.stops[i-1],job.stops[i]);
  p=job.stops[job.stops.length-1];
 }
 return d;
}
function greedyOrder(start:RoutingPoint,jobs:RoutingJob[]){
 const remaining=[...jobs],out:RoutingJob[]=[];let p=start;
 while(remaining.length){
  remaining.sort((a,b)=>{
   const pa=priorityWeight(a.priority),pb=priorityWeight(b.priority);
   if(pa!==pb)return pa-pb;
   return chainDistance(p,a)-chainDistance(p,b);
  });
  const next=remaining.shift()!;out.push(next);
  if(next.stops.length)p=next.stops[next.stops.length-1];
 }
 return out;
}
function reverseSegment<T>(arr:T[],i:number,k:number){return [...arr.slice(0,i),...arr.slice(i,k+1).reverse(),...arr.slice(k+1)];}
function twoOptJobBlocks(start:RoutingPoint,jobs:RoutingJob[]){
 let best=[...jobs],bestDistance=jobBlockDistance(start,best),improved=true,passes=0;
 while(improved&&passes<4){
  improved=false;passes++;
  for(let i=0;i<best.length-1;i++)for(let k=i+1;k<best.length;k++){
   const candidate=reverseSegment(best,i,k),distance=jobBlockDistance(start,candidate);
   if(distance+1<bestDistance){best=candidate;bestDistance=distance;improved=true;}
  }
 }
 return best;
}
function materialiseRoute(routeNo:number,resource:RoutingResource,jobs:RoutingJob[],startedAtMs:number):NativeRoute{
 let p=resource.start,clock=startedAtMs,seq=0,totalDistance=0,totalDuration=0,load=0;
 const stops:PlannedStop[]=[];
 for(const job of jobs){
  load+=Math.max(0,job.demand);
  for(const stop of job.stops){
   const distance=haversineMetres(p,stop),travel=travelSeconds(distance);
   clock+=travel*1000;totalDistance+=distance;totalDuration+=travel;
   const detail:Record<string,unknown>={};
   let state:"ok"|"warning"|"breach"="ok";
   if(stop.windowStart){
    const ws=Date.parse(stop.windowStart);
    if(Number.isFinite(ws)&&clock<ws){detail.waitSeconds=Math.round((ws-clock)/1000);totalDuration+=Math.round((ws-clock)/1000);clock=ws;}
   }
   if(stop.windowEnd){
    const we=Date.parse(stop.windowEnd);
    if(Number.isFinite(we)&&clock>we){state="breach";detail.windowEnd=stop.windowEnd;detail.lateSeconds=Math.round((clock-we)/1000);}
   }
   if(resource.shiftEnd){
    const se=Date.parse(resource.shiftEnd);
    if(Number.isFinite(se)&&clock>se){state="breach";detail.shiftEnd=resource.shiftEnd;}
   }
   const arrival=new Date(clock).toISOString(),service=Math.max(0,stop.serviceSeconds??0);
   clock+=service*1000;totalDuration+=service;
   stops.push({...stop,jobId:job.jobId,sequence:seq++,distanceFromPreviousMetres:distance,durationFromPreviousSeconds:travel,
    plannedArrivalAt:arrival,plannedDepartureAt:new Date(clock).toISOString(),constraintState:state,constraintDetail:detail});
   p=stop;
  }
 }
 return{routeNo,agentId:resource.agentId,vehicleId:resource.vehicleId??null,plannedDistanceMetres:totalDistance,
  plannedDurationSeconds:totalDuration,plannedLoad:load,capacity:resource.capacity??null,plannedFinishAt:new Date(clock).toISOString(),stops};
}
export function optimiseNativeRoutes(input:{jobs:RoutingJob[];resources:RoutingResource[];startedAt?:string;maxStopsPerRoute?:number}):NativeOptimisationResult{
 const startedAtMs=input.startedAt?Date.parse(input.startedAt):Date.now();
 const maxStops=Math.max(1,input.maxStopsPerRoute??100);
 const routeJobs=new Map<string,RoutingJob[]>(),loads=new Map<string,number>();
 for(const r of input.resources){routeJobs.set(r.agentId,[]);loads.set(r.agentId,0);}
 const sorted=[...input.jobs].sort((a,b)=>{
  const p=priorityWeight(a.priority)-priorityWeight(b.priority);if(p)return p;
  const at=a.scheduledAt?Date.parse(a.scheduledAt):Number.POSITIVE_INFINITY;
  const bt=b.scheduledAt?Date.parse(b.scheduledAt):Number.POSITIVE_INFINITY;
  return at-bt;
 });
 const unassigned:string[]=[];
 for(const job of sorted){
  let best:RoutingResource|null=null,bestCost=Number.POSITIVE_INFINITY;
  for(const r of input.resources){
   const assigned=routeJobs.get(r.agentId)??[],load=loads.get(r.agentId)??0;
   const stopsUsed=assigned.reduce((n,j)=>n+j.stops.length,0);
   if(stopsUsed+job.stops.length>maxStops||!feasible(r,job,load))continue;
   const last=assigned.length&&assigned[assigned.length-1].stops.length?assigned[assigned.length-1].stops[assigned[assigned.length-1].stops.length-1]:r.start;
   const distance=chainDistance(last,job),balancePenalty=assigned.length*2500;
   const cost=distance+balancePenalty+priorityWeight(job.priority)*500;
   if(cost<bestCost){best=r;bestCost=cost;}
  }
  if(!best){unassigned.push(job.jobId);continue;}
  routeJobs.get(best.agentId)!.push(job);
  loads.set(best.agentId,(loads.get(best.agentId)??0)+Math.max(0,job.demand));
 }
 const routes:NativeRoute[]=[];let routeNo=0;
 for(const r of input.resources){
  const assigned=routeJobs.get(r.agentId)??[];if(!assigned.length)continue;
  const ordered=twoOptJobBlocks(r.start,greedyOrder(r.start,assigned));
  routes.push(materialiseRoute(routeNo++,r,ordered,Number.isFinite(startedAtMs)?startedAtMs:Date.now()));
 }
 const distanceMetres=routes.reduce((s,r)=>s+r.plannedDistanceMetres,0);
 const durationSeconds=routes.reduce((s,r)=>s+r.plannedDurationSeconds,0);
 const constraintBreaches=routes.reduce((s,r)=>s+r.stops.filter(x=>x.constraintState==="breach").length,0);
 const warnings:string[]=[];
 if(unassigned.length)warnings.push(String(unassigned.length)+" job(s) could not be assigned under current skill/capacity/vehicle constraints");
 if(constraintBreaches)warnings.push(String(constraintBreaches)+" planned stop(s) breach a time-window or shift constraint");
 return{routes,unassignedJobIds:unassigned,warnings,score:{distanceMetres,durationSeconds,
  assignedJobs:input.jobs.length-unassigned.length,unassignedJobs:unassigned.length,constraintBreaches}};
}
