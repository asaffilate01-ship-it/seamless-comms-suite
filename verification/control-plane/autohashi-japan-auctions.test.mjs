import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const providers=await readFile(new URL("../../src/modules/integrations/provider-catalogue.ts",import.meta.url),"utf8");
const adapters=await readFile(new URL("../../src/modules/automotive/auction-providers.server.ts",import.meta.url),"utf8");
const functions=await readFile(new URL("../../src/modules/automotive/auction-provider-functions.ts",import.meta.url),"utf8");
const sync=await readFile(new URL("../../src/modules/automotive/auction-sync.server.ts",import.meta.url),"utf8");
const runtime=await readFile(new URL("../../src/modules/automotive/auction-runtime.server.ts",import.meta.url),"utf8");
const automotive=await readFile(new URL("../../src/modules/automotive/functions.ts",import.meta.url),"utf8");
const migration=await readFile(new URL("../../supabase/migrations/20261004193000_autohashi_japan_auction_providers.sql",import.meta.url),"utf8");

for(const key of ["vehicle.japan.thecarapi","vehicle.japan.carstack","vehicle.japan.agent","vehicle.japan.aucnet","vehicle.japan.iauc","vehicle.japan.uss"])
  assert(providers.includes(key),`missing provider ${key}`);

const dataProviderBlocks=providers.match(/key:"vehicle\.japan\.(?:thecarapi|carstack)"[\s\S]*?status:"evaluate"/g)??[];
assert.equal(dataProviderBlocks.length,2);
for(const block of dataProviderBlocks)assert(!block.includes("bid.submit"),"read-only provider must not advertise bid.submit");

assert(adapters.includes('url.searchParams.set("site","japan")'));
assert(adapters.includes("auction_id_str"),"Japan IDs must prefer the exact string identifier");
assert(adapters.includes("THECARAPI_API_KEY"));
assert(adapters.includes("CARSTACK_API_TOKEN"));
assert(sync.includes("resolveCanonicalAuctionVehicle"));
assert(functions.includes("mileage_regression"));
assert(runtime.includes('operation:z.literal("auction.search_sync")'));
assert(runtime.includes('operation:z.literal("auction.list")'));
assert(runtime.includes('operation:z.literal("auction.hydrate")'));
assert(runtime.includes('operation:z.literal("auction.bid.queue")'));
assert(runtime.includes('operation:z.literal("auction.history")'));
assert(runtime.includes('operation:z.literal("auction.assess")'));
assert(runtime.includes("transmittedToAuctionHouse:false"));
assert(migration.includes("automotive_auction_bid_requests"));
assert(migration.includes('"no_public_api_assumed":true'));
assert(migration.includes("automotive_auction_provider_syncs"));
assert(automotive.includes("max_bid_source_minor"));
assert(automotive.includes('fxDirection:"source_per_settlement"'));

console.log("AutoHashi Japan auction provider boundaries verified");
