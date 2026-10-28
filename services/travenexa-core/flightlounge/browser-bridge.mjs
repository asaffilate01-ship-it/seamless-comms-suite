import {validateFlightSearch} from './live-search.mjs';
const TENANT='travenexa-flightlounge';
const reply=(status,reason)=>Response.json({status:'unavailable',reason,offers:[]},{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function readJson(stream,limit){
  if(!stream)throw Error('empty');
  const reader=stream.getReader(),chunks=[];let size=0;
  try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error('large');chunks.push(value);}}
  catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.byteLength;}return JSON.parse(new TextDecoder().decode(bytes));
}
// Mount behind the source application's verified session. No browser-supplied tenant or token.
export function createFlightBrowserBridge({siteOrigin,gatewayOrigin,resolveAccess,secretReader,audit,fetchImpl=fetch,now=()=>Date.now()}={}){
  let origin,target;
  try{origin=new URL(siteOrigin);target=new URL(gatewayOrigin);for(const u of [origin,target])if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error();}catch{origin=target=null;}
  return async request=>{
    if(request.method!=='POST')return reply(405,'method_not_allowed');
    if(!origin||!target||!resolveAccess||!secretReader||!audit)return reply(503,'bridge_not_configured');
    if(request.headers.get('origin')!==origin.origin||request.headers.get('sec-fetch-site')==='cross-site')return reply(403,'origin_not_allowed');
    if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return reply(415,'json_required');
    try{
      // Must verify current session, membership, FlightLounge entitlement, rate/budget and region.
      const access=await resolveAccess(request);
      if(!access?.actorId||access.allowed!==true||access.tenantId!==TENANT)return reply(403,'access_denied');
      let query;try{query=validateFlightSearch(await readJson(request.body,8192),now());}catch{return reply(400,'invalid_request');}
      if(!query)return reply(400,'invalid_request');
      const token=await secretReader(TENANT,'travenexa_gateway');
      if(typeof token!=='string'||!token||/[\r\n]/.test(token))return reply(503,'gateway_not_configured');
      await audit({event:'flight_search_requested',actorId:access.actorId,tenantId:TENANT});
      const response=await fetchImpl(new URL('/v1/flights/search',target).href,{method:'POST',redirect:'error',signal:AbortSignal.timeout(18000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,'X-Travenexa-Tenant':TENANT},body:JSON.stringify(query)});
      if(!response.ok)return reply(response.status===429?429:503,response.status===429?'rate_limited':'supplier_unavailable');
      const data=await readJson(response.body,4000000);
      if(data?.status!=='live'||!Array.isArray(data.offers)||data.offers.length>200||data.offers.some(o=>o.live!==true||o.bookable!==false||o.source!=='duffel'||o.priceScope!=='supplier_fare_only'||!Number.isFinite(o.amount)||o.amount<0||!/^[A-Z]{3}$/.test(o.currency)||!(Date.parse(o.expiresAt)>now())))return reply(502,'invalid_gateway_response');
      const offers=data.offers.map(o=>publicOffer(o,query));
      if(offers.some(o=>o===null))return reply(502,'invalid_gateway_response');
      // Recheck membership before returning data if access was revoked while searching.
      const current=await resolveAccess(request);
      if(current?.allowed!==true||current.actorId!==access.actorId||current.tenantId!==TENANT)return reply(403,'access_denied');
      await audit({event:'flight_search_delivered',actorId:access.actorId,tenantId:TENANT,offerCount:data.offers.length});
      return Response.json({status:'live',offers,coverage:{attempted:['duffel'],succeeded:['duffel']},currencies:[...new Set(offers.map(o=>o.currency))],searchedAt:typeof data.searchedAt==='string'?data.searchedAt:null,bookingsEnabled:false},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }catch{return reply(503,'search_unavailable');}
  };
}

function publicOffer(o,q){
  if(typeof o.id!=='string'||o.id.length>200||!Array.isArray(o.slices)||o.slices.length!==q.legs.length)return null;
  const slices=[];
  for(const [i,slice] of o.slices.entries()){
    if(!Array.isArray(slice.segments)||slice.segments.length<1||slice.segments.length>q.maxConnections+1)return null;
    const segments=[];
    for(const s of slice.segments){
      if(!s||!['origin','destination'].every(k=>typeof s[k]==='string'&&/^[A-Z]{3}$/.test(s[k]))||!['operatingCarrier','departingAt','arrivingAt','cabin'].every(k=>typeof s[k]==='string'&&s[k].length<300)||!Array.isArray(s.checkedBagsPerPassenger)||s.checkedBagsPerPassenger.length!==q.adults||s.checkedBagsPerPassenger.some(b=>b!==null&&(!Number.isInteger(b)||b<0)))return null;
      segments.push({origin:s.origin,destination:s.destination,operatingCarrier:s.operatingCarrier,departingAt:s.departingAt,arrivingAt:s.arrivingAt,cabin:s.cabin,checkedBagsPerPassenger:s.checkedBagsPerPassenger});
    }
    if(segments[0].origin!==q.legs[i].origin||segments.at(-1).destination!==q.legs[i].destination)return null;
    slices.push({segments,durationMinutes:Number.isFinite(slice.durationMinutes)&&slice.durationMinutes>0?slice.durationMinutes:null,airportChanges:slice.airportChanges===true});
  }
  return {id:o.id,source:'duffel',live:true,bookable:false,priceScope:'supplier_fare_only',amount:o.amount,currency:o.currency,expiresAt:o.expiresAt,baggageRequirementMet:o.baggageRequirementMet===true,slices};
}
