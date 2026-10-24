import test from 'node:test';
import assert from 'node:assert/strict';
import {readRecordRegister} from '../../src/modules/aegis/record-register.ts';
const id='11111111-1111-4111-8111-111111111111';
function mock(rows=[],error=null){const calls=[];return {calls,from(table){const c={table,filters:[],sorts:[]};calls.push(c);const q={select(columns){c.columns=columns;return q},eq(k,v){c.filters.push([k,v]);return q},order(k,o){c.sorts.push([k,o]);return q},async range(a,b){c.range=[a,b];return {data:rows,error}}};return q}}}
test('fixed tables and tenant filters cover every register category',async()=>{
 const tables={incident:'aegis_operations',corrective:'aegis_corrective_actions',handover:'aegis_handovers',report:'aegis_reports',instructions:'aegis_post_orders_status'};
 for(const [kind,table] of Object.entries(tables)){const db=mock();await readRecordRegister(db,'tenant',kind,'all','',0);assert.equal(db.calls[0].table,table);assert.deepEqual(db.calls[0].filters[0],['tenant_id','tenant']);assert.ok(!db.calls[0].filters.some(([k])=>k==='stage'||k==='status'));if(kind==='incident')assert.ok(db.calls[0].filters.some(([k,v])=>k==='kind'&&v==='incident'));}
});
test('status and exact source filters are applied before pagination',async()=>{
 const db=mock();await readRecordRegister(db,'tenant','corrective','closed',id,3);assert.deepEqual(db.calls[0].filters,[['tenant_id','tenant'],['stage','closed'],['id',id]]);assert.deepEqual(db.calls[0].range,[75,100]);assert.deepEqual(db.calls[0].sorts,[['updated_at',{ascending:false}],['id',undefined]]);
});
test('instruction status translates to current-version evidence rather than an invented stage',async()=>{
 for(const [status,value] of [['current',true],['superseded',false]]){const db=mock();await readRecordRegister(db,'tenant','instructions',status,'',0);assert.deepEqual(db.calls[0].filters,[['tenant_id','tenant'],['is_current',value]]);assert.equal(db.calls[0].sorts[0][0],'created_at');}
});
test('unsupported categories, mismatched statuses and malformed source IDs never query',async()=>{
 const db=mock();for(const kind of ['__proto__','constructor','arbitrary_table'])await assert.rejects(()=>readRecordRegister(db,'t',kind,'all','',0),/Invalid register/);await assert.rejects(()=>readRecordRegister(db,'t','incident','acknowledged','',0),/Status does not belong/);await assert.rejects(()=>readRecordRegister(db,'t','report','all','x,tenant_id.eq.other',0),/complete source UUID/);for(const page of [-1,1.5,Infinity,10001])await assert.rejects(()=>readRecordRegister(db,'t','report','all','',page),/Invalid register/);assert.equal(db.calls.length,0);
});
test('sentinel rows detect another page without dropping terminal records or source identity',async()=>{
 const rows=Array.from({length:26},(_,i)=>({id:id.slice(0,-2)+String(i).padStart(2,'0'),title:'Archived incident',status:'closed',updated_at:'2026-10-24T12:00:00Z'}));const r=await readRecordRegister(mock(rows),'tenant','incident','closed','',1);assert.equal(r.items.length,25);assert.equal(r.hasMore,true);assert.equal(r.items[0].status,'closed');assert.equal(r.items[0].sourceRef,rows[0].id);assert.equal(r.items[0].section,'aegis-operations');assert.equal((await readRecordRegister(mock(rows.slice(0,25)),'tenant','incident','all','',0)).hasMore,false);
});
test('failed reads reject and empty authorised results do not fabricate totals',async()=>{
 await assert.rejects(()=>readRecordRegister(mock([],{message:'offline'}),'tenant','report','all','',0),/register unavailable/);const r=await readRecordRegister(mock([]),'tenant','report','all','',0);assert.deepEqual(r.items,[]);assert.equal(r.hasMore,false);assert.equal(Object.hasOwn(r,'total'),false);
});
