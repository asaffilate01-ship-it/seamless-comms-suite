type Db=any;

type ResolveBrandingInput={
  tenantId:string;
  tenantProductId:string;
  brandKey?:string|null;
  surface?:string|null;
  locationId?:string|null;
};

function object(value:any){
  return value&&typeof value==="object"&&!Array.isArray(value)?value:{};
}

function firstUrl(...values:any[]){
  for(const value of values)if(typeof value==="string"&&value.trim())return value;
  return null;
}

function mergeObjects(...values:any[]){
  return Object.assign({},...values.map(object));
}

function domainPurposeForSurface(surface:string|null|undefined){
  const map:Record<string,string[]>={
    marketing:["marketing"],
    staff_portal:["staff_portal","app"],
    customer_portal:["customer_portal","app"],
    provider_portal:["provider_portal","app"],
    auth:["auth","app"],
    tracking:["tracking"],
    documents:["assets","app"],
    email:["email"],
    invoices:["assets","app"],
    mobile_app:["app"],
  };
  return surface?map[surface]??["app"]:["app"];
}

export async function resolveTenantBranding(db:Db,input:ResolveBrandingInput){
  const{data:tp,error:tpError}=await db.from("tenant_products")
    .select("id,tenant_id,product_key,region_key,brand_key,status,settings")
    .eq("id",input.tenantProductId).eq("tenant_id",input.tenantId).maybeSingle();
  if(tpError||!tp||tp.status!=="active")throw new Error("Active tenant product required");

  const{data:product,error:productError}=await db.from("platform_products")
    .select("product_key,name,parent_product_key,metadata,status")
    .eq("product_key",tp.product_key).maybeSingle();
  if(productError||!product)throw new Error("Platform product not found");

  let landlord=product;
  if(product.parent_product_key){
    const{data:parent,error:parentError}=await db.from("platform_products")
      .select("product_key,name,parent_product_key,metadata,status")
      .eq("product_key",product.parent_product_key).maybeSingle();
    if(parentError)throw new Error(parentError.message);
    if(parent)landlord=parent;
  }

  const brandKey=input.brandKey??tp.brand_key??"default";
  const{data:exactBrand,error:brandError}=await db.from("tenant_brand_profiles")
    .select("*").eq("tenant_id",input.tenantId).eq("tenant_product_id",tp.id)
    .eq("brand_key",brandKey).eq("status","active").maybeSingle();
  if(brandError)throw new Error(brandError.message);

  let brand=exactBrand??null;
  if(!brand){
    const{data:fallback,error:fallbackError}=await db.from("tenant_brand_profiles")
      .select("*").eq("tenant_id",input.tenantId).is("tenant_product_id",null)
      .eq("brand_key",brandKey).eq("status","active").maybeSingle();
    if(fallbackError)throw new Error(fallbackError.message);
    brand=fallback??null;
  }

  const{data:surface}=input.surface
    ?await db.from("tenant_brand_surfaces").select("*")
      .eq("tenant_id",input.tenantId).eq("tenant_product_id",tp.id)
      .eq("brand_key",brandKey).eq("surface",input.surface).eq("enabled",true).maybeSingle()
    :{data:null};

  const[{data:domains,error:domainError},{data:identities,error:identityError},{data:whiteLabelGrant}]=await Promise.all([
    db.from("tenant_domains").select("id,hostname,purpose,verification_status,is_primary,location_id,metadata")
      .eq("tenant_id",input.tenantId).eq("tenant_product_id",tp.id).eq("verification_status","verified"),
    db.from("tenant_communication_identities")
      .select("id,channel,purpose,identity_value,display_name,reply_to,location_id,is_primary,metadata")
      .eq("tenant_id",input.tenantId).eq("tenant_product_id",tp.id)
      .eq("verification_status","verified").eq("active",true),
    db.from("tenant_module_entitlements").select("enabled,starts_at,ends_at")
      .eq("tenant_id",input.tenantId).eq("tenant_product_id",tp.id)
      .eq("module_key","branding.white_label").eq("enabled",true).maybeSingle()
  ]);
  if(domainError)throw new Error(domainError.message);
  if(identityError)throw new Error(identityError.message);

  const now=Date.now();
  const whiteLabelAllowed=!!whiteLabelGrant
    &&(!whiteLabelGrant.starts_at||Date.parse(whiteLabelGrant.starts_at)<=now)
    &&(!whiteLabelGrant.ends_at||Date.parse(whiteLabelGrant.ends_at)>now);

  const requestedMode=String(brand?.branding_mode??"landlord");
  const brandingMode=requestedMode==="white_label"&&!whiteLabelAllowed?"co_branded":requestedMode;

  const landlordMeta=object(landlord.metadata);
  const productMeta=object(product.metadata);
  const landlordBrand=mergeObjects(
    object(landlordMeta.branding),
    object(productMeta.branding)
  );

  const tenantTheme=object(brand?.theme);
  const surfaceTheme=object(surface?.theme);
  const tenantTerminology=object(brand?.terminology);
  const surfaceTerminology=object(surface?.terminology);
  const socialLinks=object(brand?.social_links);
  const legalDetails=object(brand?.legal_details);
  const seo=mergeObjects(object(brand?.seo),object(surface?.seo));
  const brandVoice=object(brand?.brand_voice);
  const contactDetails=object(brand?.contact_details);

  const landlordName=String(landlord?.name??product?.name??tp.product_key);
  const tenantName=String(brand?.name??brand?.app_name??landlordName);
  const displayName=brandingMode==="landlord"
    ?landlordName
    :String(surface?.display_name??brand?.app_name??tenantName);

  const theme=brandingMode==="landlord"
    ?object(landlordBrand.theme)
    :mergeObjects(object(landlordBrand.theme),tenantTheme,surfaceTheme);

  const logoUrl=brandingMode==="landlord"
    ?firstUrl(landlordBrand.logoUrl,landlordBrand.logo_url)
    :firstUrl(surface?.logo_url,brand?.logo_url,landlordBrand.logoUrl,landlordBrand.logo_url);
  const logoLightUrl=brandingMode==="landlord"
    ?firstUrl(landlordBrand.logoLightUrl,landlordBrand.logo_light_url,logoUrl)
    :firstUrl(surface?.logo_light_url,brand?.logo_light_url,logoUrl);
  const logoDarkUrl=brandingMode==="landlord"
    ?firstUrl(landlordBrand.logoDarkUrl,landlordBrand.logo_dark_url,logoUrl)
    :firstUrl(surface?.logo_dark_url,brand?.logo_dark_url,logoUrl);
  const faviconUrl=brandingMode==="landlord"
    ?firstUrl(landlordBrand.faviconUrl,landlordBrand.favicon_url)
    :firstUrl(surface?.favicon_url,brand?.favicon_url,brand?.icon_url,landlordBrand.faviconUrl);
  const ogImageUrl=brandingMode==="landlord"
    ?firstUrl(landlordBrand.ogImageUrl,landlordBrand.og_image_url)
    :firstUrl(brand?.og_image_url,landlordBrand.ogImageUrl);

  const verifiedDomains=(domains??[]).filter((row:any)=>
    !row.location_id||!input.locationId||row.location_id===input.locationId
  );
  const desiredPurposes=domainPurposeForSurface(input.surface);
  const surfaceDomain=surface?.domain_id
    ?verifiedDomains.find((row:any)=>row.id===surface.domain_id)??null
    :null;
  const resolvedDomain=surfaceDomain
    ??verifiedDomains.find((row:any)=>desiredPurposes.includes(row.purpose)&&row.is_primary)
    ??verifiedDomains.find((row:any)=>desiredPurposes.includes(row.purpose))
    ??null;

  const activeIdentities=(identities??[]).filter((row:any)=>
    !row.location_id||!input.locationId||row.location_id===input.locationId
  );

  return{
    tenantId:input.tenantId,
    tenantProductId:tp.id,
    productKey:tp.product_key,
    familyProductKey:landlord.product_key,
    regionKey:tp.region_key,
    brandKey,
    brandingMode,
    whiteLabelAllowed,
    displayName,
    landlordName,
    poweredBy:brandingMode==="co_branded"
      ?String(brand?.powered_by_label??("Powered by "+landlordName))
      :null,
    logoUrl,
    logoLightUrl,
    logoDarkUrl,
    faviconUrl,
    ogImageUrl,
    splashUrl:brandingMode==="landlord"?null:firstUrl(brand?.splash_url),
    appIconUrl:brandingMode==="landlord"?null:firstUrl(surface?.app_icon_url,brand?.icon_url),
    theme,
    terminology:brandingMode==="landlord"?{}:mergeObjects(tenantTerminology,surfaceTerminology),
    socialLinks:brandingMode==="landlord"?{}:socialLinks,
    legalDetails:brandingMode==="landlord"?{}:legalDetails,
    seo,
    brandVoice:brandingMode==="landlord"?{}:brandVoice,
    contactDetails:brandingMode==="landlord"?{}:contactDetails,
    supportEmail:brandingMode==="landlord"?null:(brand?.support_email??null),
    supportPhone:brandingMode==="landlord"?null:(brand?.support_phone??null),
    websiteUrl:brandingMode==="landlord"?null:(brand?.website_url??null),
    locale:brand?.locale??null,
    surface:surface?{
      key:surface.surface,
      navigation:surface.navigation??[],
      footer:surface.footer??{},
      metadata:surface.metadata??{}
    }:null,
    domain:resolvedDomain?{
      id:resolvedDomain.id,
      hostname:resolvedDomain.hostname,
      purpose:resolvedDomain.purpose,
      url:"https://"+resolvedDomain.hostname
    }:null,
    communicationIdentities:activeIdentities.map((row:any)=>({
      id:row.id,channel:row.channel,purpose:row.purpose,value:row.identity_value,
      displayName:row.display_name,replyTo:row.reply_to,isPrimary:row.is_primary,
      metadata:row.metadata??{}
    }))
  };
}
