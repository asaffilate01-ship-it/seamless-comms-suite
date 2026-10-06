import type { GeoAddress, GeoPoint, GeoProvider, GeocodeResult, RouteRequest, RouteResult } from "./contracts";

function timeoutSignal(ms=15000){ return AbortSignal.timeout(ms); }
async function jsonResponse(response:Response){ const text=await response.text(); if(text.length>2_000_000)throw new Error("Geo provider response too large"); let data:any; try{data=JSON.parse(text);}catch{throw new Error("Geo provider returned invalid JSON");} if(!response.ok)throw new Error("Geo provider request failed ("+response.status+")"); return data; }
function addressText(address:GeoAddress){ return [address.line1,address.line2,address.city,address.region,address.postalCode,address.countryCode].filter(Boolean).join(", "); }
function seconds(value:unknown){ if(typeof value==="number")return value; if(typeof value==="string"&&/^\d+(?:\.\d+)?s$/.test(value))return Math.round(Number(value.slice(0,-1))); return 0; }

export function createGoogleMapsProvider(credentials:Record<string,string>,config:Record<string,unknown>={}):GeoProvider{
 const apiKey=credentials.api_key??credentials.default;if(!apiKey)throw new Error("Google Maps api_key is required");
 const geocodeBase=typeof config.geocodeBaseUrl==="string"?config.geocodeBaseUrl:"https://maps.googleapis.com/maps/api/geocode/json";
 const routesBase=typeof config.routesBaseUrl==="string"?config.routesBaseUrl:"https://routes.googleapis.com/directions/v2:computeRoutes";
 const geocode=async(params:URLSearchParams):Promise<GeocodeResult[]>=>{params.set("key",apiKey);const response=await fetch(geocodeBase+"?"+params.toString(),{signal:timeoutSignal()});const data=await jsonResponse(response);if(data.status&&data.status!=="OK"&&data.status!=="ZERO_RESULTS")throw new Error("Google geocoding refused: "+data.status);return(data.results??[]).map((r:any)=>({point:{lat:Number(r.geometry?.location?.lat),lng:Number(r.geometry?.location?.lng)},formattedAddress:String(r.formatted_address??""),provider:"maps.google",providerPlaceId:r.place_id??null})).filter((r:GeocodeResult)=>Number.isFinite(r.point.lat)&&Number.isFinite(r.point.lng));};
 return{
  key:"maps.google",
  geocode:(address)=>geocode(new URLSearchParams({address:addressText(address)})),
  reverse:(point)=>geocode(new URLSearchParams({latlng:point.lat+","+point.lng})),
  async route(request:RouteRequest):Promise<RouteResult>{
   if(request.mode==="truck")throw new Error("Google Maps default adapter does not claim truck routing");
   const mode=request.mode==="driving"?"DRIVE":request.mode==="walking"?"WALK":"BICYCLE";
   const body:any={origin:{location:{latLng:{latitude:request.origin.lat,longitude:request.origin.lng}}},destination:{location:{latLng:{latitude:request.destination.lat,longitude:request.destination.lng}}},travelMode:mode,computeAlternativeRoutes:false,units:"METRIC"};
   if(request.waypoints?.length)body.intermediates=request.waypoints.map((p)=>({location:{latLng:{latitude:p.lat,longitude:p.lng}}}));
   if(request.departAt)body.departureTime=request.departAt;
   if(mode==="DRIVE")body.routingPreference="TRAFFIC_AWARE";
   const avoid=new Set(request.avoid??[]);body.routeModifiers={avoidTolls:avoid.has("tolls"),avoidHighways:avoid.has("motorways"),avoidFerries:avoid.has("ferries")};
   const response=await fetch(routesBase,{method:"POST",signal:timeoutSignal(),headers:{"content-type":"application/json","X-Goog-Api-Key":apiKey,"X-Goog-FieldMask":"routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.distanceMeters"},body:JSON.stringify(body)});
   const data=await jsonResponse(response);const route=data.routes?.[0];if(!route)throw new Error("Google Maps returned no route");
   const points=[request.origin,...(request.waypoints??[]),request.destination];
   const legs=(route.legs??[]).map((leg:any,index:number)=>({distanceMetres:Number(leg.distanceMeters??0),durationSeconds:seconds(leg.duration),start:points[index]!,end:points[index+1]!}));
   return{provider:"maps.google",distanceMetres:Number(route.distanceMeters??legs.reduce((n:number,l:any)=>n+l.distanceMetres,0)),durationSeconds:seconds(route.duration)||legs.reduce((n:number,l:any)=>n+l.durationSeconds,0),encodedPolyline:route.polyline?.encodedPolyline??null,legs};
  }
 };
}

export function createMapboxProvider(credentials:Record<string,string>,config:Record<string,unknown>={}):GeoProvider{
 const token=credentials.access_token??credentials.default;if(!token)throw new Error("Mapbox access_token is required");
 const geocodeBase=typeof config.geocodeBaseUrl==="string"?config.geocodeBaseUrl:"https://api.mapbox.com/search/geocode/v6";
 const directionsBase=typeof config.directionsBaseUrl==="string"?config.directionsBaseUrl:"https://api.mapbox.com/directions/v5";
 const parseFeatures=(data:any):GeocodeResult[]=>(data.features??[]).map((f:any)=>({point:{lat:Number(f.geometry?.coordinates?.[1]??f.properties?.coordinates?.latitude),lng:Number(f.geometry?.coordinates?.[0]??f.properties?.coordinates?.longitude)},formattedAddress:String(f.properties?.full_address??[f.properties?.name_preferred??f.properties?.name,f.properties?.place_formatted].filter(Boolean).join(", ")),provider:"maps.mapbox",providerPlaceId:f.properties?.mapbox_id??f.id??null})).filter((r:GeocodeResult)=>Number.isFinite(r.point.lat)&&Number.isFinite(r.point.lng));
 return{
  key:"maps.mapbox",
  async geocode(address){const params=new URLSearchParams({q:addressText(address),access_token:token,limit:"10"});if(address.countryCode)params.set("country",address.countryCode.toLowerCase());return parseFeatures(await jsonResponse(await fetch(geocodeBase+"/forward?"+params.toString(),{signal:timeoutSignal()})));},
  async reverse(point){const params=new URLSearchParams({longitude:String(point.lng),latitude:String(point.lat),access_token:token,limit:"10"});return parseFeatures(await jsonResponse(await fetch(geocodeBase+"/reverse?"+params.toString(),{signal:timeoutSignal()})));},
  async route(request:RouteRequest):Promise<RouteResult>{
   if(request.mode==="truck")throw new Error("Mapbox default adapter does not claim truck routing");
   const profile=request.mode==="driving"?(config.trafficAware===false?"mapbox/driving":"mapbox/driving-traffic"):request.mode==="walking"?"mapbox/walking":"mapbox/cycling";
   const points=[request.origin,...(request.waypoints??[]),request.destination];if(points.length>25)throw new Error("Mapbox Directions supports at most 25 coordinates per request");
   const coords=points.map((p)=>p.lng+","+p.lat).join(";");const params=new URLSearchParams({access_token:token,geometries:"polyline6",overview:"full",steps:"false"});
   if(request.departAt&&request.mode==="driving")params.set("depart_at",request.departAt);
   const response=await fetch(directionsBase+"/"+profile+"/"+coords+"?"+params.toString(),{signal:timeoutSignal()});const data=await jsonResponse(response);if(data.code&&data.code!=="Ok")throw new Error("Mapbox directions refused: "+data.code);const route=data.routes?.[0];if(!route)throw new Error("Mapbox returned no route");
   const legs=(route.legs??[]).map((leg:any,index:number)=>({distanceMetres:Number(leg.distance??0),durationSeconds:Math.round(Number(leg.duration??0)),start:points[index]!,end:points[index+1]!}));
   return{provider:"maps.mapbox",distanceMetres:Number(route.distance??0),durationSeconds:Math.round(Number(route.duration??0)),encodedPolyline:typeof route.geometry==="string"?route.geometry:null,legs};
  }
 };
}