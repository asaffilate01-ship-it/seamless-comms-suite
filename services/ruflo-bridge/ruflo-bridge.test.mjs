import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile,mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {RufloMcpClient,RUFLO_PROBE_TOOLS} from "./mcp-client.mjs";
import {planRufloSandboxProbe} from "./sandbox-policy.mjs";

const mockPath=fileURLToPath(new URL("./fixtures/mock-ruflo-mcp.mjs",import.meta.url));
const hash=createHash("sha256").update(await readFile(mockPath)).digest("hex");
test("pinned MCP stdio sandbox handshakes and refuses mutating tools",async()=>{
 const folder=await mkdtemp(join(tmpdir(),"oq-ruflo-test-"));
 const client=new RufloMcpClient({cliPath:mockPath,expectedSha256:hash,sandboxDir:folder,timeoutMs:4000});
 try{
  const info=await client.connect();
  assert.equal(info.protocolVersion,"2025-03-26");
  assert.deepEqual(info.probeTools,["swarm_health","agent_list"]);
  assert.equal((await client.probe("swarm_health")).received,true);
  await assert.rejects(client.probe("task_create"),/read-only/);
  await assert.rejects(client.probe("memory_store"),/read-only/);
 }finally{client.stop();await rm(folder,{recursive:true,force:true});}
});
test("file integrity and bounded paths are mandatory",async()=>{
 assert.throws(()=>new RufloMcpClient({cliPath:"npx",expectedSha256:hash,sandboxDir:"/tmp"}),/absolute/);
 assert.throws(()=>new RufloMcpClient({cliPath:mockPath,expectedSha256:"latest",sandboxDir:"/tmp"}),/SHA-256/);
 const folder=await mkdtemp(join(tmpdir(),"oq-ruflo-bad-"));
 const client=new RufloMcpClient({cliPath:mockPath,expectedSha256:"0".repeat(64),sandboxDir:folder});
 try{await assert.rejects(client.connect(),/hash mismatch/);}
 finally{client.stop();await rm(folder,{recursive:true,force:true});}
});
test("multi-tenant pilot is refused unless independently reviewed and bounded",()=>{
 const valid={
  tenantId:"0eea3213-310e-4e29-9d91-aa312b1e0001",
  productKey:"dishbee",runId:"e1fd6013-310e-4e29-9d91-aa312b1e0002",
  jobId:"e1fd6013-310e-4e29-9d91-aa312b1e0003",
  pilotStatus:"shortlisted",bindingStatus:"sandbox_verified",
  entitlementActive:true,jobStatus:"queued",reservationStatus:"reserved",
  risk:"standard",toolName:"swarm_health",verifiedTools:["swarm_health"],
  tenantGrantedTools:["swarm_health"],region:"GB",approvedRegion:"GB",
  includesCustomerContent:false,
 };
 assert.deepEqual(RUFLO_PROBE_TOOLS,["swarm_health","swarm_status","agent_list"]);
 const ready=planRufloSandboxProbe(valid);
 assert.equal(ready.status,"sandbox_probe_eligible");
 assert.equal(ready.probe.customerContentIncluded,false);
 assert.equal(ready.probe.requiresFreshWorkerPreflight,true);
 for(const changed of [
  {tenantId:"not-a-uuid"},{pilotStatus:"requested"},{bindingStatus:"disabled"},
  {entitlementActive:false},{jobStatus:"processing"},{reservationStatus:"settled"},
  {risk:"regulated"},{toolName:"task_create"},{verifiedTools:[]},
  {tenantGrantedTools:[]},{approvedRegion:"DE"},{includesCustomerContent:true},
 ]){
  const result=planRufloSandboxProbe({...valid,...changed});
  assert.equal(result.status,"blocked",JSON.stringify(changed));
  assert.equal(result.probe,null);
 }
});
