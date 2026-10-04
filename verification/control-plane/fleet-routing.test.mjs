import assert from "node:assert/strict";
import { optimiseFleetRoutes } from "../../src/modules/dispatch/routing.ts";

const planningTime = "2026-10-04T08:00:00.000Z";
const plan = optimiseFleetRoutes(
  [
    {
      id: "delivery-1",
      origin: { latitude: 25.2048, longitude: 55.2708 },
      capacity: 2,
      skills: ["delivery"],
      availableFrom: planningTime,
      availableUntil: "2026-10-04T18:00:00.000Z",
    },
    {
      id: "recovery-1",
      origin: { latitude: 25.2148, longitude: 55.2808 },
      capacity: 1,
      skills: ["recovery"],
      availableFrom: planningTime,
      availableUntil: "2026-10-04T18:00:00.000Z",
    },
    {
      id: "cold-1",
      origin: { latitude: 25.2248, longitude: 55.2908 },
      capacity: 5,
      skills: ["cold"],
      availableFrom: planningTime,
      availableUntil: "2026-10-04T09:00:00.000Z",
    },
  ],
  [
    {
      id: "priority",
      latitude: 25.205,
      longitude: 55.271,
      priority: 100,
      demand: 1,
      requiredSkills: ["delivery"],
    },
    {
      id: "delivery",
      latitude: 25.206,
      longitude: 55.272,
      priority: 50,
      demand: 1,
      requiredSkills: ["delivery"],
    },
    {
      id: "capacity-blocked",
      latitude: 25.207,
      longitude: 55.273,
      demand: 1,
      requiredSkills: ["delivery"],
    },
    {
      id: "recovery",
      latitude: 25.215,
      longitude: 55.281,
      demand: 1,
      requiredSkills: ["recovery"],
    },
    { id: "missing-skill", latitude: 25.216, longitude: 55.282, requiredSkills: ["hazmat"] },
    {
      id: "time-window",
      latitude: 25.225,
      longitude: 55.291,
      requiredSkills: ["cold"],
      windowStart: "2026-10-04T10:00:00.000Z",
      windowEnd: "2026-10-04T11:00:00.000Z",
    },
  ],
  planningTime,
);

assert.equal(plan.engine, "omniqora.native-routing.v2");
assert.equal(plan.assignedStopCount, 3);
assert.equal(plan.totalStopCount, 6);
assert.deepEqual(
  plan.unassigned.sort((left, right) => left.stopId.localeCompare(right.stopId)),
  [
    { stopId: "capacity-blocked", reason: "capacity" },
    { stopId: "missing-skill", reason: "missing_skill" },
    { stopId: "time-window", reason: "time_window" },
  ],
);
assert.deepEqual(plan.routes.find((route) => route.resourceId === "delivery-1")?.orderedStopIds, [
  "priority",
  "delivery",
]);
assert.deepEqual(plan.routes.find((route) => route.resourceId === "recovery-1")?.orderedStopIds, [
  "recovery",
]);

console.log("Native constrained Fleetora batching and explicit unassigned reasons verified");
