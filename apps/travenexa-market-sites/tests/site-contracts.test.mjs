import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.NODE_ENV='test';
process.env.TRAVENEXA_API_ORIGIN='';
process.env.TRAVENEXA_SERVER_TOKEN='';
process.env.TRAVENEXA_REDIRECT_HOSTS='partner.example';
const gateway=await import('../server.mjs');

const tomorrow=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
function request(market='KR'){
  const tuples={KR:['ko-KR','KRW'],JP:['ja-JP','JPY'],CN:['zh-CN','CNY'],US:['en-US','USD']};
  return {sourceMarket:market,destinationCountry:'GB',locale:tuples[market][0],displayCurrency:tuples[market][1],
    productType:'airport',travelDate:tomorrow,arrivalTime:'12:00',travellers:2,from:'LHR',to:'London'};
}
test('each of the four source markets retains a UK-only travel-supplier scope',()=>{
  for(const m of ['KR','JP','CN','US']){
    const item=gateway.validateSearch(request(m));
    assert.equal(item.sourceMarket,m);
    assert.equal(item.destinationCountry,'GB');
  }
});
test('client cannot switch destination country, country currency or locale to bypass tenant scope',()=>{
  assert.equal(gateway.validateSearch({...request(),destinationCountry:'JP'}),null);
  assert.equal(gateway.validateSearch({...request(),displayCurrency:'USD'}),null);
  assert.equal(gateway.validateSearch({...request(),locale:'en-US'}),null);
  assert.equal(gateway.validateSearch({...request(),travellers:13}),null);
  assert.equal(gateway.validateSearch({...request(),travelDate:'not-a-date'}),null);
  assert.equal(gateway.validateSearch({...request(),productType:'book-and-charge-card'}),null);
});
test('no invented provider connection and no affiliate redirect to unapproved hosts',()=>{
  assert.equal(gateway.allowedOrigin(),null);
  const offer={id:'offer-1',verified:true,live:true,title:'LHR to Oxford',supplierName:'Example licensed operator',
    amount:50,currency:'GBP',expiresAt:new Date(Date.now()+600000).toISOString(),
    bookingMode:'affiliate',affiliateRedirect:'https://phishing.example/book'};
  assert.equal(gateway.normaliseOffer(offer),null,
    'an affiliate offer with an unapproved redirect cannot be displayed');
  const item=gateway.normaliseOffer({...offer,
    affiliateRedirect:'https://partner.example/booking'});
  assert(item);
  assert.equal(item.affiliateRedirect,'https://partner.example/booking');
  assert.equal(gateway.normaliseOffer({...offer,verified:false}),null);
  assert.equal(gateway.normaliseOffer({...offer,live:false}),null);
  assert.equal(gateway.normaliseOffer({...offer,expiresAt:new Date(Date.now()-1000).toISOString()}),null);
  assert.equal(gateway.normaliseOffer({...offer,affiliateRedirect:'https://partner.example/booking'}).affiliateRedirect,'https://partner.example/booking');
});
test('four separately localized, installable HTML entrypoints share a single storefront renderer',async()=>{
  for(const [market,locale] of [['kr','ko-KR'],['jp','ja-JP'],['cn','zh-CN'],['us','en-US']]){
    const html=await readFile(new URL(`../${market}/index.html`,import.meta.url),'utf8');
    const manifest=JSON.parse(await readFile(new URL(`../public/${market}.webmanifest`,import.meta.url),'utf8'));
    assert.match(html,new RegExp(`<html lang="${locale}" data-market="${market}">`));
    assert.match(html,/<script type="module" src="\.\.\/src\/main\.tsx"><\/script>/);
    assert.match(html,new RegExp(`href="/${market}\\.webmanifest"`));
    assert.equal(manifest.start_url,`/${market}/`);
    assert.equal(manifest.lang,locale);
  }
});
test('market storefronts show no fake availability and payment API remains blocked',async()=>{
  const main=await readFile(new URL('../src/main.tsx',import.meta.url),'utf8');
  const gatewaySource=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  assert.match(main,/copy\.availabilityNotice/);
  assert.match(gatewaySource,/supplier_gateway_not_configured/);
  assert.match(gatewaySource,/bookingsEnabled:false/);
  assert.doesNotMatch(gatewaySource,/\b(process\.env\.[A-Z_]+\s*\|\|\s*['"]https:\/\/)/);
});

test('supplier-hosted checkout survives the tenant gateway only on an approved host',()=>{
  const offer={id:'hbx-supplier-verified',title:'Hotel room',supplierName:'Approved supplier',
    currency:'GBP',amount:200,expiresAt:new Date(Date.now()+300000).toISOString(),
    verified:true,live:true,bookingMode:'supplier_checkout',
    supplierCheckoutUrl:'https://partner.example/pay?booking=abc'};
  const normal=gateway.normaliseOffer(offer);
  assert.equal(normal.bookingMode,'supplier_checkout');
  assert.equal(normal.supplierCheckoutUrl,offer.supplierCheckoutUrl);
  assert.equal(normal.affiliateRedirect,undefined);
  assert.equal(gateway.normaliseOffer({...offer,
    supplierCheckoutUrl:'https://partner.example.evil.test/pay'}),null);
  assert.equal(gateway.normaliseOffer({...offer,
    supplierCheckoutUrl:'https://partner.example:8443/pay'}),null);
  assert.equal(gateway.normaliseOffer({...offer,amount:'200'}),null);
});
