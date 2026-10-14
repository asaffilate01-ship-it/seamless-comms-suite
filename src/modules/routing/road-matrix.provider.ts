/** Fixed-host road matrix clients. Never accept arbitrary endpoints or return provider error bodies. */
export type MatrixPoint={lat:number;lng:number};
export type MatrixMode="driving"|"walking"|"cycling";
export type MatrixProvider="maps.google"|"maps.openrouteservice"|"routing.native";
export type MatrixQuality="traffic"|"road"|"straight_line_estimate";
export type RoadCell={
 originIndex:number;destinationIndex:number;distanceMetres:number|null;
 durationSeconds:number|null;status:"ok"|"unreachable"|"estimated";
};
export type RoadMatrix={provider:MatrixProvider;quality:MatrixQuality;
 cells:RoadCell[];originCount:number;destinationCount:number};
const GOOGLE="https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const ORS:Record<MatrixMode,string>={
 driving:"https://api.openrouteservice.org/v2/matrix/driving-car",
 walking:"https://api.openrouteservice.org/v2/matrix/foot-walking",
 cycling:"https://api.openrouteservice.org/v2/matrix/cycling-regular"
};
const valid=(point:MatrixPoint)=>Number.isFinite(point.lat)&&Number.isFinite(point.lng)
 &&Math.abs(point.lat)<=90&&Math.abs(point.lng)<=180;
export function validateMatrixPoints(origins:MatrixPoint[],destinations:MatrixPoint[]){
 if(!Array.isArray(origins)||!Array.isArray(destinations)||
    origins.length<1||origins.length>8||destinations.length<1||destinations.length>8||
    origins.length*destinations.length>64||![...origins,...destinations].every(valid))
   throw new Error("Invalid bounded matrix coordinates");
}
const metric=(v:unknown):number|null=>typeof v==="number"&&
 Number.isFinite(v)&&v>=0&&v<1e9?Math.ceil(v):null;
const duration=(v:unknown):number|null=>typeof v==="string"&&
 /^\d{1,9}(?:\.\d{1,9})?s$/.test(v)?metric(Number(v.slice(0,-1))):null;
async function request(url:string,headers:Record<string,string>,body:unknown,transport:typeof fetch){
 let response:Response;
 try{
  response=await transport(url,{method:"POST",redirect:"error",body:JSON.stringify(body),
   headers:{"content-type":"application/json",...headers},signal:AbortSignal.timeout(8000)});
 }catch{throw new Error("Road matrix provider connection failed");}
 if(!response.ok){
  await response.body?.cancel();
  throw new Error("Road matrix provider returned HTTP "+String(response.status));
 }
 const size=Number(response.headers.get("content-length")||0);
 if(!Number.isFinite(size)||size>256000){
  await response.body?.cancel();throw new Error("Road matrix provider response too large");}
 let raw:string;
 try{raw=await response.text();}catch{throw new Error("Road matrix provider response unreadable");}
 if(new TextEncoder().encode(raw).length>256000)throw new Error("Road matrix provider response too large");
 try{return JSON.parse(raw) as unknown;}catch{throw new Error("Road matrix provider returned invalid JSON");}
}
function validated(cells:RoadCell[],n:number,m:number){
 const seen=new Set<string>();
 for(const c of cells){
  if(!Number.isSafeInteger(c.originIndex)||!Number.isSafeInteger(c.destinationIndex)||
    c.originIndex<0||c.originIndex>=n||c.destinationIndex<0||c.destinationIndex>=m)
   throw new Error("Road matrix returned invalid cell index");
  const key=String(c.originIndex)+":"+String(c.destinationIndex);
  if(seen.has(key))throw new Error("Road matrix returned duplicate cell");
  seen.add(key);
 }
 if(seen.size!==n*m)throw new Error("Road matrix returned incomplete results");
 return cells.sort((a,b)=>a.originIndex-b.originIndex||a.destinationIndex-b.destinationIndex);
}
export async function googleRoadMatrix(input:{
 origins:MatrixPoint[];destinations:MatrixPoint[];mode:MatrixMode;
 trafficAware:boolean;apiKey:string
},transport:typeof fetch=fetch):Promise<RoadMatrix>{
 validateMatrixPoints(input.origins,input.destinations);
 if(input.mode!=="driving"||!input.apiKey)throw new Error("Google driving matrix not configured");
 const place=(p:MatrixPoint)=>({waypoint:{location:{latLng:{latitude:p.lat,longitude:p.lng}}}});
 const payload=await request(GOOGLE,{"X-Goog-Api-Key":input.apiKey,
  "X-Goog-FieldMask":"originIndex,destinationIndex,duration,distanceMeters,status,condition,fallbackInfo"},{
   origins:input.origins.map(place),destinations:input.destinations.map(place),travelMode:"DRIVE",
   routingPreference:input.trafficAware?"TRAFFIC_AWARE":"TRAFFIC_UNAWARE"
  },transport);
 if(!Array.isArray(payload)||payload.length!==input.origins.length*input.destinations.length)
  throw new Error("Google matrix element count mismatch");
 let fallback=false;
 const cells:RoadCell[]=payload.map((item:unknown)=>{
  if(!item||typeof item!=="object")throw new Error("Invalid Google matrix element");
  const row=item as Record<string,unknown>;
  if(!Number.isSafeInteger(row.originIndex)||!Number.isSafeInteger(row.destinationIndex))
   throw new Error("Invalid Google matrix index");
  if(row.fallbackInfo)fallback=true;
  const code=row.status&&typeof row.status==="object"
   ?Number((row.status as Record<string,unknown>).code??0):0;
  const metres=metric(row.distanceMeters),seconds=duration(row.duration);
  const ok=code===0&&row.condition==="ROUTE_EXISTS"&&metres!==null&&seconds!==null;
  return{originIndex:row.originIndex as number,destinationIndex:row.destinationIndex as number,
   distanceMetres:ok?metres:null,durationSeconds:ok?seconds:null,
   status:ok?"ok":"unreachable"};
 });
 return{provider:"maps.google",quality:input.trafficAware&&!fallback?"traffic":"road",
  originCount:input.origins.length,destinationCount:input.destinations.length,
  cells:validated(cells,input.origins.length,input.destinations.length)};
}
export async function orsRoadMatrix(input:{
 origins:MatrixPoint[];destinations:MatrixPoint[];mode:MatrixMode;apiKey:string
},transport:typeof fetch=fetch):Promise<RoadMatrix>{
 validateMatrixPoints(input.origins,input.destinations);
 if(!input.apiKey)throw new Error("openrouteservice matrix not configured");
 const n=input.origins.length,m=input.destinations.length;
 const locations=[...input.origins,...input.destinations].map(p=>[p.lng,p.lat]);
 const payload=await request(ORS[input.mode],{Authorization:input.apiKey},{
  locations,sources:Array.from({length:n},(_,i)=>String(i)),
  destinations:Array.from({length:m},(_,i)=>String(i+n)),metrics:["distance","duration"],units:"m"
 },transport);
 if(!payload||typeof payload!=="object")throw new Error("Invalid ORS matrix");
 const result=payload as Record<string,unknown>;
 if(!Array.isArray(result.distances)||!Array.isArray(result.durations)||
  result.distances.length!==n||result.durations.length!==n)
  throw new Error("ORS matrix missing rows");
 const cells:RoadCell[]=[];
 for(let i=0;i<n;i++){
  const d=result.distances[i],t=result.durations[i];
  if(!Array.isArray(d)||!Array.isArray(t)||d.length!==m||t.length!==m)
   throw new Error("ORS matrix incomplete columns");
  for(let j=0;j<m;j++){
   const metres=metric(d[j]),seconds=metric(t[j]);
   const ok=metres!==null&&seconds!==null;
   cells.push({originIndex:i,destinationIndex:j,
    distanceMetres:ok?metres:null,durationSeconds:ok?seconds:null,
    status:ok?"ok":"unreachable"});
  }
 }
 return{provider:"maps.openrouteservice",quality:"road",originCount:n,destinationCount:m,
  cells:validated(cells,n,m)};
}
const radians=(d:number)=>d*Math.PI/180;
export function straightLineMatrix(origins:MatrixPoint[],destinations:MatrixPoint[]):RoadMatrix{
 validateMatrixPoints(origins,destinations);
 const cells:RoadCell[]=[];
 for(let i=0;i<origins.length;i++)for(let j=0;j<destinations.length;j++){
  const a=origins[i],b=destinations[j],dLat=radians(b.lat-a.lat),dLng=radians(b.lng-a.lng);
  const v=Math.sin(dLat/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(dLng/2)**2;
  const distanceMetres=Math.ceil(12742000*Math.asin(Math.sqrt(Math.min(1,Math.max(0,v)))));
  cells.push({originIndex:i,destinationIndex:j,status:"estimated",distanceMetres,
   durationSeconds:null});
 }
 return{provider:"routing.native",quality:"straight_line_estimate",
  originCount:origins.length,destinationCount:destinations.length,cells};
}
