/* Finance catalogue and tenant dashboard. Read-only server API: never transmits finance applications. */
import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {FINANCE_PROVIDERS,FINANCE_PLACEMENTS,recommendFinanceConnectors} from "./catalogue";

const requestSchema=z.object({
 tenantId:z.string().uuid(),productKey:z.string().min(2).max(80),
 brand:z.string().min(1).max(120).optional()
}).strict();
export const getFinanceConnectorCatalogue=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async()=>({providers:FINANCE_PROVIDERS,placements:FINANCE_PLACEMENTS}));
export const getFinanceTenantView=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((input:z.infer<typeof requestSchema>)=>requestSchema.parse(input))
 .handler(async({context,data})=>{
  const db=context.supabase as any;
  // A tenant/product request is never taken on trust. Existing SaaS Factory
  // tenant_products RLS must authorize this EXACT product in the EXACT tenant.
  const member=await db.from("tenant_products").select("tenant_id,product_key")
    .eq("tenant_id",data.tenantId).eq("product_key",data.productKey).maybeSingle();
  if(member.error||!member.data)throw new Error("Tenant product access denied");
  const recommendations=recommendFinanceConnectors(data.productKey,data.brand);
  if(!recommendations.length)return {recommendations:[],bindings:[],programmes:[],liveCount:0};
  const keys=recommendations.map(r=>r.key);
  const [bindings,approvals]=await Promise.all([
    db.from("provider_bindings").select("id,tenant_id,product_key,provider_key,environment,status,last_verified_at")
      .eq("tenant_id",data.tenantId).eq("product_key",data.productKey).in("provider_key",keys),
    db.from("finance_programme_approvals").select("id,tenant_id,product_key,provider_key,brand_id,programme_key,status,externally_verified_at")
      .eq("tenant_id",data.tenantId).eq("product_key",data.productKey).in("provider_key",keys)
  ]);
  if(bindings.error||approvals.error)throw new Error("Finance registry migration or tenant access unavailable");
  // Return only public readiness metadata, never secret_refs, private provider health,
  // merchant underwriting data, credentials or a credit decision.
  const safeBindings=(bindings.data??[]).map((b:any)=>({
    providerKey:b.provider_key,environment:b.environment,status:b.status,
    independentlyVerified:false, // never infer 'live' from a manually entered status/last_verified_at
    lastVerifiedAt:b.last_verified_at
  }));
  const safeApprovals=(approvals.data??[]).map((a:any)=>({
    providerKey:a.provider_key,programmeKey:a.programme_key,status:a.status,
    externallyVerifiedAt:a.externally_verified_at
  }));
  return {recommendations,bindings:safeBindings,programmes:safeApprovals,
   liveCount:0,verifiedForRealMoney:false,
   notice:"Candidate registry only. A production approval row does not independently verify external provider operation."};
 });
