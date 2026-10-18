import test from 'node:test';
import assert from 'node:assert/strict';
import { createTravelEngine } from '../engine.mjs';
import { createServer } from '../server.mjs';
import { TRAVEL_AI_TOOLS, runTravelAiTool } from '../omniqora-tools.mjs';
import { TENANTS, SUPPLIERS } from '../catalog.mjs';
import { calculateSellPrice, checkoutReadiness, validTravelDate, validateSearch,
  validatedHttpsRedirect } from '../policy.mjs';

const TOKENS={
  'travenexa.uk-inbound.us':'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'travenexa.uk-inbound.kr':'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'travenexa-flightlounge':'cccccccccccccccccccccccccccccccc',
  'travenexa-route50':'dddddddddddddddddddddddddddddddd',
};

const approvedReader=async ({tenantId,supplierKey,productType})=>({
  tenant_key:tenantId,supplier_key:supplierKey,product_type:productType,
  status:'approved',active:true,contract_approved:true,credentials_verified:true,
  travel_compliance_approved:true,payment_approved:true,
  servicing_approved:true,multi_brand_permission:true,
  ticketing_approved:false,payment_mode:'supplier_checkout',
  merchant_of_record:'supplier',valid_until:null,
});
const future=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
const payload={
  sourceMarket:'US',destinationCountry:'GB',productType:'airport',
  travelDate:future,arrivalTime:'14:00',travellers:2,from:'LHR',to:'London',
  locale:'en-US',displayCurrency:'USD',
};
const supplierOffer=()=>({
  offerId:'PARTNER-1',title:'Airport transfer',verified:true,live:true,
  totalMinor:15000,currency:'GBP',expiresAt:new Date(Date.now()+5*60000).toISOString(),
  bookingMode:'affiliate',affiliateRedirect:'https://partner.example/checkout?id=1',
});
function goodAdapter(overrides={}){
  return {id:'mozio',connected:true,contractApproved:true,credentialsVerified:true,
    legalApproved:true,affiliateApproved:true,tenantIds:['travenexa.uk-inbound.us'],
    products:['transfers'],redirectHosts:['partner.example'],
    search:async()=>[supplierOffer()],...overrides};
}
test('sole landlord tenant model and catalogue contain no falsely active suppliers',()=>{
  assert(!Object.hasOwn(TENANTS,'travenexa'));
  assert(TENANTS['travenexa-route50']);
  assert.deepEqual(TENANTS['travenexa-route50'].products,[]);
  assert(SUPPLIERS.length>=15);
  assert(SUPPLIERS.every(s=>s.status==='catalogue_only'));
});
test('market-site legacy products normalize to permitted UK-only products',()=>{
  const valid=validateSearch(payload,'travenexa.uk-inbound.us');
  assert.equal(valid.productType,'transfers');
  assert.equal(valid.destinationCountry,'GB');
  assert.equal(validateSearch({...payload,destinationCountry:'US'},'travenexa.uk-inbound.us'),null);
  assert.equal(validateSearch({...payload,sourceMarket:'KR'},'travenexa.uk-inbound.us'),null);
  assert.equal(validateSearch({...payload,locale:'ko-KR'},'travenexa.uk-inbound.us'),null);
  assert.equal(validateSearch({...payload,displayCurrency:'GBP'},'travenexa.uk-inbound.us'),null);
  assert.equal(validateSearch({...payload,productType:'flights'},'travenexa.uk-inbound.us'),null);
  assert.equal(validateSearch({...payload,productType:'flights'},'travenexa-route50'),null);
});
test('global brands allow international inbound/outbound; invalid dates blocked',()=>{
  const global=validateSearch({...payload,sourceMarket:'MA',destinationCountry:'FR',
    productType:'flights',from:'CMN',to:'CDG',locale:'fr-FR',displayCurrency:'EUR'},
    'travenexa-flightlounge');
  assert.equal(global.destinationCountry,'FR');
  assert.equal(global.sourceMarket,'MA');
  assert.equal(validTravelDate('2027-02-30'),false);
  assert.equal(validateSearch({...payload,travelDate:'2027-02-30'},'travenexa.uk-inbound.us'),null);
  assert.equal(validateSearch({...payload,travellers:0},'travenexa.uk-inbound.us'),null);
});
test('supplier checkout URLs are strictly host allowlisted',()=>{
  assert.equal(validatedHttpsRedirect('https://partner.example/reservation',['partner.example']),
    'https://partner.example/reservation');
  for (const url of ['http://partner.example','https://partner.example.evil.test/',
    'https://user:pass@partner.example/','https://partner.example:8443/','javascript:alert(1)']){
    assert.equal(validatedHttpsRedirect(url,['partner.example']),null);
  }
  assert.equal(validatedHttpsRedirect('https://partner.example/',[]),null);
});
test('currency minor units, markups, supplier-owned prices and checkout gates',()=>{
  assert.equal(calculateSellPrice({supplierMinor:20000,currencyCode:'GBP',markupMinor:1000,
    allowMarkup:true,bookingMode:'platform_checkout'}).amount,210);
  assert.equal(calculateSellPrice({supplierMinor:20000,currencyCode:'JPY',markupMinor:1000,
    allowMarkup:true,bookingMode:'platform_checkout'}).amount,21000);
  assert.equal(calculateSellPrice({supplierMinor:20000,currencyCode:'GBP',markupMinor:1000,
    allowMarkup:true,bookingMode:'affiliate'}),null);
  assert.equal(checkoutReadiness({}).enabled,false);
  assert(checkoutReadiness({paymentMode:'platform_split'}).blockers.includes('adyen_platform_onboarding_required'));
});
test('fail closed unless legal, contract, credential and tenant gates all pass',async()=>{
  const engine=createTravelEngine({tenantTokens:TOKENS,approvalReader:approvedReader,adapters:[goodAdapter({legalApproved:false})]});
  assert.equal((await engine.search('travenexa.uk-inbound.us',payload)).reason,'supplier_not_connected');
  assert.equal((await createTravelEngine({tenantTokens:TOKENS}).search('travenexa.uk-inbound.us',payload))
    .reason,'supplier_not_connected');
  assert.equal((await createTravelEngine({tenantTokens:TOKENS,approvalReader:approvedReader,adapters:[
    goodAdapter({tenantIds:['travenexa.uk-inbound.kr']})]}).search('travenexa.uk-inbound.us',payload))
    .reason,'supplier_not_connected');
});
test('verified supplier test adapter produces a valid offer with no invented FX or payment',async()=>{
  const engine=createTravelEngine({tenantTokens:TOKENS,approvalReader:approvedReader,adapters:[goodAdapter()]});
  const result=await engine.search('travenexa.uk-inbound.us',payload);
  assert.equal(result.httpStatus,200);
  assert.equal(result.status,'live');
  assert.equal(result.offers.length,1);
  const [offer]=result.offers;
  assert.equal(offer.amount,150);
  assert.equal(offer.currency,'GBP');
  assert.equal(offer.presentationCurrency,'USD');
  assert.equal(offer.affiliateRedirect,'https://partner.example/checkout?id=1');
  assert.equal(offer.supplierName,'Mozio');
  assert.equal(offer.priceProvenance,'contracted_live_supplier');
  assert.equal(engine.bookingPreflight('travenexa.uk-inbound.kr',offer.id).httpStatus,404);
  assert.equal(engine.bookingPreflight('travenexa.uk-inbound.us',offer.id).reason,'booking_not_enabled');
  assert.equal((await engine.readiness('travenexa.uk-inbound.us')).bookingsEnabled,false);
});
test('unverified, expired and unsafe affiliate offers never reach the customer',async()=>{
  const adapter=goodAdapter({search:async()=>[
    {...supplierOffer(),verified:false},
    {...supplierOffer(),expiresAt:new Date(Date.now()-60000).toISOString()},
    {...supplierOffer(),affiliateRedirect:'https://evil.test/pay'},
  ]});
  const result=await createTravelEngine({tenantTokens:TOKENS,approvalReader:approvedReader,adapters:[adapter]})
    .search('travenexa.uk-inbound.us',payload);
  assert.equal(result.status,'live');
  assert.deepEqual(result.offers,[]);
});
test('HTTP API authenticates tenant tokens and agrees with the existing UK-inbound contract',async()=>{
  const engine=createTravelEngine({tenantTokens:TOKENS,approvalReader:approvedReader,adapters:[goodAdapter()]});
  const server=createServer({engine});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try {
    const post=(url,token,market,body=payload)=>fetch(base+url,{
      method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,
        'X-Travenexa-Market':market},body:JSON.stringify(body),
    });
    assert.equal((await post('/v1/inbound-uk/search',TOKENS['travenexa.uk-inbound.kr'],'US')).status,401);
    assert.equal((await post('/v1/inbound-uk/search',TOKENS['travenexa.uk-inbound.us'],'US',
      {...payload,sourceMarket:'KR'})).status,400);
    const valid=await post('/v1/inbound-uk/search',TOKENS['travenexa.uk-inbound.us'],'US');
    assert.equal(valid.status,200);
    const data=await valid.json();
    assert.equal(data.offers[0].supplierName,'Mozio');
    const health=await fetch(base+'/healthz');
    assert.equal((await health.json()).bookingsEnabled,false);
    const blocked=await fetch(base+'/v1/travel/booking-preflight',{
      method:'POST',headers:{'Content-Type':'application/json',
        'Authorization':'Bearer '+TOKENS['travenexa.uk-inbound.us'],
        'X-Travenexa-Tenant':'travenexa.uk-inbound.us'},
      body:JSON.stringify({offerId:data.offers[0].id}),
    });
    assert.equal(blocked.status,503);
    const blockedData=await blocked.json();
    assert.equal(blockedData.reason,'booking_not_enabled');
    assert.equal((await fetch(base+'/v1/travel/book',{method:'POST'})).status,404);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
test('production engine rejects weak/duplicated tenant bearer tokens',()=>{
  assert.throws(()=>createTravelEngine({tenantTokens:{'travenexa-flightlounge':'short'}}));
  assert.throws(()=>createTravelEngine({tenantTokens:{
    'travenexa-flightlounge':'a'.repeat(24),'travenexa-route50':'a'.repeat(24),
  }}));
});

test('Omniqora tool surface stays read-only and respects tenant/currency boundaries',async()=>{
  assert.deepEqual(TRAVEL_AI_TOOLS.map(x=>x.name),['travel.search','travel.compare']);
  assert(TRAVEL_AI_TOOLS.every(x=>x.effect==='read_only'));
  const engine=createTravelEngine({tenantTokens:TOKENS,approvalReader:approvedReader,adapters:[goodAdapter()]});
  const blocked=await runTravelAiTool(engine,'travenexa.uk-inbound.us',
    {tool:'travel.booking.submit',input:payload});
  assert.equal(blocked.httpStatus,403);
  const compare=await runTravelAiTool(engine,'travenexa.uk-inbound.us',
    {tool:'travel.compare',input:payload});
  assert.equal(compare.httpStatus,200);
  assert.equal(compare.comparisons[0].currency,'GBP');
  assert.equal(compare.comparisons[0].priceComparisonScope,'within_currency_only');
  assert.match(compare.notice,/not a TraveNexa package/);
  const denied=await runTravelAiTool(engine,'travenexa.uk-inbound.kr',
    {tool:'travel.search',input:payload});
  assert.equal(denied.reason,'invalid_search');
});

test('a configured adapter without a persisted approval cannot show prices or claim connected',async()=>{
  const engine=createTravelEngine({tenantTokens:TOKENS,adapters:[goodAdapter()]});
  assert.equal((await engine.search('travenexa.uk-inbound.us',payload)).reason,'supplier_not_connected');
  assert.deepEqual((await engine.readiness('travenexa.uk-inbound.us')).eligibleSuppliers,[]);
});
test('approved supplier-hosted checkout provides only its allowlisted URL, not an Adyen charge',async()=>{
  const offer={...supplierOffer(),bookingMode:'supplier_checkout',
    supplierCheckoutUrl:'https://partner.example/checkout/supplier-payment',affiliateRedirect:undefined};
  const adapter=goodAdapter({affiliateApproved:false,checkoutApproved:true,
    servicingApproved:true,search:async()=>[offer]});
  const engine=createTravelEngine({tenantTokens:TOKENS,approvalReader:approvedReader,adapters:[adapter]});
  const response=await engine.search('travenexa.uk-inbound.us',payload);
  assert.equal(response.offers.length,1);
  assert.equal(response.offers[0].supplierCheckoutUrl,offer.supplierCheckoutUrl);
  assert.equal(response.offers[0].supplierResponsible,true);
  assert.equal(response.offers[0].affiliateRedirect,undefined);
  assert.equal(response.offers[0].amount,150);
  assert.equal((await engine.readiness('travenexa.uk-inbound.us')).bookingsEnabled,false);
});
test('supplier-managed checkout rejects hidden platform markups and unsafe destinations',async()=>{
  const offer={...supplierOffer(),bookingMode:'supplier_checkout',
    supplierCheckoutUrl:'https://phishing.test/capture',affiliateRedirect:undefined};
  const adapter=goodAdapter({checkoutApproved:true,servicingApproved:true,search:async()=>[offer]});
  const engine=createTravelEngine({tenantTokens:TOKENS,approvalReader:approvedReader,adapters:[adapter]});
  assert.deepEqual((await engine.search('travenexa.uk-inbound.us',payload)).offers,[]);
  assert.equal(calculateSellPrice({supplierMinor:20000,currencyCode:'GBP',markupMinor:1000,
    allowMarkup:true,bookingMode:'supplier_checkout'}),null);
});
