import {validateFlightSearch} from './live-search.mjs';
import {expandFlexibleSearch} from './flexible-search.mjs';
import {validBagSelection} from './baggage-subtotal.mjs';
import {validScope} from './offer-store.mjs';
const paths={'/api/flights/search':'search','/api/flights/flexible-search':'flexibleSearch','/api/flights/refresh':'refresh'};
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const failure=(code,reason)=>Response.json({status:'unavailable',reason,offers:[],bookingsEnabled:false},{status:code,headers});
async function body(request){
 if(!request.body)throw Error();const reader=request.body.getReader();const chunks=[];let size=0,timedOut=false;
 const abort=()=>reader.cancel().catch(()=>{});request.signal.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{timedOut=true;reader.cancel().catch(()=>{});},5000);
 try{while(true){if(request.signal.aborted)throw Error();const {done,value}=await reader.read();if(timedOut||request.signal.aborted)throw Error();if(done)break;size+=value.byteLength;if(size>8192)throw Error();chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 finally{clearTimeout(timer);request.signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
const validRefresh=q=>q&&typeof q==='object'&&!Array.isArray(q)&&Object.keys(q).every(k=>['offerRef','selectedBaggage'].includes(k))&&typeof q.offerRef==='string'&&/^offer_[a-f0-9]{32}$/.test(q.offerRef)&&validBagSelection(q.selectedBaggage===undefined?[]:q.selectedBaggage);
// In-process server handler. resolveAccess must use a verified session, never caller identity headers.
export function createTravellerFlightHandler({siteOrigin,resolveAccess,session,audit,now=()=>Date.now(),timeoutMs=50000}={}){
 let origin=null;try{const u=new URL(siteOrigin);if(u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash)origin=u.origin;}catch{}
 const handle=async request=>{
  const url=new URL(request.url),action=paths[url.pathname];
  if(!action)return failure(404,'unknown_flight_route');
  if(request.method!=='POST')return failure(405,'method_not_allowed');
  if(!origin||!resolveAccess||!session?.[action]||!audit)return failure(503,'traveller_handler_not_configured');
  if(url.origin!==origin||request.headers.get('origin')!==origin||request.headers.get('sec-fetch-site')==='cross-site')return failure(403,'origin_not_allowed');
  if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return failure(415,'json_required');
  try{
   if(request.signal.aborted)return failure(408,'request_cancelled');
   const access=await resolveAccess(request,{signal:request.signal});
   if(request.signal.aborted)return failure(408,'request_cancelled');
   if(access?.allowed!==true||!validScope(access))return failure(403,'access_denied');
   const context={tenantId:access.tenantId,actorId:access.actorId};
   let query;try{query=await body(request);}catch{return failure(400,'invalid_request');}
   if(action==='search'&&!validateFlightSearch(query,now())||action==='flexibleSearch'&&!expandFlexibleSearch(query,now())||action==='refresh'&&!validRefresh(query))return failure(400,'invalid_request');
   if(request.signal.aborted)return failure(408,'request_cancelled');
   await audit({...context,event:'traveller_flight_request',action},{signal:request.signal});
   if(request.signal.aborted)return failure(408,'request_cancelled');
   const answer=await session[action](context,query,{signal:request.signal});
   if(request.signal.aborted)return failure(408,'request_cancelled');
   const current=await resolveAccess(request,{signal:request.signal});
   if(request.signal.aborted)return failure(408,'request_cancelled');
   if(current?.allowed!==true||current.tenantId!==context.tenantId||current.actorId!==context.actorId)return failure(403,'access_denied');
   if(answer?.status!=='live')return failure([400,403,404,409,429,503].includes(answer?.httpStatus)?answer.httpStatus:503,'flight_request_unavailable');
   // session is the trusted in-process traveller-session implementation, not arbitrary remote JSON.
   const allowed=action==='search'?['offers','coverage','currencies','searchedAt']:action==='flexibleSearch'?['candidates','summaries','coverage','searchedAt','notice']:['offer','availableCheckedBagServices','changes','requiresReview','costs','baggageSubtotal','refreshedAt','notice'];
   const result={status:'live',bookingsEnabled:false};for(const key of allowed)if(answer[key]!==undefined)result[key]=answer[key];
   const json=JSON.stringify(result);if(Buffer.byteLength(json)>4000000)return failure(502,'response_too_large');
   await audit({...context,event:'traveller_flight_delivered',action},{signal:request.signal});
   if(request.signal.aborted)return failure(408,'request_cancelled');
   return new Response(json,{status:200,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
  }catch{return failure(503,'flight_request_unavailable');}
 };
 const budget=Number.isInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=50000?timeoutMs:50000;
 return async request=>{
  const controller=new AbortController();
  const signal=AbortSignal.any([request.signal,controller.signal]);
  let timer,onAbort;
  const cancelled=new Promise(resolve=>{onAbort=()=>resolve(failure(408,'request_cancelled'));signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();});
  timer=setTimeout(()=>controller.abort(),budget);
  try{
   if(signal.aborted)return failure(408,'request_cancelled');
   return await Promise.race([handle(new Request(request,{signal})),cancelled]);
  }finally{clearTimeout(timer);signal.removeEventListener('abort',onAbort);}
 };

}
