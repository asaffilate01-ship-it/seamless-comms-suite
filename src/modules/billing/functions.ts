import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requirePlatformAdmin(context:any){
 const db=context.supabase as any;const{data:p}=await db.from("platform_operators").select("role,status").eq("user_id",context.userId).maybeSingle();
 if(!p||p.status!=="active"||!["platform_owner","platform_admin"].includes(p.role))throw new Error("Platform admin access required");
}
async function requireProductManager(context:any,tenantProductId:string){
 const db=context.supabase as any;const{data:tp}=await db.from("tenant_products").select("tenant_id,product_key,region_key").eq("id",tenantProductId).maybeSingle();if(!tp)throw new Error("Tenant product not found");
 const{data:p}=await db.from("platform_operators").select("role,status").eq("user_id",context.userId).maybeSingle();if(p?.status==="active"&&["platform_owner","platform_admin"].includes(p.role))return tp;
 const{data:o}=await db.from("product_operators").select("role,status,region_keys").eq("product_key",tp.product_key).eq("user_id",context.userId).maybeSingle();const regions=Array.isArray(o?.region_keys)?o.region_keys:[];
 if(!o||o.status!=="active"||!["landlord_owner","landlord_admin","landlord_billing"].includes(o.role)||(regions.length&&!regions.includes(tp.region_key)))throw new Error("Platform or landlord billing access required");
 return tp;
}

const plan=z.object({planKey:z.string().regex(/^[a-z0-9][a-z0-9._-]{2,119}$/),productKey:z.string().min(1).max(80),name:z.string().min(2).max(160),currency:z.string().regex(/^[A-Z]{3}$/),billingInterval:z.enum(["monthly","annual","usage","one_time"]),priceMinor:z.number().int().nonnegative(),trialDays:z.number().int().min(0).max(365).optional().nullable(),modules:z.array(z.object({moduleKey:z.string().min(1).max(160),limits:z.record(z.string(),z.unknown()).optional(),config:z.record(z.string(),z.unknown()).optional()})).max(100)});
export const upsertPlatformPlan=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof plan>)=>plan.parse(i)).handler(async({context,data})=>{
 await requirePlatformAdmin(context);const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
 const{error}=await admin.from("platform_plans").upsert({plan_key:data.planKey,product_key:data.productKey,name:data.name,currency:data.currency,billing_interval:data.billingInterval,price_minor:data.priceMinor,trial_days:data.trialDays??null,active:true},{onConflict:"plan_key"});if(error)throw new Error(error.message);
 await admin.from("platform_plan_modules").delete().eq("plan_key",data.planKey);
 if(data.modules.length){const{error:me}=await admin.from("platform_plan_modules").insert(data.modules.map(m=>({plan_key:data.planKey,module_key:m.moduleKey,included:true,limits:m.limits??{},config:m.config??{}})));if(me)throw new Error(me.message);}
 return{ok:true};
});

const start=z.object({tenantProductId:z.string().uuid(),planKey:z.string().min(3).max(120),status:z.enum(["trialing","active"]).default("active"),provider:z.string().max(80).optional().nullable(),providerSubscriptionRef:z.string().max(240).optional().nullable(),currentPeriodEnd:z.string().datetime().optional().nullable(),trialEndsAt:z.string().datetime().optional().nullable()});
export const startTenantSubscription=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof start>)=>start.parse(i)).handler(async({context,data})=>{
 const tp=await requireProductManager(context,data.tenantProductId);const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
 const{data:planRow}=await admin.from("platform_plans").select("plan_key,product_key,active").eq("plan_key",data.planKey).eq("product_key",tp.product_key).eq("active",true).maybeSingle();if(!planRow)throw new Error("Active plan not found for product");
 await admin.from("tenant_subscriptions").update({status:"ended"}).eq("tenant_product_id",data.tenantProductId).in("status",["trialing","active","past_due","paused"]);
 const{data:sub,error}=await admin.from("tenant_subscriptions").insert({tenant_id:tp.tenant_id,tenant_product_id:data.tenantProductId,plan_key:data.planKey,provider:data.provider??null,provider_subscription_ref:data.providerSubscriptionRef??null,status:data.status,starts_at:new Date().toISOString(),current_period_start:new Date().toISOString(),current_period_end:data.currentPeriodEnd??null,trial_ends_at:data.trialEndsAt??null}).select("id,status,plan_key").single();if(error||!sub)throw new Error(error?.message??"Subscription could not be created");
 const{error:syncError}=await admin.rpc("sync_subscription_entitlements",{_subscription:sub.id});if(syncError)throw new Error(syncError.message);
 await admin.from("tenant_products").update({plan_key:data.planKey}).eq("id",data.tenantProductId);
 return sub;
});

export const changeTenantSubscriptionStatus=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((i:{subscriptionId:string;tenantProductId:string;status:"active"|"past_due"|"paused"|"cancelled"|"ended"})=>z.object({subscriptionId:z.string().uuid(),tenantProductId:z.string().uuid(),status:z.enum(["active","past_due","paused","cancelled","ended"])}).parse(i)).handler(async({context,data})=>{
 await requireProductManager(context,data.tenantProductId);const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
 const{error}=await admin.from("tenant_subscriptions").update({status:data.status}).eq("id",data.subscriptionId).eq("tenant_product_id",data.tenantProductId);if(error)throw new Error(error.message);
 const{error:syncError}=await admin.rpc("sync_subscription_entitlements",{_subscription:data.subscriptionId});if(syncError)throw new Error(syncError.message);
 return{ok:true};
});
