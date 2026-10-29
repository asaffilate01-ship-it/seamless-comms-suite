import test from 'node:test';
import assert from 'node:assert/strict';
import {createTravellerFlightHandler} from '../flightlounge/traveller-http.mjs';
const origin='https://flight.example',at=Date.parse('2026-10-26T12:00:00Z');
const query={legs:[{origin:'LHR',destination:'ISB',departure_date:'2026-11-20'}],adults:1,cabin:'economy',maxConnections:1,checkedBags:1};
const access={allowed:true,tenantId:'travenexa-flightlounge',actorId:'verified_user'};
const req=(path='/api/flights/search',data=query,extra={})=>new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json','x-actor-id':'forged'},body:JSON.stringify(data),...extra});
function setup(extra={}){const calls=[];const run=async(c,q)=>{calls.push({c,q});return {status:'live',offers:[],internalSecret:'must-not-leak',httpStatus:200}};return {calls,handle:createTravellerFlightHandler({siteOrigin:origin,now:()=>at,resolveAccess:async()=>access,audit:async()=>{},session:{search:run,flexibleSearch:run,refresh:run},...extra})};}
test('all three routes dispatch using verified actor only',async()=>{const s=setup();for(const [path,data] of [['/api/flights/search',query],['/api/flights/flexible-search',{query,dateOffsets:[[0,1]]}],['/api/flights/refresh',{offerRef:'offer_'+'a'.repeat(32)}]])assert.equal((await s.handle(req(path,data))).status,200);assert.ok(s.calls.every(x=>x.c.actorId==='verified_user'));});
test('reject missing or cross-site origin and incorrect destination',async()=>{const s=setup();for(const headers of [{'content-type':'application/json'},{origin:'https://evil.example','content-type':'application/json'},{origin,'content-type':'application/json','sec-fetch-site':'cross-site'}])assert.equal((await s.handle(req(undefined,query,{headers}))).status,403);assert.equal(s.calls.length,0);});
test('unauthenticated and unconfigured handlers fail before service',async()=>{const s=setup({resolveAccess:async()=>null});assert.equal((await s.handle(req())).status,403);assert.equal(s.calls.length,0);assert.equal((await createTravellerFlightHandler()(req())).status,503);});
test('reject actor injection, oversized bodies and wrong content type',async()=>{const s=setup();assert.equal((await s.handle(req(undefined,{...query,actorId:'other'}))).status,400);assert.equal((await s.handle(req(undefined,{x:'x'.repeat(9000)}))).status,400);assert.equal((await s.handle(req(undefined,query,{headers:{origin,'content-type':'text/plain'}}))).status,415);assert.equal(s.calls.length,0);});
test('revoked session suppresses results',async()=>{let n=0;const s=setup({resolveAccess:async()=>++n===1?access:{...access,actorId:'new_user'}});assert.equal((await s.handle(req())).status,403);});
test('no-store response strips internal fields; thrown errors are redacted',async()=>{const s=setup(),r=await s.handle(req());assert.equal(r.headers.get('cache-control'),'no-store');assert.ok(!(await r.text()).includes('internalSecret'));const broken=setup({audit:async()=>{throw Error('private-key')}});assert.ok(!(await (await broken.handle(req())).text()).includes('private-key'));});
test('refresh rejects price injection and routes do not expose booking',async()=>{const s=setup();assert.equal((await s.handle(req('/api/flights/refresh',{offerRef:'offer_'+'a'.repeat(32),amount:1}))).status,400);assert.equal((await s.handle(req('/api/flights/book',{}))).status,404);});

test('whole-request deadline bounds stalled authentication and prevents late supplier dispatch',{timeout:2000},async()=>{let release,signal;const s=setup({timeoutMs:20,resolveAccess:async(r,options)=>{signal=options.signal;return new Promise(resolve=>{release=resolve;});}});const r=await s.handle(req());assert.equal(r.status,408);assert.equal(signal.aborted,true);release(access);await new Promise(resolve=>setImmediate(resolve));assert.equal(s.calls.length,0);assert.equal(r.headers.get('cache-control'),'no-store');});
test('stalled request audit expires without starting supplier work',{timeout:2000},async()=>{let release;const s=setup({timeoutMs:20,audit:async()=>new Promise(resolve=>{release=resolve;})});assert.equal((await s.handle(req())).status,408);release();await new Promise(resolve=>setImmediate(resolve));assert.equal(s.calls.length,0);});
test('caller cancellation propagates to running session and suppresses late response',{timeout:2000},async()=>{let serviceSignal,release,started;const ready=new Promise(resolve=>{started=resolve;});const controller=new AbortController();const s=setup({session:{search:async(c,q,{signal})=>{serviceSignal=signal;started();return new Promise(resolve=>{release=resolve;});}}});const pending=s.handle(req(undefined,query,{signal:controller.signal}));await ready;controller.abort();assert.equal((await pending).status,408);assert.equal(serviceSignal.aborted,true);release({status:'live',offers:[]});});
test('pre-cancelled request never invokes access resolver or service',async()=>{let calls=0;const c=new AbortController();c.abort();const s=setup({resolveAccess:async()=>{calls++;return access;}});assert.equal((await s.handle(req(undefined,query,{signal:c.signal}))).status,408);assert.equal(calls,0);assert.equal(s.calls.length,0);});
test('deadline includes delivery audit after service completion',{timeout:2000},async()=>{const s=setup({timeoutMs:20,audit:async event=>{if(event.event==='traveller_flight_delivered')return new Promise(()=>{});}});const response=await s.handle(req());assert.equal(response.status,408);assert.equal((await response.json()).bookingsEnabled,false);assert.equal(s.calls.length,1);});
test('deadline cancels an unfinished body stream',{timeout:2000},async()=>{let cancelled=false;const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled=true;}});const s=setup({timeoutMs:20});const request=new Request(origin+'/api/flights/search',{method:'POST',headers:{origin,'content-type':'application/json'},body:stream,duplex:'half'});assert.equal((await s.handle(request)).status,408);await new Promise(resolve=>setImmediate(resolve));assert.equal(cancelled,true);assert.equal(s.calls.length,0);});

test('revocation during final audit suppresses delivery',async()=>{
 let revoked=false;
 const s=setup({resolveAccess:async()=>({...access,allowed:!revoked}),audit:async e=>{if(e.event==='traveller_flight_delivered')revoked=true;}});
 const r=await s.handle(req());assert.equal(r.status,403);assert.equal((await r.json()).bookingsEnabled,false);
});
test('search, flexible and refresh fares expiring during delivery audit return 409',async()=>{
 for(const action of ['search','flexibleSearch','refresh']){
  let clock=at;const offer={id:'off_fixture',expiresAt:new Date(at+1000).toISOString()};
  const result={status:'live',...(action==='search'?{offers:[offer]}:action==='refresh'?{offer}:{candidates:[{offers:[offer]}],summaries:[{best:{offerId:offer.id}}]})};
  const s=setup({now:()=>clock,session:{[action]:async()=>result},audit:async e=>{if(e.event==='traveller_flight_delivered')clock+=1000;}});
  const path=action==='flexibleSearch'?'flexible-search':action;
  const data=action==='search'?query:action==='refresh'?{offerRef:'offer_'+'a'.repeat(32)}:{query,dateOffsets:[[0]]};
  const r=await s.handle(req('/api/flights/'+path,data));assert.equal(r.status,409);const body=await r.json();assert.equal(body.reason,'fare_expired_before_delivery');assert.ok(!JSON.stringify(body).includes('off_fixture'));
 }
});
test('last access check remains inside the request deadline',async()=>{
 let count=0;const s=setup({timeoutMs:20,resolveAccess:async()=>++count===3?new Promise(()=>{}):access});
 assert.equal((await s.handle(req())).status,408);assert.equal(count,3);
});
