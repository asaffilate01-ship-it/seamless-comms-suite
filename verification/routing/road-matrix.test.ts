import {describe,test,expect} from "bun:test";
import {googleRoadMatrix,orsRoadMatrix,straightLineMatrix,validateMatrixPoints} from "../../src/modules/routing/road-matrix.provider";
const a={lat:51.87,lng:-0.42},b={lat:51.9,lng:-0.4};
const fake=(body:unknown,status=200,observer?:(url:string,init:RequestInit)=>void):typeof fetch=>
 (async(url:RequestInfo|URL,init?:RequestInit)=>{
  observer?.(String(url),init??{});
  return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
 }) as typeof fetch;
describe("road matrix fixed-provider contract",()=>{
 test("rejects oversize and invalid coordinates",()=>{
  expect(()=>validateMatrixPoints(Array(9).fill(a),[b])).toThrow();
  expect(()=>validateMatrixPoints([{lat:Infinity,lng:0}],[b])).toThrow();
 });
 test("Google traffic aware matrix uses fixed endpoint, field mask and seconds",async()=>{
  let request="";
  const x=await googleRoadMatrix({origins:[a],destinations:[a,b],mode:"driving",trafficAware:true,apiKey:"test"},
   fake([{originIndex:0,destinationIndex:0,distanceMeters:0,duration:"0s",condition:"ROUTE_EXISTS"},
   {originIndex:0,destinationIndex:1,distanceMeters:4300,duration:"490.5s",condition:"ROUTE_EXISTS"}],200,(url,init)=>{
    expect(url).toBe("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix");
    expect((init.headers as Record<string,string>)["X-Goog-FieldMask"]).toContain("distanceMeters");
    request=String(init.body);
   }));
  expect(request).toContain("TRAFFIC_AWARE");
  expect(x.quality).toBe("traffic");
  expect(x.cells[1].durationSeconds).toBe(491);
 });
 test("Google provider fallback cannot claim traffic",async()=>{
  const x=await googleRoadMatrix({origins:[a],destinations:[b],mode:"driving",trafficAware:true,apiKey:"test"},
   fake([{originIndex:0,destinationIndex:0,distanceMeters:3,duration:"2s",
    condition:"ROUTE_EXISTS",fallbackInfo:{routingMode:"TRAFFIC_UNAWARE"}}]));
  expect(x.quality).toBe("road");
 });
 test("duplicate Google indices fail closed",async()=>{
  await expect(googleRoadMatrix({origins:[a],destinations:[a,b],mode:"driving",trafficAware:false,apiKey:"test"},
   fake([{originIndex:0,destinationIndex:0,distanceMeters:1,duration:"2s",condition:"ROUTE_EXISTS"},
         {originIndex:0,destinationIndex:0,distanceMeters:2,duration:"3s",condition:"ROUTE_EXISTS"}])))
  .rejects.toThrow(/duplicate/);
 });
 test("ORS receives lon-lat and correct source/destination indices",async()=>{
  let req:any;
  const x=await orsRoadMatrix({origins:[a],destinations:[a,b],mode:"driving",apiKey:"test"},
   fake({distances:[[0,2300]],durations:[[0,140]]},200,(url,init)=>{
    expect(url).toBe("https://api.openrouteservice.org/v2/matrix/driving-car");
    req=JSON.parse(String(init.body));
   }));
  expect(req.locations[0]).toEqual([-0.42,51.87]);
  expect(req.sources).toEqual(["0"]);
  expect(req.destinations).toEqual(["1","2"]);
  expect(x.cells[1].distanceMetres).toBe(2300);
 });
 test("fallback has no invented ETA",()=>{
  const x=straightLineMatrix([a],[b]);
  expect(x.quality).toBe("straight_line_estimate");
  expect(x.cells[0].status).toBe("estimated");
  expect(x.cells[0].durationSeconds).toBeNull();
 });
 test("provider error never exposes response body",async()=>{
  await expect(orsRoadMatrix({origins:[a],destinations:[b],mode:"driving",apiKey:"SECRET"},
   fake({message:"SECRET"},429))).rejects.toThrow("Road matrix provider returned HTTP 429");
 });
});
