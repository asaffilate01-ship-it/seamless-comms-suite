import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareReview, exportSession, restoreSession} from '../../src/modules/review-lab/service.server.ts';
import {packSession, sessionSchema, parseReviewFile, encodeReviewFile, MAX_REVIEW_FILE_BYTES} from '../../src/modules/review-lab/session.ts';
const tenantId='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const study={version:1,tenantId,product:'Haccora',objective:'usability',brief:'Explore the daily food safety workflow for a cafe manager.',audience:'Cafe managers and kitchen team members',agents:3,rounds:2,budgetPence:0,evidence:[{id:'e1',kind:'manual_observation',source:'Daily checks page',summary:'Daily checks are grouped by site'}],publicOrSyntheticConfirmed:true};
function db(role='owner', error=null) {const filters={};const q={select(){return q},eq(k,v){filters[k]=v;return q},async maybeSingle(){assert.equal(filters.tenant_id,tenantId);assert.equal(filters.user_id,'actor');return {data:{role},error}}};return {from(t){assert.equal(t,'tenant_members');return q}};}
async function fixture(){const plan=await prepareReview(db(),'actor',study);return {plan,report:{version:1,studyDigest:plan.digest,findings:[{category:'fix',priority:'high',claim:'Make daily checks easier to find',evidenceIds:['e1'],experiment:'Test a daily checklist shortcut with managers',metric:'Checklist completion time'}]},transcript:{version:1,studyDigest:plan.digest,messages:[{id:'m1',agentId:'persona-1',round:1,text:'I want the daily checklist on the first screen.',evidenceIds:['e1']}]}};}
test('whole review export/restore preserves study, report and discussion without granting execution',async()=>{
 const f=await fixture(); const packed=packSession(study,{...f.report,classification:'unverified_simulated_feedback'},{...f.transcript,coverage:{suppliedTurns:1,plannedTurns:6}});
 const exported=await exportSession(db(),'actor',tenantId,packed);
 const restored=await restoreSession(db(),'actor',tenantId,parseReviewFile(encodeReviewFile(exported)));
 assert.equal(restored.plan.digest,f.plan.digest); assert.deepEqual(restored.report.findings,f.report.findings); assert.deepEqual(restored.transcript.messages,f.transcript.messages);
 assert.equal(restored.plan.provider.executionEnabled,false);assert.equal(restored.plan.budget.reservedPence,0);
 assert.equal(restored.report.classification,'unverified_simulated_feedback'); assert.equal(restored.transcript.classification,'unverified_simulated_feedback');
 assert.ok(!('coverage' in exported.transcript));assert.ok(!('classification' in exported.report));
});
test('study-only sessions are valid and do not invent results',async()=>{
 const r=await restoreSession(db(),'actor',tenantId,packSession(study,null,null));
 assert.equal(r.report,null);assert.equal(r.transcript,null);
});
test('foreign tenants, membership errors and viewers cannot restore or export',async()=>{
 const session=packSession(study,null,null);
 for(const op of [restoreSession,exportSession]) {
  await assert.rejects(op(db(),'actor',other,session),/another tenant/);
  await assert.rejects(op(db('viewer'),'actor',tenantId,session),/membership/);
  await assert.rejects(op(db('owner',new Error('unavailable')),'actor',tenantId,session),/membership/);
 }
});
test('bad report or transcript rejects the entire session without modifying the source',async()=>{
 const f=await fixture(); const s=packSession(study,f.report,f.transcript);const before=structuredClone(s);
 for(const broken of [
  {...s,report:{...s.report,studyDigest:'0'.repeat(64)}},
  {...s,transcript:{...s.transcript,messages:[{...f.transcript.messages[0],evidenceIds:['unknown']}]}},
  {...s,study:{...s.study,brief:s.study.brief+' Changed.'}},
 ]) await assert.rejects(restoreSession(db(),'actor',tenantId,broken));
 assert.deepEqual(s,before);
});
test('files cannot import provider credentials or execution status',()=>{
 const s=packSession(study,null,null);
 for(const patch of [{provider:{key:'fake'}},{executionEnabled:true},{version:2},{approved:true}])assert.ok(!sessionSchema.safeParse({...s,...patch}).success);
});
test('larger round-trip files work and UTF-8 byte limits reject oversized input and output',()=>{
 const payload={text:'漢'.repeat(60000)};const text=encodeReviewFile(payload);
 assert.ok(new TextEncoder().encode(text).length>150000);assert.deepEqual(parseReviewFile(text),payload);
 assert.throws(()=>parseReviewFile(' '.repeat(MAX_REVIEW_FILE_BYTES+1)),/4 MiB/);
 assert.throws(()=>encodeReviewFile({text:'漢'.repeat(MAX_REVIEW_FILE_BYTES/2)}),/4 MiB/);
 assert.throws(()=>parseReviewFile('{broken'));
});
