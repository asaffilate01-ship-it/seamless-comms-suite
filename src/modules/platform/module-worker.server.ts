import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { runModuleEventBatch } from "./event-worker.server";
import { createDefaultModuleProcessorRegistry } from "./default-processors.server";

function authorised(request:Request){
 const expected=process.env.OMNIQORA_WORKER_TOKEN??"";
 if(expected.length<32)return false;
 const header=request.headers.get("authorization")??"";
 if(!header.startsWith("Bearer "))return false;
 const supplied=header.slice(7);
 const a=Buffer.from(expected);const b=Buffer.from(supplied);
 return a.length===b.length&&timingSafeEqual(a,b);
}

export async function serveModuleEventWorker(request:Request){
 if(!authorised(request))return Response.json({error:"Worker authorization refused"},{status:401,headers:{"cache-control":"no-store"}});
 let input:unknown={};try{const raw=await request.text();input=raw?JSON.parse(raw):{};}catch{return Response.json({error:"Invalid JSON"},{status:400});}
 const parsed=z.object({limit:z.number().int().min(1).max(100).default(20)}).parse(input);
 try{const results=await runModuleEventBatch(createDefaultModuleProcessorRegistry(),{limit:parsed.limit});return Response.json({processed:results.length,results},{headers:{"cache-control":"no-store"}});}catch(error){return Response.json({error:error instanceof Error?error.message:"Worker failed"},{status:503,headers:{"cache-control":"no-store"}});}
}