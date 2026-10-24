import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forecastByCurrency, nextFollowUp } from '../../src/modules/crm/sales-model.ts';

test('forecast separates currencies, excludes closed deals and preserves zero probability', () => {
  const totals = forecastByCurrency([
    {status:'open',amount:'100',currency:'GBP',probability_percent:30},
    {status:'open',amount:200,currency:'EUR',probability_percent:50},
    {status:'open',amount:50,currency:'GBP',probability_percent:0},
    {status:'won',amount:900,currency:'GBP',probability_percent:100},
    {status:'open',amount:20,currency:null,probability_percent:null},
  ]);
  assert.deepEqual(totals, [
    {currency:'EUR',amount:200,weighted:100,count:1},
    {currency:'GBP',amount:150,weighted:30,count:2},
    {currency:'Unspecified',amount:20,weighted:0,count:1},
  ]);
});
test('next follow-up excludes other deals, completed and undated tasks', () => {
  const base = {related_type:'opportunity',related_id:'deal',status:'open'};
  const tasks = [
    {...base,id:'late',due_at:'2026-11-02T12:00:00Z'},
    {...base,id:'next',due_at:'2026-11-01T12:00:00Z'},
    {...base,id:'done',status:'completed',due_at:'2026-10-01T12:00:00Z'},
    {...base,id:'other',related_id:'other',due_at:'2026-10-01T12:00:00Z'},
    {...base,id:'undated',due_at:null},
  ];
  assert.equal(nextFollowUp(tasks,'deal').id,'next');
  assert.equal(nextFollowUp(tasks,'missing'),undefined);
});
