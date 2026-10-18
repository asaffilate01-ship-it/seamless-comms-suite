import assert from "node:assert/strict";
import {
  assessVehicleHistory, HISTORY_REQUIRED_AREAS, type VehicleHistoryObservation,
} from "../../src/modules/automotive/vehicle-history-intelligence";

const now = new Date("2026-10-18T09:00:00Z");
const entry = (area: VehicleHistoryObservation["area"], finding: VehicleHistoryObservation["finding"]): VehicleHistoryObservation => ({
  area, finding, sourceId: "licensed-and-verified-provider",
  checkedAt: "2026-10-18T08:00:00Z", verified: true, dataRightsConfirmed: true,
});
const empty = assessVehicleHistory("GB", [], now);
assert.equal(empty.status, "incomplete");
assert.equal(empty.checkedAreas.length, 0);
assert.equal(empty.unknownAreas.length, 6);
assert.equal(empty.coverage, 0);

const allClear = HISTORY_REQUIRED_AREAS.GB.map((area) => entry(area, "clear"));
const clean = assessVehicleHistory("GB", allClear, now);
assert.equal(clean.status, "checked_without_flags");
assert.equal(clean.coverage, 1);
assert.match(clean.statement, /not a guarantee/i);

const flagged = assessVehicleHistory("GB", [...allClear, entry("finance", "flagged")], now);
assert.equal(flagged.status, "needs_review");
assert(flagged.flaggedAreas.includes("finance"));

const unlicensed = assessVehicleHistory("GB", allClear.map((x) => ({ ...x, dataRightsConfirmed: false })), now);
assert.equal(unlicensed.status, "incomplete");
assert.equal(unlicensed.checkedAreas.length, 0);

const stale = assessVehicleHistory("GB", allClear.map((x) => ({ ...x, checkedAt: "2026-08-01T00:00:00Z" })), now);
assert.equal(stale.status, "incomplete");

const financeOnly = assessVehicleHistory("DE", [entry("identity", "clear")], now);
assert.equal(financeOnly.status, "incomplete");
assert(financeOnly.unknownAreas.includes("finance"));

const jp = assessVehicleHistory("JP", [
  ...HISTORY_REQUIRED_AREAS.JP.map((a) => entry(a, "clear")),
  entry("auction_mileage", "flagged"),
], now);
assert.equal(jp.status, "needs_review");
assert(jp.flaggedAreas.includes("auction_mileage"));
console.log("Vehicle history evidence boundaries passed");
