import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
import {createProductBridge} from '../adapters/product-bridges/client.mjs';
const source=await readFile(new URL('../src/modules/ecosystem/bridge-core.ts',import.meta.url),'utf8');
const catalogue=await readFile(new URL('../src/modules/ecosystem/catalogue.json',import.meta.url),'utf8');
const prepared=source.replace("from 'zod'",'from '+JSON.stringify(import.meta.resolve('zod'))).replace("import catalogue from './catalogue.json';",'const catalogue='+catalogue+';');
const compiled=ts.transpileModule(prepared,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {bindingSchema,bearerBinding,gatewayInput,eventInput,haccoraInput,readBody,readBindings}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const base={id:'parts',product:'sparesgrid',tenant:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',project:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',serviceUser:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',externalTenant:'source-a',allowedScopes:['source-a'],secretEnv:'OQ_BRIDGE_TEST',protocol:'bearer',enabled:true,expiresAt:'2099-01-01T00:00:00Z',contracts:['sparesgrid_question','sparesgrid_enquiry'],profile:'product',dailyLimit:20};
const key='test-credential-32-characters-long-for-offline-checks';
const env={OQ_BRIDGE_TEST:key,OMNIQORA_BRIDGES_JSON:JSON.stringify([base])};
const req=(token=key)=>new Request('https://gateway.invalid',{headers:{authorization:`Bearer ${token}`}});
test('keys bind one source and cannot be reused across connections',()=>{
 assert.equal(bearerBinding(req(),env).id,'parts');assert.throws(()=>bearerBinding(req('forged'),env));
 assert.throws(()=>readBindings({...env,OMNIQORA_BRIDGES_JSON:JSON.stringify([base,{...base,id:'duplicate'}])}));
 for(const change of [{enabled:false},{expiresAt:'2020-01-01T00:00:00Z'}])assert.throws(()=>bearerBinding(req(),{...env,OMNIQORA_BRIDGES_JSON:JSON.stringify([{...base,...change}])}));
});
test('SparesGrid native contract is accepted with exact tenant and source scope',()=>{
 const input={tenantId:'source-a',question:'Stock to review?',context:[{id:'part-1',kind:'part',data:{defects:'scratched'}}],policy:{readOnly:true,requireSources:true,noInventedFitment:true,noExternalActions:true}};
 assert.equal(gatewayInput(base,input).contract,'sparesgrid_question');
 for(const changed of [{tenantId:'foreign'},{scopeId:'foreign'},{policy:{readOnly:false}}])assert.throws(()=>gatewayInput(base,{...input,...changed}));
 assert.throws(()=>gatewayInput(base,{...input,unknown:'injected'}));
});
test('Lawquo initial event is metadata only and exact case bound',()=>{
 const b={...base,product:'lawquo',externalTenant:'firm-a',allowedScopes:['case-a'],contracts:['lawquo_assessment']};
 const scope={schema_version:1,operation:'prepare_assessment',firm_id:'firm-a',case_id:'case-a',request_id:'request-a',context_revision:1,kind:'legal'};
 const event=input=>({title:'Lawquo draft preparation requested',input:JSON.stringify(input)});
 assert.deepEqual(eventInput(b,event(scope)).payload,{});
 for(const extra of [{case_id:'case-b'},{firm_id:'firm-b'},{document:'private narrative'}])assert.throws(()=>eventInput(b,event({...scope,...extra})));
});
test('Haccora signs the exact raw payload and rejects stale or mismatched events',()=>{
 const b={...base,product:'haccora',protocol:'haccora',contracts:['event']};
 const raw=JSON.stringify({id:'event-1',type:'integration.test',occurred_at:'2026-09-16T10:00:00Z'});
 const stamp=String(Math.floor(Date.now()/1000));
 const signature=createHmac('sha256',key).update(`${stamp}.${raw}`).digest('hex');
 const headers={'x-haccora-signature':`t=${stamp},v1=${signature}`,'idempotency-key':'event-1','x-haccora-event':'integration.test'};
 assert.equal(haccoraInput(b,new Request('https://gateway.invalid',{headers}),raw,env).contract,'event');
 assert.throws(()=>haccoraInput(b,new Request('https://gateway.invalid',{headers}),raw+' ',env));
 assert.throws(()=>haccoraInput(b,new Request('https://gateway.invalid',{headers:{...headers,'idempotency-key':'wrong'}}),raw,env));
 assert.throws(()=>haccoraInput(b,new Request('https://gateway.invalid',{headers:{...headers,'x-haccora-signature':`t=1,v1=${signature}`}}),raw,env));
});
test('stream limit cannot be bypassed by absent content-length',async()=>{
 const req=new Request('https://gateway.invalid',{method:'POST',headers:{'content-type':'application/json'},body:'a'.repeat(262145)});
 await assert.rejects(()=>readBody(req),/256 KiB/);
});
test('source adapter rechecks access after generation and keeps credentials off requests from clients',async()=>{
 let checks=0,posted;
 const current={tenantId:'source-a',scopeId:'source-a',revision:1,contract:'generic_draft',context:{source_ids:['record-1']}};
 const bridge=createProductBridge({url:'https://gateway.invalid',key,resolveAccess:async()=>({...current,revision:++checks===1?1:2}),fetchImpl:async(url,init)=>{posted=JSON.parse(init.body);return Response.json({text:'Draft',sources:['record-1'],reviewRequired:true});}});
 await assert.rejects(()=>bridge.draft({actor:'user',resourceId:'record',question:'Review'}),/changed/);
 assert.equal(posted.tenantId,'source-a');assert.equal(posted.key,undefined);
 assert.throws(()=>createProductBridge({url:'http://gateway.invalid',key,resolveAccess:()=>current}),/HTTPS/);
});
