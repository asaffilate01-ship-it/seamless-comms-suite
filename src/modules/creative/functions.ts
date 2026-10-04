import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireAdminRole,requireService,requireTenantMembership,requireWriteRole} from "@/modules/platform/access";

const uuid=z.string().uuid(),product=z.string().min(2).max(80);
const scope=z.object({tenantId:uuid,productKey:product.nullish()});

export const getCreativeWorkspace=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const pf=(q:any)=>data.productKey?q.eq("product_key",data.productKey):q;
 const rs=await Promise.all([
  pf(db.from("creative_brand_kits").select("*").eq("tenant_id",data.tenantId)).order("updated_at",{ascending:false}).limit(100),
  pf(db.from("creative_briefs").select("*").eq("tenant_id",data.tenantId)).order("updated_at",{ascending:false}).limit(200),
  pf(db.from("creative_assets").select("*").eq("tenant_id",data.tenantId)).order("updated_at",{ascending:false}).limit(500),
  pf(db.from("creative_localisation_jobs").select("*").eq("tenant_id",data.tenantId)).order("created_at",{ascending:false}).limit(200)
 ]);for(const r of rs)if(r.error)throw new Error(r.error.message);
 return{brandKits:rs[0].data??[],briefs:rs[1].data??[],assets:rs[2].data??[],localisationJobs:rs[3].data??[]};
});

const kit=scope.extend({brandKey:z.string().min(1).max(120).default("default"),name:z.string().min(1).max(200),
 regionKey:z.string().max(32).nullish(),locale:z.string().max(24).nullish(),logos:z.array(z.string().url()).max(20).default([]),
 colours:z.array(z.string().max(40)).max(30).default([]),fonts:z.array(z.string().max(120)).max(30).default([]),
 tone:z.array(z.string().max(200)).max(30).default([]),bannedTerms:z.array(z.string().max(200)).max(100).default([]),
 requiredDisclaimers:z.array(z.string().max(1000)).max(50).default([]),assetRefs:z.array(z.string().max(1000)).max(200).default([])});
export const createCreativeBrandKit=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof kit>)=>kit.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.creative");requireWriteRole(a.role);
 const{data:row,error}=await(context.supabase as any).from("creative_brand_kits").insert({
  tenant_id:data.tenantId,product_key:data.productKey??null,brand_key:data.brandKey,name:data.name,region_key:data.regionKey??null,
  locale:data.locale??null,logos:data.logos,colours:data.colours,fonts:data.fonts,tone:data.tone,banned_terms:data.bannedTerms,
  required_disclaimers:data.requiredDisclaimers,asset_refs:data.assetRefs,status:"draft"
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const brief=scope.extend({brandKitId:uuid.nullish(),campaignId:uuid.nullish(),campaignRef:z.string().max(200).nullish(),
 objective:z.string().min(3).max(1000),audience:z.string().min(2).max(1000),
 channels:z.array(z.enum(["web","social","email","whatsapp","sms","print","video","audio","app"])).min(1),
 assetTypes:z.array(z.string().max(120)).min(1).max(50),message:z.string().min(1).max(5000),
 offer:z.string().max(2000).nullish(),callToAction:z.string().max(500).nullish(),dueAt:z.string().datetime().nullish()});
export const createCreativeBrief=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof brief>)=>brief.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.creative");requireWriteRole(a.role);
 const{data:row,error}=await(context.supabase as any).from("creative_briefs").insert({
  tenant_id:data.tenantId,product_key:data.productKey??null,brand_kit_id:data.brandKitId??null,campaign_id:data.campaignId??null,
  campaign_ref:data.campaignRef??null,objective:data.objective,audience:data.audience,channels:data.channels,asset_types:data.assetTypes,
  message:data.message,offer:data.offer??null,call_to_action:data.callToAction??null,due_at:data.dueAt??null,status:"ready",created_by:context.userId
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

const asset=scope.extend({briefId:uuid,assetType:z.enum(["copy","image","video","audio","document","web_asset"]),
 locale:z.string().min(2).max(24),channel:z.string().min(1).max(80),uri:z.string().url().max(2000),
 variantKey:z.string().max(120).nullish(),modelRunId:z.string().max(200).nullish(),
 sourceAssetRefs:z.array(z.string().max(1000)).max(100).default([]),evidenceRefs:z.array(z.string().max(1000)).max(100).default([])});
export const registerCreativeAsset=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof asset>)=>asset.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.creative");requireWriteRole(a.role);
 const{data:row,error}=await(context.supabase as any).from("creative_assets").insert({
  tenant_id:data.tenantId,product_key:data.productKey??null,brief_id:data.briefId,asset_type:data.assetType,locale:data.locale,
  channel:data.channel,uri:data.uri,variant_key:data.variantKey??null,model_run_id:data.modelRunId??null,
  source_asset_refs:data.sourceAssetRefs,evidence_refs:data.evidenceRefs,status:"review"
 }).select("*").single();if(error)throw new Error(error.message);return row;
});

export const reviewCreativeAsset=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;assetId:string;decision:"approved"|"rejected"})=>z.object({
 tenantId:uuid,assetId:uuid,decision:z.enum(["approved","rejected"])
}).parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.creative");requireAdminRole(a.role);
 const{data:row,error}=await(context.supabase as any).from("creative_assets").update({
  status:data.decision,reviewed_by:context.userId,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()
 }).eq("tenant_id",data.tenantId).eq("id",data.assetId).select("*").single();if(error)throw new Error(error.message);return row;
});
