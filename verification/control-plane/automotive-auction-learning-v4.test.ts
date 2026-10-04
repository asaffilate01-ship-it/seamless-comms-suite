import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {extractionDiff,matchesWatchCriteria,predictHammerPrice} from "../../src/modules/automotive/auction-learning";

const prediction=predictHammerPrice({
  target:{make:"Toyota",model:"Alphard",modelCode:"AGH30",year:2023,grade:"4.5",mileageKm:31000},
  outcomes:[
    {make:"Toyota",model:"Alphard",modelCode:"AGH30",year:2023,grade:"4.5",mileageKm:28000,hammerJpy:2_800_000,outcomeAt:"2026-09-01T00:00:00Z"},
    {make:"Toyota",model:"Alphard",modelCode:"AGH30",year:2023,grade:"4.5",mileageKm:32000,hammerJpy:3_000_000,outcomeAt:"2026-09-10T00:00:00Z"},
    {make:"Toyota",model:"Alphard",modelCode:"AGH30",year:2023,grade:"4.5",mileageKm:35000,hammerJpy:3_200_000,outcomeAt:"2026-09-20T00:00:00Z"},
  ],
});
assert.equal(prediction.method,"model_code_year_grade_mileage");
assert.equal(prediction.predictedHammerJpy,3_000_000);
assert.equal(prediction.lowJpy,2_900_000);
assert.equal(prediction.highJpy,3_100_000);
assert.equal(prediction.sampleCount,3);
assert(prediction.confidence>0.6);

const insufficient=predictHammerPrice({
  target:{make:"Toyota",model:"Crown",year:2025,grade:"5",mileageKm:5000},
  outcomes:[],
});
assert.equal(insufficient.method,"insufficient");
assert.equal(insufficient.predictedHammerJpy,null);
assert.equal(insufficient.confidence,0);

assert.deepEqual(extractionDiff(
  {rawGrade:"4.5",odometerKm:30000,flood:"none"},
  {rawGrade:"4",odometerKm:30000,flood:"none",rust:"light"}
),["rawGrade","rust"]);

assert.equal(matchesWatchCriteria(
  {make:"Toyota",model:"Alphard",yearMin:2022,gradeMin:4.5,odometerMaxKm:50000,maxPredictedHammerJpy:3_200_000,minScore:85},
  {make:"Toyota",model:"Alphard",year:2023,grade:"4.5",odometerKm:30000,predictedHammerJpy:3_000_000,score:91}
),true);
assert.equal(matchesWatchCriteria(
  {make:"Toyota",model:"Alphard",minScore:90},
  {make:"Toyota",model:"Alphard",year:2023,grade:"4.5",score:82}
),false);

const gateway=await readFile(new URL("../../supabase/functions/automotive-auction-gateway/index.ts",import.meta.url),"utf8");
const webhook=await readFile(new URL("../../supabase/functions/automotive-auction-agent-webhook/index.ts",import.meta.url),"utf8");
const intelWorker=await readFile(new URL("../../supabase/functions/automotive-auction-intelligence-worker/index.ts",import.meta.url),"utf8");
const visionRunner=await readFile(new URL("../../supabase/functions/automotive-auction-vision-runner/index.ts",import.meta.url),"utf8");
const watchWorker=await readFile(new URL("../../supabase/functions/automotive-auction-watch-worker/index.ts",import.meta.url),"utf8");
const migration=await readFile(new URL("../../supabase/migrations/20261004223000_automotive_auction_learning_v4.sql",import.meta.url),"utf8");
const watchWorkflow=await readFile(new URL("../../.github/workflows/autohashi-auction-watches.yml",import.meta.url),"utf8");
const visionWorkflow=await readFile(new URL("../../.github/workflows/autohashi-auction-vision.yml",import.meta.url),"utf8");

for(const table of [
  "automotive_auction_review_corrections","automotive_auction_price_outcomes","automotive_auction_price_curves",
  "automotive_auction_price_predictions","automotive_auction_watch_rules","automotive_auction_watch_matches"
]) assert(migration.includes(table),table+" missing from v4 migration");
assert(migration.includes("ENABLE ROW LEVEL SECURITY"),"v4 learning tables must use RLS");

assert(gateway.includes('"learning.correct_extraction"'),"correction action missing");
assert(gateway.includes('"prediction.refresh"'),"prediction refresh action missing");
assert(gateway.includes('"watch.run"'),"watch run-now action missing");
assert(gateway.includes("odometerKm must be a non-negative integer"),"server-side correction validation missing");
assert(gateway.includes("automotive_auction_price_curves"),"price curve snapshots missing from prediction path");

assert(webhook.includes("automotive_auction_price_outcomes"),"verified win must feed hammer outcomes");
assert(webhook.includes("absolute_error_jpy"),"prediction calibration error must be stored");

assert(intelWorker.includes("learningExamples"),"reviewed corrections must feed future extraction jobs");
assert(intelWorker.includes("Reference only"),"corrections must remain non-authoritative reference examples");
assert(visionRunner.includes("learningExamplesAreReferenceOnly"),"vision runner must mark learning examples as reference only");
assert(visionRunner.includes("noBidAuthority:true"),"vision provider must have no bid authority");
assert(visionRunner.includes("Math.min(10"),"vision runner batch must be bounded");

assert(watchWorker.includes("pending_intelligence"),"score-threshold watches must support two-stage intelligence");
assert(watchWorker.includes("minimum=rule.cadence"),"watch cadence enforcement missing");
assert(watchWorker.includes("automotive_auction_watch_matches"),"watch match persistence missing");
assert(!watchWorker.includes("bid.submit")&&!watchWorker.includes("automotive_bid_instructions"),"watch worker must never submit or authorise bids");

assert(watchWorkflow.includes("AUTOHASHI_AUCTION_WATCH_WORKER_SECRET"),"watch scheduler secret missing");
assert(visionWorkflow.includes("AUTOHASHI_AUCTION_VISION_RUNNER_SECRET"),"vision scheduler secret missing");

console.log("AutoHashi auction learning v4 prediction, correction and watch safety verified");
