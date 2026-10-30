import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDocumentClient } from './client.mjs';
const id='aabbccdd-0000-4000-8000-000000000001';
const json=v=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json'}});
const config={endpoint:'https://documents.example',getBearer:async()=> 'private-token'};
const draft={title:'Test',paragraphs:['One']};
const client=fetchImpl=>createDocumentClient({...config,fetchImpl});

test('fixed endpoint, fresh bearer, no redirects, no cookies and stable request identity',async()=>{
  const calls=[]; let tokens=0;
  const c=createDocumentClient({...config,getBearer:async()=>`token-${++tokens}`,
    fetchImpl:async(url,options)=>{calls.push({url,options});return json({id});}});
  await c.submit({requestId:'stable',document:draft}); await c.submit({requestId:'stable',document:draft});
  assert.equal(calls.length,2); assert.equal(calls[0].options.body,calls[1].options.body);
  assert.equal(calls[0].url,'https://documents.example/v1/documents');
  assert.equal(calls[0].options.redirect,'error'); assert.equal(calls[0].options.credentials,'omit');
  assert.notEqual(calls[0].options.headers.authorization,calls[1].options.headers.authorization);
});
test('endpoint and payload validation precede transport',async()=>{
  for(const endpoint of ['http://example.com','https://user:secret@example.com','https://example.com/path','https://example.com/?x=1'])
    assert.throws(()=>createDocumentClient({...config,endpoint}),{code:'invalid_configuration'});
  let calls=0;const c=client(async()=>{calls++;return json({id});});
  await assert.rejects(c.status('../secret'),{code:'invalid_request'});
  await assert.rejects(c.submit({requestId:'r',document:{...draft,command:'run'}}),{code:'invalid_request'});
  await assert.rejects(c.list({tenant:1}),{code:'invalid_request'});assert.equal(calls,0);
});
test('permission errors are redacted and never retried',async()=>{
  let calls=0;
  await assert.rejects(client(async()=>{calls++;return new Response('SECRET',{status:403});}).list(),{code:'forbidden'});
  assert.equal(calls,1);
});
test('timeout covers a stalled token source and prevents a late request',async()=>{
  let resolveToken,calls=0;
  const c=createDocumentClient({...config,timeoutMs:15,getBearer:()=>new Promise(r=>{resolveToken=r;}),fetchImpl:async()=>{calls++;return json({id});}});
  await assert.rejects(c.status(id),{code:'timeout'});resolveToken('later');
  await new Promise(r=>setImmediate(r));assert.equal(calls,0);
});
test('timeout cancels a stalled response stream',async()=>{
  let cancelled=false;
  const c=createDocumentClient({...config,timeoutMs:15,fetchImpl:async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-type':'application/json'}})});
  await assert.rejects(c.list(),{code:'timeout'});assert.equal(cancelled,true);
});
test('response limits, malformed JSON, schema and content type fail closed',async()=>{
  const responses=[()=>new Response('x',{headers:{'content-type':'text/plain'}}),
    ()=>new Response('x',{headers:{'content-type':'application/json'}}),
    ()=>json({jobs:'invented',next:null}),()=>json({jobs:[],next:null,privateCredential:'do-not-forward'}),()=>json({jobs:[],next:'unsafe'}),
    ()=>new Response('x',{headers:{'content-type':'application/json','content-length':'100001'}}),
    ()=>new Response(' '.repeat(100001),{headers:{'content-type':'application/json'}}),
    ()=>new Response('{}',{headers:{'content-type':'application/json','content-length':'99'}})];
  for(const response of responses) await assert.rejects(client(async()=>response()).list(),{code:'invalid_response'});
});
test('status identity and terminal state are checked',async()=>{
  await assert.rejects(client(async()=>json({id,status:'completed',draft:true,sha256:null})).status(id),{code:'invalid_response'});
  await assert.rejects(client(async()=>json({id,status:'queued',draft:true,sha256:null})).download(id),{code:'not_ready'});
});
test('download checks same-job completion and SHA256 before releasing bytes',async()=>{
  const bytes=Buffer.from('synthetic-odt');const digest=createHash('sha256').update(bytes).digest('hex');
  const c=client(async url=>url.endsWith('/artifact')?new Response(bytes,{headers:{'content-type':'application/vnd.oasis.opendocument.text'}}):json({id,status:'completed',draft:true,sha256:digest}));
  assert.deepEqual(await c.download(id),bytes);
  const bad=client(async url=>url.endsWith('/artifact')?new Response(bytes,{headers:{'content-type':'application/vnd.oasis.opendocument.text'}}):json({id,status:'completed',draft:true,sha256:'0'.repeat(64)}));
  await assert.rejects(bad.download(id),{code:'integrity_mismatch'});
});
test('pagination and history use constrained query parameters',async()=>{
  const urls=[];
  const c=client(async url=>{urls.push(url);return url.includes('/history')?json({events:[{id:2,event:'queued',at:'2026-10-30 00:00:00'}],next:null}):json({jobs:[],next:null});});
  await c.list({before:12,limit:5});await c.history(id,{after:1});
  assert.match(urls[0],/limit=5&before=12$/);assert.match(urls[1],/history\?after=1$/);
});

test('network errors and redirects do not expose upstream details',async()=>{
  await assert.rejects(client(async()=>{throw new Error('secret URL credential');}).list(),{code:'unavailable',message:'Document service: unavailable'});
  await assert.rejects(client(async()=>new Response(null,{status:302,headers:{location:'https://other.example'}})).list(),{code:'unavailable'});
});
