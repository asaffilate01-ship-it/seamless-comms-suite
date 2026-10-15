import {describe,test,expect} from "bun:test";
import {assembleRoadMatrix,partitionRoadMatrix,type SettledTile} from "../../src/modules/routing/batch-matrix";
const nodes=Array.from({length:16},(_,i)=>({lat:51.5+i*.002,lng:-.4-i*.002}));
const settled=(size:number):SettledTile[]=>partitionRoadMatrix(nodes.slice(0,size)).map(t=>({
 rowOffset:t.rowOffset,columnOffset:t.columnOffset,
 status:"completed",quality:"road",providerKey:"maps.openrouteservice",
 completedAt:"2026-10-15T12:00:00.000Z",
 origins:t.origins,destinations:t.destinations,
 cells:t.origins.flatMap((_,i)=>t.destinations.map((__,j)=>({
  originIndex:i,destinationIndex:j,status:"ok" as const,
  distanceMetres:i===j&&t.rowOffset===t.columnOffset?0:1000,
  durationSeconds:i===j&&t.rowOffset===t.columnOffset?0:120
 })))
}));
describe("billed road matrix tiling",()=>{
 test("16 nodes produce four chunks and exactly 256 billed pairs",()=>{
  const parts=partitionRoadMatrix(nodes);
  expect(parts).toHaveLength(4);
  expect(parts.map(p=>p.origins.length*p.destinations.length)).toEqual([64,64,64,64]);
  const data=assembleRoadMatrix(nodes,settled(16),new Date("2026-10-15T12:01:00Z"));
  expect(data.cells).toHaveLength(256);
  expect(data.quality).toBe("road");
  expect(data.cells.some(c=>c.originIndex===15&&c.destinationIndex===15)).toBe(true);
 });
 test("9 nodes produce four uneven chunks and 81 total pairs",()=>{
  const tiles=partitionRoadMatrix(nodes.slice(0,9));
  expect(tiles.map(p=>p.origins.length*p.destinations.length)).toEqual([64,8,8,1]);
  expect(assembleRoadMatrix(nodes.slice(0,9),settled(9),
   new Date("2026-10-15T12:01:00Z")).cells).toHaveLength(81);
 });
 test("fail closed on incomplete, duplicate or moving matrix tiles",()=>{
  const all=settled(9),now=new Date("2026-10-15T12:01:00Z");
  expect(()=>assembleRoadMatrix(nodes.slice(0,9),all.slice(1),now)).toThrow(/requires all/);
  expect(()=>assembleRoadMatrix(nodes.slice(0,9),[all[0],all[0],all[2],all[3]],now)).toThrow(/Duplicate/);
  const altered=all.map((tile,i)=>i?tile:{...tile,origins:[{lat:52,lng:-.4},...tile.origins.slice(1)]});
  expect(()=>assembleRoadMatrix(nodes.slice(0,9),altered,now)).toThrow(/moved/);
 });
 test("never mix providers, expired tiles or fallback pseudo-road data",()=>{
  const all=settled(9),now=new Date("2026-10-15T12:01:00Z");
  expect(()=>assembleRoadMatrix(nodes.slice(0,9),
    all.map((tile,i)=>i?tile:{...tile,providerKey:"maps.google"}),now))
   .toThrow(/mix/);
  expect(()=>assembleRoadMatrix(nodes.slice(0,9),
    all.map((tile,i)=>i?tile:{...tile,status:"fallback",quality:"straight_line_estimate"}),now))
   .toThrow(/incomplete/);
  expect(()=>assembleRoadMatrix(nodes.slice(0,9),all,
    new Date("2026-10-17T12:01:00Z"))).toThrow(/expired/);
 });
 test("reject topology above 16 nodes",()=>{
  expect(()=>partitionRoadMatrix([...nodes,{lat:52,lng:0}])).toThrow(/16/);
 });
});
