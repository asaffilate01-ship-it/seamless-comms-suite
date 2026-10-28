import test from 'node:test';import assert from 'node:assert/strict';
import {validateClaim,runCricketWorkerPass} from '../../services/criclume-worker/worker.mjs';
import {buildProviderRequest,createProviderAdapter,parseProviderReceipt} from '../../services/criclume-worker/providers.mjs';
import {readCricketTool} from '../../services/criclume-worker/mcp.mjs';
const tenant='11111111-1111-4111-8111-111111111111',worker='22222222-2222-4222-8222-222222222222';
const claim={tenantId:tenant,admissionId:worker,runId:worker,productKey:'criclume',task:'match_insights',providerKey:'openai',modelKey:'fixture-model',sourceHash:'a'.repeat(32),maxInputTokens:1800,maxOutputTokens:800,humanReviewRequired:true,tools:[],snapshot:{runs:50,wickets:2,overs:'6.2',target:null,recent:['4','W','0'],matchStatus:'live',evidencePolicy:'aggregates_only;no_children_or_biometrics;human_review_required'}};
const receipt={providerKey:'openai',modelKey:'fixture-model',sourceHash:claim.sourceHash,summary:'These score aggregates require a human coaching review.',providerReceiptId:'response_fixture_123',inputTokens:200,outputTokens:80,modelCalls:1,toolCalls:0,humanReviewRequired:true};
test('reject cross tenant, identities, tools and invalid aggregates',()=>{
 assert.throws(()=>validateClaim(claim,worker));assert.throws(()=>validateClaim({...claim,tools:['write']},tenant));
 assert.throws(()=>validateClaim({...claim,snapshot:{...claim.snapshot,playerName:'private'}},tenant));assert.throws(()=>validateClaim({...claim,snapshot:{...claim.snapshot,overs:'6.9'}},tenant));
});
test('all three providers have fixed destinations and bounded output',()=>{for(const p of ['openai','anthropic','google']){const r=buildProviderRequest({...claim,providerKey:p});assert.ok(new URL(r.url).protocol==='https:');assert.equal((r.url+JSON.stringify(r.body)).includes('fixture-model'),true);assert.equal(JSON.stringify(r.body).includes('800'),true);}assert.throws(()=>buildProviderRequest({...claim,providerKey:'other'}));});
test('genuine provider metering normalises, tools and missing usage fail',()=>{
 const d={id:'response_fixture_123',status:'completed',output:[{type:'message',content:[{type:'output_text',text:receipt.summary}]}],usage:{input_tokens:200,output_tokens:80,input_tokens_details:{cached_tokens:20}}};
 assert.equal(parseProviderReceipt(claim,d).cachedInputTokens,20);assert.throws(()=>parseProviderReceipt(claim,{...d,usage:{}}));assert.throws(()=>parseProviderReceipt(claim,{...d,output:[{type:'function_call'}]}));
 assert.equal(parseProviderReceipt({...claim,providerKey:'anthropic'},{id:'message_fixture_123',stop_reason:'end_turn',content:[{type:'text',text:receipt.summary}],usage:{input_tokens:100,output_tokens:50}}).outputTokens,50);
 assert.equal(parseProviderReceipt({...claim,providerKey:'google'},{responseId:'response_fixture_123',candidates:[{finishReason:'STOP',content:{parts:[{text:receipt.summary}]}}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:50,thoughtsTokenCount:10}}).outputTokens,60);
});
test('provider failures never retry or expose credentials',async()=>{let calls=0;const adapter=createProviderAdapter({providerKey:'openai',modelKey:claim.modelKey,token:'secret-fixture-token-only',reviewed:true,fetcher:async()=>{calls++;return new Response('private provider error',{status:500});}});await assert.rejects(()=>adapter.execute(claim),/reconcile/);assert.equal(calls,1);});
test('one claimed job settles, default off makes no database calls',async()=>{
 const calls=[];const db={rpc:async(n,a)=>{calls.push([n,a]);return {data:n==='claim_criclume_worker_job'?claim:{status:'waiting_review'}};}};const adapter={reviewed:true,noTools:true,providerKey:'openai',modelKey:claim.modelKey,execute:async()=>receipt};
 await assert.rejects(()=>runCricketWorkerPass({db,tenantId:tenant,workerRef:worker,adapter}));assert.equal(calls.length,0);
 assert.equal((await runCricketWorkerPass({db,tenantId:tenant,workerRef:worker,adapter,enabled:true})).status,'waiting_review');assert.equal(calls.length,2);assert.equal(calls[1][1]._receipt.cachedInputTokens,0);
});
test('ambiguous outcome retains reservation and enters reconciliation',async()=>{const calls=[];const r=await runCricketWorkerPass({db:{rpc:async(n)=>{calls.push(n);return {data:n==='claim_criclume_worker_job'?claim:{}};}},tenantId:tenant,workerRef:worker,enabled:true,adapter:{reviewed:true,noTools:true,providerKey:'openai',modelKey:claim.modelKey,execute:async()=>{throw new Error('timeout');}}});assert.equal(r.reservationHeld,true);assert.deepEqual(calls,['claim_criclume_worker_job','flag_criclume_worker_reconciliation']);});
test('MCP destination and exact club scope, with initialise handshake',async()=>{
 const b={enabled:true,reviewed:true,productKey:'criclume',tenantId:tenant,organisationId:worker,allowedHost:'fixture.supabase.co',endpoint:'https://fixture.supabase.co/functions/v1/criclume-mcp',expiresAt:new Date(Date.now()+60000).toISOString(),allowedTools:['criclume_match_summary']};
 let calls=0;const fetcher=async(url,o)=>{calls++;const r=JSON.parse(o.body);if(r.method==='notifications/initialized')return new Response(null,{status:202});if(r.method==='tools/call')assert.deepEqual(r.params.arguments,{organisationId:worker,matchId:worker});return Response.json({jsonrpc:'2.0',id:r.id,result:r.method==='initialize'?{protocolVersion:'2025-06-18',capabilities:{tools:{}}}:{content:[{type:'text',text:'{}'}],isError:false}});};
 await assert.rejects(()=>readCricketTool({binding:{...b,endpoint:'https://evil.test/functions/v1/criclume-mcp'},tool:'criclume_match_summary',matchId:worker,userToken:'x'.repeat(40),fetcher}));assert.equal(calls,0);
 await readCricketTool({binding:b,tool:'criclume_match_summary',matchId:worker,userToken:'x'.repeat(40),fetcher});assert.equal(calls,3);
});
