import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenantBranding } from "./runtime.server";

async function requireBrandAdmin(context:any,tenantId:string,tenantProductId:string){
  const db=context.supabase as any;
  const{data:m}=await db.from("tenant_members").select("role")
    .eq("tenant_id",tenantId).eq("user_id",context.userId).maybeSingle();
  if(m&&["owner","admin"].includes(m.role))return{db,kind:"tenant" as const,role:String(m.role)};

  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const{data:tp}=await admin.from("tenant_products").select("id,product_key,region_key,status")
    .eq("id",tenantProductId).eq("tenant_id",tenantId).maybeSingle();
  if(!tp||tp.status!=="active")throw new Error("Active tenant product required");

  const{data:p}=await db.from("platform_operators").select("role,status").eq("user_id",context.userId).maybeSingle();
  if(p?.status==="active"&&["platform_owner","platform_admin"].includes(p.role)){
    return{db:admin,kind:"operator" as const,role:String(p.role)};
  }
  const{data:o}=await db.from("product_operators").select("role,status,region_keys")
    .eq("product_key",tp.product_key).eq("user_id",context.userId).maybeSingle();
  const regions=Array.isArray(o?.region_keys)?o.region_keys:[];
  if(!o||o.status!=="active"||!["landlord_owner","landlord_admin"].includes(o.role)
    ||(regions.length&&!regions.includes(tp.region_key))){
    throw new Error("Tenant or landlord admin access required");
  }
  return{db:admin,kind:"operator" as const,role:String(o.role)};
}

async function requireBrandModule(db:any,tenantId:string,tenantProductId:string,moduleKey:string){
  const{data:grant}=await db.from("tenant_module_entitlements").select("enabled,starts_at,ends_at")
    .eq("tenant_id",tenantId).eq("tenant_product_id",tenantProductId)
    .eq("module_key",moduleKey).maybeSingle();
  const now=Date.now();
  if(!grant||!grant.enabled||(grant.starts_at&&Date.parse(grant.starts_at)>now)
    ||(grant.ends_at&&Date.parse(grant.ends_at)<=now)){
    throw new Error("Module entitlement required");
  }
}

const httpsUrl=z.string().url().refine((value)=>value.startsWith("https://"),"HTTPS URL required");
const optionalHttps=httpsUrl.optional().nullable();
const colour=z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable();

const socialLinks=z.object({
  facebook:optionalHttps,
  instagram:optionalHttps,
  tiktok:optionalHttps,
  youtube:optionalHttps,
  linkedin:optionalHttps,
  x:optionalHttps,
  threads:optionalHttps,
  pinterest:optionalHttps
}).default({});

const address=z.object({
  line1:z.string().max(240).optional().nullable(),
  line2:z.string().max(240).optional().nullable(),
  city:z.string().max(160).optional().nullable(),
  region:z.string().max(160).optional().nullable(),
  postcode:z.string().max(40).optional().nullable(),
  countryCode:z.string().length(2).optional().nullable()
}).default({});

const legalDetails=z.object({
  companyName:z.string().max(240).optional().nullable(),
  companyNumber:z.string().max(120).optional().nullable(),
  vatNumber:z.string().max(120).optional().nullable(),
  taxNumber:z.string().max(120).optional().nullable(),
  registeredAddress:address,
  privacyUrl:optionalHttps,
  termsUrl:optionalHttps,
  cookieUrl:optionalHttps
}).default({});

const seo=z.object({
  title:z.string().max(160).optional().nullable(),
  description:z.string().max(320).optional().nullable(),
  canonicalUrl:optionalHttps,
  ogTitle:z.string().max(160).optional().nullable(),
  ogDescription:z.string().max(320).optional().nullable(),
  ogImageUrl:optionalHttps,
  robots:z.enum(["index,follow","noindex,follow","noindex,nofollow"]).optional().nullable()
}).default({});

const theme=z.object({
  mode:z.enum(["light","dark","system"]).optional().nullable(),
  primary:colour,
  secondary:colour,
  accent:colour,
  background:colour,
  surface:colour,
  text:colour,
  muted:colour,
  border:colour,
  success:colour,
  warning:colour,
  danger:colour,
  fontFamily:z.string().max(160).optional().nullable(),
  headingFontFamily:z.string().max(160).optional().nullable(),
  borderRadius:z.number().min(0).max(40).optional().nullable(),
  buttonRadius:z.number().min(0).max(40).optional().nullable(),
  cardRadius:z.number().min(0).max(40).optional().nullable(),
  density:z.enum(["compact","comfortable","spacious"]).optional().nullable(),
  shadow:z.enum(["none","subtle","medium","strong"]).optional().nullable(),
  cssVariables:z.record(z.string(),z.string().max(200)).default({})
}).default({});

const voice=z.object({
  slogan:z.string().max(240).optional().nullable(),
  shortDescription:z.string().max(1000).optional().nullable(),
  tones:z.array(z.string().max(120)).max(30).default([]),
  bannedTerms:z.array(z.string().max(200)).max(100).default([]),
  requiredDisclaimers:z.array(z.string().max(1000)).max(50).default([])
}).default({});

const contact=z.object({
  publicEmail:z.string().email().optional().nullable(),
  publicPhone:z.string().max(40).optional().nullable(),
  bookingEmail:z.string().email().optional().nullable(),
  billingEmail:z.string().email().optional().nullable(),
  address
}).default({});

const brandSchema=z.object({
  tenantId:z.string().uuid(),
  tenantProductId:z.string().uuid(),
  brandKey:z.string().regex(/^[a-z0-9][a-z0-9._-]{0,119}$/),
  brandingMode:z.enum(["landlord","co_branded","white_label"]).default("co_branded"),
  name:z.string().trim().min(1).max(200),
  appName:z.string().max(160).optional().nullable(),
  legalName:z.string().max(240).optional().nullable(),
  logoUrl:optionalHttps,
  logoLightUrl:optionalHttps,
  logoDarkUrl:optionalHttps,
  iconUrl:optionalHttps,
  faviconUrl:optionalHttps,
  splashUrl:optionalHttps,
  ogImageUrl:optionalHttps,
  websiteUrl:optionalHttps,
  primaryColour:colour,
  secondaryColour:colour,
  accentColour:colour,
  fontFamily:z.string().max(160).optional().nullable(),
  supportEmail:z.string().email().optional().nullable(),
  supportPhone:z.string().max(40).optional().nullable(),
  locale:z.string().max(20).optional().nullable(),
  poweredByLabel:z.string().max(200).optional().nullable(),
  terminology:z.record(z.string(),z.string().max(200)).default({}),
  theme,
  socialLinks,
  legalDetails,
  seo,
  brandVoice:voice,
  contactDetails:contact
});

export const saveTenantBranding=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof brandSchema>)=>brandSchema.parse(input))
.handler(async({context,data})=>{
  const access=await requireBrandAdmin(context,data.tenantId,data.tenantProductId);
  const db=access.db as any;
  const{data:tp}=await db.from("tenant_products").select("id,status")
    .eq("id",data.tenantProductId).eq("tenant_id",data.tenantId).maybeSingle();
  if(!tp||tp.status!=="active")throw new Error("Active tenant product required");

  if(data.brandingMode==="white_label"){
    await requireBrandModule(db,data.tenantId,data.tenantProductId,"branding.white_label");
  }

  const{data:existing}=await db.from("tenant_brand_profiles").select("id,revision")
    .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .eq("brand_key",data.brandKey).maybeSingle();

  const values={
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,brand_key:data.brandKey,
    branding_mode:data.brandingMode,name:data.name,app_name:data.appName??null,legal_name:data.legalName??null,
    logo_url:data.logoUrl??null,logo_light_url:data.logoLightUrl??null,logo_dark_url:data.logoDarkUrl??null,
    icon_url:data.iconUrl??null,favicon_url:data.faviconUrl??null,splash_url:data.splashUrl??null,
    og_image_url:data.ogImageUrl??null,website_url:data.websiteUrl??null,
    primary_colour:data.primaryColour??null,secondary_colour:data.secondaryColour??null,
    accent_colour:data.accentColour??null,font_family:data.fontFamily??null,
    support_email:data.supportEmail??null,support_phone:data.supportPhone??null,locale:data.locale??null,
    powered_by_label:data.poweredByLabel??null,terminology:data.terminology,theme:data.theme,
    social_links:data.socialLinks,legal_details:data.legalDetails,seo:data.seo,
    brand_voice:data.brandVoice,contact_details:data.contactDetails,status:"active",
    revision:(existing?.revision??0)+1
  };
  const result=existing?.id
    ?await db.from("tenant_brand_profiles").update(values).eq("id",existing.id).select("*").single()
    :await db.from("tenant_brand_profiles").insert(values).select("*").single();
  if(result.error||!result.data)throw new Error(result.error?.message??"Tenant branding could not be saved");
  return result.data;
});

const surfaceSchema=z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),
  brandKey:z.string().regex(/^[a-z0-9][a-z0-9._-]{0,119}$/),
  surface:z.enum([
    "marketing","staff_portal","customer_portal","provider_portal",
    "auth","tracking","documents","email","invoices","mobile_app"
  ]),
  domainId:z.string().uuid().optional().nullable(),
  displayName:z.string().max(200).optional().nullable(),
  logoUrl:optionalHttps,logoLightUrl:optionalHttps,logoDarkUrl:optionalHttps,
  faviconUrl:optionalHttps,appIconUrl:optionalHttps,
  theme,
  navigationOrder:z.array(z.string().max(120)).max(100).default([]),
  hiddenNavigation:z.array(z.string().max(120)).max(100).default([]),
  footer:z.object({
    text:z.string().max(1000).optional().nullable(),
    links:z.array(z.object({label:z.string().max(120),url:httpsUrl})).max(30).default([])
  }).default({links:[]}),
  seo,
  terminology:z.record(z.string(),z.string().max(200)).default({}),
  enabled:z.boolean().default(true)
});

const domainPurposeBySurface:Record<string,string[]>={
  marketing:["marketing"],
  staff_portal:["staff_portal","app"],
  customer_portal:["customer_portal","app"],
  provider_portal:["provider_portal","app"],
  auth:["auth","app"],
  tracking:["tracking"],
  documents:["assets","app"],
  email:["email"],
  invoices:["assets","app"],
  mobile_app:["app"]
};

export const saveTenantBrandSurface=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof surfaceSchema>)=>surfaceSchema.parse(input))
.handler(async({context,data})=>{
  const access=await requireBrandAdmin(context,data.tenantId,data.tenantProductId);
  const db=access.db as any;
  const{data:brand}=await db.from("tenant_brand_profiles").select("id")
    .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .eq("brand_key",data.brandKey).eq("status","active").maybeSingle();
  if(!brand)throw new Error("Active tenant brand profile required");

  if(data.domainId){
    const{data:domain}=await db.from("tenant_domains").select("id,purpose,verification_status")
      .eq("id",data.domainId).eq("tenant_id",data.tenantId)
      .eq("tenant_product_id",data.tenantProductId).maybeSingle();
    if(!domain||domain.verification_status!=="verified")throw new Error("Verified tenant domain required");
    if(!(domainPurposeBySurface[data.surface]??[]).includes(domain.purpose)){
      throw new Error("Domain purpose is not valid for this branded surface");
    }
  }

  const nav={order:data.navigationOrder,hidden:data.hiddenNavigation};
  const{data:row,error}=await db.from("tenant_brand_surfaces").upsert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,brand_key:data.brandKey,
    surface:data.surface,domain_id:data.domainId??null,display_name:data.displayName??null,
    logo_url:data.logoUrl??null,logo_light_url:data.logoLightUrl??null,logo_dark_url:data.logoDarkUrl??null,
    favicon_url:data.faviconUrl??null,app_icon_url:data.appIconUrl??null,theme:data.theme,
    navigation:nav,footer:data.footer,seo:data.seo,terminology:data.terminology,
    enabled:data.enabled,metadata:{}
  },{onConflict:"tenant_product_id,brand_key,surface"}).select("*").single();
  if(error||!row)throw new Error(error?.message??"Branded surface could not be saved");
  return row;
});

const identityValue=z.string().trim().min(1).max(320);
const commSchema=z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),
  id:z.string().uuid().optional(),
  locationId:z.string().uuid().optional().nullable(),
  channel:z.enum(["email","whatsapp","sms","voice"]),
  purpose:z.enum(["transactional","marketing","support","bookings","billing","reception","general"]).default("transactional"),
  identityValue,displayName:z.string().max(200).optional().nullable(),
  replyTo:z.string().email().optional().nullable(),
  providerBindingId:z.string().uuid(),
  domainId:z.string().uuid().optional().nullable(),
  metadata:z.record(z.string(),z.union([
    z.string(),z.number(),z.boolean(),z.null(),z.array(z.string().max(240))
  ])).default({})
});

function validateIdentityValue(channel:string,value:string){
  if(channel==="email"){
    z.string().email().parse(value);return;
  }
  if(channel==="whatsapp"||channel==="voice"){
    if(!/^\+[1-9][0-9]{6,14}$/.test(value))throw new Error("Phone/WhatsApp identity must be E.164");
    return;
  }
  if(channel==="sms"&&!/^([A-Za-z0-9]{3,11}|\+[1-9][0-9]{6,14})$/.test(value)){
    throw new Error("SMS identity must be E.164 or a 3-11 character alphanumeric sender");
  }
}

export const saveTenantCommunicationIdentity=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof commSchema>)=>commSchema.parse(input))
.handler(async({context,data})=>{
  const access=await requireBrandAdmin(context,data.tenantId,data.tenantProductId);
  validateIdentityValue(data.channel,data.identityValue);
  const db=access.db as any;
  const{data:binding}=await db.from("tenant_integration_bindings")
    .select("id,status,integration_kind,tenant_product_id,location_id")
    .eq("id",data.providerBindingId).eq("tenant_id",data.tenantId).maybeSingle();
  if(!binding||binding.tenant_product_id!==data.tenantProductId
    ||!["configured","active"].includes(binding.status)){
    throw new Error("Configured provider binding required");
  }
  if(data.locationId&&binding.location_id&&binding.location_id!==data.locationId){
    throw new Error("Provider binding location does not match communication identity");
  }

  let verificationStatus="pending";
  if(data.channel==="email"){
    if(!data.domainId)throw new Error("Email identity requires a verified email domain");
    const emailDomain=data.identityValue.split("@")[1]?.toLowerCase();
    const{data:domain}=await db.from("tenant_domains").select("id,hostname,purpose,verification_status")
      .eq("id",data.domainId).eq("tenant_id",data.tenantId)
      .eq("tenant_product_id",data.tenantProductId).maybeSingle();
    if(!domain||domain.verification_status!=="verified"||domain.purpose!=="email"){
      throw new Error("Verified tenant email domain required");
    }
    if(domain.hostname.toLowerCase()!==emailDomain)throw new Error("Sender email must use the verified email domain");
    verificationStatus="configured";
  }else{
    verificationStatus="configured";
  }

  const values={
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,location_id:data.locationId??null,
    channel:data.channel,purpose:data.purpose,identity_value:data.identityValue,
    display_name:data.displayName??null,reply_to:data.replyTo??null,
    provider_binding_id:data.providerBindingId,domain_id:data.domainId??null,
    verification_status:verificationStatus,active:false,is_primary:false,
    metadata:data.metadata,verified_at:null,verified_by:null
  };
  const q=data.id
    ?db.from("tenant_communication_identities").update(values).eq("id",data.id)
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    :db.from("tenant_communication_identities").insert(values);
  const{data:row,error}=await q.select("*").single();
  if(error||!row)throw new Error(error?.message??"Communication identity could not be saved");
  return row;
});

export const setTenantCommunicationIdentityActive=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{
  tenantId:string;tenantProductId:string;identityId:string;active:boolean;primary?:boolean
})=>z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),identityId:z.string().uuid(),
  active:z.boolean(),primary:z.boolean().default(false)
}).parse(input))
.handler(async({context,data})=>{
  const access=await requireBrandAdmin(context,data.tenantId,data.tenantProductId);
  const db=access.db as any;
  const{data:identity}=await db.from("tenant_communication_identities").select("*")
    .eq("id",data.identityId).eq("tenant_id",data.tenantId)
    .eq("tenant_product_id",data.tenantProductId).maybeSingle();
  if(!identity)throw new Error("Communication identity not found");
  if(data.active&&identity.verification_status!=="verified"){
    throw new Error("Only verified communication identities can be activated");
  }
  if(data.active&&data.primary){
    let q=db.from("tenant_communication_identities").update({is_primary:false})
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
      .eq("channel",identity.channel).eq("purpose",identity.purpose)
      .eq("active",true);
    if(identity.location_id)q=q.eq("location_id",identity.location_id);else q=q.is("location_id",null);
    const{error:clearError}=await q;
    if(clearError)throw new Error(clearError.message);
  }
  const{data:row,error}=await db.from("tenant_communication_identities").update({
    active:data.active,is_primary:data.active&&data.primary
  }).eq("id",identity.id).select("*").single();
  if(error||!row)throw new Error(error?.message??"Communication identity could not be updated");
  return row;
});

export const getTenantBrandingWorkspace=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{tenantId:string;tenantProductId:string})=>z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid()
}).parse(input))
.handler(async({context,data})=>{
  const access=await requireBrandAdmin(context,data.tenantId,data.tenantProductId);
  const db=access.db as any;
  const[brands,surfaces,domains,identities]=await Promise.all([
    db.from("tenant_brand_profiles").select("*").eq("tenant_id",data.tenantId)
      .eq("tenant_product_id",data.tenantProductId).order("brand_key"),
    db.from("tenant_brand_surfaces").select("*").eq("tenant_id",data.tenantId)
      .eq("tenant_product_id",data.tenantProductId).order("surface"),
    db.from("tenant_domains").select("*").eq("tenant_id",data.tenantId)
      .eq("tenant_product_id",data.tenantProductId).order("purpose"),
    db.from("tenant_communication_identities").select("*").eq("tenant_id",data.tenantId)
      .eq("tenant_product_id",data.tenantProductId).order("channel")
  ]);
  for(const result of[brands,surfaces,domains,identities])if(result.error)throw new Error(result.error.message);
  return{
    brands:brands.data??[],surfaces:surfaces.data??[],domains:domains.data??[],
    communicationIdentities:identities.data??[]
  };
});

export const getMyEffectiveBranding=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{
  tenantId:string;tenantProductId:string;surface?:string|null;locationId?:string|null
})=>z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),
  surface:z.enum([
    "marketing","staff_portal","customer_portal","provider_portal",
    "auth","tracking","documents","email","invoices","mobile_app"
  ]).optional().nullable(),
  locationId:z.string().uuid().optional().nullable()
}).parse(input))
.handler(async({context,data})=>{
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const[{data:member},{data:customer},{data:tp}]=await Promise.all([
    admin.from("tenant_members").select("role").eq("tenant_id",data.tenantId).eq("user_id",context.userId).maybeSingle(),
    admin.from("customer_portal_users").select("id").eq("tenant_id",data.tenantId)
      .eq("tenant_product_id",data.tenantProductId).eq("user_id",context.userId)
      .eq("status","active").maybeSingle(),
    admin.from("tenant_products").select("brand_key,status").eq("id",data.tenantProductId)
      .eq("tenant_id",data.tenantId).maybeSingle()
  ]);
  let vendor=false;
  if(!member&&!customer){
    const{data:vendorRows}=await admin.from("marketplace_vendor_users")
      .select("vendor_id").eq("tenant_id",data.tenantId).eq("user_id",context.userId)
      .eq("status","active").limit(20);
    if(vendorRows?.length){
      const ids=vendorRows.map((row:any)=>row.vendor_id);
      const{data:matched}=await admin.from("marketplace_vendors").select("id")
        .eq("tenant_id",data.tenantId).in("id",ids).limit(1);
      vendor=!!matched?.length;
    }
  }
  if(!tp||tp.status!=="active"||(!member&&!customer&&!vendor)){
    throw new Error("Branding context access required");
  }
  return resolveTenantBranding(admin,{
    tenantId:data.tenantId,tenantProductId:data.tenantProductId,
    brandKey:tp.brand_key??"default",surface:data.surface??null,locationId:data.locationId??null
  });
});

export const syncTenantBrandToVoxentri=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{tenantId:string;tenantProductId:string;brandKey:string})=>z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),
  brandKey:z.string().regex(/^[a-z0-9][a-z0-9._-]{0,119}$/)
}).parse(input))
.handler(async({context,data})=>{
  const access=await requireBrandAdmin(context,data.tenantId,data.tenantProductId);
  const db=access.db as any;
  await requireBrandModule(db,data.tenantId,data.tenantProductId,"creative.core");
  const{data:brand}=await db.from("tenant_brand_profiles").select("*")
    .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .eq("brand_key",data.brandKey).eq("status","active").maybeSingle();
  if(!brand)throw new Error("Active tenant brand profile required");

  const voice=brand.brand_voice&&typeof brand.brand_voice==="object"?brand.brand_voice:{};
  const logos=[brand.logo_url,brand.logo_light_url,brand.logo_dark_url,brand.icon_url]
    .filter((value:any)=>typeof value==="string"&&value);
  const colours=[brand.primary_colour,brand.secondary_colour,brand.accent_colour]
    .filter((value:any)=>typeof value==="string"&&value);
  const fonts=[brand.font_family].filter((value:any)=>typeof value==="string"&&value);
  const tones=Array.isArray((voice as any).tones)?(voice as any).tones:[];
  const bannedTerms=Array.isArray((voice as any).bannedTerms)?(voice as any).bannedTerms:[];
  const requiredDisclaimers=Array.isArray((voice as any).requiredDisclaimers)?(voice as any).requiredDisclaimers:[];

  const{data:existing}=await db.from("creative_brand_kits").select("id,revision")
    .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .eq("brand_key",data.brandKey).maybeSingle();
  const values={
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,brand_key:data.brandKey,
    name:brand.name,region_key:null,locale:brand.locale??null,logos,colours,fonts,
    tone:tones,banned_terms:bannedTerms,required_disclaimers:requiredDisclaimers,
    asset_refs:[],revision:(existing?.revision??0)+1
  };
  const result=existing?.id
    ?await db.from("creative_brand_kits").update(values).eq("id",existing.id).select("*").single()
    :await db.from("creative_brand_kits").insert(values).select("*").single();
  if(result.error||!result.data)throw new Error(result.error?.message??"Voxentri brand kit could not be synchronized");
  return result.data;
});
