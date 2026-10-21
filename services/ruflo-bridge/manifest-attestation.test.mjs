import assert from "node:assert/strict";
import test from "node:test";
import {attestReadOnlyManifest,assertManifestPin} from "./manifest-attestation.mjs";

const health={name:"swarm_health",inputSchema:{type:"object",properties:{swarmId:{type:"string"}}}};
const agents={name:"agent_list",inputSchema:{properties:{},type:"object"}};
test("read-only MCP schemas are canonical, order-independent and hash pinned",()=>{
 const a=attestReadOnlyManifest([health,agents,{name:"task_create",inputSchema:{type:"object"}}]);
 const b=attestReadOnlyManifest([agents,health]);
 assert.equal(a.sha256,b.sha256);
 assert.deepEqual(a.toolNames,["agent_list","swarm_health"]);
 assert.equal(assertManifestPin(b.sha256,a.sha256),true);
 assert.throws(()=>assertManifestPin(a.sha256,"0".repeat(64)),/mismatch/);
});
test("a changed upstream tool signature cannot reuse the approved hash",()=>{
 const current=attestReadOnlyManifest([health]).sha256;
 const modified=attestReadOnlyManifest([{name:"swarm_health",inputSchema:{type:"object",properties:{swarmId:{type:"integer"}}}}]).sha256;
 assert.notEqual(current,modified);
 assert.throws(()=>assertManifestPin(modified,current),/mismatch/);
});
test("unknown effects, required arguments, duplicate names, deep schemas and no probes fail closed",()=>{
 assert.throws(()=>attestReadOnlyManifest([{...health,inputSchema:{type:"object",required:["swarmId"]}}]),/undeclared arguments/);
 assert.throws(()=>attestReadOnlyManifest([health,health]),/Duplicate/);
 assert.throws(()=>attestReadOnlyManifest([{name:"agent_execute",inputSchema:{type:"object"}}]),/No approved/);
 assert.throws(()=>attestReadOnlyManifest([{...health,inputSchema:{type:"object",properties:{__proto__:null,constructor:"x"}}}]),/Unsafe/);
 assert.throws(()=>attestReadOnlyManifest(Array(401).fill({name:"x"})),/Unsupported/);
});
