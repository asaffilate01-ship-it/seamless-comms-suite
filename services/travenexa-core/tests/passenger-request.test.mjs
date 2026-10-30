import test from 'node:test';
import assert from 'node:assert/strict';
import {readPassengerJson} from '../flightlounge/passenger-request.mjs';
import {createTravellerFlightHandler} from '../flightlounge/traveller-http.mjs';
const origin='https://journeys.example';
const request=(body,signal)=>new Request(origin+'/api/flights/search',{
 method:'POST',headers:{origin,'content-type':'application/json'},body,duplex:'half',signal,
});
const encode=s=>new TextEncoder().encode(s);

test('accepts exactly 8192 bytes and UTF-8 characters split across chunks',async()=>{
 const text=JSON.stringify({value:'x'.repeat(8180)});assert.equal(encode(text).length,8192);
 assert.equal((await readPassengerJson(request(text))).value.length,8180);
 const data=encode('{"value":"é"}');let i=0;
 const stream=new ReadableStream({pull(c){if(i<data.length){c.enqueue(data.slice(i,i+1));i++;}else c.close();}});
 assert.deepEqual(await readPassengerJson(request(stream)),{value:'é'});
});
test('rejects oversized chunks without waiting for producer cancellation',{timeout:2000},async()=>{
 let cancelled=false;
 const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(8193));},cancel(){cancelled=true;return new Promise(()=>{});}});
 await assert.rejects(readPassengerJson(request(stream)),/too_large/);assert.equal(cancelled,true);
});
test('independent body deadline bounds stalled reads and hanging cleanup',{timeout:2000},async()=>{
 let cancelled=false;
 const stream=new ReadableStream({cancel(){cancelled=true;return new Promise(()=>{});}});
 await assert.rejects(readPassengerJson(request(stream),{timeoutMs:20}),/timeout/);assert.equal(cancelled,true);
});
test('caller cancellation interrupts reads and pre-cancelled bodies are discarded',{timeout:2000},async()=>{
 for(const before of [true,false]){
  const controller=new AbortController();let cancelled=false;
  const stream=new ReadableStream({cancel(){cancelled=true;return new Promise(()=>{});}});
  if(before)controller.abort();
  const pending=readPassengerJson(request(stream,controller.signal));
  if(!before)controller.abort();
  await assert.rejects(pending,/cancelled/);assert.equal(cancelled,true);
 }
});
test('rejects malformed UTF-8, invalid JSON and non-byte chunks',async()=>{
 for(const chunk of [new Uint8Array([0xff]),encode('{'), 'not bytes']){
  await assert.rejects(readPassengerJson(request(new ReadableStream({start(c){c.enqueue(chunk);c.close();}}))));
 }
 for(const timeoutMs of [0,5001,NaN])await assert.rejects(readPassengerJson(request('{}'),{timeoutMs}),/deadline/);
});
test('copies consumed chunks before producer reuses the same buffer',async()=>{
 const shared=encode('{"a":');let phase=0;
 const stream=new ReadableStream({pull(c){
  if(phase++===0)c.enqueue(shared);
  else{shared.fill(32);c.enqueue(encode('1}'));c.close();}
 }},{highWaterMark:0});
 assert.deepEqual(await readPassengerJson(request(stream)),{a:1});
});
test('HTTP handler rejects oversized upload before audit or supplier work despite hanging cleanup',{timeout:2000},async()=>{
 let calls=0,cancelled=false;
 const handler=createTravellerFlightHandler({siteOrigin:origin,timeoutMs:1000,
 resolveAccess:async()=>({allowed:true,tenantId:'travenexa-flightlounge',actorId:'alice'}),
 audit:async()=>{calls++;},session:{search:async()=>{calls++;return {status:'live',offers:[]};}},
 });
 const response=await handler(request(new ReadableStream({start(c){c.enqueue(new Uint8Array(8193));},cancel(){cancelled=true;return new Promise(()=>{});}})));
 assert.equal(response.status,400);assert.equal((await response.json()).reason,'invalid_request');
 assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(calls,0);assert.equal(cancelled,true);
});
