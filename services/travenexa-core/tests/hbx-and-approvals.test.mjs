import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHotelbedsSandboxClient, normalizeHotelbedsRates,
  hotelbedsSignature, HotelbedsSandboxError } from '../hbx-hotels-sandbox.mjs';
import { supplierApprovalValid, canPresentOffer,
  createPostgresSupplierApprovalReader } from '../supplier-approvals.mjs';

const TENANT='travenexa-flightlounge';
const future=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
const validApproval=(props={})=>({
 tenant_key:TENANT,supplier_key:'hotelbeds',product_type:'hotels',
 status:'approved',active:true,contract_approved:true,credentials_verified:true,
 travel_compliance_approved:true,payment_approved:true,servicing_approved:true,
 multi_brand_permission:true,ticketing_approved:true,
 payment_mode:'platform_checkout',merchant_of_record:'travenexa',
 valid_until:null,...props,
});
const apiKey='sandboxApiKeyExampleOnly',apiSecret='sandboxSecretExampleOnly';
const hotelReply={
 hotels:{hotels:[{code:3424,name:'Test Hotel',currency:'GBP',
 rooms:[{code:'DBL.ST',name:'Double room',rates:[
  {rateKey:'20261020|3424|SAMPLE-A',net:'120.50',rateType:'RECHECK',
   paymentType:'AT_WEB',packaging:false,taxes:{allIncluded:true},
   cancellationPolicies:[{amount:'120.50',from:'2026-10-19'}]},
  {rateKey:'20261020|3424|SAMPLE-B',net:'150.00',rateType:'BOOKABLE',
   packaging:true},
 ]}]}]},
};
const fakeFetch=({body=hotelReply,status=200}={})=>{
 const calls=[];
 return {calls,fetchImpl:async (url,options)=>{
   calls.push({url,options});
   return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 }};
};
test('approval reader scopes precise tenant, supplier and product, not just a configured API key',async()=>{
 const evidence=validApproval();
 assert.equal(supplierApprovalValid(evidence,
   {tenantId:TENANT,supplierKey:'hotelbeds',productType:'hotels'}),true);
 assert.equal(supplierApprovalValid({...evidence,active:false},
   {tenantId:TENANT,supplierKey:'hotelbeds',productType:'hotels'}),false);
 assert.equal(supplierApprovalValid({...evidence,contract_approved:false},
   {tenantId:TENANT,supplierKey:'hotelbeds',productType:'hotels'}),false);
 assert.equal(supplierApprovalValid({...evidence,valid_until:new Date(Date.now()-1000).toISOString()},
   {tenantId:TENANT,supplierKey:'hotelbeds',productType:'hotels'}),false);
 assert.equal(supplierApprovalValid(evidence,
   {tenantId:'travenexa-marocways',supplierKey:'hotelbeds',productType:'hotels'}),false);
 assert.equal(canPresentOffer(evidence,'platform_checkout'),true);
 assert.equal(canPresentOffer(evidence,'supplier_checkout'),false);
 const calls=[];
 const db={async query(sql,params){calls.push({sql,params});return {rows:[evidence]};}};
 const reader=createPostgresSupplierApprovalReader({db});
 assert.deepEqual(await reader({tenantId:TENANT,supplierKey:'hotelbeds',productType:'hotels'}),evidence);
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0].params,[TENANT,'hotelbeds','hotels']);
 assert.equal(await reader({tenantId:'forged-tenant',supplierKey:'hotelbeds',productType:'hotels'}),null);
 assert.equal(calls.length,1);
});
test('supplier-managed affiliate and checkout require merchant of record to be the supplier',()=>{
 const evidence=validApproval({payment_mode:'supplier_checkout',merchant_of_record:'supplier',
   ticketing_approved:false});
 assert.equal(canPresentOffer(evidence,'affiliate'),true);
 assert.equal(canPresentOffer(evidence,'supplier_checkout'),true);
 assert.equal(canPresentOffer(evidence,'platform_checkout'),false);
 assert.equal(supplierApprovalValid({...evidence,merchant_of_record:'travenexa'},
   {tenantId:TENANT,supplierKey:'hotelbeds',productType:'hotels'}),false);
});
test('Hotelbeds signature exactly matches its documented SHA256(key + secret + Unix seconds)',()=>{
 const stamp=1792150000;
 assert.equal(hotelbedsSignature(apiKey,apiSecret,stamp),
   createHash('sha256').update(apiKey+apiSecret+stamp).digest('hex'));
 assert.throws(()=>hotelbedsSignature(apiKey,'',stamp),HotelbedsSandboxError);
});
test('Hotelbeds sandbox status uses fixed official endpoint and redacts credentials from result',async()=>{
 const recorder=fakeFetch({body:{status:'OK'}});
 const timestamp=1792150000000;
 const client=createHotelbedsSandboxClient({apiKey,apiSecret,
   fetchImpl:recorder.fetchImpl,now:()=>timestamp});
 const reply=await client.status();
 assert.deepEqual(reply,{environment:'sandbox',responseReceived:true,bookingsEnabled:false});
 const [{url,options}]=recorder.calls;
 assert.equal(url,'https://api.test.hotelbeds.com/hotel-api/1.0/status');
 assert.equal(options.method,'GET');
 assert.equal(options.redirect,'error');
 assert.equal(options.headers['Api-key'],apiKey);
 assert.equal(options.headers['X-Signature'],hotelbedsSignature(apiKey,apiSecret,
   Math.floor(timestamp/1000)));
 assert.equal(JSON.stringify(reply).includes(apiSecret),false);
 assert.equal('createOrder' in client,false);
 assert.equal('book' in client,false);
});
test('Hotelbeds availability matches official Hotels Booking API payload and no sale is possible',async()=>{
 const r=fakeFetch();
 const client=createHotelbedsSandboxClient({apiKey,apiSecret,fetchImpl:r.fetchImpl});
 const result=await client.availabilityByHotelCodes({hotelCodes:[3424,168],checkIn:future,nights:3,adults:2});
 assert.equal(result.customerBookable,false);
 assert.equal(result.rates.length,1); // explicitly blocks package-only rates
 assert.equal(result.rates[0].netMinor,12050);
 assert.equal(result.rates[0].rateType,'RECHECK');
 assert.equal(result.rates[0].currency,'GBP');
 assert.equal(result.rates[0].customerBookable,false);
 const {url,options}=r.calls[0];
 assert.equal(url,'https://api.test.hotelbeds.com/hotel-api/1.0/hotels');
 assert.equal(options.method,'POST');
 const request=JSON.parse(options.body);
 assert.deepEqual(request.hotels.hotel,[3424,168]);
 assert.deepEqual(request.occupancies,[{rooms:1,adults:2,children:0}]);
 assert.equal(request.stay.checkIn,future);
 assert.equal(request.stay.checkOut,new Date(Date.parse(future)+3*86400000).toISOString().slice(0,10));
});
test('Hotelbeds CheckRate never creates hotel bookings and rejects invalid rate keys',async()=>{
 const r=fakeFetch();
 const client=createHotelbedsSandboxClient({apiKey,apiSecret,fetchImpl:r.fetchImpl});
 await client.checkRate('20261020|3424|SAMPLE-A');
 assert.equal(r.calls[0].url,'https://api.test.hotelbeds.com/hotel-api/1.0/checkrates');
 assert.deepEqual(JSON.parse(r.calls[0].options.body),{rooms:[{rateKey:'20261020|3424|SAMPLE-A'}]});
 await assert.rejects(()=>client.checkRate('x'),/invalid_rate_key/);
 await assert.rejects(()=>client.availabilityByHotelCodes({hotelCodes:[3424,3424],
   checkIn:future,nights:2,adults:2}),/invalid_availability_request/);
 await assert.rejects(()=>client.availabilityByHotelCodes({hotelCodes:[3424],
   checkIn:future,nights:0,adults:2}),/invalid_availability_request/);
 assert.equal(r.calls.length,1);
});
test('Hotelbeds wholesale rates with missing price, wrong currency, packaging or unsafe decimal are not quoted',()=>{
 const response={hotels:{hotels:[{code:18,name:'X',currency:'JPY',
   rooms:[{rates:[
    {rateKey:'a valid rate key!',rateType:'BOOKABLE',net:'100.50'},
    {rateKey:'another valid key',rateType:'BOOKABLE',net:'100',packaging:true},
    {rateKey:'third valid key 1',rateType:'BOOKABLE',net:'150'},
   ]}]}]}};
 const rates=normalizeHotelbedsRates(response);
 assert.equal(rates.length,1);
 assert.equal(rates[0].netMinor,150);
 assert.equal(rates[0].currency,'JPY');
});
test('Hotelbeds always fails closed on bad HTTP, malformed JSON and excessive responses',async()=>{
 const denied=createHotelbedsSandboxClient({apiKey,apiSecret,
   fetchImpl:async()=>new Response('not allowed',{status:403})});
 await assert.rejects(()=>denied.status(),/http_upstream_unavailable/);
 const invalid=createHotelbedsSandboxClient({apiKey,apiSecret,
   fetchImpl:async()=>new Response('not valid json',{status:200})});
 await assert.rejects(()=>invalid.status(),/invalid_json_response/);
 const oversized=createHotelbedsSandboxClient({apiKey,apiSecret,
   fetchImpl:async()=>new Response('{}',{status:200,
     headers:{'content-length':'4000000'}})});
 await assert.rejects(()=>oversized.status(),/response_too_large/);
});

test('a single-hotel CheckRate response is still internal wholesale evidence',()=>{
  const single=normalizeHotelbedsRates({hotel:hotelReply.hotels.hotels[0]});
  assert.equal(single.length,1);
  assert.equal(single[0].netMinor,12050);
  assert.equal(single[0].customerBookable,false);
});

test('approval reader forwards cancellation and rejects late approval rows',async()=>{
 const controller=new AbortController();let calls=0,received,release;
 const reader=createPostgresSupplierApprovalReader({db:{query:async(sql,params,{signal})=>{
  calls++;received=signal;return new Promise(resolve=>{release=resolve;});
 }}});
 const scope={tenantId:TENANT,supplierKey:'hotelbeds',productType:'hotels'};
 const pending=reader(scope,{signal:controller.signal});
 assert.equal(received,controller.signal);controller.abort();
 release({rows:[validApproval()]});assert.equal(await pending,null);
 assert.equal(await reader(scope,{signal:controller.signal}),null);assert.equal(calls,1);
});
