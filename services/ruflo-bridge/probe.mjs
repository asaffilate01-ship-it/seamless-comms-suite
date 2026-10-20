/**
 * Explicit engineering-only CLI smoke: no cloud credentials and no tenant data.
 * Supply an already reviewed, locally installed Ruflo bin/cli.js and its digest.
 */
import {RufloMcpClient} from "./mcp-client.mjs";
const client=new RufloMcpClient({
 cliPath:process.env.RUFLO_CLI_PATH,
 expectedSha256:process.env.RUFLO_BINARY_SHA256,
 sandboxDir:process.env.RUFLO_SANDBOX_DIR,
});
try{
 const connected=await client.connect();
 const chosen=["swarm_health","swarm_status","agent_list"].find(tool=>connected.probeTools.includes(tool));
 const probe=chosen?await client.probe(chosen):null;
 console.log(JSON.stringify({
  integration:"ruflo",mode:"read_only_sandbox_probe",
  handshake:true,protocolVersion:connected.protocolVersion,
  readOnlyToolNames:connected.probeTools,probeManifestSha256:connected.probeManifestSha256,
  probeReceived:probe?.received??false,
  tenantExecutionEnabled:false,
 }));
}catch{
 console.error("Ruflo isolated MCP probe failed; no tenant integration activated");
 process.exitCode=1;
}finally{client.stop();}
