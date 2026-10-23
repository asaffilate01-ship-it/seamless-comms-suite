import test from 'node:test';
import assert from 'node:assert/strict';
import {buildControlQueue} from '../../src/modules/aegis/control-room.ts';
const empty=()=>({incidents:[],actions:[],handovers:[],reports:[],orders:[],receipts:[]});
test('recorded priority and UTC due date rank remediation without inventing incident severity',()=>{
 const s=empty();s.actions=[{id:'normal',stage:'open',priority:'normal',due_on:'2026-10-24',assignee_id:'u'},{id:'urgent',stage:'submitted',priority:'critical',due_on:'2026-10-22',assignee_id:'v'},{id:'closed',stage:'closed',priority:'critical',due_on:'2020-01-01',assignee_id:'u'}];s.incidents=[{id:'incident',title:'Door',status:'open',assigned_user_id:'u'}];
 const r=buildControlQueue(s,'u','2026-10-23');assert.deepEqual(r.map(x=>x.sourceRef),['urgent','normal','incident']);assert.equal(r[0].overdue,true);assert.equal(r[1].overdue,false);assert.equal(r[2].rank,30);assert.equal(r[0].mine,false);
});
test('due today is not overdue and terminal records do not create tasks',()=>{
 const s=empty();s.actions=[{id:'today',stage:'in_progress',priority:'high',due_on:'2026-10-23',assignee_id:'u'}];s.incidents=[{id:'closed',status:'closed'},{id:'resolved',status:'resolved'}];s.reports=[{id:'r',stage:'approved'}];s.handovers=[{id:'h',stage:'acknowledged'}];const r=buildControlQueue(s,'u','2026-10-23');assert.equal(r.length,1);assert.equal(r[0].overdue,false);
});
test('handover responsibility follows offered recipient and returned author',()=>{
 const s=empty();s.handovers=[{id:'offered',summary:'Incoming',stage:'offered',created_by:'v',incoming_id:'u'},{id:'returned',summary:'Clarification',stage:'returned',created_by:'u',incoming_id:'v'},{id:'other',summary:'Other',stage:'offered',created_by:'u',incoming_id:'v'}];const r=buildControlQueue(s,'u','2026-10-23');assert.deepEqual(r.filter(x=>x.mine).map(x=>x.sourceRef),['offered','returned']);
});
test('a receipt of an old version never acknowledges the current instructions',()=>{
 const s=empty();s.orders=[{id:'current',title:'Site duties',version:3,site_id:'site'}];s.receipts=[{order_id:'previous'}];let r=buildControlQueue(s,'u','2026-10-23');assert.equal(r.length,1);assert.equal(r[0].title,'Site duties · v3');assert.equal(r[0].section,'aegis-orders');s.receipts.push({order_id:'current'});assert.deepEqual(buildControlQueue(s,'u','2026-10-23'),[]);
});
test('source identifiers survive categorisation and equal-priority order is deterministic',()=>{
 const s=empty();s.reports=[{id:'b',title:'Second',stage:'submitted',created_by:'v'},{id:'a',title:'First',stage:'submitted',created_by:'u'}];const r=buildControlQueue(s,'u','2026-10-23');assert.deepEqual(r.map(x=>x.sourceRef),['a','b']);assert.ok(r.every(x=>x.section==='aegis-reports'&&!x.mine));assert.deepEqual(buildControlQueue(empty(),'u','2026-10-23'),[]);
});
