// @ts-nocheck -- new SaaS Factory tables are ahead of generated Supabase types.
import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import type {FactoryCatalogue,TenantControl} from "@/lib/saas-factory";

async function ensurePlatformAdmin(context:any){
  const {data:row,error}=await context.supabase.from("omniqora_platform_admins")
    .select("user_id").eq("user_id",context.userId).maybeSingle();
  if(error)throw new Error("Unable to verify Omniqora platform access");
  if(row)return;

  const email=String(context.claims?.email??"").trim().toLowerCase();
  const allowed=(process.env["OMNIQORA_PLATFORM_ADMIN_EMAILS"]??"")
    .split(",").map(v=>v.trim().toLowerCase()).filter(Boolean);
  if(!email||!allowed.includes(email))throw new Error("Omniqora platform administrator access is required");

  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const{error:seedError}=await supabaseAdmin.from("omniqora_platform_admins")
    .upsert({user_id:context.userId},{onConflict:"user_id"});
  if(seedError)throw new Error("Unable to initialise Omniqora platform administrator");
}

export const getFactoryCatalogue=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .handler(async({context})=>{
    await ensurePlatformAdmin(context);
    const{data,error}=await context.supabase.rpc("omniqora_factory_catalogue");
    if(error)throw new Error(error.message);
    return (data??{products:[],services:[],blueprints:[]}) as FactoryCatalogue;
  });

const provisionSchema=z.object({
  organisationName:z.string().trim().min(1).max(160),
  organisationSlug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  tenantName:z.string().trim().min(1).max(160),
  tenantSlug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  countryCode:z.string().min(2).max(3).default("GB"),
  currency:z.string().length(3).default("GBP"),
  timezone:z.string().min(3).max(100).default("Europe/London"),
  productKeys:z.array(z.string().min(1)).min(1),
  blueprintKey:z.string().optional().nullable(),
  serviceKeys:z.array(z.string().min(1)).default([]),
  branding:z.record(z.unknown()).default({}),
  primaryDomain:z.string().optional().nullable(),
  settings:z.record(z.unknown()).default({}),
  adminName:z.string().optional().nullable(),
  adminEmail:z.string().email().optional().nullable(),
});

export const provisionSaasTenant=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(provisionSchema)
  .handler(async({context,data})=>{
    await ensurePlatformAdmin(context);
    const{data:tenant,error}=await context.supabase.rpc("omniqora_provision_tenant",{
      p_organisation_name:data.organisationName,
      p_organisation_slug:data.organisationSlug,
      p_name:data.tenantName,
      p_slug:data.tenantSlug,
      p_country_code:data.countryCode.toUpperCase(),
      p_currency:data.currency.toUpperCase(),
      p_timezone:data.timezone,
      p_product_keys:data.productKeys,
      p_blueprint_key:data.blueprintKey??null,
      p_service_keys:data.serviceKeys,
      p_branding:data.branding,
      p_primary_domain:data.primaryDomain??null,
      p_settings:data.settings,
    });
    if(error)throw new Error(error.message);
    const tenantId=String(tenant);
    const{supabaseAdmin}=await import("@/integrations/supabase/client.server");

    if(data.adminEmail){
      const email=data.adminEmail.trim().toLowerCase();
      const{data:existing,error:lookupError}=await supabaseAdmin.rpc("server_find_auth_user_by_email",{p_email:email});
      if(lookupError)throw new Error(lookupError.message);
      let userId=existing?String(existing):"";
      let invited=false;
      if(!userId){
        const{data:invite,error:inviteError}=await supabaseAdmin.auth.admin.inviteUserByEmail(email,{
          data:{name:data.adminName??undefined,tenant_id:tenantId},
        });
        if(inviteError)throw new Error(inviteError.message);
        userId=invite.user?.id??"";
        invited=true;
      }
      if(!userId)throw new Error("Unable to create tenant owner");

      const{error:memberError}=await supabaseAdmin.from("tenant_members").upsert({
        tenant_id:tenantId,user_id:userId,role:"owner",
      },{onConflict:"tenant_id,user_id"});
      if(memberError)throw new Error(memberError.message);

      const{data:tenantRow}=await supabaseAdmin.from("tenants").select("organisation_id").eq("id",tenantId).single();
      if(tenantRow?.organisation_id){
        const{error:orgError}=await supabaseAdmin.from("omniqora_organisation_members").upsert({
          organisation_id:tenantRow.organisation_id,user_id:userId,role:"owner",active:true,
        },{onConflict:"organisation_id,user_id"});
        if(orgError)throw new Error(orgError.message);
      }
      const{data:products,error:productsError}=await supabaseAdmin.from("omniqora_tenant_products")
        .select("product_key").eq("tenant_id",tenantId).neq("status","cancelled");
      if(productsError)throw new Error(productsError.message);
      if(products?.length){
        const{error:pmError}=await supabaseAdmin.from("omniqora_product_members").upsert(
          products.map((p:any)=>({tenant_id:tenantId,product_key:p.product_key,user_id:userId,role:"owner",active:true})),
          {onConflict:"tenant_id,product_key,user_id"}
        );
        if(pmError)throw new Error(pmError.message);
      }
      return{tenantId,adminUserId:userId,invited};
    }
    return{tenantId,adminUserId:null,invited:false};
  });

export const getTenantControl=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({tenantId:z.string().uuid()}))
  .handler(async({context,data})=>{
    await ensurePlatformAdmin(context);
    const{data:row,error}=await context.supabase.rpc("omniqora_tenant_control",{p_tenant:data.tenantId});
    if(error)throw new Error(error.message);
    return row as TenantControl;
  });

export const attachTenantProduct=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({tenantId:z.string().uuid(),productKey:z.string().min(1),config:z.record(z.unknown()).default({})}))
  .handler(async({context,data})=>{
    await ensurePlatformAdmin(context);
    const{error}=await context.supabase.rpc("omniqora_attach_product",{
      p_tenant:data.tenantId,p_product_key:data.productKey,p_config:data.config,
    });
    if(error)throw new Error(error.message);
    return{ok:true};
  });

export const setTenantService=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({tenantId:z.string().uuid(),serviceKey:z.string().min(1),enabled:z.boolean(),config:z.record(z.unknown()).default({})}))
  .handler(async({context,data})=>{
    await ensurePlatformAdmin(context);
    const{error}=await context.supabase.rpc("omniqora_set_service",{
      p_tenant:data.tenantId,p_service_key:data.serviceKey,p_enabled:data.enabled,p_config:data.config,
    });
    if(error)throw new Error(error.message);
    return{ok:true};
  });

export const setTenantBranding=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    tenantId:z.string().uuid(),productKey:z.string().min(1),
    branding:z.record(z.unknown()),domain:z.string().optional().nullable(),
  }))
  .handler(async({context,data})=>{
    await ensurePlatformAdmin(context);
    const{error}=await context.supabase.rpc("omniqora_set_branding",{
      p_tenant:data.tenantId,p_product_key:data.productKey,p_branding:data.branding,
    });
    if(error)throw new Error(error.message);
    if(data.domain?.trim()){
      const{error:domainError}=await context.supabase.rpc("omniqora_set_domain",{
        p_tenant:data.tenantId,p_product_key:data.productKey,p_hostname:data.domain.trim(),
        p_domain_type:"web",p_primary:true,
      });
      if(domainError)throw new Error(domainError.message);
    }
    return{ok:true};
  });

export const listOpenChangeRequests=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .handler(async({context})=>{
    await ensurePlatformAdmin(context);
    const{data,error}=await context.supabase.from("omniqora_change_requests")
      .select("id,tenant_id,change_type,target_key,status,quoted_amount_pence,landlord_notes,metadata,created_at")
      .in("status",["pending","approved","awaiting_payment"]).order("created_at",{ascending:false}).limit(100);
    if(error)throw new Error(error.message);
    const ids=[...new Set((data??[]).map((r:any)=>r.tenant_id))];
    let tenants:Record<string,string>={};
    if(ids.length){
      const{data:t,error:tError}=await context.supabase.from("tenants").select("id,name").in("id",ids);
      if(tError)throw new Error(tError.message);
      tenants=Object.fromEntries((t??[]).map((r:any)=>[r.id,r.name]));
    }
    return{requests:data??[],tenants};
  });

export const decideChangeRequest=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    requestId:z.string().uuid(),
    decision:z.enum(["approved","rejected","awaiting_payment","completed"]),
    quotePence:z.number().int().nonnegative().optional().nullable(),
    notes:z.string().max(2000).optional().nullable(),
  }))
  .handler(async({context,data})=>{
    await ensurePlatformAdmin(context);
    const{error}=await context.supabase.rpc("omniqora_decide_change",{
      p_request:data.requestId,p_decision:data.decision,
      p_quote:data.quotePence??null,p_notes:data.notes??null,
    });
    if(error)throw new Error(error.message);
    return{ok:true};
  });

export const getTenantAddons=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({tenantId:z.string().uuid()}))
  .handler(async({context,data})=>{
    const{data:member,error:memberError}=await context.supabase.from("tenant_members")
      .select("role").eq("tenant_id",data.tenantId).eq("user_id",context.userId).maybeSingle();
    if(memberError||!member)throw new Error("Tenant access denied");
    const[{data:services,error:sError},{data:active,error:aError},{data:products,error:pError}]=await Promise.all([
      context.supabase.from("omniqora_service_catalogue")
        .select("service_key,name,description,category,service_kind,billing_basis,default_unit_amount_pence,currency,metadata")
        .eq("active",true).order("category").order("name"),
      context.supabase.from("omniqora_tenant_services")
        .select("service_key,status,unit_amount_pence,quantity").eq("tenant_id",data.tenantId),
      context.supabase.from("omniqora_tenant_products")
        .select("product_key,status,plan_key").eq("tenant_id",data.tenantId).neq("status","cancelled"),
    ]);
    if(sError||aError||pError)throw new Error(sError?.message??aError?.message??pError?.message??"Unable to load add-ons");
    return{services:services??[],active:active??[],products:products??[],role:member.role};
  });

export const requestTenantChange=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    tenantId:z.string().uuid(),changeType:z.enum(["add_product","remove_product","add_addon","remove_addon"]),
    targetKey:z.string().min(1),metadata:z.record(z.unknown()).default({}),
  }))
  .handler(async({context,data})=>{
    const{data:row,error}=await context.supabase.rpc("omniqora_request_change",{
      p_tenant:data.tenantId,p_change_type:data.changeType,p_target_key:data.targetKey,p_metadata:data.metadata,
    });
    if(error)throw new Error(error.message);
    return{requestId:String(row)};
  });
