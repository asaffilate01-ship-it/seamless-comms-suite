import type { CreatePaymentIntentRequest, PaymentProviderRegistry } from "./contracts";
import { chooseTenantPlugin, resolveBindingSecrets } from "@/modules/platform/plugin-runtime.server";

export async function createPaymentIntent(registry:PaymentProviderRegistry,input:{tenantId:string;tenantProductId:string;regionKey:string;request:CreatePaymentIntentRequest}){
 const{request}=input;if(!Number.isInteger(request.amountMinor)||request.amountMinor<0)throw new Error("amountMinor must be a non-negative integer");if(!/^[A-Z]{3}$/.test(request.currency))throw new Error("Invalid currency");
 const candidate=await chooseTenantPlugin({tenantId:input.tenantId,tenantProductId:input.tenantProductId,moduleKey:"payments.core",integrationKind:"payments",regionKey:input.regionKey});
 const provider=registry.get(candidate.definition.key);const secrets=resolveBindingSecrets(candidate.binding as any);const result=await provider.createIntent(request,secrets,candidate.binding.config);
 const{ supabaseAdmin }=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
 const{data:row,error}=await db.from("payment_intents").upsert({tenant_id:input.tenantId,tenant_product_id:input.tenantProductId,provider:candidate.definition.key,provider_intent_ref:result.providerRef,idempotency_key:request.idempotencyKey,purpose:request.purpose,context_type:request.contextType??null,context_id:request.contextId??null,customer_ref:request.customerRef??null,amount_minor:request.amountMinor,currency:request.currency,capture_mode:request.captureMode,status:result.status,metadata:{...(request.metadata??{}),providerMetadata:result.metadata??{}}},{onConflict:"tenant_id,idempotency_key"}).select("*").single();
 if(error||!row)throw new Error(error?.message??"Payment intent could not be recorded");return{payment:row,provider:result};
}