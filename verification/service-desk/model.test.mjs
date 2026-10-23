import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSubmit, normaliseTitle, selectQueue, attentionReasons } from '../../src/modules/service-desk/model.ts';

const now = Date.parse('2026-10-22T12:00:00Z');
const row = { id: 'ref-one', title: 'Repair appointment', status: 'new', priority: 'normal', assignee: null, created_at: '2026-10-20T12:00:00Z', updated_at: '2026-10-22T12:00:00Z' };
test('closed urgent cases never inflate active attention or unassigned counts', () => {
  const rows = [row, { ...row, id: 'closed', status: 'closed', priority: 'urgent' }];
  assert.equal(selectQueue(rows, 'active').length, 1);
  assert.equal(selectQueue(rows, 'urgent').length, 0);
  assert.equal(selectQueue(rows, 'unassigned').length, 1);
  assert.deepEqual(attentionReasons(rows[1], now), []);
});
test('priority and escalation both enter attention queue without duplicate rows', () => {
  const rows = [{ ...row, priority: 'urgent', status: 'escalated' }, { ...row, id: 'two', status: 'escalated' }];
  assert.equal(selectQueue(rows, 'urgent').length, 2);
});
test('search and queue combine, matching references without modifying input', () => {
  const rows = [row, { ...row, id: 'TWO', status: 'waiting_customer' }];
  assert.deepEqual(selectQueue(rows, 'waiting', ' two '), [rows[1]]);
  assert.deepEqual(selectQueue(rows, 'closed', 'repair'), []);
  assert.equal(rows.length, 2);
});
test('staleness requires valid evidence and a complete 72 hour interval', () => {
  assert.deepEqual(attentionReasons({ ...row, assignee: 'staff', updated_at: 'invalid' }, now), []);
  assert.deepEqual(attentionReasons({ ...row, assignee: 'staff', updated_at: '2026-10-23T12:00:00Z' }, now), []);
  assert.equal(attentionReasons({ ...row, assignee: 'staff', updated_at: '2026-10-19T12:00:00Z' }, now).length, 1);
  assert.equal(attentionReasons({ ...row, assignee: 'staff', updated_at: '2026-10-19T12:00:01Z' }, now).length, 0);
});
test('only known staff roles may submit', () => {
  for (const role of ['owner', 'admin', 'agent']) assert.equal(canSubmit(role), true);
  for (const role of ['viewer', 'resident', 'landlord', '', null]) assert.equal(canSubmit(role), false);
});
test('intake rejects whitespace-only and oversized summaries', () => {
  assert.throws(() => normaliseTitle('    '));
  assert.throws(() => normaliseTitle('x'.repeat(161)));
  assert.equal(normaliseTitle('  Repair\n appointment  '), 'Repair appointment');
});
