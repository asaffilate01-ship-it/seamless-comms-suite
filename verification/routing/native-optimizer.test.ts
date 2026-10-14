import {describe,expect,test} from "bun:test";
import {haversineMetres,optimiseNativeRoutes} from "../../src/modules/routing/service.server";

describe("native routing optimiser",()=>{
 test("assigns by skills vehicle capacity and leaves infeasible work unassigned",()=>{
  const start="2026-10-04T09:00:00.000Z";
  const result=optimiseNativeRoutes({
   startedAt:start,
   resources:[
    {agentId:"a1",vehicleId:"v1",skills:["cold-chain","fragile"],vehicleType:"van",capacity:10,start:{lat:51.8787,lng:-0.4200},shiftEnd:"2026-10-04T17:00:00.000Z"},
    {agentId:"a2",vehicleId:"v2",skills:["general"],vehicleType:"car",capacity:3,start:{lat:51.8800,lng:-0.4100},shiftEnd:"2026-10-04T17:00:00.000Z"}
   ],
   jobs:[
    {jobId:"urgent",priority:"urgent",demand:4,requiredSkills:["cold-chain"],requiredVehicleTypes:["van"],stops:[{lat:51.885,lng:-0.405,serviceSeconds:60}]},
    {jobId:"general",priority:"normal",demand:2,requiredSkills:["general"],requiredVehicleTypes:["car"],stops:[{lat:51.881,lng:-0.408,serviceSeconds:30}]},
    {jobId:"too-heavy",priority:"high",demand:20,requiredSkills:["cold-chain"],requiredVehicleTypes:["van"],stops:[{lat:51.9,lng:-0.39}]}
   ]
  });
  expect(result.score.assignedJobs).toBe(2);
  expect(result.unassignedJobIds).toEqual(["too-heavy"]);
  expect(result.routes).toHaveLength(2);
  expect(result.routes.find(r=>r.agentId==="a1")?.stops[0].jobId).toBe("urgent");
  expect(result.routes.find(r=>r.agentId==="a2")?.stops[0].jobId).toBe("general");
 });

 test("reports time-window breaches instead of silently accepting them",()=>{
  const result=optimiseNativeRoutes({
   startedAt:"2026-10-04T12:00:00.000Z",
   resources:[{agentId:"a1",vehicleId:"v1",skills:[],vehicleType:"van",capacity:10,start:{lat:51.8787,lng:-0.4200},shiftEnd:"2026-10-04T12:05:00.000Z"}],
   jobs:[{jobId:"late",priority:"urgent",demand:1,requiredSkills:[],requiredVehicleTypes:["van"],stops:[{lat:52.2,lng:-0.1,windowEnd:"2026-10-04T12:01:00.000Z",serviceSeconds:0}]}]
  });
  expect(result.score.constraintBreaches).toBeGreaterThan(0);
  expect(result.warnings.some(x=>x.includes("breach"))).toBe(true);
  expect(result.routes[0].stops[0].constraintState).toBe("breach");
 });

 test("haversine fallback is deterministic",()=>{
  const a={lat:51.8787,lng:-0.4200},b={lat:51.88,lng:-0.417};
  expect(haversineMetres(a,b)).toBe(haversineMetres(a,b));
  expect(haversineMetres(a,b)).toBeGreaterThan(100);
 });
});
