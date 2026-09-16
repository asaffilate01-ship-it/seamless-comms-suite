import { env } from "cloudflare:workers";
import { getAppSecret, verifyWebhookSignature } from "@/lib/bridge/security";

type Bindings={DB?:D1Database;WEBHOOK_SECRETS?:string};
type EventPayload={event_id?:string;event_type?:string;occurred_at?:string;tenant_id?:string;data?:unknown};

export async function POST(request:Request,context:{params:Promise<{app:string}>}){
  const {app}=await context.params;
  const body=await request.text();
  const timestamp=request.headers.get("x-ai-core-timestamp")??"";
  const signature=(request.headers.get("x-ai-core-signature")??"").replace(/^sha256=/,"");
  const idempotencyKey=request.headers.get("idempotency-key")??"";
  const bindings=env as unknown as Bindings;
  const secret=getAppSecret(bindings.WEBHOOK_SECRETS,app);
  if(!secret) return Response.json({error:"Unknown or inactive application"},{status:401});
  if(!idempotencyKey) return Response.json({error:"Idempotency-Key is required"},{status:400});
  if(!(await verifyWebhookSignature(body,timestamp,signature,secret))) return Response.json({error:"Invalid or expired signature"},{status:401});
  let payload:EventPayload; try{payload=JSON.parse(body) as EventPayload}catch{return Response.json({error:"Invalid JSON"},{status:400})}
  if(!payload.event_id||!payload.event_type||!payload.occurred_at) return Response.json({error:"event_id, event_type and occurred_at are required"},{status:422});
  if(!bindings.DB) return Response.json({accepted:true,event_id:payload.event_id,mode:"simulation"},{status:202});
  try{
    const eventInsert=bindings.DB.prepare("INSERT INTO events (id, application_id, event_type, idempotency_key, payload_json, signature_valid, status, occurred_at) VALUES (?, ?, ?, ?, ?, 1, 'accepted', ?)").bind(payload.event_id,app,payload.event_type,idempotencyKey,body,payload.occurred_at);
    if(payload.tenant_id){const tenant=await bindings.DB.prepare("SELECT id FROM tenants WHERE id = ? AND application_id = ? LIMIT 1").bind(payload.tenant_id,app).first();if(!tenant)return Response.json({error:"Tenant does not belong to this application"},{status:422});await bindings.DB.batch([eventInsert,bindings.DB.prepare("INSERT INTO event_tenant_links (id, event_id, tenant_id) VALUES (?, ?, ?)").bind(crypto.randomUUID(),payload.event_id,payload.tenant_id)])}else await eventInsert.run();
    return Response.json({accepted:true,event_id:payload.event_id},{status:202});
  }catch(error){
    if(String(error).includes("UNIQUE")) return Response.json({accepted:true,event_id:payload.event_id,duplicate:true},{status:200});
    return Response.json({error:"Event could not be recorded"},{status:503});
  }
}
