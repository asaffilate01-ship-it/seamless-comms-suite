#!/usr/bin/env node
/**
 * Explicit one-shot operator job. Never auto-start in the Lovable web process.
 * Never gives the Ruflo child process a service token, customer prompt or key.
 */
import {pathToFileURL} from "node:url";
import {RufloMcpClient} from "./mcp-client.mjs";
import {processOneRufloProbe,validateRufloWorkerConfig} from "./worker-core.mjs";

export function resolveGatewayUrl(value){
 if(typeof value!=="string")throw new Error("Ruflo gateway URL is required");
 const url=new URL(value);
 if(url.protocol!=="https:"||url.username||url.password||url.hash||url.search||
    url.pathname!=="/api/platform/ruflo-probe"||!url.hostname)
  throw new Error("The configured Ruflo gateway must be an explicit HTTPS control-plane route");
 return url.toString();
}
export function createScopedGateway({url,credential,tenantId,productKey,region,fetchImpl=fetch}){
 const destination=resolveGatewayUrl(url);
 if(typeof credential!=="string"||!/^[A-Za-z0-9_-]{8,80}\.[^\s]{32,256}$/.test(credential))
  throw new Error("A scoped service identity credential is required");
 return async(operation,payload={})=>{
  const response=await fetchImpl(destination,{
   method:"POST",redirect:"error",headers:{
    "content-type":"application/json","authorization":"Bearer "+credential,
    "accept":"application/json",
   },
   body:JSON.stringify({...payload,operation,tenantId,productKey,region}),
   signal:AbortSignal.timeout(8000),
  });
  if(!response.ok)throw new Error("Ruflo probe gateway refused the request");
  const size=Number(response.headers.get("content-length")??0);
  if(!Number.isFinite(size)||size>8192)throw new Error("Oversized gateway response");
  const raw=await response.text();
  if(raw.length>8192)throw new Error("Oversized gateway response");
  let parsed;
  try{parsed=JSON.parse(raw);}catch{throw new Error("Malformed gateway response");}
  if(parsed?.ok!==true)throw new Error("Ruflo probe gateway refused the request");
  return parsed.data??null;
 };
}
export async function main(env=process.env){
 if(env.RUFLO_ENABLE_SANDBOX_WORKER!=="1"||process.argv.length!==3||
    process.argv[2]!=="--once")throw new Error("Ruflo worker requires explicit --once and operator enablement");
 const config=validateRufloWorkerConfig({
  tenantId:env.RUFLO_TENANT_ID,productKey:env.RUFLO_PRODUCT_KEY,
  region:env.RUFLO_REGION,expectedDigest:env.RUFLO_BINARY_SHA256,
 });
 const gateway=createScopedGateway({
  url:env.OMNIQORA_RUFLO_GATEWAY_URL,credential:env.RUFLO_WORKER_CREDENTIAL,
  tenantId:config.tenantId,productKey:config.productKey,region:config.region,
 });
 const result=await processOneRufloProbe({
  config,gateway,
  clientFactory:()=>new RufloMcpClient({
   cliPath:env.RUFLO_CLI_PATH,expectedSha256:config.expectedDigest,
   sandboxDir:env.RUFLO_SANDBOX_DIR,timeoutMs:8000,
  }),
 });
 // Only coarse metrics; no tenant identity, prompt, provider output or secrets.
 console.log(JSON.stringify({mode:"ruflo-sandbox-health-only",status:result.status,processed:result.processed}));
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(()=>{
  console.error("Ruflo sandbox worker refused or failed; inspect server-side metadata only");
  process.exitCode=1;
 });
}
