import test from 'node:test';
import assert from 'node:assert/strict';
import {readSourceRecord} from '../../src/modules/aegis/source-record.ts';
function mock(record={id:'source'},events=[],recordError=null,historyError=null){const calls=[];return {calls,from(table){const call={table,filters:[],sorts:[]};calls.push(call);const q={select(value){call.select=value;return q},eq(k,v){call.filters.push([k,v]);return q},order(k,o){call.sorts.push([k,o]);return q},async maybeSingle(){return {data:record,error:recordError}},async range(a,b){call.range=[a,b];return {data:events,error:historyError}}};return q}}}
test('each source maps to a fixed table and history foreign key with explicit tenant filters',async()=>{
 const plans=[['incident','aegis_operations','aegis_operation_events','operation_id'],['corrective','aegis_corrective_actions','aegis_corrective_events','action_id'],['handover','aegis_handovers','aegis_handover_events','handover_id'],['report','aegis_reports','aegis_report_events','report_id'],['instructions','aegis_post_orders_status','aegis_post_order_receipts','order_id']];
 for(const [kind,table,history,key] of plans){const db=mock();await readSourceRecord(db,'tenant',kind,'source',0);assert.equal(db.calls[0].table,table);assert.deepEqual(db.calls[0].filters.slice(0,2),[['tenant_id','tenant'],['id','source']]);assert.equal(db.calls[1].table,history);assert.deepEqual(db.calls[1].filters,[['tenant_id','tenant'],[key,'source']]);if(kind==='incident')assert.ok(db.calls[0].filters.some(([k,v])=>k==='kind'&&v==='incident'))}
});
test('unknown/prototype kinds and invalid pages never query a table',async()=>{
 const db=mock();for(const kind of ['__proto__','constructor','arbitrary_table'])await assert.rejects(()=>readSourceRecord(db,'t',kind,'s',0),/Invalid source request/);for(const page of [-1,1.5,10001,Infinity])await assert.rejects(()=>readSourceRecord(db,'t','report','s',page),/Invalid source request/);assert.equal(db.calls.length,0);
});
test('missing or denied records share an error and never query history',async()=>{
 for(const db of [mock(null),mock(null,[],{message:'permission denied'})]){await assert.rejects(()=>readSourceRecord(db,'t','report','s',0),/^Error: Source record unavailable or access denied$/);assert.equal(db.calls.length,1)}
});
test('history pagination uses an extra row for hasMore without returning it',async()=>{
 const events=Array.from({length:26},(_,i)=>({id:'event'+i})),db=mock({id:'s'},events);const r=await readSourceRecord(db,'t','handover','s',2);assert.deepEqual(db.calls[1].range,[50,75]);assert.equal(r.history.length,25);assert.equal(r.hasMore,true);assert.equal(r.page,2);assert.equal(r.pageSize,25);assert.deepEqual(db.calls[1].sorts,[['revision',{ascending:false}],['id',undefined]]);
 const last=await readSourceRecord(mock({id:'s'},events.slice(0,25)),'t','instructions','s',0);assert.equal(last.hasMore,false);
});
test('history failure rejects the inspection instead of presenting incomplete evidence as success',async()=>{
 await assert.rejects(()=>readSourceRecord(mock({id:'s'},[],null,{message:'offline'}),'t','corrective','s',0),/Source history unavailable/);
 const db=mock({id:'s'},[]);const r=await readSourceRecord(db,'t','instructions','s',0);assert.deepEqual(r.history,[]);assert.equal(db.calls[1].sorts[0][0],'recorded_at');
});
