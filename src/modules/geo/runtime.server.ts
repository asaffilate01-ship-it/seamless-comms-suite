import type { GeoProvider, GeoAddress, GeoPoint, RouteRequest, OptimisationRequest, OptimisationResult } from "./contracts";
import { createGoogleMapsProvider, createMapboxProvider } from "./providers.server";
import { chooseTenantPlugin, resolveBindingSecrets } from "@/modules/platform/plugin-runtime.server";

export type GeoProviderFactory=(credentials:Record<string,string>,config:Record<string,unknown>)=>GeoProvider;
export class GeoProviderRegistry{private factories=new Map<string,GeoProviderFactory>();register(key:string,factory:GeoProviderFactory){if(this.factories.has(key))throw new Error("Geo provider already registered: "+key);this.factories.set(key,factory);return this;}create(key:string,credentials:Record<string,string>,config:Record<string,unknown>){const f=this.factories.get(key);if(!f)throw new Error("Geo provider not installed: "+key);return f(credentials,config);}}
export function defaultGeoProviderRegistry(){return new GeoProviderRegistry().register("maps.google",createGoogleMapsProvider).register("maps.mapbox",createMapboxProvider);}

export async function resolveTenantGeoProvider(input:{tenantId:string;tenantProductId:string;regionKey:string;registry?:GeoProviderRegistry}){
 const candidate=await chooseTenantPlugin({tenantId:input.tenantId,tenantProductId:input.tenantProductId,moduleKey:"geo.core",integrationKind:"maps",regionKey:input.regionKey});
 const credentials=resolveBindingSecrets(candidate.binding as any);const registry=input.registry??defaultGeoProviderRegistry();return registry.create(candidate.definition.key,credentials,candidate.binding.config);
}

export async function tenantGeocode(input:{tenantId:string;tenantProductId:string;regionKey:string;address:GeoAddress;registry?:GeoProviderRegistry}){const provider=await resolveTenantGeoProvider(input);return provider.geocode(input.address);}
export async function tenantReverseGeocode(input:{tenantId:string;tenantProductId:string;regionKey:string;point:GeoPoint;registry?:GeoProviderRegistry}){const provider=await resolveTenantGeoProvider(input);return provider.reverse(input.point);}
export async function tenantRoute(input:{tenantId:string;tenantProductId:string;regionKey:string;request:RouteRequest;registry?:GeoProviderRegistry}){const provider=await resolveTenantGeoProvider(input);return provider.route(input.request);}

function haversineMetres(a:GeoPoint,b:GeoPoint){
 const toRad=(n:number)=>n*Math.PI/180;
 const r=6371000;const dLat=toRad(b.lat-a.lat);const dLng=toRad(b.lng-a.lng);
 const lat1=toRad(a.lat);const lat2=toRad(b.lat);
 const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
 return 2*r*Math.asin(Math.min(1,Math.sqrt(h)));
}

async function heuristicOptimise(provider:GeoProvider,request:OptimisationRequest):Promise<OptimisationResult>{
 if(!request.vehicles.length)return{provider:"omniqora.heuristic",objective:request.objective,routes:[],unassignedStopIds:request.stops.map((s)=>s.id)};
 const remaining=new Map(request.stops.map((stop)=>[stop.id,stop]));
 const work=request.vehicles.map((vehicle)=>({
  vehicle,current:vehicle.start,stopIds:[] as string[],distance:0,
  remainingCapacity:vehicle.capacity??Number.POSITIVE_INFINITY
 }));
 const unassigned:string[]=[];

 while(remaining.size){
  let best:{worker:number;stopId:string;score:number;distance:number}|null=null;
  for(let wi=0;wi<work.length;wi++){
   const w=work[wi]!;
   for(const stop of remaining.values()){
    const demand=stop.demand??0;if(demand>w.remainingCapacity)continue;
    const distance=haversineMetres(w.current,stop.point);
    const balancePenalty=request.objective==="balanced"?w.distance*0.2:0;
    const costPenalty=request.objective==="cost"?w.distance*0.1:0;
    const score=distance+balancePenalty+costPenalty;
    if(!best||score<best.score)best={worker:wi,stopId:stop.id,score,distance};
   }
  }
  if(!best){unassigned.push(...remaining.keys());break;}
  const stop=remaining.get(best.stopId)!;const w=work[best.worker]!;
  w.stopIds.push(stop.id);w.distance+=best.distance;w.current=stop.point;
  if(Number.isFinite(w.remainingCapacity))w.remainingCapacity-=stop.demand??0;
  remaining.delete(stop.id);
 }

 const stopById=new Map(request.stops.map((stop)=>[stop.id,stop]));
 const routes=[] as OptimisationResult["routes"];
 let usedProviderKey="omniqora.heuristic";
 for(const w of work){
  if(!w.stopIds.length){
   routes.push({vehicleId:w.vehicle.id,stopIds:[],distanceMetres:0,durationSeconds:0});continue;
  }
  const points=w.stopIds.map((id)=>stopById.get(id)!.point);
  const fallbackDistance=(()=>{
   let total=0;let current=w.vehicle.start;
   for(const point of points){total+=haversineMetres(current,point);current=point;}
   if(w.vehicle.end)total+=haversineMetres(current,w.vehicle.end);
   return Math.round(total);
  })();
  let distanceMetres=fallbackDistance;
  let durationSeconds=Math.round(fallbackDistance/11.11);
  const destination=w.vehicle.end??points[points.length-1]!;
  const waypoints=w.vehicle.end?points:points.slice(0,-1);
  if(waypoints.length<=23){
   try{
    const routed=await provider.route({
     tenantId:request.tenantId,origin:w.vehicle.start,destination,waypoints,
     mode:"driving"
    });
    distanceMetres=routed.distanceMetres;durationSeconds=routed.durationSeconds;
    usedProviderKey=provider.key+"+omniqora.heuristic";
   }catch{
    // Provider refinement is optional; allocation remains usable with the deterministic fallback.
   }
  }
  routes.push({vehicleId:w.vehicle.id,stopIds:w.stopIds,distanceMetres,durationSeconds});
 }
 return{provider:usedProviderKey,objective:request.objective,routes,unassignedStopIds:unassigned};
}

export async function tenantOptimise(input:{
 tenantId:string;tenantProductId:string;regionKey:string;request:OptimisationRequest;registry?:GeoProviderRegistry
}):Promise<OptimisationResult>{
 const provider=await resolveTenantGeoProvider(input);
 if(provider.optimise){
  try{return await provider.optimise(input.request);}catch{/* fall through to Omniqora heuristic */}
 }
 return heuristicOptimise(provider,input.request);
}
