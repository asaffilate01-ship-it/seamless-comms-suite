import { createHash,timingSafeEqual } from "node:crypto";
import { z } from "zod";
function equal(a:string,b:string){const aa=createHash("sha256").update(a).digest(),bb=createHash("sha256").update(b).digest();return timingSafeEqual(aa,bb);}
export async function servePracticeWorker(request:Request){
 const expected=process.env.CONTROL_PLANE_WORKER_SECRET??"";const auth=request.headers.get("authorization")??"";const token=auth.startsWith("Bearer ")?auth.slice(7):"";
 if(expected.length<32||!token||!equal(expected,token))return Response.json({error:"Worker authorization refused"},{status:401});
 let input:{limit:number};try{const raw=await request.text();if(raw.length>1024)throw new Error();input=z.object({limit:z.number().int().min(1).max(100).default(50)}).parse(raw?JSON.parse(raw):{});}catch{return Response.json({error:"Invalid worker request"},{status:400});}
 try{const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const{data,error}=await(supabaseAdmin as any).rpc("run_practice_automation",{_limit:input.limit});if(error)throw error;return Response.json(data,{headers:{"cache-control":"no-store"}});}
 catch{return Response.json({error:"Practice automation failed"},{status:503});}
}
