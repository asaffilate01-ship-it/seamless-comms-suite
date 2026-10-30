import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftSchema, studySchema, parseTranscript, createExperimentBacklog } from '../../src/modules/review-lab/contract.ts';
import { inspectDiscussion, exportExperiments } from '../../src/modules/review-lab/service.server.ts';
const digest = 'a'.repeat(64);
const study = {version:1,tenantId:'11111111-1111-4111-8111-111111111111',product:'UniPathway',objective:'marketing',brief:'Explore how prospective students understand the course delivery format.',audience:'Prospective students and their parents',agents:3,rounds:2,budgetPence:0,evidence:[{id:'e1',kind:'manual_observation',source:'Course page',summary:'Delivery format is described'}],publicOrSyntheticConfirmed:true};
const message = {id:'m1',agentId:'persona-1',round:1,text:'I need clearer information about attendance.',evidenceIds:['e1']};
const transcript = {version:1,studyDigest:digest,messages:[message]};
const finding = {category:'market',priority:'low',claim:'Clarify delivery format',evidenceIds:[],experiment:'Compare two explanations with prospective students',metric:'Qualified enquiries'};
const report = {version:1,studyDigest:digest,findings:[finding,{...finding,priority:'high',evidenceIds:['e1']}]};
test('unfinished drafts restore without becoming execution-ready studies', () => {
 const unfinished={...study,product:'',brief:'',audience:'',evidence:[{...study.evidence[0],source:'',summary:''}]};
 assert.ok(draftSchema.safeParse(unfinished).success); assert.ok(!studySchema.safeParse(unfinished).success);
 assert.ok(!draftSchema.safeParse({...unfinished,brief:'a'.repeat(12001)}).success);
 assert.ok(!draftSchema.safeParse({...unfinished,evidence:[study.evidence[0],study.evidence[0]]}).success);
 assert.ok(!draftSchema.safeParse({...unfinished,tenantId:'other'}).success);
});
test('discussion sorts without changing supplied text and reports partial coverage', () => {
 const data={...transcript,messages:[{...message,id:'m2',agentId:'persona-2',round:2},message]};
 const parsed=parseTranscript(data,digest,study);
 assert.equal(parsed.messages[0].id,'m1'); assert.equal(data.messages[0].id,'m2');
 assert.deepEqual(parsed.coverage,{suppliedTurns:2,plannedTurns:6});
 assert.equal(parsed.classification,'unverified_simulated_feedback');
});
test('foreign revisions, unknown agents, excess rounds, duplicates and invented evidence are rejected', () => {
 for(const m of [{...message,agentId:'persona-4'},{...message,round:3},{...message,evidenceIds:['foreign']},{...message,text:''},{...message,text:'x'.repeat(2001)}])
  assert.throws(()=>parseTranscript({...transcript,messages:[m]},digest,study));
 assert.throws(()=>parseTranscript(transcript,'b'.repeat(64),study));
 assert.throws(()=>parseTranscript({...transcript,messages:[message,{...message,id:'m2'}]},digest,study));
 assert.throws(()=>parseTranscript({...transcript,messages:[message,{...message,round:2}]},digest,study));
 assert.throws(()=>parseTranscript({...transcript,verified:true},digest,study));
});
test('experiment handoff retains evidence, stable source indexes and unapproved status', () => {
 const backlog=createExperimentBacklog(report,digest,study);
 assert.equal(backlog.items[0].id,'finding-2'); assert.equal(backlog.items[1].id,'finding-1');
 assert.equal(backlog.items[0].evidenceStatus,'supplied_references_unverified');
 assert.equal(backlog.items[1].evidenceStatus,'unsupported_hypothesis');
 assert.equal(backlog.executionEnabled,false); assert.equal(backlog.status,'draft_requires_human_review');
 assert.equal(backlog.items[0].owner,null); assert.equal(backlog.items[0].outcome,null);
 assert.throws(()=>createExperimentBacklog(report,'b'.repeat(64),study));
});
test('new server operations enforce current membership before returning content', async () => {
 for(const operation of [inspectDiscussion,exportExperiments]) {
  let queried=false;
  const q={select(){return q},eq(){return q},async maybeSingle(){queried=true;return {data:{role:'viewer'},error:null}}};
  await assert.rejects(operation({from(){return q}},'actor',study,operation===inspectDiscussion?transcript:report),/membership/);
  assert.equal(queried,true);
 }
});
