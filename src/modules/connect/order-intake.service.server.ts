import { z } from "zod";
import { authoriseServiceScope,parseServiceAuthorization,verifyServiceSecret,type ServiceCredentialRecord } from "@/modules/platform/service-identity";

const base=z.object({tenantId:z.string().uuid(),productKey:z.string().min(2).max(80)});
const schema=z.discriminatedUnion("operation",[
  base.extend({operation:z.literal("handoff.claim"),limit:z.number().int().min(1).max(50).default(20)}),
  base.extend({operation:z.literal("handoff.ack"),sessionId:z.string().uuid(),targetOrderId:z.string().min(1).max(200),ok:z.boolean(),detail:z.record(z.string(),z.unknown()).default({})}),
  base.extend({operation:z.literal("payment.status"),providerKey:z.string().min(3).max(100),providerReference:z.string().min(1).max(200),status:z.enum(["paid","expired","cancelled","failed","refunded","pending"]),metadata:z.record(z.string(),z.unknown()).default({})})
]);

function reply(body:unknown,status=200){return Response.json(body,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});}
async function auth(request:Request){
  const{keyId,secret}=parseServiceAuthorization(request.headers.get("authorization"));
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
  const{data:row,error}=await db.from("platform_service_credentials").select("id,key_id,secret_hash,status,expires_at,scopes").eq("key_id",keyId).maybeSingle();
  if(error||!row||!verifyServiceSecret(secret,row.secret_hash))throw new Error("Service credential refused");
  const scopes=z.array(z.object({tenantId:z.string().uuid(),productKey:z.string().min(2),brandIds:z.array(z.string().uuid()).optional(),locationIds:z.array(z.string().uuid()).optional(),capabilities:z.array(z.string())})).parse(row.scopes);
  const credential:ServiceCredentialRecord={id:row.id,keyId:row.key_id,secretHash:row.secret_hash,status:row.status,expiresAt:row.expires_at,scopes};
  return{db,credential};
}

export async function serveOrderIntakeService(request:Request){
  try{
    const raw=await request.text();if(raw.length>262144)return reply({error:"Payload too large"},413);
    let value:unknown;try{value=JSON.parse(raw);}catch{return reply({error:"Invalid JSON"},400);}
    const input=schema.parse(value);const{db,credential}=await auth(request);
    const capability=input.operation==="handoff.claim"?"orders.consume":input.operation==="handoff.ack"?"orders.ack":"payments.callback";
    authoriseServiceScope(credential,{tenantId:input.tenantId,productKey:input.productKey,capability});
    if(input.operation==="handoff.claim"){
      const{data,error}=await db.rpc("server_claim_order_handoff",{_tenant:input.tenantId,_product:input.productKey,_key_id:credential.keyId,_limit:input.limit});
      if(error)throw new Error(error.message);
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply({orders:data??[]});
    }
    if(input.operation==="handoff.ack"){
      const{error}=await db.rpc("server_ack_order_handoff",{_session:input.sessionId,_key_id:credential.keyId,_target_order_id:input.targetOrderId,_ok:input.ok,_detail:input.detail});
      if(error)throw new Error(error.message);
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply({ok:true});
    }
    const{data,error}=await db.rpc("server_order_payment_status",{_provider_key:input.providerKey,_provider_reference:input.providerReference,_status:input.status,_metadata:input.metadata});
    if(error)throw new Error(error.message);
    return reply({ok:true,sessionId:data});
  }catch(error){
    if(error instanceof z.ZodError)return reply({error:"Invalid order-intake service contract"},422);
    const message=error instanceof Error?error.message:"Order-intake service refused";
    if(/credential|scope|authorization|expired/i.test(message))return reply({error:message},403);
    return reply({error:message},503);
  }
}
