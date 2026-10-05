import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
const require=createRequire(import.meta.url),ts=require('typescript');
const compile=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const identity=compile(await readFile(new URL('../../src/modules/platform/service-identity.ts',import.meta.url),'utf8'));
const source=await readFile(new URL('../../src/modules/intelligence/service.server.ts',import.meta.url),'utf8');
const entry=source.replace('"@/modules/platform/service-identity"',JSON.stringify(identity)).replace('"zod"',JSON.stringify(pathToFileURL(require.resolve('zod')).href)).replace('import("@/integrations/supabase/client.server")','({supabaseAdmin:globalThis.__actionDB})');
const {serveIntelligenceService}=await import(compile(entry));
const tenant='10000000-0000-4000-8000-000000000001',id='10000000-0000-4000-8000-000000000003',claimToken='10000000-0000-4000-8000-000000000004';
const secret='a'.repeat(64),key='oqsvc_test01',credentialId='10000000-0000-4000-8000-000000000005';
let calls=[];
function setup({capabilities=['intelligence.action.finish','intelligence.action.claim','intelligence.action.review'],locations,connector=false}={}){
 calls=[];
 const record=connector?{id:credentialId,tenant_id:tenant,product_key:'dishbee',status:'connected',capabilities,credential_hash:createHash('sha256').update('oqcp_'+secret).digest('hex')}:
 {id:credentialId,key_id:key,secret_hash:createHash('sha256').update(secret).digest('hex'),status:'active',scopes:[{tenantId:tenant,productKey:'dishbee',capabilities,locationIds:locations}]};
 globalThis.__actionDB={from(){return {select(){return this;},eq(){return this;},update(){return this;},maybeSingle:async()=>({data:record,error:null})};},rpc:async(name,args)=>{calls.push({name,args});return {data:name==='has_tenant_entitlement'?true:[],error:null};}};
 return 'Bearer '+(connector?'oqcp_'+secret:key+'.'+secret);
}
const payload={tenantId:tenant,productKey:'dishbee',operation:'action.finish',actionRequestId:id,claimToken,workerKey:'worker-a',success:true,result:{ok:true}};
const invoke=(p,header)=>serveIntelligenceService(new Request('https://test.invalid/api',{method:'POST',headers:{authorization:header},body:JSON.stringify(p)}));
for(const connector of [false,true])test(`completion carries authenticated ${connector?'connector':'service'} identity and claim scope`,async()=>{
 const response=await invoke(payload,setup({connector}));assert.equal(response.status,200);
 const call=calls.find(c=>c.name==='finish_product_action_request');assert(call);
 assert.equal(call.args._tenant,tenant);assert.equal(call.args._product,'dishbee');assert.equal(call.args._destination,'dishbee.runtime');
 assert.equal(call.args._worker,(connector?'connector:':'service:')+credentialId+':worker-a');assert.equal(call.args._claim_token,claimToken);
});
test('foreign tenant credential cannot reach a completion RPC',async()=>{
 const response=await invoke({...payload,tenantId:'20000000-0000-4000-8000-000000000001'},setup());
 assert.equal(response.status,403);assert(!calls.some(c=>c.name==='finish_product_action_request'));
});
test('a location-limited key cannot request product-wide execution',async()=>{
 const response=await invoke(payload,setup({locations:[id]}));assert.equal(response.status,403);assert.equal(calls.length,0);
});
test('missing explicit action capability is denied',async()=>{
 const response=await invoke(payload,setup({capabilities:['intelligence.run.read']}));assert.equal(response.status,403);assert.equal(calls.length,0);
});
test('legacy completion without fencing token is rejected before authentication',async()=>{
 const {claimToken:ignored,...legacy}=payload;const response=await invoke(legacy,setup());assert.equal(response.status,422);assert.equal(calls.length,0);
});
test('human review uses one atomic, tenant-scoped RPC',async()=>{
 const response=await invoke({tenantId:tenant,productKey:'dishbee',operation:'action.review',proposalId:id,decision:'approved',actorRef:'dishbee-user:reviewer'},setup());
 assert.equal(response.status,200);const call=calls.find(c=>c.name==='review_product_action_proposal');assert.equal(call.args._tenant,tenant);assert.equal(call.args._proposal,id);
});
test('claim ownership is bound to the authenticated credential rather than only a caller label',async()=>{
 const response=await invoke({tenantId:tenant,productKey:'dishbee',operation:'action.claim',workerKey:'worker-a'},setup());assert.equal(response.status,200);
 assert.equal(calls.find(c=>c.name==='claim_product_action_requests').args._worker,'service:'+credentialId+':worker-a');
});
