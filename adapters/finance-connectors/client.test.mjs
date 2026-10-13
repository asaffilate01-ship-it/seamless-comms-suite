import assert from "node:assert/strict";
import {createFinanceCatalogueClient} from "../../adapters/finance-connectors/client.mjs";
const tenantId="11111111-1111-4111-8111-111111111111";
const credential="oqsvc_example123."+"a".repeat(64);
assert.throws(()=>createFinanceCatalogueClient({host:"http://insecure.test",credential}),/HTTPS/);
assert.throws(()=>createFinanceCatalogueClient({host:"https://example.test",credential:"abc"}),/credential/);
let calls=0;
const client=createFinanceCatalogueClient({
 host:"https://omniqora.example.test",credential,
 fetcher:async (url,init)=>{
  calls++;
  assert.equal(url,"https://omniqora.example.test/api/finance/catalogue");
  assert.equal(init.method,"POST");
  assert.equal(init.headers.Authorization,"Bearer "+credential);
  assert.equal(JSON.parse(init.body).tenantId,tenantId);
  return {ok:true,json:async()=>({
   tenantId,productKey:"dishbee",liveFinance:false,enabledProviderKeys:[],
   candidates:[{key:"finance.youlend",status:"candidate",usableAtCheckout:false}]
  })};
 }
});
const value=await client.candidates({tenantId,productKey:"dishbee"});
assert.equal(value.candidates[0].status,"candidate");
assert.equal(calls,1);
const unsafe=createFinanceCatalogueClient({host:"https://omniqora.example.test",credential,
 fetcher:async()=>({ok:true,json:async()=>({tenantId,productKey:"dishbee",liveFinance:true,enabledProviderKeys:["checkout.klarna"],candidates:[]})})});
await assert.rejects(()=>unsafe.candidates({tenantId,productKey:"dishbee"}),/unsafe/);
await assert.rejects(()=>client.candidates({tenantId:"bad",productKey:"dishbee"}),/scope/);
console.log("Finance source SaaS adapter respects exact scope, HTTPS, provider-disabled response");
