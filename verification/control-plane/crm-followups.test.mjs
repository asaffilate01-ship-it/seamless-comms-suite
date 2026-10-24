import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readDealFollowUps } from '../../src/modules/crm/followups.server.ts';
const dealId='11111111-1111-4111-8111-111111111111';
const now=new Date('2026-10-24T12:00:00Z');
function database(tasks, deals=[{id:dealId,tenant_id:'a',title:'Deal',status:'open'}], failTable='') {
 return {from(table){let rows=[...(table==='crm_tasks'?tasks:deals)];const orders=[];let range=null;
 const q={select(){return q;},eq(k,v){rows=rows.filter(r=>r[k]===v);return q;},in(k,vs){rows=rows.filter(r=>vs.includes(r[k]));return q;},lt(k,v){rows=rows.filter(r=>r[k]!==null&&r[k]<v);return q;},gte(k,v){rows=rows.filter(r=>r[k]!==null&&r[k]>=v);return q;},is(k,v){rows=rows.filter(r=>r[k]===v);return q;},order(k,o){orders.push([k,o]);return q;},range(a,b){range=[a,b];return q;},then(resolve){rows.sort((a,b)=>{for(const [k,o] of orders){if(a[k]===b[k])continue;if(a[k]==null)return o.nullsFirst?-1:1;if(b[k]==null)return o.nullsFirst?1:-1;return (a[k]<b[k]?-1:1)*(o.ascending?1:-1);}return 0;});if(range)rows=rows.slice(range[0],range[1]+1);return Promise.resolve({data:rows,error:table===failTable?{message:'failure'}:null}).then(resolve);}};return q;}};
}
const task=(id,due_at,extra={})=>({id,tenant_id:'a',title:id,status:'open',related_type:'opportunity',related_id:dealId,due_at,...extra});
test('filters use server cutoff, retain exact-boundary upcoming and isolate tenant/type/status',async()=>{
 const rows=[task('old','2026-10-23T12:00:00Z'),task('now',now.toISOString()),task('none',null),task('foreign','2026-10-22T12:00:00Z',{tenant_id:'b'}),task('done','2026-10-22T12:00:00Z',{status:'completed'}),task('person','2026-10-22T12:00:00Z',{related_type:'person'})];
 for(const [filter,expected] of [['overdue',['old']],['upcoming',['now']],['undated',['none']]]){
 const result=await readDealFollowUps(database(rows),'a',filter,0,now);assert.deepEqual(result.rows.map(r=>r.id),expected);assert.equal(result.asOf,now.toISOString());}
});
test('server pagination reaches beyond 500 tasks and uses a sentinel without returning it',async()=>{
 const rows=Array.from({length:528},(_,i)=>task(String(i).padStart(4,'0'),null));
 const page=await readDealFollowUps(database(rows),'a','all',20,now);
 assert.equal(page.rows.length,25);assert.equal(page.rows[0].id,'0500');assert.equal(page.hasMore,true);
 const last=await readDealFollowUps(database(rows),'a','all',21,now);assert.equal(last.rows.length,3);assert.equal(last.hasMore,false);
});
test('missing/invalid/cross-tenant links remain unavailable; query errors fail closed',async()=>{
 const rows=[task('valid',null),task('malformed',null,{related_id:'bad-id'})];
 const result=await readDealFollowUps(database(rows,[{id:dealId,tenant_id:'b',title:'Secret'}]),'a','all',0,now);
 assert(result.rows.every(r=>r.deal===null));
 await assert.rejects(()=>readDealFollowUps(database(rows,[],'crm_tasks'),'a','all',0,now),/Follow-ups could not/);
 await assert.rejects(()=>readDealFollowUps(database(rows,[],'crm_opportunities'),'a','all',0,now),/Linked deals could not/);
});
