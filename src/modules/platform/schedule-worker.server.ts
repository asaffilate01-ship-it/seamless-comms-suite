import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

function authorised(request:Request){
 const expected=process.env.OMNIQORA_WORKER_TOKEN??"";
 if(expected.length<32)return false;
 const header=request.headers.get("authorization")??"";
 if(!header.startsWith("Bearer "))return false;
 const supplied=header.slice(7);const a=Buffer.from(expected);const b=Buffer.from(supplied);
 return a.length===b.length&&timingSafeEqual(a,b);
}

type ClaimedSchedule={
 id:string;tenantId:string|null;tenantProductId:string|null;moduleKey:string|null;
 scheduleKey:string;timezone:string;intervalMinutes:number|null;actionKey:string;
 actionPayload:Record<string,unknown>;nextRunAt:string;attempts:number;
};

async function executeSchedule(db:any,s:ClaimedSchedule){
 if(!s.tenantId||!s.tenantProductId)throw new Error("Tenant schedule scope required");
 if(s.actionKey!=="event.emit")throw new Error("Unsupported schedule action: "+s.actionKey);
 if(!s.intervalMinutes||s.intervalMinutes<60)throw new Error("Interval schedule requires at least 60 minutes");
 const payload=z.object({
  eventType:z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/),
  payload:z.record(z.string(),z.unknown()).default({})
 }).parse(s.actionPayload);
 const{data:tp,error:tpError}=await db.from("tenant_products").select("product_key,status")
  .eq("id",s.tenantProductId).eq("tenant_id",s.tenantId).maybeSingle();
 if(tpError||!tp||tp.status!=="active")throw new Error("Active tenant product required");
 const eventId=randomUUID();
 const idempotencyKey="schedule:"+s.id+":"+s.nextRunAt;
 const{data:existing}=await db.from("platform_events").select("id")
  .eq("tenant_id",s.tenantId).eq("product_key",tp.product_key).eq("idempotency_key",idempotencyKey).maybeSingle();
 if(!existing){
  const{error}=await db.from("platform_events").insert({
   id:eventId,tenant_id:s.tenantId,tenant_product_id:s.tenantProductId,product_key:tp.product_key,
   event_type:payload.eventType,event_version:1,occurred_at:new Date().toISOString(),environment:"production",
   subject_type:"platform_schedule",subject_id:s.id,correlation_id:s.id,causation_id:null,
   idempotency_key:idempotencyKey,data_classification:"internal",
   payload:{...payload.payload,scheduleId:s.id,scheduleKey:s.scheduleKey}
  });
  if(error)throw new Error(error.message);
 }
 const base=Math.max(Date.parse(s.nextRunAt),Date.now());
 return new Date(base+s.intervalMinutes*60000).toISOString();
}

export async function runScheduleBatch(limit=20){
 const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
 const{data:claimed,error}=await db.rpc("claim_platform_schedules",{_limit:limit});
 if(error)throw new Error(error.message);
 const results:Array<Record<string,unknown>>=[];
 for(const raw of claimed??[]){
  const schedule=raw as ClaimedSchedule;
  try{
   const nextRunAt=await executeSchedule(db,schedule);
   const{error:finishError}=await db.rpc("finish_platform_schedule",{
    _schedule:schedule.id,_success:true,_next_run_at:nextRunAt,_error:null
   });
   if(finishError)throw new Error(finishError.message);
   results.push({scheduleId:schedule.id,status:"completed",nextRunAt});
  }catch(error){
   const message=error instanceof Error?error.message:"Schedule failed";
   const retryAt=new Date(Date.now()+5*60000).toISOString();
   await db.rpc("finish_platform_schedule",{
    _schedule:schedule.id,_success:false,_next_run_at:retryAt,_error:message
   });
   results.push({scheduleId:schedule.id,status:"failed",error:message,retryAt});
  }
 }
 return results;
}

export async function serveScheduleWorker(request:Request){
 if(!authorised(request))return Response.json({error:"Worker authorization refused"},{status:401,headers:{"cache-control":"no-store"}});
 let input:unknown={};try{const raw=await request.text();input=raw?JSON.parse(raw):{};}catch{return Response.json({error:"Invalid JSON"},{status:400});}
 const parsed=z.object({limit:z.number().int().min(1).max(100).default(20)}).parse(input);
 try{
  const results=await runScheduleBatch(parsed.limit);
  return Response.json({processed:results.length,results},{headers:{"cache-control":"no-store"}});
 }catch(error){
  return Response.json({error:error instanceof Error?error.message:"Schedule worker failed"},{status:503,headers:{"cache-control":"no-store"}});
 }
}
