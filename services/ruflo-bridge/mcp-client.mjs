/**
 * Ruflo MCP stdio discovery adapter. Isolated engineering sandbox only.
 * Never runs npx, downloads packages, grants credentials or executes business tools.
 */
import {spawn} from "node:child_process";
import {createHash,timingSafeEqual} from "node:crypto";
import {readFile,stat} from "node:fs/promises";
import {isAbsolute} from "node:path";

export const RUFLO_PROBE_TOOLS=Object.freeze(["swarm_health","swarm_status","agent_list"]);
const MAX_STDOUT_CHARS=262144;
const MAX_TOOLS=400;
const protocolVersion="2025-03-26";

function validatePath(value,name){
 if(typeof value!=="string"||!isAbsolute(value)||value.includes("\u0000"))
  throw new Error(name+" must be an absolute local path");
}
function digestMatches(actual,expected){
 if(!/^[a-f0-9]{64}$/i.test(expected??""))return false;
 return timingSafeEqual(Buffer.from(actual,"hex"),Buffer.from(expected,"hex"));
}

export class RufloMcpClient{
 #child=null;
 #pending=new Map();
 #buffer="";
 #sequence=0;
 #stopped=false;
 constructor({cliPath,expectedSha256,sandboxDir,timeoutMs=8000,spawnProcess=spawn}={}){
  validatePath(cliPath,"Ruflo CLI path");
  validatePath(sandboxDir,"Ruflo sandbox directory");
  if(!/^[a-f0-9]{64}$/i.test(expectedSha256??""))
   throw new Error("An independently reviewed Ruflo CLI SHA-256 is required");
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)
   throw new Error("MCP timeout must be bounded");
  this.cliPath=cliPath;
  this.expectedSha256=expectedSha256.toLowerCase();
  this.sandboxDir=sandboxDir;
  this.timeoutMs=timeoutMs;
  this.spawnProcess=spawnProcess;
  this.tools=[];
 }
 async connect(){
  if(this.#child||this.#stopped)throw new Error("Ruflo client is not reusable");
  const [bytes,directory]=await Promise.all([readFile(this.cliPath),stat(this.sandboxDir)]);
  if(!directory.isDirectory())throw new Error("Ruflo sandbox directory required");
  const actual=createHash("sha256").update(bytes).digest("hex");
  if(!digestMatches(actual,this.expectedSha256))throw new Error("Ruflo executable hash mismatch");
  // Deliberately minimal environment: no SaaS credentials, API tokens or model keys.
  this.#child=this.spawnProcess(process.execPath,[this.cliPath,"mcp","start"],{
   shell:false,cwd:this.sandboxDir,stdio:["pipe","pipe","pipe"],
   env:{PATH:process.env.PATH??"",HOME:this.sandboxDir,
    XDG_CONFIG_HOME:this.sandboxDir,TMPDIR:process.env.TMPDIR??"/tmp",
    RUFLO_TELEMETRY_ENABLED:"false"},
  });
  this.#child.stdout.on("data",part=>this.#ingest(part));
  this.#child.stderr.on("data",()=>{}); // Drain, never log potential upstream secrets.
  this.#child.stdin.on("error",()=>{this.#fail("Ruflo MCP stdin closed");this.stop();});
  this.#child.on("error",()=>this.#fail("Ruflo process start failed"));
  this.#child.on("exit",()=>this.#fail("Ruflo process stopped"));
  try{
   const result=await this.#rpc("initialize",{
    protocolVersion,capabilities:{},clientInfo:{name:"omniqora-ruflo-sandbox",version:"0.1.0"},
   });
   if(!result||typeof result.protocolVersion!=="string")
    throw new Error("Ruflo MCP handshake not confirmed");
   this.#notify("notifications/initialized");
   await this.listTools();
   return {protocolVersion:result.protocolVersion,probeTools:this.tools.filter(name=>RUFLO_PROBE_TOOLS.includes(name))};
  }catch(error){this.stop();throw error;}
 }
 #ingest(part){
  if(this.#stopped)return;
  this.#buffer+=part.toString("utf8");
  if(this.#buffer.length>MAX_STDOUT_CHARS){
   this.#fail("Oversized MCP message");this.stop();return;
  }
  let pos;
  while((pos=this.#buffer.indexOf("\n"))!==-1){
   const line=this.#buffer.slice(0,pos).trim();
   this.#buffer=this.#buffer.slice(pos+1);
   if(!line)continue;
   let value;
   try{value=JSON.parse(line);}catch{this.#fail("Malformed MCP message");this.stop();return;}
   if(value?.jsonrpc!=="2.0"||typeof value.id!=="number")continue;
   const pending=this.#pending.get(value.id);
   if(!pending)continue;
   this.#pending.delete(value.id);
   clearTimeout(pending.timer);
   if(value.error)pending.reject(new Error("Ruflo MCP tool returned an error"));
   else pending.resolve(value.result);
  }
 }
 #fail(message){
  for(const entry of this.#pending.values()){clearTimeout(entry.timer);entry.reject(new Error(message));}
  this.#pending.clear();
 }
 #notify(method){
  if(!this.#child||this.#stopped)throw new Error("Ruflo is not connected");
  this.#child.stdin.write(JSON.stringify({jsonrpc:"2.0",method})+"\n");
 }
 #rpc(method,params={}){
  if(!this.#child||this.#stopped)throw new Error("Ruflo is not connected");
  const id=++this.#sequence;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{
    this.#pending.delete(id);
    reject(new Error("Ruflo MCP request timed out"));
    this.stop();
   },this.timeoutMs);
   this.#pending.set(id,{resolve,reject,timer});
   try{
    this.#child.stdin.write(JSON.stringify({jsonrpc:"2.0",id,method,params})+"\n");
   }catch{
    clearTimeout(timer);this.#pending.delete(id);
    reject(new Error("Ruflo MCP transport failed"));
   }
  });
 }
 async listTools(){
  if(!this.#child||this.#stopped)throw new Error("Ruflo is not connected");
  const found=new Set();
  let cursor;
  for(let page=0;page<4;page++){
   const result=await this.#rpc("tools/list",cursor?{cursor}:{});
   if(!Array.isArray(result?.tools)||result.tools.length>MAX_TOOLS)
    throw new Error("Invalid Ruflo MCP tool manifest");
   for(const tool of result.tools){
    if(typeof tool?.name==="string"&&tool.name.length<160)found.add(tool.name);
   }
   if(found.size>MAX_TOOLS)throw new Error("Ruflo MCP tool catalogue exceeded limit");
   cursor=typeof result.nextCursor==="string"?result.nextCursor:null;
   if(!cursor)break;
   if(page===3)throw new Error("Ruflo MCP pagination exceeded limit");
  }
  this.tools=[...found];
  return this.tools.filter(name=>RUFLO_PROBE_TOOLS.includes(name));
 }
 async probe(tool){
  if(!RUFLO_PROBE_TOOLS.includes(tool))throw new Error("Only approved, read-only Ruflo probes are permitted");
  if(!this.tools.includes(tool))throw new Error("The reviewed Ruflo tool is unavailable");
  await this.#rpc("tools/call",{name:tool,arguments:{}});
  // No untrusted tool output or potentially sensitive data leaves this process.
  return {tool,received:true,kind:"read_only_health_probe"};
 }
 stop(){
  if(this.#stopped)return;
  this.#stopped=true;
  this.#fail("Ruflo client closed");
  try{this.#child?.kill("SIGTERM");}catch{}
 }
}
