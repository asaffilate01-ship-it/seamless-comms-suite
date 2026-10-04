import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {evaluateAuctionDecision} from "../../src/modules/automotive/auction-intelligence";

const clean=evaluateAuctionDecision({
  lot:{chassisNumber:"AGH30-1234567",grade:"4.5",odometerKm:30000,make:"Toyota",model:"Alphard",year:2023},
  extraction:{
    rawGrade:"4.5",repairHistory:"none",structuralRepair:"none",flood:"none",corrosion:"none",rust:"none",
    oilLeak:false,warningLights:false,airbagIssue:false,chassisNumber:"AGH30-1234567",odometerKm:30000,
    odometerStatus:"verified",confidence:.95,translationConfidence:.9,damageMapConfidence:.9,
  },
  history:[
    {observedAt:"2026-08-01T00:00:00Z",auctionHouse:"TAA",grade:"4.5",odometerKm:29000},
    {observedAt:"2026-10-01T00:00:00Z",auctionHouse:"USS",grade:"4.5",odometerKm:30000},
  ],
  comparables:[
    {evidenceType:"sold",priceGbpMinor:2_900_000,source:"autohashi",year:2023,mileageKm:32000},
    {evidenceType:"sold",priceGbpMinor:3_000_000,source:"autohashi",year:2023,mileageKm:28000},
    {evidenceType:"asking",priceGbpMinor:3_100_000,source:"autohashi",year:2023,mileageKm:30000},
  ],
  economics:{targetRetailGbpMinor:3_000_000,targetMarginGbpMinor:500_000,estimatedLandedGbpMinor:2_300_000,estimatedGrossMarginGbpMinor:700_000,proposedHammerJpy:2_800_000,maxHammerJpy:2_950_000},
});
assert.equal(clean.recommendation,"buy");
assert(clean.score>=90);
assert.equal(clean.blockers.length,0);
assert(clean.confidence>=.9);
assert.equal(clean.market.soldCount,2);
assert.equal(clean.reviewRequired,true);

const flood=evaluateAuctionDecision({
  lot:{chassisNumber:"A-1",grade:"4",odometerKm:50000},
  extraction:{flood:"declared",structuralRepair:"none",repairHistory:"none",corrosion:"none",rust:"none",chassisNumber:"A-1",odometerKm:50000,odometerStatus:"verified",confidence:.95},
  history:[{observedAt:"2026-10-01T00:00:00Z",odometerKm:50000}],
  comparables:[
    {evidenceType:"sold",priceGbpMinor:2_000_000,source:"x"},
    {evidenceType:"sold",priceGbpMinor:2_100_000,source:"x"},
    {evidenceType:"asking",priceGbpMinor:2_200_000,source:"x"},
  ],
  economics:{targetRetailGbpMinor:2_100_000,targetMarginGbpMinor:300_000,estimatedLandedGbpMinor:1_600_000,estimatedGrossMarginGbpMinor:500_000},
});
assert.equal(flood.recommendation,"do_not_bid");
assert(flood.blockers.includes("flood_declared"));

const rollback=evaluateAuctionDecision({
  lot:{chassisNumber:"B-1",grade:"4.5",odometerKm:60000},
  extraction:{flood:"none",structuralRepair:"none",repairHistory:"none",corrosion:"none",rust:"none",chassisNumber:"B-1",odometerKm:60000,odometerStatus:"verified",confidence:.95},
  history:[
    {observedAt:"2026-08-01T00:00:00Z",odometerKm:82000},
    {observedAt:"2026-10-01T00:00:00Z",odometerKm:60000},
  ],
  comparables:[
    {evidenceType:"sold",priceGbpMinor:2_000_000,source:"x"},
    {evidenceType:"sold",priceGbpMinor:2_100_000,source:"x"},
    {evidenceType:"asking",priceGbpMinor:2_200_000,source:"x"},
  ],
  economics:{targetRetailGbpMinor:2_100_000,targetMarginGbpMinor:300_000,estimatedLandedGbpMinor:1_600_000,estimatedGrossMarginGbpMinor:500_000},
});
assert.equal(rollback.recommendation,"do_not_bid");
assert(rollback.blockers.includes("mileage_regression"));

const missing=evaluateAuctionDecision({
  lot:{grade:"4.5",odometerKm:20000},
  extraction:null,
  history:[{observedAt:"2026-10-01T00:00:00Z",odometerKm:20000}],
  comparables:[
    {evidenceType:"sold",priceGbpMinor:2_000_000,source:"x"},
    {evidenceType:"sold",priceGbpMinor:2_100_000,source:"x"},
    {evidenceType:"asking",priceGbpMinor:2_200_000,source:"x"},
  ],
  economics:{targetRetailGbpMinor:2_100_000,targetMarginGbpMinor:300_000,estimatedLandedGbpMinor:1_600_000,estimatedGrossMarginGbpMinor:500_000},
});
assert.equal(missing.recommendation,"review");
assert(missing.warnings.includes("auction_sheet_not_extracted"));

const worker=await readFile(new URL("../../supabase/functions/automotive-auction-intelligence-worker/index.ts",import.meta.url),"utf8");
const gateway=await readFile(new URL("../../supabase/functions/automotive-auction-gateway/index.ts",import.meta.url),"utf8");
const migration=await readFile(new URL("../../supabase/migrations/20261004213000_automotive_auction_intelligence_v3.sql",import.meta.url),"utf8");

assert(worker.includes("OMNIQORA_INTELLIGENCE_WORKER_SECRET"),"worker secret gate missing");
assert(worker.includes('status:"waiting_review"'),"AI worker must stop at human review");
assert(worker.includes("AUCTION_EXTRACTION_SCHEMA"),"typed extraction schema missing from worker");
assert(gateway.includes("Human-approved auction intelligence is required before admin approval"),"admin bid gate must require human-reviewed intelligence");
assert(gateway.includes("Approved auction intelligence says DO NOT BID"),"DO NOT BID must block execution");
assert(gateway.includes('in("status",["proposed","reviewed","approved"])'),"changed inputs must supersede previous approved decisions");
assert(gateway.includes('status:"draft",authorised_actor_ref:null,authorised_at:null'),"changed intelligence must revoke stale finance approval");
assert(worker.includes('status:"draft",authorised_actor_ref:null,authorised_at:null'),"new sheet evidence must revoke stale finance approval");
assert(migration.includes("automotive_auction_sheet_extractions"),"sheet extraction ledger missing");
assert(migration.includes("automotive_auction_comparables"),"market evidence ledger missing");
assert(migration.includes("automotive_auction_decisions"),"decision ledger missing");
assert(migration.includes("FOR UPDATE SKIP LOCKED"),"atomic worker claim missing");

console.log("AutoHashi auction intelligence v3 scoring, review and safety gates verified");
