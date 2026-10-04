import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {calculateJapanUkBidCost} from "../../src/modules/automotive/landed-cost-v2";

const result=calculateJapanUkBidCost({
  fxJpyPerGbp:190,
  targetRetailGbpMinor:3_000_000,
  targetMarginGbpMinor:500_000,
  auctionFeesJpy:120_000,
  inlandTransportJpy:80_000,
  freightGbpMinor:110_000,
  insuranceGbpMinor:15_000,
  clearanceGbpMinor:30_000,
  complianceGbpMinor:85_000,
  registrationGbpMinor:6_000,
  deliveryGbpMinor:25_000,
  otherGbpMinor:0,
  dutyRateBps:1000,
  taxRateBps:2000,
  proposedHammerJpy:2_800_000,
});
assert.equal(result.japanFixedGbpMinor,105263);
assert.equal(result.maxHammerJpy,2_950_833);
assert.equal(result.proposedCifGbpMinor,1_703_947);
assert.equal(result.proposedDutyGbpMinor,170_395);
assert.equal(result.proposedTaxGbpMinor,374_868);
assert.equal(result.proposedLandedGbpMinor,2_395_210);
assert.equal(result.proposedGrossMarginGbpMinor,604_790);
assert.equal(result.proposedHeadroomJpy,150_833);
assert.equal(result.assumptions.taxRecoveryAssumed,false);

const gateway=await readFile(new URL("../../supabase/functions/automotive-auction-gateway/index.ts",import.meta.url),"utf8");
const webhook=await readFile(new URL("../../supabase/functions/automotive-auction-agent-webhook/index.ts",import.meta.url),"utf8");
const migration=await readFile(new URL("../../supabase/migrations/20261004203000_automotive_bid_execution_v2.sql",import.meta.url),"utf8");

for(const action of ["bid.model","bid.customer_authorise","bid.admin_authorise","bid.status","bid.submit"]){
  assert(gateway.includes(action),action+" gateway action missing");
}
assert(gateway.includes('AUTOHASHI_AUCTION_EXECUTION_ENABLED'),"live execution feature gate missing");
assert(gateway.includes('if(!executionEnabled())throw new Error("Live auction execution is disabled")'),"fail-closed submit guard missing");
assert(gateway.includes("Customer authorisation is required before admin approval"),"customer-before-admin gate missing");
assert(gateway.includes("Proposed hammer bid exceeds the calculated reviewed maximum"),"max-hammer guard missing");
assert(gateway.includes("acceptedMax>Number(current.data.max_bid_minor)"),"provider acknowledgement max-bid guard missing");
assert(webhook.includes("hammer>Number(instruction.max_bid_minor)"),"won-event max-bid safety guard missing");
assert(webhook.includes("x-auction-signature")&&webhook.includes("x-auction-timestamp"),"signed webhook verification missing");
assert(webhook.includes("duplicate:true"),"webhook replay handling missing");
assert(webhook.includes("terminalStates.has"),"terminal webhook states must not regress");
assert(gateway.includes('providerStatus==="rejected"?"rejected"'),"explicit provider rejection must remain rejected");
assert(migration.includes("automotive_bid_cost_models_v2"),"v2 mixed-currency model table missing");
assert(migration.includes("automotive_bid_provider_events"),"provider event audit table missing");
assert(migration.includes("ENABLE ROW LEVEL SECURITY"),"v2 bid tables must use RLS");

console.log("AutoHashi bid execution v2 maths and safety gates verified");
