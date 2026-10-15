import {describe,test,expect} from "bun:test";
import {collectRoadTopology,verifiedRoadGraph,type RoadMatrixEvidence} from "../../src/modules/routing/road-graph";
import {optimiseNativeRoutes} from "../../src/modules/routing/service.server";
const a={lat:51.8701,lng:-0.42},b={lat:51.8600,lng:-0.42},c={lat:51.875,lng:-0.4201};
function evidence(now:string,values:number[][],durations:number[][]):RoadMatrixEvidence{
 const nodes=[a,b,c],cells=[];
 for(let i=0;i<3;i++)for(let j=0;j<3;j++)cells.push({
  originIndex:i,destinationIndex:j,status:"ok" as const,
  distanceMetres:values[i][j],durationSeconds:durations[i][j]});
 return{provider:"maps.openrouteservice",quality:"road",observedAt:now,
  origins:nodes,destinations:nodes,cells};
}
const NOW="2026-10-15T08:00:00.000Z";
const d=[[0,100,400],[100,0,500],[400,500,0]];
const t=[[0,900,500],[900,0,100],[500,100,0]];
const rows=evidence(NOW,d,t);
const jobs=[{jobId:"delivery",priority:"normal" as const,demand:1,
 requiredSkills:[],requiredVehicleTypes:[],stops:[c]}];
const resources=[
 {agentId:"close-straight",skills:[],capacity:5,start:a},
 {agentId:"fast-road",skills:[],capacity:5,start:b}
];
describe("road-aware VRP",()=>{
 test("real road duration changes driver choice versus Haversine",()=>{
  const approximate=optimiseNativeRoutes({jobs,resources,startedAt:NOW});
  const real=optimiseNativeRoutes({jobs,resources,roadMatrix:rows,startedAt:NOW});
  expect(approximate.routes[0].agentId).toBe("close-straight");
  expect(real.routes[0].agentId).toBe("fast-road");
  expect(real.routes[0].stops[0].durationFromPreviousSeconds).toBe(100);
  expect(real.routeQuality).toBe("road");
  expect(approximate.routeQuality).toBe("straight_line_estimate");
 });
 test("road graph cannot import estimated or incomplete cells",()=>{
  const missing={...rows,cells:rows.cells.slice(1)};
  expect(()=>verifiedRoadGraph(missing,[a,b,c],new Date(NOW))).toThrow(/incomplete/);
  const fake={...rows,quality:"straight_line_estimate" as const};
  expect(()=>verifiedRoadGraph(fake,[a,b,c],new Date(NOW))).toThrow(/Only real/);
 });
 test("traffic expiry and stale locations fail closed",()=>{
  const traffic={...rows,provider:"maps.google" as const,quality:"traffic" as const};
  expect(()=>verifiedRoadGraph(traffic,[a,b,c],new Date("2026-10-15T08:11:00.000Z"))).toThrow(/expired/);
  expect(()=>verifiedRoadGraph(rows,[a,b,{lat:51.92,lng:-0.41}],new Date(NOW))).toThrow(/coordinates/);
 });
 test("unreachable legs are excluded from road-aware assignment",()=>{
  const bad={...rows,cells:rows.cells.map(x=>x.originIndex===1&&x.destinationIndex===2?
   {...x,distanceMetres:null,durationSeconds:null,status:"unreachable" as const}:x)};
  const result=optimiseNativeRoutes({jobs,resources,roadMatrix:bad,startedAt:NOW});
  expect(result.routes[0].agentId).toBe("close-straight");
  expect(result.routes[0].stops[0].durationFromPreviousSeconds).toBe(500);
 });
 test("topology deduplicates repeated stops but keeps resource origins",()=>{
  expect(collectRoadTopology(resources,[{stops:[c,c]}])).toHaveLength(3);
 });
});
