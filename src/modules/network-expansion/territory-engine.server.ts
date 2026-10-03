type LatLng={lat:number;lng:number};
type Candidate={bearing:number;radiusKm:number;lat:number;lng:number;index:number};
type RouteSample={durationSeconds:number;distanceMeters:number|null;condition:string|null};

const GOOGLE_ROUTE_MATRIX_URL="https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const GOOGLE_GEOCODE_URL="https://maps.googleapis.com/maps/api/geocode/json";

function rad(v:number){return v*Math.PI/180}
function deg(v:number){return v*180/Math.PI}
export async function geocodeAddress(address:string):Promise<LatLng>{
  const key=process.env.GOOGLE_GEOCODING_API_KEY||process.env.GOOGLE_ROUTES_API_KEY;
  if(!key)throw new Error("Google geocoding API key is not configured");
  const url=new URL(GOOGLE_GEOCODE_URL);url.searchParams.set("address",address);url.searchParams.set("region","gb");url.searchParams.set("key",key);
  const response=await fetch(url);if(!response.ok)throw new Error(`Google geocoding failed (${response.status})`);
  const payload=await response.json() as any;
  const loc=payload?.results?.[0]?.geometry?.location;
  if(payload?.status!=="OK"||!loc||!Number.isFinite(Number(loc.lat))||!Number.isFinite(Number(loc.lng)))throw new Error("Address could not be geocoded");
  return{lat:Number(loc.lat),lng:Number(loc.lng)};
}

export function haversineKm(a:LatLng,b:LatLng){
  const R=6371,dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng);
  const q=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(q)));
}
function destination(origin:LatLng,bearingDeg:number,distanceKm:number):LatLng{
  const R=6371,brng=rad(bearingDeg),d=distanceKm/R,lat1=rad(origin.lat),lng1=rad(origin.lng);
  const lat2=Math.asin(Math.sin(lat1)*Math.cos(d)+Math.cos(lat1)*Math.sin(d)*Math.cos(brng));
  const lng2=lng1+Math.atan2(Math.sin(brng)*Math.sin(d)*Math.cos(lat1),Math.cos(d)-Math.sin(lat1)*Math.sin(lat2));
  return{lat:deg(lat2),lng:((deg(lng2)+540)%360)-180};
}
function durationSeconds(value:unknown){
  if(typeof value==="string"&&value.endsWith("s"))return Number(value.slice(0,-1))||Infinity;
  if(typeof value==="number")return value;
  return Infinity;
}
function ringGeo(points:LatLng[]){
  const coordinates=points.map(p=>[p.lng,p.lat]);
  if(coordinates.length&&JSON.stringify(coordinates[0])!==JSON.stringify(coordinates[coordinates.length-1]))coordinates.push(coordinates[0]);
  return{type:"Polygon",coordinates:[coordinates]};
}
function bboxOf(polygon:any){
  const ring=(polygon?.coordinates?.[0]??[]) as number[][];
  let minLat=90,maxLat=-90,minLng=180,maxLng=-180;
  for(const [lng,lat] of ring){minLat=Math.min(minLat,lat);maxLat=Math.max(maxLat,lat);minLng=Math.min(minLng,lng);maxLng=Math.max(maxLng,lng);}
  return{minLat,maxLat,minLng,maxLng};
}
function pointInPolygon(point:LatLng,polygon:any){
  const ring=(polygon?.coordinates?.[0]??[]) as number[][];
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i]?.[0],yi=ring[i]?.[1],xj=ring[j]?.[0],yj=ring[j]?.[1];
    if([xi,yi,xj,yj].some(v=>typeof v!=="number"))continue;
    const intersect=((yi>point.lat)!==(yj>point.lat))&&(point.lng<(xj-xi)*(point.lat-yi)/(yj-yi+Number.EPSILON)+xi);
    if(intersect)inside=!inside;
  }
  return inside;
}
function makeCandidates(origin:LatLng,bearings:number,maxRadiusKm:number){
  const radii=Array.from({length:7},(_,i)=>Number((((i+1)/7)*maxRadiusKm).toFixed(3)));
  const rows:Candidate[]=[];let index=0;
  for(let b=0;b<bearings;b++){
    const bearing=b*360/bearings;
    for(const radiusKm of radii){const p=destination(origin,bearing,radiusKm);rows.push({bearing,radiusKm,lat:p.lat,lng:p.lng,index:index++});}
  }
  return rows;
}
function grouped(candidates:Candidate[]){
  const map=new Map<number,Candidate[]>();
  for(const c of candidates){const a=map.get(c.bearing)??[];a.push(c);map.set(c.bearing,a);}
  for(const a of map.values())a.sort((x,y)=>x.radiusKm-y.radiusKm);
  return [...map.entries()].sort((a,b)=>a[0]-b[0]);
}

async function googleMatrix(origin:LatLng,destinations:Candidate[],routingPreference:string){
  const key=process.env.GOOGLE_ROUTES_API_KEY;
  if(!key)throw new Error("GOOGLE_ROUTES_API_KEY is not configured");
  const response=await fetch(GOOGLE_ROUTE_MATRIX_URL,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "X-Goog-Api-Key":key,
      "X-Goog-FieldMask":"originIndex,destinationIndex,duration,distanceMeters,status,condition"
    },
    body:JSON.stringify({
      origins:[{waypoint:{location:{latLng:{latitude:origin.lat,longitude:origin.lng}}}}],
      destinations:destinations.map(d=>({waypoint:{location:{latLng:{latitude:d.lat,longitude:d.lng}}}})),
      travelMode:"DRIVE",
      routingPreference:routingPreference||"TRAFFIC_UNAWARE"
    })
  });
  if(!response.ok)throw new Error(`Google Routes matrix failed (${response.status}): ${(await response.text()).slice(0,500)}`);
  const payload=await response.json() as any[];
  const out=new Map<number,RouteSample>();
  for(const row of payload??[]){
    const i=Number(row.destinationIndex);
    if(!Number.isFinite(i))continue;
    out.set(i,{durationSeconds:durationSeconds(row.duration),distanceMeters:Number.isFinite(Number(row.distanceMeters))?Number(row.distanceMeters):null,condition:row.condition??null});
  }
  return out;
}

function boundaryFor(
  candidates:Candidate[],
  current:Map<number,RouteSample>,
  neighbours:Array<Map<number,RouteSample>>,
  thresholdMinutes:number,
  protectedMode:boolean,
  neighbourToleranceSeconds:number
){
  const threshold=thresholdMinutes*60;
  const points:LatLng[]=[];
  for(const[,samples]of grouped(candidates)){
    let chosen:Candidate|null=null;
    let previous:Candidate|null=null;
    for(const c of samples){
      const cur=current.get(c.index)?.durationSeconds??Infinity;
      let allowed=cur<=threshold;
      if(allowed&&protectedMode&&neighbours.length){
        for(const n of neighbours){
          const nd=n.get(c.index)?.durationSeconds??Infinity;
          if(Number.isFinite(nd)&&nd+neighbourToleranceSeconds<cur){allowed=false;break;}
        }
      }
      if(allowed){chosen=c;previous=c;continue;}
      if(previous&&!protectedMode&&Number.isFinite(cur)){
        const pd=current.get(previous.index)?.durationSeconds??0;
        if(pd<threshold&&cur>pd){
          const ratio=Math.max(0,Math.min(1,(threshold-pd)/(cur-pd)));
          const radius=previous.radiusKm+(c.radiusKm-previous.radiusKm)*ratio;
          const bearing=c.bearing;
          const originBack=destination({lat:c.lat,lng:c.lng},(bearing+180)%360,c.radiusKm);
          const interp=destination(originBack,bearing,radius);
          chosen={...c,radiusKm:radius,lat:interp.lat,lng:interp.lng};
        }
      }
      break;
    }
    if(!chosen){
      const first=samples[0];if(first)chosen={...first,radiusKm:Math.min(.75,first.radiusKm*.45),...destination(destination({lat:first.lat,lng:first.lng},(first.bearing+180)%360,first.radiusKm),first.bearing,Math.min(.75,first.radiusKm*.45))};
    }
    if(chosen)points.push({lat:chosen.lat,lng:chosen.lng});
  }
  return ringGeo(points);
}

async function demographicCells(db:any,polygon:any,geographyType:string){
  const box=bboxOf(polygon);
  const q=await db.from("geo_demographic_cells").select("geography_code,centroid_lat,centroid_lng,population,households,daytime_population,students")
    .eq("geography_type",geographyType).gte("centroid_lat",box.minLat).lte("centroid_lat",box.maxLat)
    .gte("centroid_lng",box.minLng).lte("centroid_lng",box.maxLng).range(0,4999);
  if(q.error)throw new Error(q.error.message);
  return(q.data??[]).filter((x:any)=>pointInPolygon({lat:Number(x.centroid_lat),lng:Number(x.centroid_lng)},polygon));
}
function aggregate(cells:any[]){
  return cells.reduce((a,c)=>({
    population:a.population+Number(c.population??0),households:a.households+Number(c.households??0),
    daytimePopulation:a.daytimePopulation+Number(c.daytime_population??0),students:a.students+Number(c.students??0)
  }),{population:0,households:0,daytimePopulation:0,students:0});
}
function targetThreshold(
  design:any,candidates:Candidate[],current:Map<number,RouteSample>,neighbours:Array<Map<number,RouteSample>>,
  cells:any[],tolerance:number
){
  const min=Number(design.core_min_minutes??design.core_drive_minutes),max=Number(design.core_max_minutes??design.core_drive_minutes);
  const lo=Number(design.target_population_min??0),hi=Number(design.target_population_max??0);
  if(!cells.length||(!lo&&!hi))return{minutes:Number(design.core_drive_minutes),population:null};
  const target=lo&&hi?(lo+hi)/2:(lo||hi);
  let best:{minutes:number;population:number;distance:number}|null=null;
  for(let minutes=min;minutes<=max;minutes++){
    const poly=boundaryFor(candidates,current,neighbours,minutes,true,tolerance);
    const pop=cells.filter(c=>pointInPolygon({lat:Number(c.centroid_lat),lng:Number(c.centroid_lng)},poly)).reduce((s,c)=>s+Number(c.population??0),0);
    const inside=(lo?pop>=lo:true)&&(hi?pop<=hi:true);
    const distance=inside?0:Math.abs(pop-target);
    if(!best||distance<best.distance||(distance===best.distance&&minutes>best.minutes))best={minutes,population:pop,distance};
  }
  return{minutes:best?.minutes??Number(design.core_drive_minutes),population:best?.population??null};
}

export async function calculateTerritoryVersion(db:any,tenantId:string,territoryId:string){
  const territory=await db.from("network_territories").select("*").eq("tenant_id",tenantId).eq("id",territoryId).single();
  if(territory.error)throw new Error(territory.error.message);
  const designQ=await db.from("network_territory_designs").select("*").eq("tenant_id",tenantId).eq("territory_id",territoryId).maybeSingle();
  if(designQ.error)throw new Error(designQ.error.message);
  if(!designQ.data)throw new Error("Territory design is not configured");
  const design=designQ.data;
  await db.from("network_territory_designs").update({status:"calculating",updated_at:new Date().toISOString()}).eq("territory_id",territoryId);

  const origin={lat:Number(design.centre_lat),lng:Number(design.centre_lng)};
  const candidates=makeCandidates(origin,Number(design.bearings??30),Number(design.max_sample_radius_km??15));
  if(candidates.length>625)throw new Error("Territory sampling exceeds Google route-matrix request limit");

  const current=await googleMatrix(origin,candidates,design.routing_preference||"TRAFFIC_UNAWARE");

  const allTerritories=await db.from("network_territories").select("id,name,status,programme_id").eq("tenant_id",tenantId).eq("programme_id",territory.data.programme_id);
  if(allTerritories.error)throw new Error(allTerritories.error.message);
  const ids=(allTerritories.data??[]).filter((t:any)=>t.id!==territoryId&&["taken","reserved","onboarding","operating"].includes(t.status)).map((t:any)=>t.id);
  let neighbourDesigns:any[]=[];
  if(ids.length){
    const nd=await db.from("network_territory_designs").select("*").eq("tenant_id",tenantId).in("territory_id",ids);
    if(nd.error)throw new Error(nd.error.message);neighbourDesigns=nd.data??[];
  }
  neighbourDesigns=neighbourDesigns.map(d=>({...d,distanceKm:haversineKm(origin,{lat:Number(d.centre_lat),lng:Number(d.centre_lng)})}))
    .sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,Number(design.max_neighbours??4));

  const neighbourMatrices:Map<number,RouteSample>[]=[];
  for(const n of neighbourDesigns){
    neighbourMatrices.push(await googleMatrix({lat:Number(n.centre_lat),lng:Number(n.centre_lng)},candidates,design.routing_preference||"TRAFFIC_UNAWARE"));
  }

  const overflowPre=boundaryFor(candidates,current,[],Number(design.overflow_drive_minutes),false,0);
  const overflowBox=bboxOf(overflowPre);
  const allCellsQ=await db.from("geo_demographic_cells")
    .select("geography_code,centroid_lat,centroid_lng,population,households,daytime_population,students")
    .eq("geography_type",design.demographic_geography||"LSOA21")
    .gte("centroid_lat",overflowBox.minLat).lte("centroid_lat",overflowBox.maxLat)
    .gte("centroid_lng",overflowBox.minLng).lte("centroid_lng",overflowBox.maxLng).range(0,4999);
  if(allCellsQ.error)throw new Error(allCellsQ.error.message);
  const allCells=allCellsQ.data??[];
  const tolerance=Number(design.rules?.neighbourToleranceSeconds??120);
  const tuned=targetThreshold(design,candidates,current,neighbourMatrices,allCells,tolerance);
  const protectedGeo=boundaryFor(candidates,current,neighbourMatrices,tuned.minutes,true,tolerance);
  const sharedGeo=boundaryFor(candidates,current,[],Number(design.shared_drive_minutes),false,0);
  const overflowGeo=overflowPre;

  const protectedCells=allCells.filter((c:any)=>pointInPolygon({lat:Number(c.centroid_lat),lng:Number(c.centroid_lng)},protectedGeo));
  const sharedCells=allCells.filter((c:any)=>pointInPolygon({lat:Number(c.centroid_lat),lng:Number(c.centroid_lng)},sharedGeo));
  const protectedAgg=aggregate(protectedCells),sharedAgg=aggregate(sharedCells);
  const demographicLoaded=allCells.length>0;

  const prev=await db.from("network_territory_versions").select("version").eq("tenant_id",tenantId).eq("territory_id",territoryId).order("version",{ascending:false}).limit(1);
  if(prev.error)throw new Error(prev.error.message);
  const version=Number(prev.data?.[0]?.version??0)+1;
  const inserted=await db.from("network_territory_versions").insert({
    tenant_id:tenantId,territory_id:territoryId,version,algorithm_version:"route-radial-v2",
    status:"review",route_provider:"google-routes",route_calculated_at:new Date().toISOString(),
    core_drive_minutes:tuned.minutes,shared_drive_minutes:Number(design.shared_drive_minutes),overflow_drive_minutes:Number(design.overflow_drive_minutes),
    protected_geojson:protectedGeo,shared_geojson:sharedGeo,overflow_geojson:overflowGeo,
    protected_population:demographicLoaded?protectedAgg.population:null,protected_households:demographicLoaded?protectedAgg.households:null,
    protected_daytime_population:demographicLoaded?protectedAgg.daytimePopulation:null,protected_students:demographicLoaded?protectedAgg.students:null,
    shared_population:demographicLoaded?sharedAgg.population:null,shared_households:demographicLoaded?sharedAgg.households:null,
    neighbour_analysis:{neighbours:neighbourDesigns.map(n=>({territoryId:n.territory_id,distanceKm:Number(n.distanceKm.toFixed(2))})),toleranceSeconds:tolerance},
    demographic_analysis:{geography:design.demographic_geography,loaded:demographicLoaded,cellsConsidered:allCells.length,protectedCells:protectedCells.length,sharedCells:sharedCells.length,
      populationSource:"ONS small-area population estimates (imported)",householdSource:"Census/ONS households (imported)",method:"centroid-in-polygon estimate"},
    calculation:{candidatePoints:candidates.length,bearings:design.bearings,maxRadiusKm:design.max_sample_radius_km,requestedCoreMinutes:design.core_drive_minutes,
      selectedCoreMinutes:tuned.minutes,targetPopulationMin:design.target_population_min,targetPopulationMax:design.target_population_max,routingPreference:design.routing_preference}
  }).select("*").single();
  if(inserted.error)throw new Error(inserted.error.message);

  if(protectedCells.length||sharedCells.length){
    const rows:any[]=[];
    for(const c of protectedCells)rows.push({version_id:inserted.data.id,geography_code:c.geography_code,zone:"protected",assignment_weight:1});
    for(const c of sharedCells)if(!protectedCells.some((p:any)=>p.geography_code===c.geography_code))rows.push({version_id:inserted.data.id,geography_code:c.geography_code,zone:"shared",assignment_weight:.5});
    for(let i=0;i<rows.length;i+=500){const x=await db.from("network_territory_version_cells").insert(rows.slice(i,i+500));if(x.error)throw new Error(x.error.message);}
  }
  await db.from("network_territory_designs").update({status:"review",updated_at:new Date().toISOString()}).eq("territory_id",territoryId);
  return inserted.data;
}
