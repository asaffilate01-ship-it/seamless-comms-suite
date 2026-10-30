import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfferRefresh,baggageServices} from '../flightlounge/offer-refresh.mjs';
import {normalizeOffer} from '../flightlounge/live-search.mjs';
import {createServer} from '../server.mjs';
const tenant='travenexa-flightlounge',at=Date.parse('2026-10-26T12:00:00Z');
const query={legs:[{origin:'LHR',destination:'ISB',departure_date:'2026-11-20'}],adults:1,cabin:'economy',maxConnections:1,checkedBags:1};
const supplier=()=>({id:'off_fixture',live_mode:true,total_amount:'250.00',total_currency:'GBP',expires_at:'2026-10-26T13:00:00Z',passengers:[{id:'pas_1',given_name:'Never expose'}],slices:[{segments:[{id:'seg_1',origin:{iata_code:'LHR'},destination:{iata_code:'ISB'},departing_at:'2026-11-20T09:00:00',arriving_at:'2026-11-20T20:00:00',operating_carrier:{name:'Fixture airline'},operating_carrier_flight_number:'123',passengers:[{cabin_class:'economy',baggages:[{type:'checked',quantity:1}]}]}]}],available_services:[{id:'ase_1',type:'baggage',total_amount:'30.00',total_currency:'GBP',maximum_quantity:1,passenger_ids:['pas_1'],segment_ids:['seg_1'],metadata:{type:'checked',maximum_weight_kg:23}}]});
function setup(overrides={}){const original=supplier(),calls=[];const record={tenantId:tenant,offerRef:'ref_1',query,offer:normalizeOffer(original,query,at)};const service=createOfferRefresh({now:()=>at,authorize:async()=>({allowed:true,tenantId:tenant,supplier:'duffel'}),loadOffer:async()=>record,secretReader:async()=> 'duffel_live_fixture_only',audit:async()=>{},fetchImpl:async(url,init)=>{calls.push({url,init});return {ok:true,text:async()=>JSON.stringify({data:original})}},...overrides});return {service,calls,record};}
test('default and unauthorized refresh fail closed',async()=>{assert.equal((await createOfferRefresh().refresh(tenant,{offerRef:'ref_1'})).httpStatus,503);const s=setup({authorize:async()=>({allowed:false})});assert.equal((await s.service.refresh(tenant,{offerRef:'ref_1'})).httpStatus,403);assert.equal(s.calls.length,0);});
test('reject browser prices, arbitrary URLs and wrong tenants before calls',async()=>{const s=setup();for(const r of [{offerRef:'https://evil'},{offerRef:'ref_1',amount:1},null])assert.equal((await s.service.refresh(tenant,r)).httpStatus,400);assert.equal((await s.service.refresh('other',{offerRef:'ref_1'})).httpStatus,403);assert.equal(s.calls.length,0);});
test('unknown or cross-tenant records are inaccessible',async()=>{for(const record of [null,{tenantId:'other',offerRef:'ref_1'}]){const s=setup({loadOffer:async()=>record});assert.equal((await s.service.refresh(tenant,{offerRef:'ref_1'})).httpStatus,404);assert.equal(s.calls.length,0);}});
test('expired quotes and sandbox credentials never reach supplier',async()=>{const s=setup();s.record.offer.expiresAt='2020-01-01';assert.equal((await s.service.refresh(tenant,{offerRef:'ref_1'})).httpStatus,409);assert.equal(s.calls.length,0);const t=setup({secretReader:async()=> 'duffel_test_fixture'});assert.equal((await t.service.refresh(tenant,{offerRef:'ref_1'})).httpStatus,503);assert.equal(t.calls.length,0);});
test('GET requests fixed provider with services and returns no passenger PII or final total',async()=>{const s=setup(),r=await s.service.refresh(tenant,{offerRef:'ref_1'});assert.equal(r.status,'live');assert.equal(r.requiresReview,false);assert.equal(r.costs.finalTotal,null);assert.equal(r.availableCheckedBagServices[0].maximumWeightKg,23);assert.deepEqual(r.availableCheckedBagServices[0].passengers,[1]);assert.equal(r.bookingsEnabled,false);assert.ok(!JSON.stringify(r).includes('Never expose'));assert.match(s.calls[0].url,/^https:\/\/api.duffel.com\/air\/offers\/off_fixture\?return_available_services=true$/);assert.equal(s.calls[0].init.method,'GET');assert.equal(s.calls[0].init.redirect,'error');});
test('price, itinerary, currency and baggage changes require review',async()=>{const o=supplier();o.total_amount='260.00';o.total_currency='EUR';o.slices[0].segments[0].departing_at='2026-11-20T10:00:00';o.slices[0].segments[0].passengers[0].baggages=[];const s=setup({fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({data:o})})});const r=await s.service.refresh(tenant,{offerRef:'ref_1'});assert.equal(r.requiresReview,true);assert.ok(Object.values(r.changes).every(Boolean));});
test('wrong identity, test-mode, expired and route changes cannot be refreshed as matching',async()=>{for(const mutate of [o=>o.id='off_other',o=>o.live_mode=false,o=>o.expires_at='2020-01-01',o=>o.slices[0].segments[0].destination.iata_code='KHI']){const o=supplier();mutate(o);const s=setup({fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({data:o})})});assert.notEqual((await s.service.refresh(tenant,{offerRef:'ref_1'})).status,'live');}});
test('revocation and audit failure discard refreshed output',async()=>{let n=0;const s=setup({authorize:async()=>({allowed:++n===1,tenantId:tenant,supplier:'duffel'})});assert.equal((await s.service.refresh(tenant,{offerRef:'ref_1'})).httpStatus,403);const t=setup({audit:async()=>{throw Error('secret')}});const r=await t.service.refresh(tenant,{offerRef:'ref_1'});assert.ok(!JSON.stringify(r).includes('secret'));assert.equal(t.calls.length,0);});
test('malformed or unsupported baggage options are excluded, duplicates removed',()=>{const o=supplier();o.available_services.push(structuredClone(o.available_services[0]));assert.equal(baggageServices(o).length,1);o.available_services[0].segment_ids=['wrong'];assert.equal(baggageServices(o).length,1);o.available_services[1].total_amount='NaN';assert.equal(baggageServices(o).length,0);});
test('HTTP refresh requires tenant auth and defaults unavailable',async()=>{const server=createServer({engine:{hasConfiguredTenants:()=>true,authenticate:(_,b)=>b==='test'}});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const url=`http://127.0.0.1:${server.address().port}/v1/flights/refresh`,init={method:'POST',headers:{'content-type':'application/json','x-travenexa-tenant':tenant},body:JSON.stringify({offerRef:'ref_1'})};assert.equal((await fetch(url,init)).status,401);assert.equal((await fetch(url,{...init,headers:{...init.headers,authorization:'Bearer test'}})).status,503);}finally{await new Promise(r=>server.close(r));}});

test('selected bags are priced from fresh supplier services, not browser amounts',async()=>{const s=setup(),r=await s.service.refresh(tenant,{offerRef:'ref_1',selectedBaggage:[{id:'ase_1',quantity:1}]});assert.equal(r.status,'live');assert.equal(r.baggageSubtotal.knownSubtotal,'280');assert.equal(r.baggageSubtotal.finalTotal,null);assert.equal(r.offer.amount,250);});
test('changed service inventory requires reselection; selection tampering fails before fetch',async()=>{const s=setup();assert.equal((await s.service.refresh(tenant,{offerRef:'ref_1',selectedBaggage:[{id:'missing',quantity:1}]})).requiresReselection,true);const t=setup();for(const selectedBaggage of [null,[{id:'ase_1',quantity:1,unitAmount:'0'}]])assert.equal((await t.service.refresh(tenant,{offerRef:'ref_1',selectedBaggage})).httpStatus,400);assert.equal(t.calls.length,0);});

test('null ancillary entries preserve valid sibling baggage quotes',async()=>{
 const o=supplier();o.available_services.unshift(null,42,{});
 const s=setup({fetchImpl:async()=>Response.json({data:o})});
 const r=await s.service.refresh(tenant,{offerRef:'ref_1',selectedBaggage:[{id:'ase_1',quantity:1}]});
 assert.equal(r.status,'live');assert.equal(r.baggageSubtotal.knownSubtotal,'280');assert.equal(r.availableCheckedBagServices.length,1);
});
test('ambiguous supplier passenger or segment identities cannot price baggage',()=>{
 for(const mutate of [o=>o.passengers.push({...o.passengers[0]}),o=>o.passengers[0]=null,o=>o.slices[0].segments.push({...o.slices[0].segments[0]}),o=>delete o.slices[0].segments[0].id]){
  const o=supplier();mutate(o);assert.deepEqual(baggageServices(o),[]);
 }
});
test('duplicate baggage scopes are rejected without making extras free',async()=>{
 const o=supplier();o.available_services[0].passenger_ids.push('pas_1');
 const s=setup({fetchImpl:async()=>Response.json({data:o})});
 const r=await s.service.refresh(tenant,{offerRef:'ref_1',selectedBaggage:[{id:'ase_1',quantity:1}]});assert.equal(r.httpStatus,409);assert.equal(r.requiresReselection,true);
});

test('refresh rejects oversized streamed supplier responses and cancels their bodies',async()=>{
 let cancelled=false;const s=setup({fetchImpl:async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(4000001));},cancel(){cancelled=true;}}))});
 const r=await s.service.refresh(tenant,{offerRef:'ref_1'});assert.equal(r.httpStatus,503);assert.equal(r.offer,undefined);assert.equal(cancelled,true);
});
