import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createDocumentClient } from './client.mjs';
import { workspaceOperation } from './workspace.mjs';

test('real HTTP: scoped submit, duplicate, list, history, download and delete through WSGI', {timeout:15000}, async t=>{
  const process=spawn('python3',[fileURLToPath(new URL('./http_fixture.py',import.meta.url))],{stdio:['ignore','pipe','pipe']});
  t.after(async()=>{
    if(process.exitCode===null && process.signalCode===null){
      const done=once(process,'exit');process.kill('SIGTERM');await done;
    }
  });
  const ready=await new Promise((resolve,reject)=>{
    let buffer='';const timer=setTimeout(()=>reject(new Error('Fixture startup timeout')),5000);
    process.once('error',e=>{clearTimeout(timer);reject(e);});
    process.once('exit',()=>{clearTimeout(timer);reject(new Error('Fixture exited'));});
    process.stdout.on('data',data=>{
      buffer+=data.toString();
      if(buffer.includes('\n')){clearTimeout(timer);try{resolve(JSON.parse(buffer.split('\n')[0]));}catch(e){reject(e);}}
    });
  });
  const endpoint=`http://127.0.0.1:${ready.port}`;
  const c=createDocumentClient({endpoint,testOnlyAllowLoopbackHttp:true,getBearer:async()=> 'synthetic-a'});
  const first=await c.submit({requestId:'same-event',document:{title:'Brief',paragraphs:['Synthetic only.']}});
  assert.deepEqual(await c.submit({requestId:'same-event',document:{title:'Brief',paragraphs:['Synthetic only.']}}),first);
  await assert.rejects(c.submit({requestId:'same-event',document:{title:'Changed',paragraphs:['Synthetic only.']}}),{code:'invalid_request'});
  assert.equal((await c.status(first.id)).status,'queued');
  const page=await c.list({limit:1});assert.equal(page.jobs[0].id,first.id);assert.ok(page.next);
  const next=await c.list({before:page.next});assert.equal(next.jobs[0].id,ready.own);assert.equal(next.next,null);
  assert.deepEqual((await c.history(first.id)).events.map(e=>e.event),['queued']);
  const file=await c.download(ready.own);assert.equal(file.subarray(0,2).toString(),'PK');
  await assert.rejects(c.status(ready.foreign),{code:'forbidden'});
  await assert.rejects(c.download(ready.foreign),{code:'forbidden'});
  await assert.rejects(workspaceOperation(c, {canWrite:false}, {action:'delete',id:first.id,confirmed:true}), /Read-only/);
  for (const action of ['history','delete']) await assert.rejects(workspaceOperation(c, {canWrite:true}, {action,id:ready.foreign,confirmed:true}), /access denied/);
  await workspaceOperation(c, {canWrite:true}, {action:'delete',id:first.id,confirmed:true});
  await workspaceOperation(c, {canWrite:true}, {action:'delete',id:first.id,confirmed:true});
  const audit = await workspaceOperation(c, {canWrite:false}, {action:'history',id:first.id});
  assert.deepEqual(audit.events.map(e=>e.event), ['queued','deleted']);
  assert.equal((await workspaceOperation(c, {canWrite:false}, {action:'history',id:first.id,after:audit.events[0].id})).events[0].event, 'deleted');
  assert.equal((await c.status(first.id)).status,'deleted');
  assert.deepEqual((await c.history(first.id)).events.map(e=>e.event),['queued','deleted']);
  const invalid=createDocumentClient({endpoint,testOnlyAllowLoopbackHttp:true,getBearer:async()=> 'invalid'});
  await assert.rejects(invalid.list(),{code:'unauthenticated'});
});
