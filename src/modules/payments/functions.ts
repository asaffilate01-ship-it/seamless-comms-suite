import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireModuleEntitlement,
  requireWritableTenantRole,
  requireAdminTenantRole,
} from "@/modules/platform/module-access";

const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()});

async function paymentContext(context:any,data:z.infer<typeof scope>,adminOnly=false){
  const access=await requireModuleEntitlement(context,{...data,moduleKey:"payments.core"});
  if(adminOnly)requireAdminTenantRole(access.role);else requireWritableTenantRole(access.role);
  const db=context.supabase as any;
  const{data:tp,error}=await db.from("tenant_products").select("region_key,product_key,status")
    .eq("id",data.tenantProductId).eq("tenant_id",data.tenantId).maybeSingle();
  if(error||!tp||tp.status!=="active")throw new Error("Active tenant product required");
  return{access,tp};
}

const createSchema=scope.extend({
  amountMinor:z.number().int().nonnegative(),currency:z.string().regex(/^[A-Z]{3}$/),
  captureMode:z.enum(["automatic","manual"]).default("automatic"),
  customerRef:z.string().max(200).optional().nullable(),purpose:z.string().min(1).max(500),
  contextType:z.string().max(120).optional().nullable(),contextId:z.string().max(240).optional().nullable(),
  idempotencyKey:z.string().min(8).max(160),metadata:z.record(z.string(),z.unknown()).default({})
});

export const createTenantPaymentIntent=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof createSchema>)=>createSchema.parse(input))
.handler(async({context,data})=>{
  const{tp}=await paymentContext(context,data,false);
  const[{createDefaultPaymentProviderRegistry},{createPaymentIntent}]=await Promise.all([
    import("./providers.server"),import("./runtime.server")
  ]);
  return createPaymentIntent(createDefaultPaymentProviderRegistry(),{
    tenantId:data.tenantId,tenantProductId:data.tenantProductId,regionKey:tp.region_key,
    request:{
      idempotencyKey:data.idempotencyKey,amountMinor:data.amountMinor,currency:data.currency,
      captureMode:data.captureMode,customerRef:data.customerRef??null,purpose:data.purpose,
      contextType:data.contextType??null,contextId:data.contextId??null,metadata:data.metadata
    }
  });
});

export const listTenantPayments=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>&{status?:string|null;limit?:number})=>scope.extend({
  status:z.enum(["created","requires_action","pending","authorised","captured","failed","cancelled","partially_refunded","refunded"]).optional().nullable(),
  limit:z.number().int().min(1).max(1000).default(250)
}).parse(input))
.handler(async({context,data})=>{
  await requireModuleEntitlement(context,{...data,moduleKey:"payments.core"});
  const db=context.supabase as any;let q=db.from("payment_intents").select("*")
    .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .order("created_at",{ascending:false}).limit(data.limit);
  if(data.status)q=q.eq("status",data.status);
  const{data:rows,error}=await q;if(error)throw new Error(error.message);return rows??[];
});

export const getTenantPayment=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>&{paymentIntentId:string})=>scope.extend({paymentIntentId:z.string().uuid()}).parse(input))
.handler(async({context,data})=>{
  await requireModuleEntitlement(context,{...data,moduleKey:"payments.core"});
  const db=context.supabase as any;
  const[{data:payment,error},{data:refunds,error:refundError}]=await Promise.all([
    db.from("payment_intents").select("*").eq("id",data.paymentIntentId).eq("tenant_id",data.tenantId)
      .eq("tenant_product_id",data.tenantProductId).maybeSingle(),
    db.from("payment_refunds").select("*").eq("tenant_id",data.tenantId)
      .eq("payment_intent_id",data.paymentIntentId).order("created_at",{ascending:false})
  ]);
  if(error||!payment)throw new Error("Payment intent not found");
  if(refundError)throw new Error(refundError.message);
  return{payment,refunds:refunds??[]};
});

const captureSchema=scope.extend({
  paymentIntentId:z.string().uuid(),amountMinor:z.number().int().positive().optional(),
  idempotencyKey:z.string().min(8).max(160)
});
export const captureTenantPayment=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof captureSchema>)=>captureSchema.parse(input))
.handler(async({context,data})=>{
  await paymentContext(context,data,true);
  const[{createDefaultPaymentProviderRegistry},{capturePaymentIntent}]=await Promise.all([
    import("./providers.server"),import("./runtime.server")
  ]);
  return capturePaymentIntent(createDefaultPaymentProviderRegistry(),{
    tenantId:data.tenantId,tenantProductId:data.tenantProductId,paymentIntentId:data.paymentIntentId,
    amountMinor:data.amountMinor,idempotencyKey:data.idempotencyKey
  });
});

const refundSchema=scope.extend({
  paymentIntentId:z.string().uuid(),amountMinor:z.number().int().positive(),
  idempotencyKey:z.string().min(8).max(160),reason:z.string().max(500).optional().nullable()
});
export const refundTenantPayment=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof refundSchema>)=>refundSchema.parse(input))
.handler(async({context,data})=>{
  await paymentContext(context,data,true);
  const[{createDefaultPaymentProviderRegistry},{refundPaymentIntent}]=await Promise.all([
    import("./providers.server"),import("./runtime.server")
  ]);
  return refundPaymentIntent(createDefaultPaymentProviderRegistry(),{
    tenantId:data.tenantId,tenantProductId:data.tenantProductId,paymentIntentId:data.paymentIntentId,
    amountMinor:data.amountMinor,idempotencyKey:data.idempotencyKey,reason:data.reason??null
  });
});
