import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const provider=await readFile(new URL("../../src/modules/automotive/auction-providers.ts",import.meta.url),"utf8");
const fn=await readFile(new URL("../../src/modules/automotive/auction-provider.functions.ts",import.meta.url),"utf8");
const migration=await readFile(new URL("../../supabase/migrations/20261004193000_automotive_auction_provider_runtime.sql",import.meta.url),"utf8");
const gateway=await readFile(new URL("../../supabase/functions/automotive-auction-gateway/index.ts",import.meta.url),"utf8");
const contract=await readFile(new URL("../../docs/automotive/JAPAN_AUCTION_AGENT_API_CONTRACT.md",import.meta.url),"utf8");

for(const key of ["vehicle.auction.thecarapi","vehicle.auction.carstack","vehicle.auction.agent","vehicle.auction.uss","vehicle.auction.aucnet"]){
  assert(provider.includes(key),key+" missing from adapter catalogue");
  assert(migration.includes(key),key+" missing from provider migration");
}
for(const capability of ["inventory.read","auction_sheet.read","history.read","bid.submit","bid.status"]){
  assert(provider.includes(capability),capability+" capability missing");
}
assert(provider.includes('url.searchParams.set("site","japan")'),"TheCarAPI Japan source must be explicit");
assert(provider.includes('Authorization:"Bearer "+input.secret'),"CarStack must use a server-side bearer token");
assert(provider.includes("searchAuctionProvidersWithFailover"),"read-provider failover helper is missing");
assert(provider.includes("compareAuctionLotSamples"),"provider comparison helper is missing");
assert(provider.includes("protectedImageRefs"),"authenticated CarStack image references must stay server-side");
assert(provider.includes("page_size??body.limit"),"TheCarAPI pagination normalisation is missing");
assert(fn.includes("Requested bid exceeds the reviewed maximum bid model"),"max-bid guard is missing");
assert(fn.includes('status:"authorised"'),"bid authorisation state is missing");
assert(!fn.includes("AUTOHASHI_AUCTION_AGENT_URL")&&!fn.includes("fetch(agent"),"application code must not submit an invented agent API contract");
assert(gateway.includes('if(!executionEnabled())throw new Error("Live auction execution is disabled")'),"gateway live-bid fail-closed guard is missing");
assert(gateway.includes("executionEnabled:false"),"gateway must advertise execution disabled");
assert(gateway.includes("x-oq-signature")&&gateway.includes("HMAC"),"signed bridge verification is missing");
assert(gateway.includes('body.action==="compare"'),"100-500 lot comparison gateway action is missing");
assert(gateway.includes("searchAuctionProvidersWithFailover"),"gateway auto-provider failover is missing");
assert(gateway.includes("AUTOHASHI_OMNIQORA_TENANT_ID"),"gateway tenant mapping must be server-fixed");
assert(migration.includes("automotive_auction_observations"),"auction observations table missing");
assert(migration.includes("automotive_bid_instructions"),"bid instructions table missing");
assert(migration.includes("ENABLE ROW LEVEL SECURITY"),"new auction tables must have RLS");
assert(contract.includes("No live bidding is enabled"),"agent contract must state execution is disabled");
assert(contract.includes("must never exceed"),"agent max-bid obligation missing");

console.log("Automotive auction provider, history, bridge and bid-safety contract verified");
