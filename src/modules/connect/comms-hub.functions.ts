import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement } from "@/modules/platform/module-access";
import { connectManifest } from "./product-manifests";
import { pluginDefinition } from "@/modules/platform/plugins";

const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()});

export const getCommsHubWorkspace=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{
  await requireModuleEntitlement(context,{...data,moduleKey:"connect.core"});
  const db=context.supabase as any;

  const{data:tp,error:tpError}=await db.from("tenant_products")
    .select("id,tenant_id,product_key,region_key,status")
    .eq("id",data.tenantProductId).eq("tenant_id",data.tenantId).maybeSingle();
  if(tpError||!tp||tp.status!=="active")throw new Error("Active tenant product required");

  const{data:product}=await db.from("platform_products")
    .select("product_key,parent_product_key").eq("product_key",tp.product_key).maybeSingle();
  const productKeys=[...new Set([tp.product_key,product?.parent_product_key].filter(Boolean))] as string[];

  const[identities,bindings,channels,events,receptionSettings,receptionRequests,domains,locations]=await Promise.all([
    db.from("tenant_communication_identities")
      .select("id,location_id,channel,purpose,identity_value,display_name,reply_to,provider_binding_id,domain_id,verification_status,active,is_primary,verified_at,updated_at")
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
      .order("channel").order("purpose"),
    db.from("tenant_integration_bindings")
      .select("id,location_id,module_key,provider,plugin_key,integration_kind,environment,external_account_ref,status,last_verified_at,secret_ref,secret_refs,config,created_at,updated_at")
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
      .eq("integration_kind","communications").order("provider"),
    db.from("whatsapp_channels")
      .select("id,label,product_key,external_tenant_id,scope_kind,scope_id,is_primary,ai_enabled,human_handoff_enabled,inbound_enabled,outbound_enabled,display_phone,phone_number_id,waba_id,status,updated_at")
      .eq("tenant_id",data.tenantId).in("product_key",productKeys)
      .order("is_primary",{ascending:false}),
    db.from("communication_events")
      .select("id,product_key,external_tenant_id,scope_id,source_event_id,event_type,direction,recipient,message,metadata,status,attempts,last_error,created_at,updated_at")
      .eq("tenant_id",data.tenantId).in("product_key",productKeys)
      .order("created_at",{ascending:false}).limit(500),
    db.from("reception_settings")
      .select("id,location_id,enabled,default_locale,allow_ai_drafting,allow_order_intake,allow_booking_intake,updated_at")
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
      .order("location_id",{ascending:true,nullsFirst:true}),
    db.from("reception_requests")
      .select("id,location_id,kind,channel,crm_person_id,customer_name,contact,summary,status,revision,created_at,updated_at")
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
      .order("created_at",{ascending:false}).limit(250),
    db.from("tenant_domains")
      .select("id,hostname,purpose,verification_status,is_primary")
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
      .order("purpose"),
    db.from("tenant_locations")
      .select("id,location_key,name,status,country_code,locale")
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
      .eq("status","active").order("name")
  ]);

  for(const result of[identities,bindings,channels,events,domains,locations]){
    if(result.error)throw new Error(result.error.message);
  }
  // Reception is an optional entitlement; lack of rows/table visibility must not hide core comms.
  const safeReceptionSettings=receptionSettings.error?[]:(receptionSettings.data??[]);
  const safeReceptionRequests=receptionRequests.error?[]:(receptionRequests.data??[]);

  const channelIds=(channels.data??[]).map((row:any)=>row.id);
  let conversations:any[]=[];
  if(channelIds.length){
    const result=await db.from("conversations")
      .select("id,status,channel_id,last_message_at,contact:contacts(id,display_name,wa_id)")
      .eq("tenant_id",data.tenantId).in("channel_id",channelIds)
      .order("last_message_at",{ascending:false}).limit(250);
    if(result.error)throw new Error(result.error.message);
    conversations=result.data??[];
  }

  const safeBindings=(bindings.data??[]).map((row:any)=>{
    const key=row.plugin_key??("communications."+row.provider);
    const definition=pluginDefinition(key);
    return{
      id:row.id,locationId:row.location_id,moduleKey:row.module_key,
      provider:row.provider,pluginKey:row.plugin_key,integrationKind:row.integration_kind,
      environment:row.environment,externalAccountRef:row.external_account_ref,status:row.status,
      lastVerifiedAt:row.last_verified_at,
      credentialNamesConfigured:[
        ...(row.secret_ref?["default"]:[]),
        ...Object.keys(row.secret_refs??{})
      ],
      capabilities:definition?.capabilities??[],
      adapterStatus:definition?.status??"planned",
      createdAt:row.created_at,updatedAt:row.updated_at
    };
  });

  const manifest=connectManifest(tp.product_key);
  const activeCapabilities=new Set<string>();
  for(const binding of safeBindings){
    if(binding.status!=="active")continue;
    for(const capability of binding.capabilities)activeCapabilities.add(capability);
  }
  for(const channel of channels.data??[]){
    if(channel.status==="configured"){
      activeCapabilities.add("whatsapp.inbound");
      if(channel.outbound_enabled)activeCapabilities.add("whatsapp.outbound");
    }
  }

  return{
    tenantProduct:tp,
    manifest,
    communicationIdentities:identities.data??[],
    providerBindings:safeBindings,
    whatsappChannels:channels.data??[],
    communicationEvents:events.data??[],
    conversations,
    receptionSettings:safeReceptionSettings,
    receptionRequests:safeReceptionRequests,
    domains:domains.data??[],
    locations:locations.data??[],
    activeCapabilities:[...activeCapabilities],
  };
});
