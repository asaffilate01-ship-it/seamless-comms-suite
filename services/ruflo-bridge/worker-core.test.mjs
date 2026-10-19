import test from "node:test";
import assert from "node:assert/strict";
import {processOneRufloProbe,validateRufloWorkerConfig} from "./worker-core.mjs";
import {resolveGatewayUrl,createScopedGateway} from "./worker.mjs";

const data={
 tenantId:"0eea3213-310e-4e29-9d91-aa312b1e0001",productKey:"dishbee",
 region:"GB",expectedDigest:"a".repeat(64),
};
const task={
 taskId:"e1fd6013-310e-4e29-9d91-aa312b1e0002",
 claimToken:"e1fd6013-310e-4e29-9d91-aa312b1e0003",
 toolName:"swarm_health",expectedDigest:data.expectedDigest,
 dataRegion:"GB",leaseExpiresAt:new Date(Date.now()+60000).toISOString(),
};
const receiptFactory=()=>"ruflo_00000000-0000-4000-8000-000000000002";
function harness({claim=task,preflight=null,fail=null}={}){
 const events=[];let stopped=false;
 const gateway=async(op,params)=>{
  events.push(op);
  if(op==="probe.claim")return claim;
  if(op==="probe.preflight")return preflight??{
   allowed:true,toolName:task.toolName,expectedDigest:data.expectedDigest,
   dataRegion:data.region,leaseExpiresAt:task.leaseExpiresAt,
  };
  if(op==="probe.finish"){
   assert.equal(params.receiptRef,receiptFactory());
   return{status:params.result,alreadyExists:false};
  }
  throw Error("Unexpected gateway operation");
 };
 const clientFactory=async()=>({
  connect:async()=>{events.push("client.connect");return{probeTools:["swarm_health"]};},
  probe:async(name)=>{events.push("client.probe");if(fail)throw fail;return{received:true,tool:name};},
  stop:()=>{events.push("client.stop");stopped=true;},
 });
 return{events,gateway,clientFactory,wasStopped:()=>stopped};
}
test("fully verified sandbox executes one allowlisted read-only tool and saves receipt",async()=>{
 const h=harness();
 const result=await processOneRufloProbe({...h,config:data,receiptFactory});
 assert.deepEqual(result,{status:"passed",processed:1,receiptRecorded:true});
 assert.deepEqual(h.events,["probe.claim","probe.preflight","client.connect","probe.preflight","client.probe","client.stop","probe.finish"]);
 assert.equal(h.wasStopped(),true);
});
test("empty queue never spawns Ruflo or starts a model",async()=>{
 const h=harness({claim:null});
 const r=await processOneRufloProbe({...h,config:data,receiptFactory});
 assert.equal(r.status,"idle");assert.deepEqual(h.events,["probe.claim"]);
});
test("revoked pilot after claim fails before Ruflo process starts",async()=>{
 const h=harness({preflight:{allowed:false}});
 const r=await processOneRufloProbe({...h,config:data,receiptFactory});
 assert.equal(r.status,"denied");assert.deepEqual(h.events,["probe.claim","probe.preflight","probe.finish"]);
});
test("in-flight revocation after MCP handshake skips tools/call and shuts down",async()=>{
 let checks=0,probed=false,stopped=false;
 const h=harness();
 const gateway=async(op,p)=>{
  if(op==="probe.preflight"){
   checks++;return checks===2?{allowed:false}:{
    allowed:true,toolName:task.toolName,expectedDigest:data.expectedDigest,
    dataRegion:"GB",leaseExpiresAt:task.leaseExpiresAt,
   };
  }
  return h.gateway(op,p);
 };
 const clientFactory=async()=>({
  connect:async()=>({probeTools:["swarm_health"]}),
  probe:async()=>{probed=true;return{tool:"swarm_health",received:true};},
  stop:()=>{stopped=true;},
 });
 const result=await processOneRufloProbe({config:data,gateway,clientFactory,receiptFactory});
 assert.equal(result.status,"denied");assert.equal(probed,false);assert.equal(stopped,true);
});
test("cross-region/digest, expired lease and unsafe MCP tools reject before process starts",async()=>{
 for(const modified of [
  {dataRegion:"DE"},{expectedDigest:"b".repeat(64)},
  {leaseExpiresAt:new Date(Date.now()-5000).toISOString()},
  {toolName:"agent_execute"},{toolName:"swarm_init"},
 ]){
  const h=harness({claim:{...task,...modified}});
  const r=await processOneRufloProbe({...h,config:data,receiptFactory});
  assert.equal(r.status,"denied",JSON.stringify(modified));
  assert.equal(h.events.includes("client.connect"),false);
 }
});
test("MCP failures generate generic server receipts and no raw errors",async()=>{
 const h=harness({fail:new Error("secret input accidentally appeared from MCP")});
 const result=await processOneRufloProbe({...h,config:data,receiptFactory});
 assert.equal(result.status,"failed");
 assert.equal(JSON.stringify(result).includes("secret"),false);
});
test("tenant config and remote API require exact scopes and HTTPS",async()=>{
 assert.throws(()=>validateRufloWorkerConfig({...data,tenantId:"other"}),/Explicit tenant/);
 for(const url of ["http://example.com/api/platform/ruflo-probe","https://example.com/","https://name:pw@example.com/api/platform/ruflo-probe","https://example.com/api/platform/ruflo-probe?x=1"])
  assert.throws(()=>resolveGatewayUrl(url));
 const requests=[];
 const mockFetch=async(url,init)=>{
  requests.push({url,init});
  return{ok:true,headers:new Headers(),text:async()=>JSON.stringify({ok:true,data:null})};
 };
 const gateway=createScopedGateway({url:"https://omniqora.example/api/platform/ruflo-probe",
  credential:"ruflo_testworker.fake_test_secret_payload_length_min_32",tenantId:data.tenantId,
  productKey:data.productKey,region:"GB",fetchImpl:mockFetch});
 assert.equal(await gateway("probe.claim",{}),null);
 assert.equal(requests[0].init.redirect,"error");
 assert.equal(JSON.parse(requests[0].init.body).tenantId,data.tenantId);
});
