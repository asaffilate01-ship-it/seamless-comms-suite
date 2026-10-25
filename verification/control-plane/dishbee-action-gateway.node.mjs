import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
const require=createRequire(import.meta.url),ts=require('typescript');
const compile=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const identity=compile(await readFile(new URL('../../src/modules/platform/service-identity.ts',import.meta.url),'utf8'));
const policy=compile(await readFile(new URL('../../src/modules/intelligence/criclume-policy.ts',import.meta.url),'utf8'));
const cricketSource=await readFile(new URL('../../src/modules/intelligence/criclume-budget-contract.ts',import.meta.url),'utf8');
const cricketContract=compile(cricketSource.replace('"zod"',JSON.stringify(pathToFileURL(require.resolve('zod')).href)));
const source=await readFile(new URL('../../src/modules/intelligence/service.server.ts',import.meta.url),'utf8');
const entry=source.replace('"@/modules/platform/service-identity"',JSON.stringify(identity))
 .replace('"@/modules/intelligence/criclume-policy"',JSON.stringify(policy))
 .replace('"@/modules/intelligence/criclume-budget-contract"',JSON.stringify(cricketContract))
 .replace('"zod"',JSON.stringify(pathToFileURL(require.resolve('zod')).href))
 .replace('import("@/integrations/supabase/client.server")','({supabaseAdmin:globalThis.__actionDB})');
const {serveIntelligenceService}=await import(compile(entry));
const tenant='10000000-0000-4000-8000-000000000001',id='10000000-0000-4000-8000-000000000003',claimToken='10000000-0000-4000-8000-000000000004';
const secret='a'.repeat(64),key='oqsvc_test01',credentialId='10000000-0000-4000-8000-000000000005';
let calls=[];
function setup({capabilities=['intelligence.action.finish','intelligence.action.claim','intelligence.action.review'],locations,connector=false,product='dishbee',budgetReply=null,cancelReply=null}={}){
 calls=[];
 const record=connector?{id:credentialId,tenant_id:tenant,product_key:product,status:'connected',capabilities,credential_hash:createHash('sha256').update('oqcp_'+secret).digest('hex')}:
 {id:credentialId,key_id:key,secret_hash:createHash('sha256').update(secret).digest('hex'),status:'active',scopes:[{tenantId:tenant,productKey:product,capabilities,locationIds:locations}]};
 globalThis.__actionDB={from(){return {select(){return this;},eq(){return this;},update(){return this;},maybeSingle:async()=>({data:record,error:null})};},rpc:async(name,args)=>{calls.push({name,args});return {data:name==='has_tenant_entitlement'?true:name==='queue_criclume_budgeted_agent'?budgetReply:name==='cancel_criclume_budgeted_agent'?cancelReply:[],error:null};}};
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

test('CricLume budget gate blocks generic billable starts even with a scoped credential',async()=>{
 const response=await invoke({tenantId:tenant,productKey:'criclume',operation:'run.start',
  profile:'operations',goal:'Create a cricket match insights report'},
  setup({product:'criclume',capabilities:['intelligence.run.start']}));
 assert.equal(response.status,409);
 assert.equal((await response.json()).code,'BUDGETED_ADMISSION_REQUIRED');
 assert.ok(calls.every(call=>call.name==='has_tenant_entitlement'));
});
test('CricLume connection verify checks scoped entitlement without invoking a model',async()=>{
 const response=await invoke({tenantId:tenant,productKey:'criclume',operation:'connection.verify'},
  setup({product:'criclume',capabilities:['intelligence.connection.verify']}));
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.connection,'verified');
 assert.equal(body.entitlementActive,true);
 assert.equal(body.modelExecutionReady,false);
 assert.ok(calls.every(call=>call.name==='has_tenant_entitlement'));
});
test('CricLume handshake refuses a scoped credential without verify capability',async()=>{
 const response=await invoke({tenantId:tenant,productKey:'criclume',operation:'connection.verify'},
  setup({product:'criclume',capabilities:['intelligence.run.read']}));
 assert.equal(response.status,403);
 assert.equal(calls.length,0);
});


const cricketSnapshot={runs:85,wickets:3,overs:'12.4',target:130,recent:['0','4','W'],
 matchStatus:'live',evidencePolicy:'aggregates_only;no_children_or_biometrics;human_review_required'};
const cricketRequest={tenantId:tenant,productKey:'criclume',operation:'run.start.budgeted',
 sourceOrganisationId:'10000000-0000-4000-8000-000000000007',
 matchId:'10000000-0000-4000-8000-000000000008',
 sourceRevision:'2026-10-25T06:00:00.000Z',
 idempotencyKey:'10000000-0000-4000-8000-000000000009',
 task:'match_insights',snapshot:cricketSnapshot};
const cricketReceipt={admissionId:'10000000-0000-4000-8000-000000000011',
 runId:'10000000-0000-4000-8000-000000000012',
 jobId:'10000000-0000-4000-8000-000000000013',
 reservationId:'10000000-0000-4000-8000-000000000014',
 reservedMinor:42,currency:'GBP',status:'queued',alreadyExists:false};

test('budgeted cricket run requires product/tenant-scoped service approval and hands off only aggregate context',async()=>{
 const header=setup({product:'criclume',capabilities:['intelligence.run.budgeted'],budgetReply:cricketReceipt});
 const r=await invoke(cricketRequest,header);
 assert.equal(r.status,202);
 const view=await r.json();
 assert.equal(view.reservedMinor,42);
 assert.equal(view.humanReviewRequired,true);
 assert.equal(view.modelExecutionReady,false);
 assert.equal(view.sourceProduct,'criclume');
 assert.equal(calls.filter(x=>x.name==='queue_criclume_budgeted_agent').length,1);
 const admission=calls.find(x=>x.name==='queue_criclume_budgeted_agent').args;
 assert.equal(admission._tenant,tenant);
 assert.equal(admission._source_org,cricketRequest.sourceOrganisationId);
 assert.equal(admission._service_credential,credentialId);
 assert.deepEqual(admission._source_snapshot,cricketSnapshot);
});
test('unbudgeted cricket credential cannot invoke the reservation RPC',async()=>{
 const response=await invoke(cricketRequest,setup({product:'criclume',capabilities:['intelligence.run.start'],budgetReply:cricketReceipt}));
 assert.equal(response.status,403);
 assert.ok(!calls.some(c=>c.name==='queue_criclume_budgeted_agent'));
});
test('foreign tenant and connector cannot access cricket budgeted admission',async()=>{
 const foreign=await invoke({...cricketRequest,tenantId:'20000000-0000-4000-8000-000000000001'},
  setup({product:'criclume',capabilities:['intelligence.run.budgeted'],budgetReply:cricketReceipt}));
 assert.equal(foreign.status,403);
 assert.ok(!calls.some(c=>c.name==='queue_criclume_budgeted_agent'));
 const connector=await invoke(cricketRequest,setup({connector:true,product:'criclume',
  capabilities:['intelligence.run.budgeted'],budgetReply:cricketReceipt}));
 assert.equal(connector.status,403);
 assert.ok(!calls.some(c=>c.name==='queue_criclume_budgeted_agent'));
});
test('external caller may not select a model, provider, API URL or executable agent tool',async()=>{
 const r=await invoke({...cricketRequest,providerKey:'cheap-unknown',model:'bypass',tool:'payments.write'},
  setup({product:'criclume',capabilities:['intelligence.run.budgeted'],budgetReply:cricketReceipt}));
 assert.equal(r.status,422);
 assert.ok(!calls.some(c=>c.name==='queue_criclume_budgeted_agent'));
});
test('budgeted API rejects an invalid database reservation result (no phantom success)',async()=>{
 const response=await invoke(cricketRequest,setup({product:'criclume',
  capabilities:['intelligence.run.budgeted'],budgetReply:{status:'queued',reservedMinor:0}}));
 assert.notEqual(response.status,202);
});


test('separate cancel permission releases only an operator-approved queued cricket reservation',async()=>{
 const receipt={admissionId:cricketReceipt.admissionId,runId:cricketReceipt.runId,
  releasedMinor:42,alreadyCancelled:false};
 const response=await invoke({tenantId:tenant,productKey:'criclume',
  operation:'run.cancel.budgeted',admissionId:cricketReceipt.admissionId},
  setup({product:'criclume',capabilities:['intelligence.run.cancel'],cancelReply:receipt}));
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.releasedMinor,42);
 assert.equal(body.humanReviewRequired,true);
 assert.equal(calls.filter(c=>c.name==='cancel_criclume_budgeted_agent').length,1);
 const call=calls.find(c=>c.name==='cancel_criclume_budgeted_agent');
 assert.equal(call.args._tenant,tenant);
 assert.equal(call.args._service_credential,credentialId);
});
test('model-spend credential alone cannot release cricket budget',async()=>{
 const response=await invoke({tenantId:tenant,productKey:'criclume',
  operation:'run.cancel.budgeted',admissionId:cricketReceipt.admissionId},
  setup({product:'criclume',capabilities:['intelligence.run.budgeted']}));
 assert.equal(response.status,403);
 assert.equal(calls.length,0);
});
