/**
 * Exact input-schema attestation of Ruflo's selected read-only MCP tools.
 * A successful MCP handshake or a familiar tool name alone is not a grant.
 * Only independently reviewed, immutable hashes may be used by workers.
 */
import {createHash} from "node:crypto";

export const SAFE_PROBE_NAMES=Object.freeze(["swarm_health","swarm_status","agent_list"]);
const MAX_MANIFEST_BYTES=128*1024;
const nameAllowed=new Set(SAFE_PROBE_NAMES);

function canonical(value,depth=0){
 if(depth>24)throw new Error("Ruflo MCP schema nesting exceeded");
 if(value===null||typeof value==="string"||typeof value==="boolean")return value;
 if(typeof value==="number"){
  if(!Number.isFinite(value))throw new Error("Non-finite Ruflo schema value");
  return value;
 }
 if(Array.isArray(value)){
  if(value.length>500)throw new Error("Ruflo schema array exceeded limit");
  return value.map(item=>canonical(item,depth+1));
 }
 if(typeof value!=="object")throw new Error("Non-JSON Ruflo MCP tool schema");
 const keys=Object.keys(value).sort();
 if(keys.length>500)throw new Error("Ruflo schema property limit exceeded");
 const obj=Object.create(null);
 for(const key of keys){
  if(key==="__proto__"||key==="constructor"||key==="prototype")
   throw new Error("Unsafe Ruflo MCP schema property");
  obj[key]=canonical(value[key],depth+1);
 }
 return obj;
}
const validHash=digest=>typeof digest==="string"&&/^[a-f0-9]{64}$/.test(digest);

/**
 * Fingerprint exactly the selected safe tool names and their full input schemas.
 * No descriptions, untrusted text, tool results, customer content or credentials
 * are stored. Pagination order cannot affect the digest.
 */
export function attestReadOnlyManifest(tools){
 if(!Array.isArray(tools)||tools.length>400)
  throw new Error("Unsupported Ruflo MCP tool manifest");
 const found=new Map();
 for(const tool of tools){
  if(!tool||!nameAllowed.has(tool.name))continue;
  if(found.has(tool.name))throw new Error("Duplicate Ruflo probe tool definition");
  if(tool.inputSchema?.type!=="object"||
     (tool.inputSchema.required!==undefined&&
      (!Array.isArray(tool.inputSchema.required)||tool.inputSchema.required.length!==0)))
   throw new Error("Read-only Ruflo probe requires undeclared arguments");
  found.set(tool.name,canonical(tool.inputSchema));
 }
 if(found.size===0)throw new Error("No approved read-only Ruflo tools found");
 const records=[...found].sort(([a],[b])=>a.localeCompare(b))
  .map(([name,inputSchema])=>({name,inputSchema}));
 const packed=JSON.stringify({version:1,tools:records});
 if(Buffer.byteLength(packed)>MAX_MANIFEST_BYTES)
  throw new Error("Ruflo probe tool manifest exceeded size limit");
 return Object.freeze({
  sha256:createHash("sha256").update(packed,"utf8").digest("hex"),
  toolNames:records.map(x=>x.name),
  format:"ruflo-mcp-read-only-tools-v1",
 });
}
export function assertManifestPin(received,expected){
 if(!validHash(expected)||!validHash(received)||received!==expected)
  throw new Error("Independently reviewed Ruflo MCP manifest digest mismatch");
 return true;
}
