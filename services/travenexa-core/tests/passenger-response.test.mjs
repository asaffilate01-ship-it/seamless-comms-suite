import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {bufferPassengerResponse} from '../flightlounge/passenger-response.mjs';
import {createServer} from '../server.mjs';
const origin='https://flight.example';
const request=signal=>new Request(origin+'/api/flights/search',{signal});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('buffers complete response and replaces unsafe cache/framing headers',async()=>{
 const result=await bufferPassengerResponse(async()=>new Response('fare',{status:409,headers:{'cache-control':'public','content-length':'1','transfer-encoding':'chunked'}}),request());
 assert.equal(result.status,409);assert.equal(result.body.toString(),'fare');
 assert.equal(result.headers['cache-control'],'no-store');
 assert.equal(result.headers['content-length'],undefined);assert.equal(result.headers['transfer-encoding'],undefined);
});
test('deadline bounds stalled handler and cancels a late response body',{timeout:2000},async()=>{
 let release,signal,cancelled=false;
 const pending=bufferPassengerResponse(async req=>{signal=req.signal;return new Promise(resolve=>{release=resolve;});},request(),{timeoutMs:20});
 await assert.rejects(pending,/cancelled/);assert.equal(signal.aborted,true);
 release(new Response(new ReadableStream({cancel(){cancelled=true;return new Promise(()=>{});}})));
 await tick();assert.equal(cancelled,true);
});
test('deadline bounds stalled response body even if cancellation hook hangs',{timeout:2000},async()=>{
 let cancelled=false,signal;
 await assert.rejects(bufferPassengerResponse(async req=>{signal=req.signal;return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1]));},cancel(){cancelled=true;return new Promise(()=>{});}}));},request(),{timeoutMs:20}),/cancelled/);
 assert.equal(cancelled,true);assert.equal(signal.aborted,true);
});
test('rejects declared and streamed oversized bodies and cancels their producers',async()=>{
 for(const declared of [true,false]){
  let cancelled=false;
  const body=new ReadableStream({start(c){if(!declared)c.enqueue(new Uint8Array(4000001));},cancel(){cancelled=true;}});
  await assert.rejects(bufferPassengerResponse(async()=>new Response(body,{headers:declared?{'content-length':'4000001'}:{}}),request()),/too_large/);
  assert.equal(cancelled,true);
 }
});
test('pre-cancelled requests do not dispatch and invalid deadlines fail closed',async()=>{
 const c=new AbortController();c.abort();let calls=0;
 const handler=async()=>{calls++;return new Response();};
 await assert.rejects(bufferPassengerResponse(handler,request(c.signal)),/cancelled/);
 for(const timeoutMs of [0,55001,NaN])await assert.rejects(bufferPassengerResponse(handler,request(),{timeoutMs}),/deadline/);
 assert.equal(calls,0);
});
async function gateway(t,handler,extra={}){
 const server=createServer({travellerHandler:handler,passengerOrigin:origin,...extra});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 return `http://127.0.0.1:${server.address().port}/api/flights/search`;
}
test('Node gateway suppresses partial success and redacts response failures',{timeout:3000},async t=>{
 const url=await gateway(t,async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('private partial fare'));c.error(Error('private secret'));}})));
 const response=await fetch(url);assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal((await response.json()).reason,'passenger_gateway_unavailable');
});
test('Node gateway deadline responds without waiting for handler',{timeout:3000},async t=>{
 let signal;
 const url=await gateway(t,async req=>{signal=req.signal;return new Promise(()=>{});},{passengerTimeoutMs:20});
 const response=await fetch(url);assert.equal(response.status,503);assert.equal(signal.aborted,true);
 await response.text();
});
test('Node client disconnect cancels handler and discards late results',{timeout:3000},async t=>{
 let start,aborted,release,cancelled=false;
 const ready=new Promise(resolve=>{start=resolve;});const abort=new Promise(resolve=>{aborted=resolve;});
 const url=await gateway(t,async req=>{req.signal.addEventListener('abort',aborted,{once:true});start();return new Promise(resolve=>{release=resolve;});});
 const client=http.get(url);client.on('error',()=>{});
 await ready;client.destroy();await abort;
 release(new Response(new ReadableStream({cancel(){cancelled=true;}})));
 await tick();assert.equal(cancelled,true);
});
