/* Audited finance journey drafts: not offers, credit applications, or provider transmissions. */
import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {FINANCE_PROVIDER_KEYS} from "./catalogue";

const scope=z.object({tenantId:z.string().uuid(),productKey:z.string().min(2).max(80)}).strict();
const draft=scope.extend({
 providerKey:z.string().min(3).max(100),
 sourceSubjectRef:z.string().uuid(),
 requestedAmountMinor:z.number().int().min(100).max(10_000_000_000),
 idempotencyKey:z.string().uuid(),
 brandId:z.string().uuid().nullable().optional()
}).strict();
const withdraw=z.object({tenantId:z.string().uuid(),caseId:z.string().uuid()}).strict();

export const listFinanceDrafts=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((input:z.infer<typeof scope>)=>scope.parse(input))
 .handler(async({context,data})=>{
  const db=context.supabase as any;
  const access=await db.from("tenant_products").select("tenant_id").eq("tenant_id",data.tenantId)
    .eq("product_key",data.productKey).maybeSingle();
  if(access.error||!access.data)throw new Error("No access to tenant product");
  const response=await db.from("finance_case_drafts")
    .select("id,tenant_id,product_key,provider_key,family,source_subject_ref,requested_amount_minor,currency,stage,created_at")
    .eq("tenant_id",data.tenantId).eq("product_key",data.productKey)
    .order("created_at",{ascending:false}).limit(100);
  if(response.error)throw new Error("Finance draft list unavailable");
  // Database RLS restricts to created_by=auth.uid() even for tenant administrators.
  return {drafts:response.data??[],availableActions:["draft","withdraw"],liveSubmissionsEnabled:false};
 });

export const createFinanceDraft=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((input:z.infer<typeof draft>)=>draft.parse(input))
 .handler(async({context,data})=>{
  if(!FINANCE_PROVIDER_KEYS.has(data.providerKey))throw new Error("Provider not supported");
  const db=context.supabase as any;
  const result=await db.rpc("finance_create_draft",{
   _tenant:data.tenantId,_product:data.productKey,_provider:data.providerKey,
   _source_ref:data.sourceSubjectRef,_amount:data.requestedAmountMinor,
   _idempotency:data.idempotencyKey,_brand:data.brandId??null
  });
  if(result.error)throw new Error("Could not create scoped finance draft");
  return {id:result.data,stage:"draft" as const,submittedToProvider:false,customerOffer:false};
 });

export const withdrawFinanceDraft=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((input:z.infer<typeof withdraw>)=>withdraw.parse(input))
 .handler(async({context,data})=>{
  const result=await (context.supabase as any).rpc("finance_withdraw_draft",{
    _tenant:data.tenantId,_case:data.caseId
  });
  if(result.error||result.data!==true)throw new Error("Draft not found or not withdrawable");
  return {withdrawn:true,providerNotContacted:true};
 });
