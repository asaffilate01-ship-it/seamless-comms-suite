import {describe,expect,test} from "bun:test";
import {verifiedRoadGraph,type RoadMatrixEvidence} from "../../src/modules/routing/road-graph";
import {optimiseNativeRoutes} from "../../src/modules/routing/service.server";
const time="2026-10-15T08:00:00.000Z";
const nodes=Array.from({length:16},(_,i)=>({lat:51.75+i*.002,lng:-0.42+i*.0001}));
const cells=nodes.flatMap((_,i)=>nodes.map((__,j)=>({
 originIndex:i,destinationIndex:j,status:"ok" as const,
 distanceMetres:Math.abs(i-j)*350,durationSeconds:Math.abs(i-j)*40
})));
const base:RoadMatrixEvidence={
 provider:"maps.openrouteservice",quality:"road",observedAt:time,
 origins:nodes,destinations:nodes,cells
};
describe("sixteen node road graph",()=>{
 test("accepts 256 trusted directional road-matrix cells",()=>{
  const graph=verifiedRoadGraph(base,nodes,new Date(time));
  expect(graph.get(nodes[0],nodes[15])?.durationSeconds).toBe(600);
  expect(graph.get(nodes[15],nodes[1])?.distanceMetres).toBe(4900);
 });
 test("rejects incomplete or duplicate evidence even with correct tile count",()=>{
  expect(()=>verifiedRoadGraph({...base,cells:cells.slice(1)},nodes,new Date(time))).toThrow(/incomplete/);
  expect(()=>verifiedRoadGraph({...base,cells:[...cells.slice(0,255),cells[0]]},nodes,new Date(time))).toThrow(/duplicate/);
 });
 test("rejects source drift, expiry and 17-node inputs",()=>{
  expect(()=>verifiedRoadGraph(base,nodes.map((n,i)=>i===2?{...n,lat:n.lat+.004}:n),new Date(time))).toThrow();
  expect(()=>verifiedRoadGraph(base,nodes,new Date("2026-10-16T09:00:00.000Z"))).toThrow(/expired/);
  expect(()=>verifiedRoadGraph(base,[...nodes,{lat:52.1,lng:-0.1}],new Date(time))).toThrow(/cover/);
 });
 test("VRP consumes a sixteen-node road graph with multiple drivers",()=>{
  const result=optimiseNativeRoutes({startedAt:time,roadMatrix:base,
   resources:[{agentId:"north",skills:[],capacity:5,start:nodes[0]},
              {agentId:"south",skills:[],capacity:5,start:nodes[15]}],
   jobs:Array.from({length:14},(_,i)=>({
    jobId:"job"+i,priority:"normal" as const,demand:0,
    requiredSkills:[],requiredVehicleTypes:[],stops:[nodes[i+1]]
   }))});
  expect(result.routeQuality).toBe("road");
  expect(result.providerKey).toBe("maps.openrouteservice");
  expect(result.score.assignedJobs).toBe(14);
  expect(result.score.constraintBreaches).toBe(0);
 });
});
