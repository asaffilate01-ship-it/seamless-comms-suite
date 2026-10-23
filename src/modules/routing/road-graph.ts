/**
 * Strict adapter between settled route-matrix receipts and the native VRP solver.
 * An estimated distance cannot become a road ETA, and an incomplete matrix
 * cannot silently fall through to Haversine within a road-verified run.
 */
import type { MatrixPoint, RoadCell, RoadMatrix } from "./road-matrix.provider";

export type RoadMatrixEvidence = {
 provider: RoadMatrix["provider"];
 quality: RoadMatrix["quality"];
 observedAt: string;
 origins: MatrixPoint[];
 destinations: MatrixPoint[];
 cells: RoadCell[];
};
export type RoadLeg = {distanceMetres:number;durationSeconds:number};
export type RoadGraph = {
 readonly provider:"maps.google"|"maps.openrouteservice";
 readonly quality:"road"|"traffic";
 get(from:MatrixPoint,to:MatrixPoint):RoadLeg|null;
};
function key(p:MatrixPoint):string{
 if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||
    Math.abs(p.lat)>90||Math.abs(p.lng)>180)throw new Error("Invalid route point");
 return p.lat.toFixed(7)+","+p.lng.toFixed(7);
}
export function uniqueRoadNodes(points:MatrixPoint[]):MatrixPoint[]{
 const nodes:MatrixPoint[]=[],keys=new Set<string>();
 for(const point of points){
  const id=key(point);
  if(!keys.has(id)){keys.add(id);nodes.push({lat:point.lat,lng:point.lng});}
 }
 return nodes;
}
export function collectRoadTopology(
 resources:ReadonlyArray<{start:MatrixPoint}>,
 jobs:ReadonlyArray<{stops:ReadonlyArray<MatrixPoint>}>
):MatrixPoint[]{
 return uniqueRoadNodes([
  ...resources.map(r=>r.start),
  ...jobs.flatMap(job=>job.stops)
 ]);
}
export function verifiedRoadGraph(evidence:RoadMatrixEvidence,
 expectedPoints:readonly MatrixPoint[],
 now:Date=new Date()):RoadGraph{
 if(!evidence||!["maps.google","maps.openrouteservice"].includes(evidence.provider)||
   !["road","traffic"].includes(evidence.quality)||
   (evidence.quality==="traffic"&&evidence.provider!=="maps.google"))
  throw new Error("Only real verified road/traffic matrices can plan road-aware routes");
 const moment=Date.parse(evidence.observedAt),age=now.getTime()-moment;
 const maxAgeMs=evidence.quality==="traffic"?10*60_000:24*60*60_000;
 if(!Number.isFinite(age)||age<0||age>maxAgeMs)throw new Error("Road matrix has expired");
 const nodes=uniqueRoadNodes([...expectedPoints]);
 const origins=evidence.origins,destinations=evidence.destinations;
 if(!Array.isArray(origins)||!Array.isArray(destinations)||
   nodes.length<1||nodes.length>8||origins.length!==nodes.length||
   destinations.length!==nodes.length)
  throw new Error("Road matrix does not cover the current workforce and stops");
 const expected=new Set(nodes.map(key));
 const byIndex=new Map<string,number>();
 for(let i=0;i<origins.length;i++){
  const k=key(origins[i]);
  if(!expected.has(k)||byIndex.has(k)||key(destinations[i])!==k)
   throw new Error("Road matrix coordinates differ from current source");
  byIndex.set(k,i);
 }
 if(byIndex.size!==nodes.length||
  !Array.isArray(evidence.cells)||
  evidence.cells.length!==nodes.length*nodes.length)
  throw new Error("Road matrix is incomplete");
 const legs=new Map<string,RoadLeg|null>();
 for(const c of evidence.cells){
  if(!Number.isSafeInteger(c.originIndex)||!Number.isSafeInteger(c.destinationIndex)||
   c.originIndex<0||c.originIndex>=nodes.length||
   c.destinationIndex<0||c.destinationIndex>=nodes.length)
   throw new Error("Road matrix has invalid indices");
  const index=String(c.originIndex)+":"+String(c.destinationIndex);
  if(legs.has(index))throw new Error("Road matrix has duplicate cells");
  if(c.status==="unreachable"){
   if(c.distanceMetres!==null||c.durationSeconds!==null)
    throw new Error("Unreachable matrix leg includes fake values");
   legs.set(index,null);
  }else if(c.status==="ok"&&Number.isSafeInteger(c.distanceMetres)&&
   Number.isSafeInteger(c.durationSeconds)&&
   c.distanceMetres!==null&&c.durationSeconds!==null&&
   c.distanceMetres>=0&&c.durationSeconds>=0&&
   c.distanceMetres<=1e9&&c.durationSeconds<=1e9){
   legs.set(index,{distanceMetres:c.distanceMetres,durationSeconds:c.durationSeconds});
  }else{
   throw new Error("Only verified road metrics or unreachable cells are accepted");
  }
 }
 if(legs.size!==nodes.length*nodes.length)throw new Error("Road matrix has gaps");
 return{
  provider:evidence.provider as RoadGraph["provider"],
  quality:evidence.quality as RoadGraph["quality"],
  get(from,to){
   const a=byIndex.get(key(from)),b=byIndex.get(key(to));
   if(a===undefined||b===undefined)throw new Error("Road route point moved or is missing");
   const index=String(a)+":"+String(b);
   if(!legs.has(index))throw new Error("Road matrix cell missing");
   return legs.get(index)??null;
  }
 };
}
