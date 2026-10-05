import { resolveTenantBranding } from "./runtime.server";

function reply(body:unknown,status=200){
  return Response.json(body,{status,headers:{
    "cache-control":"public, max-age=60, stale-while-revalidate=300",
    "x-content-type-options":"nosniff"
  }});
}

function cleanHost(value:string|null){
  if(!value)return null;
  const host=value.trim().toLowerCase().replace(/:\d+$/,"");
  if(!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host))return null;
  return host;
}

function surfaceForPurpose(purpose:string){
  const map:Record<string,string>={
    marketing:"marketing",
    app:"staff_portal",
    customer_portal:"customer_portal",
    provider_portal:"provider_portal",
    staff_portal:"staff_portal",
    auth:"auth",
    tracking:"tracking",
    assets:"documents"
  };
  return map[purpose]??"marketing";
}

export async function servePublicBranding(request:Request){
  const url=new URL(request.url);
  const host=cleanHost(url.searchParams.get("host")??request.headers.get("x-forwarded-host")??request.headers.get("host"));
  if(!host)return reply({error:"Verified brand host required"},400);

  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
  const{data:domain,error}=await db.from("tenant_domains")
    .select("id,tenant_id,tenant_product_id,location_id,hostname,purpose,verification_status,is_primary")
    .eq("hostname",host).eq("verification_status","verified").maybeSingle();
  if(error||!domain||!domain.tenant_product_id)return reply({error:"Brand host not found"},404);

  const{data:tp}=await db.from("tenant_products").select("id,status,brand_key")
    .eq("id",domain.tenant_product_id).eq("tenant_id",domain.tenant_id).maybeSingle();
  if(!tp||tp.status!=="active")return reply({error:"Brand host not active"},404);

  const branding=await resolveTenantBranding(db,{
    tenantId:domain.tenant_id,tenantProductId:tp.id,
    brandKey:tp.brand_key??"default",surface:surfaceForPurpose(domain.purpose),
    locationId:domain.location_id??null
  });

  const publicIdentities=branding.communicationIdentities.filter((identity:any)=>
    ["support","general","bookings","reception","marketing"].includes(identity.purpose)
  );

  return reply({
    productKey:branding.productKey,
    familyProductKey:branding.familyProductKey,
    regionKey:branding.regionKey,
    brandingMode:branding.brandingMode,
    displayName:branding.displayName,
    landlordName:branding.landlordName,
    poweredBy:branding.poweredBy,
    logoUrl:branding.logoUrl,
    logoLightUrl:branding.logoLightUrl,
    logoDarkUrl:branding.logoDarkUrl,
    faviconUrl:branding.faviconUrl,
    ogImageUrl:branding.ogImageUrl,
    splashUrl:branding.splashUrl,
    appIconUrl:branding.appIconUrl,
    theme:branding.theme,
    terminology:branding.terminology,
    socialLinks:branding.socialLinks,
    legalDetails:branding.legalDetails,
    seo:branding.seo,
    contactDetails:branding.contactDetails,
    supportEmail:branding.supportEmail,
    supportPhone:branding.supportPhone,
    websiteUrl:branding.websiteUrl,
    locale:branding.locale,
    surface:branding.surface,
    domain:branding.domain,
    communicationIdentities:publicIdentities
  });
}
