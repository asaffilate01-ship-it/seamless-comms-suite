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

// Exercise the actual server-side preflight with offline identity/RPC adapters.
const entitlementSource=await readFile(new URL('../src/modules/transformation/entitlement.server.ts',import.meta.url),'utf8');
const entitlementCompiled=ts.transpileModule(entitlementSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const entitlementUrl='data:text/javascript;base64,'+Buffer.from(entitlementCompiled).toString('base64');
const {business360Entitled}=await import(entitlementUrl);
const serverSource=await readFile(new URL('../src/modules/ecosystem/bridge.server.ts',import.meta.url),'utf8');
const coreUrl='data:text/javascript;base64,'+Buffer.from(compiled).toString('base64');
const harness={binding:base,role:'member',calls:[],after:null,result:null};
globalThis.__bridgeReadinessTest=harness;
const serverPrepared=serverSource
 .replace("from '../transformation/entitlement.server'",'from '+JSON.stringify(entitlementUrl))
 .replace("from 'zod'",'from '+JSON.stringify(import.meta.resolve('zod')))
 .replace("import { createClient } from '@supabase/supabase-js';",`const h=globalThis.__bridgeReadinessTest;
 const createClient=()=>({from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{role:h.role},error:null})})})})})});`)
 .replace("import { callTransformation, TransformationError } from '../transformation/transformation.server';",`class TransformationError extends Error {}
 const callTransformation=async(identity,request)=>{h.calls.push({identity,request});if(h.after)h.after();return h.result;};`)
 .replace("from './bridge-core'",'from '+JSON.stringify(coreUrl));
const serverCompiled=ts.transpileModule(serverPrepared,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {checkBridgeReadiness}=await import('data:text/javascript;base64,'+Buffer.from(serverCompiled).toString('base64'));
const codes=['project_active','ai_enabled','data_sharing_approved','profile_authorised','model_bound','provider_configuration_present'];
async function preflightFixture(run){
 const values={...env,BUSINESS360_ENTITLEMENT_MODE:'pilot',BUSINESS360_ENABLED_TENANTS:base.tenant,SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'offline-fixture'};
 const prior=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));
 Object.assign(process.env,values);
 harness.role='member';harness.calls=[];harness.after=null;
 harness.result={connection:base.id,checkedAt:'2026-10-04T00:00:00Z',readyForTest:true,liveVerified:false,checks:codes.map(code=>({code,passed:true}))};
 try{await run();}finally{for(const [k,v]of Object.entries(prior)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
}
test('readiness uses the fixed service identity and sends no source context',()=>preflightFixture(async()=>{
 const result=await checkBridgeReadiness(base);assert.equal(result.liveVerified,false);
 assert.deepEqual(harness.calls,[{identity:{tenant:base.tenant,user:base.serviceUser,tenant_role:'member'},request:{command:'bridges.readiness',project_id:base.project,data:{profile:base.profile,connection:base.id}}}]);
}));
test('readiness rejects disabled entitlement and revoked source membership before RPC',()=>preflightFixture(async()=>{
 process.env.BUSINESS360_ENABLED_TENANTS='';await assert.rejects(checkBridgeReadiness(base));
 process.env.BUSINESS360_ENABLED_TENANTS=base.tenant;harness.role='viewer';await assert.rejects(checkBridgeReadiness(base));
 assert.equal(harness.calls.length,0);
}));
test('readiness discards a result when credentials or membership change during RPC',()=>preflightFixture(async()=>{
 harness.after=()=>{process.env.OQ_BRIDGE_TEST='a-different-long-credential-for-offline-check';};
 await assert.rejects(checkBridgeReadiness(base));
 process.env.OQ_BRIDGE_TEST=key;harness.after=()=>{harness.role='viewer';};
 await assert.rejects(checkBridgeReadiness(base));
}));
test('readiness rejects foreign, incomplete and falsely live responses',()=>preflightFixture(async()=>{
 const valid=structuredClone(harness.result);
 for(const change of [{connection:'foreign'},{liveVerified:true},{checks:[]},{checks:codes.map(()=>({code:'model_bound',passed:true}))},{readyForTest:false}]){
  harness.result={...valid,...change};await assert.rejects(checkBridgeReadiness(base));
 }
}));

harness.core=await import(coreUrl);
harness.checkBridgeReadiness=checkBridgeReadiness;
const functionsSource=await readFile(new URL('../src/modules/ecosystem/ecosystem.functions.ts',import.meta.url),'utf8');
const functionsPrepared=functionsSource
 .replace("import { createServerFn } from '@tanstack/react-start';",`const h=globalThis.__bridgeReadinessTest;
 const createServerFn=()=>({middleware(){return this},inputValidator(){return this},handler(fn){return fn}});`)
 .replace("from 'zod'",'from '+JSON.stringify(import.meta.resolve('zod')))
 .replace("import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';",'const requireSupabaseAuth={};')
 .replaceAll("import('./bridge-core')",'Promise.resolve(h.core)')
 .replace("import('../transformation/entitlement.server')",'import('+JSON.stringify(entitlementUrl)+')')
 .replace("import('./bridge.server')",'Promise.resolve({checkBridgeReadiness:h.checkBridgeReadiness})')
 .replace("import('../transformation/transformation.server')",'Promise.resolve({TransformationError:class extends Error {}})');
const functionsCompiled=ts.transpileModule(functionsPrepared,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {checkConnectionReadiness}=await import('data:text/javascript;base64,'+Buffer.from(functionsCompiled).toString('base64'));
const adminContext=()=>({userId:'admin-fixture',supabase:{from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{role:harness.adminRole},error:null})})})})})}});
const checkAsAdmin=(tenantId=base.tenant)=>checkConnectionReadiness({context:adminContext(),data:{tenantId,connectionId:base.id}});
test('readiness endpoint rejects non-admins and cross-workspace bindings',()=>preflightFixture(async()=>{
 harness.adminRole='member';await assert.rejects(checkAsAdmin());
 harness.adminRole='admin';await assert.rejects(checkAsAdmin('dddddddd-dddd-4ddd-8ddd-dddddddddddd'));
 assert.equal(harness.calls.length,0);
 assert.equal((await checkAsAdmin()).readyForTest,true);
}));
test('readiness endpoint rechecks administrator access before returning results',()=>preflightFixture(async()=>{
 harness.adminRole='admin';harness.after=()=>{harness.adminRole='member';};
 await assert.rejects(checkAsAdmin());assert.equal(harness.calls.length,1);
}));

test('Factory access validates current tenant, product, service and validity window',async()=>{
 const now=Date.parse('2026-10-05T10:00:00Z');
 const state={tenants:{status:'active'},tenant_products:{status:'active'},tenant_services:{status:'active',valid_from:'2026-10-01T00:00:00Z',valid_until:null}};
 const queries=[];let error=null;
 const client={from(table){const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},async maybeSingle(){queries.push({table,filters});return {data:state[table],error}}};return q;}};
 const env={BUSINESS360_ENTITLEMENT_MODE:'factory',BUSINESS360_ENABLED_TENANTS:base.tenant};
 const allowed=()=>business360Entitled(client,base.tenant,env,now);
 assert.equal(await allowed(),true);
 assert(queries.every(q=>q.filters.some(([k,v])=>['tenant_id','id'].includes(k)&&v===base.tenant)));
 assert(queries.find(q=>q.table==='tenant_services').filters.some(([k,v])=>k==='service_key'&&v==='business360.core'));
 for(const patch of [{status:'suspended'},{valid_from:'2027-01-01T00:00:00Z'},{valid_from:'invalid'},{valid_until:'2026-10-05T10:00:00Z'},{valid_until:'invalid'}]){
  const original={...state.tenant_services};Object.assign(state.tenant_services,patch);assert.equal(await allowed(),false);state.tenant_services=original;
 }
 state.tenant_products.status='suspended';assert.equal(await allowed(),false);
 state.tenant_products=null;assert.equal(await allowed(),true); // service-only add-on
 state.tenants.status='suspended';assert.equal(await allowed(),false);state.tenants.status='active';
 state.tenant_services=null;assert.equal(await allowed(),false);
 error={message:'database unavailable'};await assert.rejects(allowed());
 await assert.rejects(business360Entitled(client,base.tenant,{...env,BUSINESS360_ENTITLEMENT_MODE:'typo'},now));
 assert.equal(await business360Entitled(client,base.tenant,{BUSINESS360_ENABLED_TENANTS:base.tenant},now),true);
 assert.equal(await business360Entitled(client,base.tenant,{},now),false);
});

const workspaceSource=await readFile(new URL('../src/modules/transformation/transformation.functions.ts',import.meta.url),'utf8');
const workspacePrepared=workspaceSource
 .replace('import { createServerFn } from "@tanstack/react-start";',`const h=globalThis.__bridgeReadinessTest;const createServerFn=()=>({middleware(){return this},inputValidator(){return this},handler(fn){return fn}});`)
 .replace('from "zod"','from '+JSON.stringify(import.meta.resolve('zod')))
 .replace('import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";','const requireSupabaseAuth={};')
 .replace("import('./entitlement.server')",'import('+JSON.stringify(entitlementUrl)+')')
 .replace('import("./transformation.server")','Promise.resolve({callTransformation:async()=>{h.workspaceCalls++;if(h.after)h.after();return {private:"result"}}})');
const workspaceCompiled=ts.transpileModule(workspacePrepared,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {transformationRequest}=await import('data:text/javascript;base64,'+Buffer.from(workspaceCompiled).toString('base64'));
test('workspace Factory gate blocks suspended access before RPC and revoked entitlement after RPC',()=>preflightFixture(async()=>{
 process.env.BUSINESS360_ENTITLEMENT_MODE='factory';harness.workspaceCalls=0;
 const state={tenant_members:{role:'owner'},tenants:{status:'active'},tenant_products:{status:'active'},tenant_services:{status:'active',valid_from:'2020-01-01T00:00:00Z',valid_until:null}};
 const client={from(table){const q={select(){return q},eq(){return q},async maybeSingle(){return {data:state[table],error:null}}};return q;}};
 const request=()=>transformationRequest({context:{supabase:client,userId:base.serviceUser},data:{tenantId:base.tenant,command:'projects.list',data:{}}});
 state.tenant_services.status='suspended';await assert.rejects(request());assert.equal(harness.workspaceCalls,0);
 state.tenant_services.status='active';harness.after=()=>{state.tenant_services.status='suspended';};
 await assert.rejects(request());assert.equal(harness.workspaceCalls,1);
 state.tenant_services.status='active';harness.after=null;assert.equal(JSON.parse((await request()).payload).private,'result');
}));
