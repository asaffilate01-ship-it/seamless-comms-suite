import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assessTenantReadiness } from "./readiness";

async function requireTenantProductManager(context:any,tenantProductId:string){
  const db=context.supabase as any;
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const admin=supabaseAdmin as any;
  const{data:tp,error}=await admin.from("tenant_products")
    .select("id,tenant_id,product_key,region_key,plan_key,status,brand_key,settings,provisioned_at,created_at,updated_at")
    .eq("id",tenantProductId).maybeSingle();
  if(error||!tp)throw new Error("Tenant product not found");

  const{data:membership}=await db.from("tenant_members").select("role")
    .eq("tenant_id",tp.tenant_id).eq("user_id",context.userId).maybeSingle();
  if(membership&&["owner","admin"].includes(membership.role)){
    return{tp,admin,actorKind:"tenant" as const,role:String(membership.role)};
  }

  const{data:platform}=await db.from("platform_operators").select("role,status")
    .eq("user_id",context.userId).maybeSingle();
  if(platform?.status==="active"&&["platform_owner","platform_admin"].includes(platform.role)){
    return{tp,admin,actorKind:"platform" as const,role:String(platform.role)};
  }

  const{data:allowed,error:operatorError}=await db.rpc("is_product_operator",{
    _product:tp.product_key,_user:context.userId,
    _roles:["landlord_owner","landlord_admin"],_region:tp.region_key
  });
  if(operatorError)throw new Error(operatorError.message);
  if(allowed===true)return{tp,admin,actorKind:"landlord" as const,role:"landlord_admin"};

  throw new Error("Tenant, landlord or platform admin access required");
}

const detailSchema=z.object({tenantProductId:z.string().uuid()});

export const getManagedTenantProductConfiguration=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof detailSchema>)=>detailSchema.parse(input))
.handler(async({context,data})=>{
  const access=await requireTenantProductManager(context,data.tenantProductId);
  const{tp,admin}=access;
  const[
    tenant,entitlements,requests,domains,brands,surfaces,locations,bindings,
    subscriptions,addonSubscriptions,addons,members,invitations,identities
  ]=await Promise.all([
    admin.from("tenants").select("id,name,slug,created_at").eq("id",tp.tenant_id).single(),
    admin.from("tenant_module_entitlements")
      .select("id,module_key,enabled,limits,config,starts_at,ends_at,source,created_at,updated_at")
      .eq("tenant_id",tp.tenant_id).eq("tenant_product_id",tp.id).order("module_key"),
    admin.from("tenant_module_requests")
      .select("id,module_key,reason,status,requested_by,decided_by,decided_at,decision_note,created_at,updated_at")
      .eq("tenant_id",tp.tenant_id).eq("tenant_product_id",tp.id).order("created_at",{ascending:false}),
    admin.from("tenant_domains")
      .select("id,location_id,hostname,purpose,verification_status,is_primary,created_at,updated_at")
      .eq("tenant_id",tp.tenant_id).eq("tenant_product_id",tp.id).order("purpose"),
    admin.from("tenant_brand_profiles")
      .select("id,brand_key,branding_mode,name,app_name,logo_url,logo_light_url,logo_dark_url,icon_url,favicon_url,website_url,primary_colour,secondary_colour,accent_colour,support_email,support_phone,locale,social_links,status,revision,updated_at")
      .eq("tenant_id",tp.tenant_id).eq("tenant_product_id",tp.id).order("brand_key"),
    admin.from("tenant_brand_surfaces")
      .select("id,brand_key,surface,domain_id,display_name,enabled,updated_at")
      .eq("tenant_id",tp.tenant_id).eq("tenant_product_id",tp.id).order("surface"),
    admin.from("tenant_locations")
      .select("id,parent_location_id,location_key,name,kind,country_code,locale,time_zone,currency,status,created_at,updated_at")
      .eq("tenant_id",tp.tenant_id).eq("tenant_product_id",tp.id).order("name"),
    admin.from("tenant_integration_bindings")
      .select("id,location_id,module_key,provider,plugin_key,integration_kind,environment,secret_ref,secret_refs,status,last_verified_at,created_at,updated_at")
      .eq("tenant_id",tp.tenant_id).eq("tenant_product_id",tp.id).order("integration_kind"),
    admin.from("tenant_subscriptions")
      .select("id,plan_key,provider,status,starts_at,current_period_start,current_period_end,trial_ends_at,cancel_at,created_at,updated_at")
      .eq("tenant_id",tp.tenant_id).eq("tenant_product_id",tp.id).order("created_at",{ascending:false}),
    admin.from("tenant_addon_subscriptions")
      .select("id,addon_key,status,starts_at,ends_at,created_at,updated_at")
      .eq("tenant_id",tp.tenant_id).eq("tenant_product_id",tp.id).order("created_at",{ascending:false}),
    admin.from("platform_module_addons")
      .select("addon_key,product_key,module_key,name,currency,billing_interval,price_minor,included_limits,active")
      .or(`product_key.is.null,product_key.eq.${tp.product_key}`).eq("active",true).order("name"),
    admin.from("tenant_members").select("user_id,role").eq("tenant_id",tp.tenant_id),
    admin.from("tenant_invitations")
      .select("id,email,role,product_key,expires_at,accepted_at,revoked_at,created_at")
      .eq("tenant_id",tp.tenant_id).order("created_at",{ascending:false}).limit(100),
    admin.from("tenant_communication_identities")
      .select("id,location_id,channel,purpose,identity_value,display_name,reply_to,verification_status,active,is_primary,verified_at,updated_at")
      .eq("tenant_id",tp.tenant_id).eq("tenant_product_id",tp.id).order("channel"),
  ]);

  for(const result of[
    tenant,entitlements,requests,domains,brands,surfaces,locations,bindings,
    subscriptions,addonSubscriptions,addons,members,invitations,identities
  ]){
    if(result.error)throw new Error(result.error.message);
  }

  const now=Date.now();
  const activeModules=(entitlements.data??[])
    .filter((row:any)=>row.enabled)
    .filter((row:any)=>!row.starts_at||Date.parse(row.starts_at)<=now)
    .filter((row:any)=>!row.ends_at||Date.parse(row.ends_at)>now)
    .map((row:any)=>row.module_key);

  const readiness=assessTenantReadiness({
    moduleKeys:activeModules,
    bindings:bindings.data??[],
    domains:domains.data??[],
    locations:(locations.data??[]).filter((row:any)=>row.status==="active")
  });

  const safeBindings=(bindings.data??[]).map((row:any)=>({
    id:row.id,location_id:row.location_id,module_key:row.module_key,provider:row.provider,
    plugin_key:row.plugin_key,integration_kind:row.integration_kind,environment:row.environment,
    status:row.status,last_verified_at:row.last_verified_at,created_at:row.created_at,updated_at:row.updated_at,
    credentialReferencesConfigured:!!row.secret_ref||Object.keys(row.secret_refs??{}).length>0
  }));

  return{
    access:{actorKind:access.actorKind,role:access.role},
    tenant:tenant.data,
    tenantProduct:tp,
    activeModuleKeys:activeModules,
    entitlements:entitlements.data??[],
    moduleRequests:requests.data??[],
    domains:domains.data??[],
    brands:brands.data??[],
    brandSurfaces:surfaces.data??[],
    locations:locations.data??[],
    integrations:safeBindings,
    subscriptions:subscriptions.data??[],
    addonSubscriptions:addonSubscriptions.data??[],
    availableAddons:addons.data??[],
    members:members.data??[],
    invitations:invitations.data??[],
    communicationIdentities:identities.data??[],
    readiness
  };
});

const statusSchema=z.object({
  tenantProductId:z.string().uuid(),
  status:z.enum(["active","suspended","cancelled"])
});
export const setManagedTenantProductStatus=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof statusSchema>)=>statusSchema.parse(input))
.handler(async({context,data})=>{
  const access=await requireTenantProductManager(context,data.tenantProductId);
  if(access.actorKind==="tenant"&&data.status==="cancelled"){
    throw new Error("Cancellation requires landlord or platform administration");
  }
  const{data:row,error}=await access.admin.from("tenant_products").update({
    status:data.status
  }).eq("id",data.tenantProductId).eq("tenant_id",access.tp.tenant_id)
    .select("id,status,updated_at").single();
  if(error||!row)throw new Error(error?.message??"Tenant product status could not be updated");
  await access.admin.from("audit_log").insert({
    tenant_id:access.tp.tenant_id,actor:context.userId,action:"platform.tenant_product.status_changed",
    entity:"tenant_product",entity_id:data.tenantProductId,payload:{status:data.status}
  });
  return row;
});

const memberSchema=z.object({
  tenantProductId:z.string().uuid(),
  userId:z.string().uuid(),
  role:z.enum(["owner","admin","agent","viewer"])
});
export const setManagedTenantMemberRole=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof memberSchema>)=>memberSchema.parse(input))
.handler(async({context,data})=>{
  const access=await requireTenantProductManager(context,data.tenantProductId);
  const admin=access.admin;
  const{data:target}=await admin.from("tenant_members").select("user_id,role")
    .eq("tenant_id",access.tp.tenant_id).eq("user_id",data.userId).maybeSingle();
  if(!target)throw new Error("Tenant member not found");

  if(target.role==="owner"&&data.role!=="owner"){
    const{count,error:countError}=await admin.from("tenant_members").select("user_id",{count:"exact",head:true})
      .eq("tenant_id",access.tp.tenant_id).eq("role","owner");
    if(countError)throw new Error(countError.message);
    if((count??0)<=1)throw new Error("A tenant must retain at least one owner");
  }

  const{data:row,error}=await admin.from("tenant_members").update({role:data.role})
    .eq("tenant_id",access.tp.tenant_id).eq("user_id",data.userId)
    .select("user_id,role").single();
  if(error||!row)throw new Error(error?.message??"Tenant member role could not be updated");
  await admin.from("audit_log").insert({
    tenant_id:access.tp.tenant_id,actor:context.userId,action:"platform.tenant_member.role_changed",
    entity:"tenant_member",entity_id:data.userId,payload:{role:data.role,tenantProductId:data.tenantProductId}
  });
  return row;
});
