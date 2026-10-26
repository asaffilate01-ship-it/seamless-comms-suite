import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadReviewedHandoff} from '../../scripts/lib/product-research-handoff.mjs';
const scope={tenantId:'tenant',projectId:'project',revision:2};
function fixture(options={}){
 const dossier=JSON.parse(readFileSync(new URL('../../docs/factory/examples/product-research.json',import.meta.url),'utf8'));
 dossier.sources[0].review='reviewed';dossier.sources[0].reviewer='Local operator';
 const reviews=[{reviewer_id:'owner',decision:'reviewed',reviewed_at:'2026-10-25T00:00:00Z'}];
 const state={dossier,reviews,member:true,head:2,reads:0,...options};
 const calls=[];
 const client={from(table){const filters={};let countRequested=false;const q={
 select(columns,opts){countRequested=opts?.count==='exact';return q;},eq(key,value){filters[key]=value;return q;},order(){return q;},limit(){return q;},single(){return q;},maybeSingle(){return q;},
 then(resolve,reject){calls.push({table,filters});let data,count;
 if(filters.tenant_id!=='tenant')data=null;
 else if(table==='tenant_members')data=state.member&&filters.user_id==='user'?{role:'viewer'}:null;
 else if(table==='product_research_projects'){data=filters.id==='project'?{revision:state.reads++?state.finalHead??state.head:state.head}:null;}
 else if(table==='product_research_revisions')data=filters.project_id==='project'&&filters.revision===2?{dossier:state.dossier}:null;
 else if(table==='product_research_reviews'){data=filters.project_id==='project'&&filters.revision===2?state.reviews:[];count=countRequested?state.count??data.length:null;}
 return Promise.resolve({data,count,error:state.failTable===table?{message:'SECRET upstream error'}:null}).then(resolve,reject);
 }};return q;}};
 return {state,calls,run:(input=scope,user='user')=>loadReviewedHandoff(client,input,user)};
}
test('handoff uses saved data and review attribution without raw evidence or authority',async()=>{
 const f=fixture(),pack=await f.run();
 assert.equal(pack.executable,false);assert.equal(pack.project.revision,2);assert.equal(pack.reviewSnapshot[0].reviewerId,'owner');
 assert.equal(pack.implementation.tasks.length,1);assert.equal(pack.implementation.tasks[0].acceptance.length,3);
 assert.equal(JSON.stringify(pack).includes(f.state.dossier.observations[0].summary),false);
 assert.equal(JSON.stringify(pack).includes(f.state.dossier.sources[0].url),false);
 assert.ok(f.calls.every(c=>c.filters.tenant_id==='tenant'));
});
test('handoff rejects missing membership and foreign projects/tenants',async()=>{
 await assert.rejects(fixture({member:false}).run(),/access required/);
 await assert.rejects(fixture().run({...scope,tenantId:'other'}),/access required/);
 await assert.rejects(fixture().run({...scope,projectId:'other'}),/latest saved/);
 await assert.rejects(fixture().run(scope,''),/access required/);
});
test('handoff rejects missing reviews and requested changes',async()=>{
 await assert.rejects(fixture({reviews:[]}).run(),/authenticated review/);
 const f=fixture();f.state.reviews.push({reviewer_id:'other',decision:'changes_requested'});
 await assert.rejects(f.run(),/requested changes/);
});
test('handoff fails closed if review result is truncated or unavailable',async()=>{
 await assert.rejects(fixture({count:1001}).run(),/Complete review records/);
 await assert.rejects(fixture({failTable:'product_research_reviews'}).run(),/Complete review records/);
});
test('handoff rejects stale revisions and concurrent saves',async()=>{
 await assert.rejects(fixture({head:3}).run(),/latest saved/);
 await assert.rejects(fixture({finalHead:3}).run(),/changed during export/);
});
test('handoff requires ready evidence and selected features',async()=>{
 const pending=fixture();pending.state.dossier.sources[0].review='pending';await assert.rejects(pending.run(),/source reviews/);
 const inferred=fixture();inferred.state.dossier.observations[0].kind='inferred';await assert.rejects(inferred.run(),/inferred evidence/);
 const empty=fixture();empty.state.dossier.features[0].decision='defer';await assert.rejects(empty.run(),/at least one feature/);
});
test('handoff propagates safe errors without backend details',async()=>{
 await assert.rejects(fixture({failTable:'product_research_revisions'}).run(),e=>e.message==='Saved research revision unavailable');
});
