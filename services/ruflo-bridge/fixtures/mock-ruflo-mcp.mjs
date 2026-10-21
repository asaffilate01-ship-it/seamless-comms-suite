// Test fixture only, never an upstream Ruflo implementation or production endpoint.
import readline from "node:readline";
const reader=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
reader.on("line",line=>{
 let input;try{input=JSON.parse(line);}catch{return;}
 if(typeof input.id!=="number")return;
 let result;
 if(input.method==="initialize"){
  result={protocolVersion:"2025-03-26",capabilities:{tools:{}},serverInfo:{name:"mock-ruflo",version:"0.0.0"}};
 }else if(input.method==="tools/list"){
  result={tools:[{name:"swarm_health",inputSchema:{type:"object"}},{name:"agent_list",inputSchema:{type:"object"}},
   {name:"swarm_status",inputSchema:{type:"object"}},{name:"swarm_init",inputSchema:{type:"object"}},
   {name:"task_create",inputSchema:{type:"object"}}]};
 }else if(input.method==="tools/call"&&input.params?.name==="swarm_health"){
  result={content:[{type:"text",text:"mock healthy"}]};
 }else if(input.method==="tools/call"&&input.params?.name==="swarm_status"){
  result={isError:true,content:[{type:"text",text:"upstream test error"}]};
 }else{
  process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:input.id,error:{code:-32601,message:"Unknown test tool"}})+"\n");
  return;
 }
 process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:input.id,result})+"\n");
});
