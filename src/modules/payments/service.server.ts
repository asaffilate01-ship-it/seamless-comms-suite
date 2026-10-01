import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  authoriseServiceScope,
  parseServiceAuthorization,
  verifyServiceSecret,
  type ServiceCredentialRecord,
} from "@/modules/platform/service-identity";

function reply(body:unknown,status=200){
  return Response.json(body,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});
}

const base=z.object({
  tenantId:z.string().uuid(),productKey:z.string().min(1).max(80),tenantProductId:z.string().uuid()
});
const jsonScalar=z.union([z.string(),z.number(),z.boolean(),z.null()]);

const schema=z.discriminatedUnion("operation",[
  base.extend({
    operation:z.literal("intent.create"),amountMinor:z.number().int().nonnegative(),
    currency:z.string().regex(/^[A-Z]{3}$/),captureMode:z.enum(["automatic","manual"]).default("automatic"),
    customerRef:z.string().max(200).optional().nullable(),purpose:z.string().min(1).max(500),
    contextType:z.string().max(120).optional().nullable(),contextId:z.string().max(240).optional().nullable(),
    idempotencyKey:z.string().min(8).max(160),metadata:z.record(z.string(),jsonScalar).default({})
  }),
  base.extend({
    operation:z.literal("intent.get"),paymentIntentId:z.string().uuid()
  }),
  base.extend({
    operation:z.literal("intent.capture"),paymentIntentId:z.string().uuid(),
    amountMinor:z.number().int().positive().optional(),idempotencyKey:z.string().min(8).max(160)
  }),
  base.extend({
    operation:z.literal("intent.refund"),paymentIntentId:z.string().uuid(),
    amountMinor:z.number().int().positive(),idempotencyKey:z.string().min(8).max(160),
    reason:z.string().max(500).optional().nullable()
  }),
  base.extend({
    operation:z.literal("provider.payment_status"),paymentIntentId:z.string().uuid(),
    providerEventId:z.string().min(1).max(240),provider:z.string().min(1).max(160),
    status:z.enum(["created","requires_action","pending","authorised","captured","failed","cancelled","partially_refunded","refunded"]),
    payload:z.record(z.string(),z.unknown()).default({})
  }),
  base.extend({
    operation:z.literal("provider.refund_status"),refundId:z.string().uuid(),
    providerEventId:z.string().min(1).max(240),provider:z.string().min(1).max(160),
    status:z.enum(["pending","succeeded","failed","cancelled"]),
    payload:z.record(z.string(),z.unknown()).default({})
  })
]);

async function auth(request:Request){
  const{keyId,secret}=parseServiceAuthorization(request.headers.get("authorization"));
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
  const{data:row,error}=await db.from("platform_service_credentials")
    .select("id,key_id,secret_hash,status,expires_at,scopes").eq("key_id",keyId).maybeSingle();
  if(error||!row||!verifyServiceSecret(secret,row.secret_hash))throw new Error("Service credential refused");
  const scopes=z.array(z.object({
    tenantId:z.string().uuid(),productKey:z.string().min(1),
    tenantProductId:z.string().uuid().optional().nullable(),
    locationIds:z.array(z.string().uuid()).optional(),capabilities:z.array(z.string().min(1))
  })).parse(row.scopes);
  const credential:ServiceCredentialRecord={
    id:row.id,keyId:row.key_id,secretHash:row.secret_hash,status:row.status,expiresAt:row.expires_at,scopes
  };
  return{db,credential};
}

function paymentTransitionAllowed(current:string,next:string){
  if(current===next)return true;
  const allowed:Record<string,string[]>={
    created:["requires_action","pending","authorised","captured","failed","cancelled"],
    requires_action:["pending","authorised","captured","failed","cancelled"],
    pending:["authorised","captured","failed","cancelled"],
    authorised:["captured","failed","cancelled"],
    captured:["partially_refunded","refunded"],
    partially_refunded:["partially_refunded","refunded"],
    refunded:[],failed:[],cancelled:[]
  };
  return(allowed[current]??[]).includes(next);
}

async function emit(db:any,input:any,type:string,payload:Record<string,unknown>){
  const eventId=randomUUID();
  const{error}=await db.from("platform_events").insert({
    id:eventId,tenant_id:input.tenantId,tenant_product_id:input.tenantProductId,
    product_key:input.productKey,event_type:type,event_version:1,occurred_at:new Date().toISOString(),
    environment:"production",subject_type:"payment",subject_id:String(input.paymentIntentId??input.refundId??eventId),
    correlation_id:String(input.paymentIntentId??input.refundId??eventId),causation_id:null,
    idempotency_key:type+":"+String(input.providerEventId??eventId),data_classification:"confidential",payload
  });
  if(error&&error.code!=="23505")throw new Error(error.message);
}

export async function servePaymentsService(request:Request){
  try{
    const raw=await request.text();if(raw.length>262144)return reply({error:"Payload too large"},413);
    let json:unknown;try{json=JSON.parse(raw);}catch{return reply({error:"Invalid JSON"},400);}
    const input=schema.parse(json);
    const{db,credential}=await auth(request);
    const statusWrite=input.operation.startsWith("provider.");
    const capability=statusWrite?"payments.status.write":
      input.operation==="intent.get"?"payments.read":
      input.operation==="intent.capture"||input.operation==="intent.refund"?"payments.admin":"payments.write";
    authoriseServiceScope(credential,{
      tenantId:input.tenantId,productKey:input.productKey,tenantProductId:input.tenantProductId,capability
    });

    const{data:tp}=await db.from("tenant_products").select("id,status,product_key,region_key")
      .eq("id",input.tenantProductId).eq("tenant_id",input.tenantId).maybeSingle();
    if(!tp||tp.status!=="active"||tp.product_key!==input.productKey)return reply({error:"Active tenant product required"},403);
    const{data:grant}=await db.from("tenant_module_entitlements").select("enabled,starts_at,ends_at")
      .eq("tenant_id",input.tenantId).eq("tenant_product_id",input.tenantProductId)
      .eq("module_key","payments.core").eq("enabled",true).maybeSingle();
    const now=Date.now();
    if(!grant|| (grant.starts_at&&Date.parse(grant.starts_at)>now) || (grant.ends_at&&Date.parse(grant.ends_at)<=now)){
      return reply({error:"Payments entitlement required"},403);
    }

    if(input.operation==="intent.create"){
      const[{createDefaultPaymentProviderRegistry},{createPaymentIntent}]=await Promise.all([
        import("./providers.server"),import("./runtime.server")
      ]);
      const result=await createPaymentIntent(createDefaultPaymentProviderRegistry(),{
        tenantId:input.tenantId,tenantProductId:input.tenantProductId,regionKey:tp.region_key,
        request:{
          idempotencyKey:input.idempotencyKey,amountMinor:input.amountMinor,currency:input.currency,
          captureMode:input.captureMode,customerRef:input.customerRef??null,purpose:input.purpose,
          contextType:input.contextType??null,contextId:input.contextId??null,metadata:input.metadata
        }
      });
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply(result,201);
    }

    if(input.operation==="intent.get"){
      const[{data:payment,error},{data:refunds,error:refundError}]=await Promise.all([
        db.from("payment_intents").select("*").eq("id",input.paymentIntentId).eq("tenant_id",input.tenantId)
          .eq("tenant_product_id",input.tenantProductId).maybeSingle(),
        db.from("payment_refunds").select("*").eq("tenant_id",input.tenantId)
          .eq("payment_intent_id",input.paymentIntentId).order("created_at",{ascending:false})
      ]);
      if(error||!payment)return reply({error:"Payment intent not found"},404);
      if(refundError)throw new Error(refundError.message);
      return reply({payment,refunds:refunds??[]});
    }

    if(input.operation==="intent.capture"){
      const[{createDefaultPaymentProviderRegistry},{capturePaymentIntent}]=await Promise.all([
        import("./providers.server"),import("./runtime.server")
      ]);
      const result=await capturePaymentIntent(createDefaultPaymentProviderRegistry(),{
        tenantId:input.tenantId,tenantProductId:input.tenantProductId,paymentIntentId:input.paymentIntentId,
        amountMinor:input.amountMinor,idempotencyKey:input.idempotencyKey
      });
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply(result,202);
    }

    if(input.operation==="intent.refund"){
      const[{createDefaultPaymentProviderRegistry},{refundPaymentIntent}]=await Promise.all([
        import("./providers.server"),import("./runtime.server")
      ]);
      const result=await refundPaymentIntent(createDefaultPaymentProviderRegistry(),{
        tenantId:input.tenantId,tenantProductId:input.tenantProductId,paymentIntentId:input.paymentIntentId,
        amountMinor:input.amountMinor,idempotencyKey:input.idempotencyKey,reason:input.reason??null
      });
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply(result,202);
    }

    if(input.operation==="provider.payment_status"){
      const{data:payment}=await db.from("payment_intents").select("*")
        .eq("id",input.paymentIntentId).eq("tenant_id",input.tenantId)
        .eq("tenant_product_id",input.tenantProductId).maybeSingle();
      if(!payment)return reply({error:"Payment intent not found"},404);
      if(payment.provider!==input.provider)return reply({error:"Provider does not match the payment"},409);
      const{data:seen}=await db.from("payment_provider_events").select("id")
        .eq("provider",input.provider).eq("provider_event_id",input.providerEventId).maybeSingle();
      if(seen)return reply({ok:true,idempotent:true,status:payment.status});
      if(!paymentTransitionAllowed(payment.status,input.status)){
        return reply({error:"Payment status transition is not allowed"},409);
      }
      const{data:event,error:eventError}=await db.from("payment_provider_events").insert({
        tenant_id:input.tenantId,tenant_product_id:input.tenantProductId,provider:input.provider,
        provider_event_id:input.providerEventId,event_type:"payment.status",payment_intent_id:payment.id,
        payload:input.payload
      }).select("id").single();
      if(eventError||!event)throw new Error(eventError?.message??"Provider event could not be recorded");
      const{error:updateError}=await db.from("payment_intents").update({
        status:input.status,
        metadata:{...(payment.metadata??{}),lastProviderEventId:input.providerEventId,lastProviderPayload:input.payload}
      }).eq("id",payment.id);
      if(updateError)throw new Error(updateError.message);
      await emit(db,input,"payment."+input.status,{paymentIntentId:payment.id,provider:input.provider});
      return reply({ok:true,status:input.status},202);
    }

    const{data:refund}=await db.from("payment_refunds")
      .select("*,payment:payment_intents(id,tenant_product_id,provider,amount_minor,status)")
      .eq("id",input.refundId).eq("tenant_id",input.tenantId).maybeSingle();
    if(!refund||refund.payment?.tenant_product_id!==input.tenantProductId)return reply({error:"Refund not found"},404);
    if(refund.payment.provider!==input.provider)return reply({error:"Provider does not match the refund payment"},409);
    const{data:seen}=await db.from("payment_provider_events").select("id")
      .eq("provider",input.provider).eq("provider_event_id",input.providerEventId).maybeSingle();
    if(seen)return reply({ok:true,idempotent:true,status:refund.status});
    const{error:eventError}=await db.from("payment_provider_events").insert({
      tenant_id:input.tenantId,tenant_product_id:input.tenantProductId,provider:input.provider,
      provider_event_id:input.providerEventId,event_type:"refund.status",
      payment_intent_id:refund.payment_intent_id,refund_id:refund.id,payload:input.payload
    });
    if(eventError)throw new Error(eventError.message);
    await db.from("payment_refunds").update({status:input.status,metadata:{...(refund.metadata??{}),lastProviderPayload:input.payload}})
      .eq("id",refund.id);

    if(input.status==="succeeded"){
      const{data:all}=await db.from("payment_refunds").select("amount_minor,status")
        .eq("tenant_id",input.tenantId).eq("payment_intent_id",refund.payment_intent_id);
      const succeeded=(all??[]).filter((row:any)=>row.status==="succeeded")
        .reduce((sum:number,row:any)=>sum+Number(row.amount_minor??0),0);
      await db.from("payment_intents").update({
        status:succeeded>=Number(refund.payment.amount_minor)?"refunded":"partially_refunded"
      }).eq("id",refund.payment_intent_id);
    }
    await emit(db,input,"refund."+input.status,{refundId:refund.id,paymentIntentId:refund.payment_intent_id,provider:input.provider});
    return reply({ok:true,status:input.status},202);
  }catch(error){
    if(error instanceof z.ZodError)return reply({error:"Invalid Payments contract"},422);
    const message=error instanceof Error?error.message:"Payments service refused";
    if(/credential|scope|authorization|expired/i.test(message))return reply({error:message},403);
    return reply({error:message},503);
  }
}
