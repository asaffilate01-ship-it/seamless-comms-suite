import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareStudy, parseFindings, studySchema } from '../../src/modules/review-lab/contract.ts';
import { prepareReview, inspectReview } from '../../src/modules/review-lab/service.server.ts';
const tenantId = '11111111-1111-4111-8111-111111111111';
const input = { version: 1, tenantId, product: 'Kindelo', objective: 'pricing', brief: 'Compare subscription benefits for independent childcare providers.', audience: 'Independent childcare providers in the UK', agents: 12, rounds: 3, budgetPence: 0, evidence: [{ id: 'ev1', kind: 'manual_observation', source: 'Pricing page', summary: 'Support tiers are displayed together' }], publicOrSyntheticConfirmed: true };
function db(role = 'owner', error = null, expectedTenant = tenantId) {
  const filters = {};
  const q = { select() { return q; }, eq(k,v) { filters[k] = v; return q; }, async maybeSingle() { assert.equal(filters.user_id, 'actor'); return { error, data: filters.tenant_id === expectedTenant ? { role } : null }; } };
  return { from(table) { assert.equal(table, 'tenant_members'); return q; } };
}
test('preparation is deterministic, offline and cannot activate execution', () => {
  const a = prepareStudy(input); assert.deepEqual(a, prepareStudy(input));
  assert.equal(a.discussionTurns, 36); assert.equal(a.provider.executionEnabled, false);
  assert.equal(a.budget.reservedPence, 0); assert.equal(a.budget.estimatedCost, null);
});
test('bounds, confirmations and unknown fields fail closed', () => {
  for (const patch of [{agents: 100}, {rounds: 0}, {budgetPence: -1}, {budgetPence: 5001}, {publicOrSyntheticConfirmed: false}, {executionEnabled: true}, {brief: ''}, {evidence: [input.evidence[0], input.evidence[0]]}])
    assert.equal(studySchema.safeParse({...input,...patch}).success, false);
});
test('membership errors, viewers and foreign tenants are denied', async () => {
  for (const client of [db('viewer'),db(null),db('owner',new Error('offline')),db('owner',null,'other')])
    await assert.rejects(prepareReview(client, 'actor', input), /membership/);
  for (const role of ['owner','admin','agent']) assert.equal((await prepareReview(db(role),'actor',input)).status,'prepared_not_executed');
});
test('digest binds entire study revision including audience and budget', async () => {
  const a = await prepareReview(db(),'actor',input);
  for (const patch of [{ audience: 'Different prospective customers' }, {budgetPence: 100}, {rounds: 4}])
    assert.notEqual((await prepareReview(db(),'actor',{...input,...patch})).digest,a.digest);
});
test('reports cannot claim verified results or refer to another revision/evidence', async () => {
  const plan = await prepareReview(db(),'actor',input);
  const r = {version:1,studyDigest:plan.digest,findings:[{category:'fix',priority:'high',claim:'Make the tier differences clearer',evidenceIds:['ev1'],experiment:'Compare two pricing layouts with real prospects',metric:'Paid conversion rate'}]};
  assert.equal((await inspectReview(db(),'actor',input,r)).classification,'unverified_simulated_feedback');
  assert.throws(()=>parseFindings({...r,studyDigest:'a'.repeat(64)},plan.digest,input),/revision/);
  assert.throws(()=>parseFindings({...r,findings:[{...r.findings[0],evidenceIds:['missing']}]},plan.digest,input),/unknown evidence/);
  assert.throws(()=>parseFindings({...r,verified:true},plan.digest,input));
  await assert.rejects(inspectReview(db('viewer'),'actor',input,r),/membership/);
});
