import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const directory=new URL("../../src/modules/control-plane/",import.meta.url);
const manifest=JSON.parse(await readFile(new URL("dishbee-import-handover.json",directory),"utf8"));
const registry=JSON.parse(await readFile(new URL("portfolio-factory-registry.json",directory),"utf8"));

test("exactly three independent draft Dishbee import handovers",()=>{
  assert.equal(manifest.schemaVersion,1);
  assert.equal(manifest.status,"registry_only_not_live");
  assert.deepEqual(manifest.handovers.map(x=>x.dishbeeTenantSlug).sort(),
    ["cafe-1-luton","cafe-1-st-albans","mealdeck"].sort());
  assert.equal(new Set(manifest.handovers.map(x=>x.factoryTenantKey)).size,3);
  assert.equal(new Set(manifest.handovers.map(x=>x.dishbeeTenantSlug)).size,3);
  assert.equal(manifest.rules.noAutomaticTenantCreation,true);
  assert.equal(manifest.rules.noProductionCutover,true);
  assert.equal(manifest.rules.noSharedPaymentCredentials,true);
});
test("factory inventory blueprints are explicitly reconciled to Dishbee source repos",()=>{
  for(const handover of manifest.handovers){
    const source=registry.tenants.find(t=>t.tenantKey===handover.factoryTenantKey);
    assert(source,handoversource(handover));
    assert.equal(source.parentLandlord,"dishbee");
    assert.equal(source.blueprintKey,handover.factoryBlueprintKey);
    assert.equal(source.provisioning,"not_activated");
    assert(handover.sourceRepo.startsWith("asaffilate01-ship-it/"));
    assert.equal(new Set(handover.expectedLocations).size,handover.expectedLocations.length);
    assert(handover.expectedLocations.length>=1);
    assert.equal(handover.phase,"awaiting_draft_tenant_and_staging");
  }
});
function handoversource(h){return "Factory tenant missing: "+h.factoryTenantKey}
test("MealDeck is a native multi-brand tenant and Cafe 1 venues are source imports",()=>{
  const byKey=Object.fromEntries(manifest.handovers.map(x=>[x.dishbeeBlueprintKey,x]));
  assert.equal(byKey.mealdeck.importPath,"native_dishbee_multibrand_no_legacy_cafe_import");
  for(const key of ["cafe1-luton","cafe1-st-albans"]){
    assert.equal(byKey[key].importPath,"cafe1_v3_full_parity");
    assert(byKey[key].sourceRepo.includes("cafe"));
  }
  assert.deepEqual(manifest.rules.futureProviders,["uber_direct","deliveroo_express","just_eat_go"]);
});

test("every expected physical site has three independently uncommissioned courier accounts",()=>{
  const providers=["uber_direct","deliveroo_express","just_eat_go"];
  const rules=manifest.rules.deliveryActivation;
  assert.equal(rules.importWithoutProviderAllowed,true);
  assert.equal(rules.paidOrderBeforeBooking,true);
  assert.equal(rules.neverAutoBookUnapprovedProvider,true);
  assert.equal(rules.doNotReplaceMarketplaceCourier,true);
  assert.equal(rules.noCredentialsInFactoryRegistry,true);
  let physicalSiteCount=0;
  for(const handover of manifest.handovers){
    assert.deepEqual(handover.deliveryLocationPlans.map(x=>x.locationKey),
      handover.expectedLocations);
    physicalSiteCount+=handover.deliveryLocationPlans.length;
    for(const location of handover.deliveryLocationPlans){
      assert.equal(location.sourceOfTruth,"dishbee");
      assert.equal(location.approvalStatus,"not_commissioned");
      assert.deepEqual(location.providerOptions.map(x=>x.provider),providers);
      for(const provider of location.providerOptions){
        assert.equal(provider.credentialStatus,"not_connected");
        for(const field of [
          "merchantAuthorised","collectionPointApproved","webhookCertified",
          "sandboxQuoteAccepted","sandboxDeliveryAccepted","productionEnabled",
        ])assert.equal(provider[field],false,
          `${handover.factoryTenantKey}/${location.locationKey}/${provider.provider}: ${field}`);
      }
    }
  }
  assert.equal(physicalSiteCount,5);
  assert.equal(manifest.status,"registry_only_not_live");
  assert(!JSON.stringify(manifest).includes("sk_live_"));
  assert(!JSON.stringify(manifest).includes("sb_secret_"));
});
