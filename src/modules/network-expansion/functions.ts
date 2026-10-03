import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid=z.string().uuid();
const scope=z.object({tenantId:uuid});

async function access(context:any,tenantId:string,write=false){
  const db=context.supabase as any;
  const [member,platform,entitlement]=await Promise.all([
    db.from("tenant_members").select("role").eq("tenant_id",tenantId).eq("user_id",context.userId).maybeSingle(),
    db.rpc("is_platform_admin",{_user:context.userId}),
    db.rpc("has_tenant_entitlement",{_tenant:tenantId,_service:"omniqora.network-expansion"}),
  ]);
  if(member.error)throw new Error(member.error.message);
  if(platform.error)throw new Error(platform.error.message);
  if(entitlement.error)throw new Error(entitlement.error.message);
  if(!member.data&&!platform.data)throw new Error("Network expansion tenant access denied");
  if(!platform.data&&!entitlement.data)throw new Error("Omniqora Network Expansion entitlement required");
  const role=platform.data?"platform_admin":String(member.data?.role??"viewer");
  if(write&&!["platform_admin","owner","admin","agent"].includes(role))throw new Error("Network expansion write access denied");
  return{db,role,isPlatformAdmin:!!platform.data};
}

export const getNetworkExpansionWorkspace=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof scope>)=>scope.parse(i))
.handler(async({context,data})=>{
  const{db}=await access(context,data.tenantId);
  const rs=await Promise.all([
    db.from("network_programmes").select("*").eq("tenant_id",data.tenantId).order("created_at"),
    db.from("network_territories").select("*").eq("tenant_id",data.tenantId).order("region").order("name"),
    db.from("network_applications").select("*,territory:network_territories(name,territory_code,region,fee_minor)").eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(500),
    db.from("growth_channel_catalogue").select("*").eq("status","active").order("medium").order("name"),
    db.from("growth_acquisition_campaigns").select("*,territory:network_territories(name,territory_code)").eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(500),
    db.from("growth_content_items").select("*,territory:network_territories(name,territory_code)").eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(500),
  ]);
  for(const r of rs)if(r.error)throw new Error(r.error.message);
  return{programmes:rs[0].data??[],territories:rs[1].data??[],applications:rs[2].data??[],channels:rs[3].data??[],campaigns:rs[4].data??[],content:rs[5].data??[]};
});

export const seedMealDeckNetwork=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof scope>)=>scope.parse(i))
.handler(async({context,data})=>{
  const{db}=await access(context,data.tenantId,true);
  const r=await db.rpc("network_seed_mealdeck_programme",{_tenant:data.tenantId});
  if(r.error)throw new Error(r.error.message);return{programmeId:r.data as string};
});

const territoryUpdate=scope.extend({
 territoryId:uuid,status:z.enum(["available","coming_soon","held","reserved","taken","onboarding","operating","paused","retired"]).optional(),
 feeMinor:z.number().int().nonnegative().optional(),isSellable:z.boolean().optional(),publicNote:z.string().max(500).nullish().optional(),
 territoryScore:z.number().nonnegative().max(1000).nullish().optional(),metrics:z.record(z.string(),z.unknown()).optional()
});
export const updateNetworkTerritory=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof territoryUpdate>)=>territoryUpdate.parse(i))
.handler(async({context,data})=>{
  const{db}=await access(context,data.tenantId,true);
  const patch:any={updated_at:new Date().toISOString()};
  if(data.status!==undefined)patch.status=data.status;
  if(data.feeMinor!==undefined)patch.fee_minor=data.feeMinor;
  if(data.isSellable!==undefined)patch.is_sellable=data.isSellable;
  if(data.publicNote!==undefined)patch.public_note=data.publicNote??null;
  if(data.territoryScore!==undefined)patch.territory_score=data.territoryScore??null;
  if(data.metrics!==undefined)patch.metrics=data.metrics;
  const{data:row,error}=await db.from("network_territories").update(patch).eq("tenant_id",data.tenantId).eq("id",data.territoryId).select("*").single();
  if(error)throw new Error(error.message);return row;
});

const applicationUpdate=scope.extend({
 applicationId:uuid,stage:z.enum(["new","qualifying","qualified","discovery","due_diligence","agreement","fee_due","paid","onboarding","training","launch_ready","live","declined","withdrawn"]),
 score:z.number().int().min(0).max(1000).nullish().optional()
});
export const updateNetworkApplication=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof applicationUpdate>)=>applicationUpdate.parse(i))
.handler(async({context,data})=>{
  const{db}=await access(context,data.tenantId,true);
  const patch:any={stage:data.stage,updated_at:new Date().toISOString()};
  if(data.score!==undefined)patch.score=data.score;
  const{data:row,error}=await db.from("network_applications").update(patch).eq("tenant_id",data.tenantId).eq("id",data.applicationId).select("*").single();
  if(error)throw new Error(error.message);
  await db.from("network_application_events").insert({tenant_id:data.tenantId,application_id:data.applicationId,event_type:"stage_changed",detail:{stage:data.stage},actor_user_id:context.userId});
  if(row.crm_lead_id){
    const leadStatus=["qualified","discovery","due_diligence","agreement","fee_due","paid","onboarding","training","launch_ready","live"].includes(data.stage)?"qualified":
      ["declined","withdrawn"].includes(data.stage)?"closed":"working";
    await db.from("crm_leads").update({status:leadStatus,score:data.score??row.score,updated_at:new Date().toISOString()}).eq("tenant_id",data.tenantId).eq("id",row.crm_lead_id);
  }
  return row;
});

const acquisitionCampaign=scope.extend({
 programmeId:uuid.nullish(),territoryId:uuid.nullish(),productKey:z.string().max(80).nullish(),channelKey:z.string().min(1).max(100),
 name:z.string().min(1).max(200),objective:z.string().max(500).nullish(),budgetMinor:z.number().int().nonnegative().default(0)
});
export const createAcquisitionCampaign=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof acquisitionCampaign>)=>acquisitionCampaign.parse(i))
.handler(async({context,data})=>{
  const{db}=await access(context,data.tenantId,true);
  const{data:row,error}=await db.from("growth_acquisition_campaigns").insert({
    tenant_id:data.tenantId,programme_id:data.programmeId??null,territory_id:data.territoryId??null,product_key:data.productKey??null,
    channel_key:data.channelKey,name:data.name,objective:data.objective??null,budget_minor:data.budgetMinor,status:"planned"
  }).select("*").single();
  if(error)throw new Error(error.message);return row;
});

const contentItem=scope.extend({
 programmeId:uuid.nullish(),territoryId:uuid.nullish(),productKey:z.string().max(80).nullish(),channelKey:z.string().max(100).nullish(),
 contentType:z.enum(["landing_page","seo_page","blog","video","short_video","social_post","ad","email","whatsapp","sms","directory_listing","pr","event","outdoor","vehicle_wrap","leaflet","creative"]),
 title:z.string().min(1).max(240),targetUrl:z.string().url().max(1000).nullish(),brief:z.record(z.string(),z.unknown()).default({})
});
export const createGrowthContentItem=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof contentItem>)=>contentItem.parse(i))
.handler(async({context,data})=>{
  const{db}=await access(context,data.tenantId,true);
  const{data:row,error}=await db.from("growth_content_items").insert({
    tenant_id:data.tenantId,programme_id:data.programmeId??null,territory_id:data.territoryId??null,product_key:data.productKey??null,
    channel_key:data.channelKey??null,content_type:data.contentType,title:data.title,target_url:data.targetUrl??null,brief:data.brief,status:"idea"
  }).select("*").single();
  if(error)throw new Error(error.message);return row;
});
