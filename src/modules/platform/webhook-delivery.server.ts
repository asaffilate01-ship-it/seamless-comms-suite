import {createHmac,timingSafeEqual} from "node:crypto";

type JsonRecord=Record<string,unknown>;

function internalSecret(){
  const value=process.env["OMNIQORA_WEBHOOK_WORKER_SECRET"]?.trim();
  if(!value)throw new Error("OMNIQORA_WEBHOOK_WORKER_SECRET is not configured");
  return value;
}
function resolveSecret(ref:string){
  if(ref.startsWith("env:")){
    const key=ref.slice(4);const value=process.env[key]?.trim();
    if(!value)throw new Error("Webhook secret environment reference is unavailable");
    return value;
  }
  throw new Error("Unsupported webhook secret reference");
}
function sign(secret:string,timestamp:string,raw:string){
  return createHmac("sha256",secret).update(timestamp+".").update(raw).digest("hex");
}
function safeDelay(attempt:number){
  const seconds=Math.min(3600,Math.max(5,Math.pow(2,Math.min(attempt,8))*5));
  return new Date(Date.now()+seconds*1000).toISOString();
}
export function verifyWebhookWorkerSecret(value:string|null){
  const expected=internalSecret();
  if(!value||value.length!==expected.length)return false;
  return timingSafeEqual(Buffer.from(value),Buffer.from(expected));
}

export async function drainPlatformWebhooks(limit=25){
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const db=supabaseAdmin as any;
  const deliveries=await db.from("platform_event_deliveries")
    .select("id,event_id,subscription_id,tenant_id,status,attempts,available_at")
    .in("status",["queued","failed"])
    .lte("available_at",new Date().toISOString())
    .order("created_at",{ascending:true}).limit(Math.min(Math.max(limit,1),100));
  if(deliveries.error)throw new Error(deliveries.error.message);

  let succeeded=0,failed=0,deadLetter=0;
  for(const delivery of deliveries.data??[]){
    const claimed=await db.from("platform_event_deliveries").update({
      status:"processing",attempts:Number(delivery.attempts??0)+1,
    }).eq("id",delivery.id).in("status",["queued","failed"]).select("*").maybeSingle();
    if(claimed.error||!claimed.data)continue;

    const [event,subscription]=await Promise.all([
      db.from("platform_events").select("*").eq("id",delivery.event_id).single(),
      db.from("platform_event_subscriptions").select("*").eq("id",delivery.subscription_id).single(),
    ]);
    if(event.error||subscription.error||!event.data||!subscription.data){
      await db.from("platform_event_deliveries").update({status:"dead_letter",last_error:"Missing event/subscription",completed_at:new Date().toISOString()}).eq("id",delivery.id);
      deadLetter++;continue;
    }
    if(subscription.data.destination_kind!=="webhook"){
      await db.from("platform_event_deliveries").update({status:"queued",last_error:null,available_at:new Date().toISOString()}).eq("id",delivery.id);
      continue;
    }

    const endpoint=await db.from("webhook_endpoints").select("*")
      .eq("tenant_id",delivery.tenant_id).eq("id",subscription.data.destination_ref).maybeSingle();
    if(endpoint.error||!endpoint.data||endpoint.data.status!=="active"){
      await db.from("platform_event_deliveries").update({status:"dead_letter",last_error:"Webhook endpoint unavailable",completed_at:new Date().toISOString()}).eq("id",delivery.id);
      deadLetter++;continue;
    }

    const payload:JsonRecord={
      id:event.data.id,tenantId:event.data.tenant_id,productKey:event.data.product_key,
      brandId:event.data.brand_id,locationId:event.data.location_id,eventType:event.data.event_type,
      eventVersion:event.data.event_version,occurredAt:event.data.occurred_at,subjectType:event.data.subject_type,
      subjectId:event.data.subject_id,correlationId:event.data.correlation_id,causationId:event.data.causation_id,
      dataClassification:event.data.data_classification,payload:event.data.payload,
    };
    const raw=JSON.stringify(payload),timestamp=String(Math.floor(Date.now()/1000));
    try{
      const secret=resolveSecret(String(endpoint.data.secret_ref));
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),Number(endpoint.data.timeout_ms??10000));
      let response:Response;
      try{
        response=await fetch(String(endpoint.data.url),{
          method:"POST",headers:{
            "content-type":"application/json",
            "x-omniqora-timestamp":timestamp,
            "x-omniqora-signature":sign(secret,timestamp,raw),
            "x-omniqora-event":String(event.data.event_type),
            "x-omniqora-delivery-id":String(delivery.id),
          },body:raw,signal:controller.signal,redirect:"error",
        });
      }finally{clearTimeout(timer)}
      const responseBody=(await response.text()).slice(0,4000);
      if(!response.ok)throw new Error("Webhook HTTP "+response.status+": "+responseBody.slice(0,500));
      await Promise.all([
        db.from("platform_event_deliveries").update({status:"succeeded",last_error:null,completed_at:new Date().toISOString()}).eq("id",delivery.id),
        db.from("webhook_endpoints").update({last_success_at:new Date().toISOString(),health:{status:"healthy",lastStatus:response.status},updated_at:new Date().toISOString()}).eq("id",endpoint.data.id),
      ]);
      succeeded++;
    }catch(error){
      const attempts=Number(claimed.data.attempts??1),maxAttempts=Number(endpoint.data.max_attempts??8);
      const terminal=attempts>=maxAttempts;
      const message=error instanceof Error?error.message:String(error);
      await Promise.all([
        db.from("platform_event_deliveries").update({
          status:terminal?"dead_letter":"failed",last_error:message.slice(0,2000),
          available_at:terminal?claimed.data.available_at:safeDelay(attempts),
          completed_at:terminal?new Date().toISOString():null,
        }).eq("id",delivery.id),
        db.from("webhook_endpoints").update({
          last_failure_at:new Date().toISOString(),health:{status:terminal?"failed":"degraded",lastError:message.slice(0,500)},updated_at:new Date().toISOString(),
        }).eq("id",endpoint.data.id),
      ]);
      terminal?deadLetter++:failed++;
    }
  }
  return{processed:(deliveries.data??[]).length,succeeded,failed,deadLetter};
}
