import type {
  CreatePaymentIntentRequest,
  PaymentProviderRegistry,
} from "./contracts";
import {
  chooseTenantPlugin,
  loadPluginCandidates,
  resolveBindingSecrets,
} from "@/modules/platform/plugin-runtime.server";

async function storedProviderCandidate(input:{
  tenantId:string;tenantProductId:string;providerKey:string;
}){
  const candidates=await loadPluginCandidates({
    tenantId:input.tenantId,tenantProductId:input.tenantProductId,
    moduleKey:"payments.core",integrationKind:"payments"
  });
  const candidate=candidates.find((c)=>c.definition.key===input.providerKey&&c.health!=="degraded");
  if(!candidate)throw new Error("Original payment provider is not configured/healthy");
  return candidate;
}

export async function createPaymentIntent(
  registry:PaymentProviderRegistry,
  input:{tenantId:string;tenantProductId:string;regionKey:string;request:CreatePaymentIntentRequest}
){
  const{request}=input;
  if(!Number.isInteger(request.amountMinor)||request.amountMinor<0)throw new Error("amountMinor must be a non-negative integer");
  if(!/^[A-Z]{3}$/.test(request.currency))throw new Error("Invalid currency");
  const candidate=await chooseTenantPlugin({
    tenantId:input.tenantId,tenantProductId:input.tenantProductId,
    moduleKey:"payments.core",integrationKind:"payments",regionKey:input.regionKey
  });
  const provider=registry.get(candidate.definition.key);
  const secrets=resolveBindingSecrets(candidate.binding as any);
  const result=await provider.createIntent(request,secrets,candidate.binding.config);
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
  const{data:row,error}=await db.from("payment_intents").upsert({
    tenant_id:input.tenantId,tenant_product_id:input.tenantProductId,
    provider:candidate.definition.key,provider_intent_ref:result.providerRef,
    idempotency_key:request.idempotencyKey,purpose:request.purpose,
    context_type:request.contextType??null,context_id:request.contextId??null,
    customer_ref:request.customerRef??null,amount_minor:request.amountMinor,currency:request.currency,
    capture_mode:request.captureMode,status:result.status,
    metadata:{...(request.metadata??{}),providerMetadata:result.metadata??{}}
  },{onConflict:"tenant_id,idempotency_key"}).select("*").single();
  if(error||!row)throw new Error(error?.message??"Payment intent could not be recorded");
  return{payment:row,provider:result};
}

export async function capturePaymentIntent(
  registry:PaymentProviderRegistry,
  input:{
    tenantId:string;tenantProductId:string;paymentIntentId:string;
    amountMinor?:number;idempotencyKey:string;
  }
){
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
  const{data:payment,error}=await db.from("payment_intents").select("*")
    .eq("id",input.paymentIntentId).eq("tenant_id",input.tenantId)
    .eq("tenant_product_id",input.tenantProductId).maybeSingle();
  if(error||!payment)throw new Error("Payment intent not found");
  if(payment.capture_mode!=="manual")throw new Error("Only manual-capture payments can be captured explicitly");
  if(!["authorised","pending"].includes(payment.status))throw new Error("Payment is not in a capturable state");
  if(!payment.provider_intent_ref)throw new Error("Payment provider reference is missing");
  if(input.amountMinor!==undefined&&(!Number.isInteger(input.amountMinor)||input.amountMinor<=0||input.amountMinor>payment.amount_minor)){
    throw new Error("Invalid capture amount");
  }

  const candidate=await storedProviderCandidate({
    tenantId:input.tenantId,tenantProductId:input.tenantProductId,providerKey:payment.provider
  });
  const provider=registry.get(payment.provider);
  if(!provider.capture)throw new Error("Payment provider does not support explicit capture");
  const result=await provider.capture(
    payment.provider_intent_ref,
    {amountMinor:input.amountMinor,currency:payment.currency,idempotencyKey:input.idempotencyKey},
    resolveBindingSecrets(candidate.binding as any),candidate.binding.config
  );
  const metadata={
    ...(payment.metadata??{}),
    captureProviderMetadata:result.metadata??{},
    captureIdempotencyKey:input.idempotencyKey
  };
  const{data:row,error:updateError}=await db.from("payment_intents").update({
    provider_intent_ref:result.providerRef,status:result.status,metadata
  }).eq("id",payment.id).select("*").single();
  if(updateError||!row)throw new Error(updateError?.message??"Captured payment could not be recorded");
  return{payment:row,provider:result};
}

export async function refundPaymentIntent(
  registry:PaymentProviderRegistry,
  input:{
    tenantId:string;tenantProductId:string;paymentIntentId:string;
    amountMinor:number;idempotencyKey:string;reason?:string|null;
  }
){
  if(!Number.isInteger(input.amountMinor)||input.amountMinor<=0)throw new Error("Refund amount must be a positive integer");
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
  const{data:payment,error}=await db.from("payment_intents").select("*")
    .eq("id",input.paymentIntentId).eq("tenant_id",input.tenantId)
    .eq("tenant_product_id",input.tenantProductId).maybeSingle();
  if(error||!payment)throw new Error("Payment intent not found");
  if(!payment.provider_intent_ref)throw new Error("Payment provider reference is missing");

  const{data:refundId,error:reserveError}=await db.rpc("reserve_payment_refund",{
    _tenant:input.tenantId,_payment:payment.id,_amount:input.amountMinor,
    _idempotency_key:input.idempotencyKey,_reason:input.reason??null
  });
  if(reserveError||!refundId)throw new Error(reserveError?.message??"Refund could not be reserved");

  const{data:existing}=await db.from("payment_refunds").select("*").eq("id",refundId).maybeSingle();
  if(existing&&["succeeded","cancelled"].includes(existing.status))return{refund:existing,idempotent:true};

  const candidate=await storedProviderCandidate({
    tenantId:input.tenantId,tenantProductId:input.tenantProductId,providerKey:payment.provider
  });
  const provider=registry.get(payment.provider);
  try{
    const result=await provider.refund(
      payment.provider_intent_ref,
      {amountMinor:input.amountMinor,currency:payment.currency,reason:input.reason??null,idempotencyKey:input.idempotencyKey},
      resolveBindingSecrets(candidate.binding as any),candidate.binding.config
    );
    const{data:refund,error:updateError}=await db.from("payment_refunds").update({
      provider_ref:result.providerRef,status:result.status,metadata:result.metadata??{}
    }).eq("id",refundId).select("*").single();
    if(updateError||!refund)throw new Error(updateError?.message??"Refund result could not be recorded");

    if(result.status==="succeeded"){
      const{data:all}=await db.from("payment_refunds").select("amount_minor,status")
        .eq("tenant_id",input.tenantId).eq("payment_intent_id",payment.id);
      const succeeded=(all??[]).filter((r:any)=>r.status==="succeeded")
        .reduce((sum:number,r:any)=>sum+Number(r.amount_minor??0),0);
      await db.from("payment_intents").update({
        status:succeeded>=Number(payment.amount_minor)?"refunded":"partially_refunded"
      }).eq("id",payment.id);
    }
    return{refund,provider:result};
  }catch(error){
    await db.from("payment_refunds").update({
      status:"failed",metadata:{providerError:error instanceof Error?error.message:"Provider refund failed"}
    }).eq("id",refundId);
    throw error;
  }
}
