import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement, requireWritableTenantRole, requireAdminTenantRole } from "@/modules/platform/module-access";

const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()});

const programme=scope.extend({
 name:z.string().min(2).max(200),currency:z.enum(["points","stamps","credit"]),
 earnRule:z.record(z.string(),z.unknown()).default({}),expiryDays:z.number().int().positive().max(3650).optional().nullable(),
 metadata:z.record(z.string(),z.unknown()).default({})
});
export const createLoyaltyProgramme=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof programme>)=>programme.parse(i))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"loyalty.core"});
 requireAdminTenantRole(access.role);const db=context.supabase as any;
 const{data:row,error}=await db.from("loyalty_programmes").insert({
  tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,name:data.name,
  loyalty_currency:data.currency,earn_rule:data.earnRule,expiry_days:data.expiryDays??null,active:true,metadata:data.metadata
 }).select("*").single();
 if(error||!row)throw new Error(error?.message??"Loyalty programme could not be created");return row;
});

export const getCustomerLoyalty=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof scope>&{customerRef:string})=>scope.extend({customerRef:z.string().min(1).max(200)}).parse(i))
.handler(async({context,data})=>{
 await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"loyalty.core"});
 const db=context.supabase as any;
 const{data:programmes,error}=await db.from("loyalty_programmes").select("id,name,loyalty_currency,expiry_days")
  .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).eq("active",true);
 if(error)throw new Error(error.message);
 const ids=(programmes??[]).map((p:any)=>p.id);
 if(!ids.length)return{programmes:[],accounts:[]};
 const{data:accounts,error:accountError}=await db.from("loyalty_accounts").select("*")
  .eq("tenant_id",data.tenantId).eq("customer_ref",data.customerRef).in("programme_id",ids);
 if(accountError)throw new Error(accountError.message);return{programmes:programmes??[],accounts:accounts??[]};
});

const entry=scope.extend({
 programmeId:z.string().uuid(),customerRef:z.string().min(1).max(200),
 entryType:z.enum(["earn","redeem","adjust","expire","reverse"]),quantity:z.number(),
 sourceRef:z.string().min(1).max(200),reason:z.string().max(1000).optional().nullable(),
 occurredAt:z.string().datetime().optional()
});
export const applyLoyaltyEntry=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof entry>)=>entry.parse(i))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"loyalty.core"});
 requireWritableTenantRole(access.role);const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
 const{data:program}=await admin.from("loyalty_programmes").select("id").eq("id",data.programmeId)
  .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).eq("active",true).maybeSingle();
 if(!program)throw new Error("Active loyalty programme not found");
 const{data:id,error}=await admin.rpc("apply_loyalty_entry",{
  _tenant:data.tenantId,_programme:data.programmeId,_customer_ref:data.customerRef,_entry_type:data.entryType,
  _quantity:data.quantity,_source_ref:data.sourceRef,_reason:data.reason??null,_occurred_at:data.occurredAt??new Date().toISOString()
 });
 if(error||!id)throw new Error(error?.message??"Loyalty entry could not be applied");return{id};
});
