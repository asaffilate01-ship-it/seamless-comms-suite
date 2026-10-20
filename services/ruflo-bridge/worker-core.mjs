import {randomUUID} from "node:crypto";
import {RUFLO_PROBE_TOOLS} from "./mcp-client.mjs";
const id=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const product=/^[a-z0-9][a-z0-9.-]{1,80}$/;
const digest=/^[a-f0-9]{64}$/;
export function validateRufloWorkerConfig(config){
 if(!config||!id.test(config.tenantId)||!product.test(config.productKey)||
    !/^[A-Z]{2}$/.test(config.region)||!digest.test(config.expectedDigest))
  throw new Error("Explicit tenant, product, data region and pinned Ruflo SHA-256 required");
 return Object.freeze({
  tenantId:config.tenantId,productKey:config.productKey,region:config.region,
  expectedDigest:config.expectedDigest,
 });
}
function claimIsValid(task,config){
 return !!task&&id.test(task.taskId)&&id.test(task.claimToken)&&
  RUFLO_PROBE_TOOLS.includes(task.toolName)&&task.expectedDigest===config.expectedDigest&&
  task.dataRegion===config.region&&
  Number.isFinite(Date.parse(task.leaseExpiresAt))&&
  Date.parse(task.leaseExpiresAt)>Date.now();
}
function preflightIsValid(preflight,task,config){
 return preflight?.allowed===true&&preflight.toolName===task.toolName&&
  preflight.expectedDigest===config.expectedDigest&&
  preflight.dataRegion===config.region&&
  Number.isFinite(Date.parse(preflight.leaseExpiresAt))&&
  Date.parse(preflight.leaseExpiresAt)>Date.now();
}

/**
 * One gated read-only MCP probe, never a customer/business AI job.
 * gateway(operation, params) must enforce scoped server identity and SQL RPCs.
 * All tool outputs are discarded. No model call, agent spawn or memory writes.
 */
export async function processOneRufloProbe({gateway,clientFactory,config,receiptFactory=()=>"ruflo_"+randomUUID()}){
 const cfg=validateRufloWorkerConfig(config);
 if(typeof gateway!=="function"||typeof clientFactory!=="function")
  throw new Error("Scoped gateway and isolated client factory required");
 const task=await gateway("probe.claim",{});
 if(task===null||task===undefined)return {status:"idle",processed:0};
 if(task?.status==="denied")return {status:"denied",processed:0};
 if(!id.test(task?.taskId)||!id.test(task?.claimToken))
  throw new Error("Invalid Ruflo claim was refused");
 let result="denied",errorCode="policy_denied";
 let client;
 try{
  if(!claimIsValid(task,cfg))throw new Error("Policy verification denied");
  const before=await gateway("probe.preflight",{taskId:task.taskId,claimToken:task.claimToken});
  if(!preflightIsValid(before,task,cfg))throw new Error("Policy verification denied");
  client=await clientFactory();
  const connected=await client.connect();
  if(!Array.isArray(connected?.probeTools)||!connected.probeTools.includes(task.toolName))
   throw new Error("Approved Ruflo tool is unavailable");
  // Rechecking prevents a revoke during process startup from reaching tools/call.
  const immediatelyBefore=await gateway("probe.preflight",{taskId:task.taskId,claimToken:task.claimToken});
  if(!preflightIsValid(immediatelyBefore,task,cfg))throw new Error("Policy verification denied");
  const receipt=await client.probe(task.toolName);
  if(receipt?.received!==true||receipt?.tool!==task.toolName)
   throw new Error("Ruflo MCP probe returned no success receipt");
  result="passed";errorCode=null;
 }catch(error){
  // Never store raw provider/MCP tool errors in audit records.
  const message=error instanceof Error?error.message:"";
  if(message==="Policy verification denied"){result="denied";errorCode="policy_denied";}
  else if(/timed out/i.test(message)){result="timed_out";errorCode="timeout";}
  else {result="failed";errorCode="probe_error";}
 }finally{
  try{client?.stop();}catch{}
 }
 // Keep one immutable receipt reference if a network retry is necessary.
 const receiptRef=receiptFactory();
 if(typeof receiptRef!=="string"||!/^ruflo_[a-f0-9-]{36}$/i.test(receiptRef))
  throw new Error("Invalid generated Ruflo audit receipt");
 const done=await gateway("probe.finish",{
  taskId:task.taskId,claimToken:task.claimToken,result,receiptRef,errorCode,
 });
 if(!["passed","failed","timed_out","denied"].includes(done?.status))
  throw new Error("Trusted Ruflo report was not acknowledged");
 return {status:done.status,processed:1,receiptRecorded:true};
}
