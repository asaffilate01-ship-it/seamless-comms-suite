import {verifiedRoadGraph,type RoadMatrixEvidence} from "./road-graph";
import type {MatrixPoint,RoadCell} from "./road-matrix.provider";

/** Strict finite, deterministic matrix tiling: 16 unique nodes = four <=8x8 chunks. */
export type TileSpec={
 rowOffset:number;columnOffset:number;origins:MatrixPoint[];
 destinations:MatrixPoint[];
};
export type SettledTile={
 rowOffset:number;columnOffset:number;
 status:string;quality:string;providerKey:string;completedAt:string;
 origins:MatrixPoint[];destinations:MatrixPoint[];cells:RoadCell[];
};
const MAX_NODES=16,SIDE=8;
const pointKey=(point:MatrixPoint)=>{
 if(!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lng)||
    Math.abs(point.lat)>90||Math.abs(point.lng)>180)throw new Error("Invalid matrix coordinate");
 return point.lat.toFixed(7)+":"+point.lng.toFixed(7);
};
const samePoints=(a:readonly MatrixPoint[],b:readonly MatrixPoint[]) =>
 a.length===b.length&&a.every((p,i)=>pointKey(p)===pointKey(b[i]));
export function partitionRoadMatrix(nodes:readonly MatrixPoint[]):TileSpec[]{
 if(!Array.isArray(nodes)||nodes.length<2||nodes.length>MAX_NODES)
  throw new Error("Road matrix batching supports 2 to 16 unique nodes");
 const seen=new Set(nodes.map(pointKey));
 if(seen.size!==nodes.length)throw new Error("Road matrix topology contains duplicate locations");
 const result:TileSpec[]=[];
 for(let i=0;i<nodes.length;i+=SIDE)
  for(let j=0;j<nodes.length;j+=SIDE)
   result.push({rowOffset:i,columnOffset:j,
    origins:nodes.slice(i,i+SIDE),destinations:nodes.slice(j,j+SIDE)});
 const pairs=result.reduce((sum,t)=>sum+t.origins.length*t.destinations.length,0);
 if(pairs!==nodes.length*nodes.length||result.length>4)
  throw new Error("Matrix tile partition produced unexpected cardinality");
 return result;
}
/** Reconstructs only vendor-backed, completed, fully covered road evidence. */
export function assembleRoadMatrix(
 nodes:readonly MatrixPoint[],receipts:readonly SettledTile[],now:Date=new Date()
):RoadMatrixEvidence{
 const spec=partitionRoadMatrix(nodes);
 if(!Array.isArray(receipts)||receipts.length!==spec.length)
  throw new Error("Batched road matrix requires all completed tiles");
 const map=new Map<string,SettledTile>();
 for(const r of receipts){
  if(!Number.isSafeInteger(r.rowOffset)||!Number.isSafeInteger(r.columnOffset))
   throw new Error("Invalid matrix tile offsets");
  const id=r.rowOffset+":"+r.columnOffset;
  if(map.has(id))throw new Error("Duplicate matrix tile receipt");
  map.set(id,r);
 }
 let provider:RoadMatrixEvidence["provider"]|undefined;
 let quality:RoadMatrixEvidence["quality"]|undefined;
 let earliest=Number.POSITIVE_INFINITY;
 const output:RoadCell[]=[];
 for(const tile of spec){
  const r=map.get(tile.rowOffset+":"+tile.columnOffset);
  if(!r||r.status!=="completed"||!["road","traffic"].includes(r.quality)||
   !["maps.google","maps.openrouteservice"].includes(r.providerKey)||
   r.quality==="traffic"&&r.providerKey!=="maps.google"||
   !samePoints(tile.origins,r.origins)||!samePoints(tile.destinations,r.destinations))
   throw new Error("Road tile incomplete, estimated, invalid or moved");
  if(provider&&provider!==r.providerKey||quality&&quality!==r.quality)
   throw new Error("Cannot mix routing providers or traffic freshness within a route");
  provider=r.providerKey as RoadMatrixEvidence["provider"];
  quality=r.quality as RoadMatrixEvidence["quality"];
  const stamped=Date.parse(r.completedAt);
  const age=now.getTime()-stamped;
  const ttl=r.quality==="traffic"?10*60_000:24*60*60_000;
  if(!Number.isFinite(age)||age<0||age>ttl)throw new Error("Road tile has expired");
  earliest=Math.min(earliest,stamped);
  if(!Array.isArray(r.cells)||r.cells.length!==tile.origins.length*tile.destinations.length)
   throw new Error("Road tile cell count incomplete");
  const seen=new Set<string>();
  for(const c of r.cells){
   const row=c.originIndex,col=c.destinationIndex;
   if(!Number.isSafeInteger(row)||!Number.isSafeInteger(col)||
    row<0||row>=tile.origins.length||col<0||col>=tile.destinations.length)
    throw new Error("Road tile has invalid cell indices");
   const id=row+":"+col;
   if(seen.has(id))throw new Error("Road tile has duplicate cells");
   seen.add(id);
   output.push({...c,originIndex:row+tile.rowOffset,
    destinationIndex:col+tile.columnOffset});
  }
 }
 if(!provider||!quality||!Number.isFinite(earliest))
  throw new Error("No qualified road matrix evidence");
 const evidence:RoadMatrixEvidence={
  provider,quality,origins:[...nodes],destinations:[...nodes],
  observedAt:new Date(earliest).toISOString(),cells:output
 };
 // A single non-road, unreachable or missing leg cannot turn into synthetic ETA.
 verifiedRoadGraph(evidence,nodes,now);
 return evidence;
}
