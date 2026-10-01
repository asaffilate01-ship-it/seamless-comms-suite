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

const scope=z.object({
  tenantId:z.string().uuid(),productKey:z.string().min(1).max(80),
  tenantProductId:z.string().uuid(),locationId:z.string().uuid().optional().nullable(),
});

const line=z.object({
  itemRef:z.string().min(1).max(200),quantity:z.number().positive().max(1000),
  optionRefs:z.array(z.string().max(200)).max(100).default([]),
  notes:z.string().max(1000).optional().nullable(),
});

const requestSchema=z.discriminatedUnion("operation",[
  scope.extend({
    operation:z.literal("intent.create"),
    channel:z.enum(["web","app","whatsapp","phone","kiosk","pos","marketplace","api"]),
    customerRef:z.string().max(200).optional().nullable(),
    currency:z.string().regex(/^[A-Z]{3}$/),lines:z.array(line).min(1).max(200),
    fulfilment:z.enum(["collection","delivery","dine_in","service"]),
    requestedAt:z.string().datetime().optional().nullable(),
    deliveryAddress:z.record(z.string(),z.unknown()).optional().nullable(),
    tableRef:z.string().max(160).optional().nullable(),
    idempotencyKey:z.string().min(8).max(160),metadata:z.record(z.string(),z.unknown()).default({}),
  }),
  scope.extend({
    operation:z.literal("validation.record"),intentId:z.string().uuid(),catalogueRevision:z.string().min(1).max(240),
    priceValidated:z.boolean(),availabilityValidated:z.boolean(),fulfilmentValidated:z.boolean(),
    subtotalMinor:z.number().int(),discountMinor:z.number().int().nonnegative().default(0),
    taxMinor:z.number().int().nonnegative().default(0),feesMinor:z.number().int().nonnegative().default(0),
    totalMinor:z.number().int(),currency:z.string().regex(/^[A-Z]{3}$/),
    warnings:z.array(z.string().max(500)).max(100).default([]),validUntil:z.string().datetime(),
  }),
  scope.extend({
    operation:z.literal("acceptance.record"),intentId:z.string().uuid(),sourceOrderRef:z.string().min(1).max(240),
    accepted:z.boolean(),paymentState:z.enum(["not_required","pending","paid","pay_later_authorized"]),
    kdsAcknowledged:z.boolean().optional().nullable(),acceptedAt:z.string().datetime().optional().nullable(),
    rejectionReason:z.string().max(1000).optional().nullable(),
  }),
  scope.extend({operation:z.literal("status.get"),intentId:z.string().uuid()}),
]);

async function auth(request:Request){
  const{keyId,secret}=parseServiceAuthorization(request.headers.get("authorization"));
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
  const{data:row,error}=await db.from("platform_service_credentials")
    .select("id,key_id,secret_hash,status,expires_at,scopes").eq("key_id",keyId).maybeSingle();
  if(error||!row||!verifyServiceSecret(secret,row.secret_hash))throw new Error("Service credential refused");
  const scopes=z.array(z.object({
    tenantId:z.string().uuid(),productKey:z.string().min(1),
    tenantProductId:z.string().uuid().optional().nullable(),locationIds:z.array(z.string().uuid()).optional(),
    capabilities:z.array(z.string().min(1))
  })).parse(row.scopes);
  const credential:ServiceCredentialRecord={id:row.id,keyId:row.key_id,secretHash:row.secret_hash,status:row.status,expiresAt:row.expires_at,scopes};
  return{db,credential};
}

export async function serveOrderingService(request:Request){
  try{
    const raw=await request.text();if(raw.length>262144)return reply({error:"Payload too large"},413);
    let json:unknown;try{json=JSON.parse(raw);}catch{return reply({error:"Invalid JSON"},400);}
    const input=requestSchema.parse(json);
    const{db,credential}=await auth(request);

    const capability=input.operation==="status.get"?"ordering.read":
      input.operation==="validation.record"?"ordering.validate":
      input.operation==="acceptance.record"?"ordering.accept":"ordering.write";

    authoriseServiceScope(credential,{
      tenantId:input.tenantId,productKey:input.productKey,tenantProductId:input.tenantProductId,
      locationId:input.locationId,capability
    });

    const{data:tp}=await db.from("tenant_products").select("id,status,product_key")
      .eq("id",input.tenantProductId).eq("tenant_id",input.tenantId).maybeSingle();
    if(!tp||tp.status!=="active"||tp.product_key!==input.productKey)return reply({error:"Active tenant product required"},403);

    const{data:grant}=await db.from("tenant_module_entitlements").select("enabled,starts_at,ends_at")
      .eq("tenant_id",input.tenantId).eq("tenant_product_id",input.tenantProductId).eq("module_key","ordering.core").maybeSingle();
    const now=Date.now();
    if(!grant?.enabled||(grant.starts_at&&Date.parse(grant.starts_at)>now)||(grant.ends_at&&Date.parse(grant.ends_at)<=now)){
      return reply({error:"Ordering entitlement required"},403);
    }

    if(input.operation==="intent.create"){
      const{data:existing}=await db.from("ordering_intents").select("*")
        .eq("tenant_id",input.tenantId).eq("product_key",input.productKey).eq("idempotency_key",input.idempotencyKey).maybeSingle();
      if(existing)return reply({intent:existing,idempotent:true});
      const{data:intent,error}=await db.from("ordering_intents").insert({
        tenant_id:input.tenantId,tenant_product_id:input.tenantProductId,location_id:input.locationId??null,
        product_key:input.productKey,channel:input.channel,customer_ref:input.customerRef??null,currency:input.currency,
        lines:input.lines,fulfilment:input.fulfilment,requested_at:input.requestedAt??null,
        delivery_address:input.deliveryAddress??null,table_ref:input.tableRef??null,status:"awaiting_confirmation",
        idempotency_key:input.idempotencyKey,metadata:input.metadata
      }).select("*").single();
      if(error||!intent)return reply({error:"Order intent could not be created"},503);
      return reply({intent},202);
    }

    const{data:intent}=await db.from("ordering_intents").select("*")
      .eq("id",input.intentId).eq("tenant_id",input.tenantId).eq("tenant_product_id",input.tenantProductId).maybeSingle();
    if(!intent)return reply({error:"Order intent not found"},404);

    if(input.operation==="validation.record"){
      const{error}=await db.from("ordering_validation_receipts").upsert({
        intent_id:input.intentId,tenant_id:input.tenantId,catalogue_revision:input.catalogueRevision,
        price_validated:input.priceValidated,availability_validated:input.availabilityValidated,
        fulfilment_validated:input.fulfilmentValidated,subtotal_minor:input.subtotalMinor,
        discount_minor:input.discountMinor,tax_minor:input.taxMinor,fees_minor:input.feesMinor,
        total_minor:input.totalMinor,currency:input.currency,warnings:input.warnings,valid_until:input.validUntil
      },{onConflict:"intent_id"});
      if(error)return reply({error:"Validation receipt could not be saved"},503);
      const valid=input.priceValidated&&input.availabilityValidated&&input.fulfilmentValidated&&Date.parse(input.validUntil)>Date.now();
      await db.from("ordering_intents").update({status:valid?"awaiting_payment":"rejected",source_revision:input.catalogueRevision}).eq("id",input.intentId);
      return reply({intentId:input.intentId,valid},202);
    }

    if(input.operation==="acceptance.record"){
      const{error}=await db.from("ordering_acceptance_receipts").upsert({
        intent_id:input.intentId,tenant_id:input.tenantId,source_order_ref:input.sourceOrderRef,
        accepted:input.accepted,payment_state:input.paymentState,kds_acknowledged:input.kdsAcknowledged??null,
        accepted_at:input.acceptedAt??null,rejection_reason:input.rejectionReason??null
      },{onConflict:"intent_id"});
      if(error)return reply({error:"Acceptance receipt could not be saved"},503);
      await db.from("ordering_intents").update({
        status:input.accepted?(input.kdsAcknowledged?"in_progress":"accepted"):"rejected",
        source_order_ref:input.sourceOrderRef
      }).eq("id",input.intentId);
      return reply({intentId:input.intentId,accepted:input.accepted},202);
    }

    const[{data:validation},{data:acceptance}]=await Promise.all([
      db.from("ordering_validation_receipts").select("*").eq("intent_id",input.intentId).maybeSingle(),
      db.from("ordering_acceptance_receipts").select("*").eq("intent_id",input.intentId).maybeSingle()
    ]);
    return reply({intent,validation:validation??null,acceptance:acceptance??null});
  }catch(error){
    if(error instanceof z.ZodError)return reply({error:"Invalid ordering contract"},422);
    const message=error instanceof Error?error.message:"Ordering service refused";
    if(/credential|scope|authorization|expired/i.test(message))return reply({error:message},403);
    return reply({error:"Ordering service unavailable"},503);
  }
}
