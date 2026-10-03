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
    db.from("network_management_agreements").select("*,territory:network_territories(name,territory_code)").eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(500),
    db.from("network_territory_designs").select("*,territory:network_territories(name,territory_code,status,programme_id)").eq("tenant_id",data.tenantId).order("updated_at",{ascending:false}).limit(500),
    db.from("network_territory_versions").select("*,territory:network_territories(name,territory_code)").eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(500),
    db.from("geo_demographic_cells").select("geography_code",{count:"exact",head:true})
  ]);
  for(const r of rs)if(r.error)throw new Error(r.error.message);
  return{programmes:rs[0].data??[],territories:rs[1].data??[],applications:rs[2].data??[],channels:rs[3].data??[],campaigns:rs[4].data??[],content:rs[5].data??[],
    managementAgreements:rs[6].data??[],territoryDesigns:rs[7].data??[],territoryVersions:rs[8].data??[],demographicCells:rs[9].count??0};
});

export const seedMealDeckNetwork=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof scope>)=>scope.parse(i))
.handler(async({context,data})=>{
  const{db}=await access(context,data.tenantId,true);
  const r=await db.rpc("network_seed_mealdeck_programme",{_tenant:data.tenantId});
  if(r.error)throw new Error(r.error.message);
  const d=await db.rpc("network_seed_default_territory_designs",{_tenant:data.tenantId});if(d.error)throw new Error(d.error.message);
  return{programmeId:r.data as string};
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


const territoryDesign=scope.extend({
 territoryId:uuid,centrePostcode:z.string().max(160).nullish(),centreLat:z.number().min(-90).max(90).nullish(),centreLng:z.number().min(-180).max(180).nullish(),
 coreDriveMinutes:z.number().int().min(5).max(60).default(25),sharedDriveMinutes:z.number().int().min(5).max(75).default(30),
 overflowDriveMinutes:z.number().int().min(5).max(90).default(35),coreMinMinutes:z.number().int().min(5).max(60).default(18),
 coreMaxMinutes:z.number().int().min(5).max(60).default(28),targetPopulationMin:z.number().int().nonnegative().nullish(),
 targetPopulationMax:z.number().int().nonnegative().nullish(),maxSampleRadiusKm:z.number().min(2).max(60).default(15),
 bearings:z.number().int().min(12).max(72).default(30),maxNeighbours:z.number().int().min(0).max(12).default(4),
 rules:z.record(z.string(),z.unknown()).default({})
});
export const saveTerritoryDesign=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof territoryDesign>)=>territoryDesign.parse(i))
.handler(async({context,data})=>{
 const{db}=await access(context,data.tenantId,true);
 const territory=await db.from("network_territories").select("id,name").eq("tenant_id",data.tenantId).eq("id",data.territoryId).maybeSingle();
 if(territory.error||!territory.data)throw new Error("Territory not found");
 let centreLat=data.centreLat??null,centreLng=data.centreLng??null;
 if(centreLat===null||centreLng===null){
  const query=(data.centrePostcode||territory.data.name)+", United Kingdom";
  const{geocodeAddress}=await import("./territory-engine.server");
  const point=await geocodeAddress(query);centreLat=point.lat;centreLng=point.lng;
 }
 const{data:row,error}=await db.from("network_territory_designs").upsert({
  territory_id:data.territoryId,tenant_id:data.tenantId,centre_postcode:data.centrePostcode??null,centre_lat:centreLat,centre_lng:centreLng,
  core_drive_minutes:data.coreDriveMinutes,shared_drive_minutes:data.sharedDriveMinutes,overflow_drive_minutes:data.overflowDriveMinutes,
  core_min_minutes:data.coreMinMinutes,core_max_minutes:data.coreMaxMinutes,target_population_min:data.targetPopulationMin??null,
  target_population_max:data.targetPopulationMax??null,max_sample_radius_km:data.maxSampleRadiusKm,bearings:data.bearings,max_neighbours:data.maxNeighbours,
  routing_provider:"google-routes",routing_preference:"TRAFFIC_UNAWARE",demographic_geography:"LSOA21",rules:data.rules,status:"ready",updated_at:new Date().toISOString()
 },{onConflict:"territory_id"}).select("*").single();
 if(error)throw new Error(error.message);return row;
});

export const calculateNetworkTerritory=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;territoryId:string})=>scope.extend({territoryId:uuid}).parse(i))
.handler(async({context,data})=>{
 const{db}=await access(context,data.tenantId,true);
 const{calculateTerritoryVersion}=await import("./territory-engine.server");
 return calculateTerritoryVersion(db,data.tenantId,data.territoryId);
});

export const approveNetworkTerritoryVersion=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;versionId:string})=>scope.extend({versionId:uuid}).parse(i))
.handler(async({context,data})=>{
 const{db}=await access(context,data.tenantId,true);
 const version=await db.from("network_territory_versions").select("*").eq("tenant_id",data.tenantId).eq("id",data.versionId).single();
 if(version.error)throw new Error(version.error.message);
 await db.from("network_territory_versions").update({status:"superseded"}).eq("tenant_id",data.tenantId).eq("territory_id",version.data.territory_id).eq("status","approved").neq("id",data.versionId);
 const approved=await db.from("network_territory_versions").update({status:"approved",approved_by:context.userId,approved_at:new Date().toISOString()})
  .eq("tenant_id",data.tenantId).eq("id",data.versionId).select("*").single();
 if(approved.error)throw new Error(approved.error.message);
 const metrics={territoryVersionId:data.versionId,algorithm:version.data.algorithm_version,protectedPopulation:version.data.protected_population,
  protectedHouseholds:version.data.protected_households,sharedPopulation:version.data.shared_population,approvedAt:new Date().toISOString()};
 const t=await db.from("network_territories").update({
  protected_geojson:version.data.protected_geojson,shared_geojson:version.data.shared_geojson,overflow_geojson:version.data.overflow_geojson,
  resident_population:version.data.protected_population,households:version.data.protected_households,daytime_population:version.data.protected_daytime_population,
  students:version.data.protected_students,metrics,updated_at:new Date().toISOString()
 }).eq("tenant_id",data.tenantId).eq("id",version.data.territory_id);
 if(t.error)throw new Error(t.error.message);
 await db.from("network_territory_designs").update({status:"approved",updated_at:new Date().toISOString()}).eq("territory_id",version.data.territory_id);
 return approved.data;
});

const demographicCell=z.object({
 geographyCode:z.string().min(3).max(40),geographyType:z.string().min(2).max(30).default("LSOA21"),name:z.string().max(200).nullish(),
 centroidLat:z.number().min(-90).max(90),centroidLng:z.number().min(-180).max(180),population:z.number().int().nonnegative().default(0),
 households:z.number().int().nonnegative().default(0),daytimePopulation:z.number().int().nonnegative().nullish(),students:z.number().int().nonnegative().nullish(),
 boundaryGeojson:z.record(z.string(),z.unknown()).nullish(),populationSource:z.string().max(500).nullish(),householdSource:z.string().max(500).nullish(),
 sourceYear:z.number().int().min(2000).max(2100).nullish(),metadata:z.record(z.string(),z.unknown()).default({})
});
export const importDemographicCells=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;cells:z.input<typeof demographicCell>[]})=>scope.extend({cells:z.array(demographicCell).min(1).max(1000)}).parse(i))
.handler(async({context,data})=>{
 const{db,isPlatformAdmin}=await access(context,data.tenantId,true);if(!isPlatformAdmin)throw new Error("Platform administrator required for demographic imports");
 const rows=data.cells.map(c=>({geography_code:c.geographyCode,geography_type:c.geographyType,name:c.name??null,centroid_lat:c.centroidLat,centroid_lng:c.centroidLng,
  population:c.population,households:c.households,daytime_population:c.daytimePopulation??null,students:c.students??null,boundary_geojson:c.boundaryGeojson??null,
  population_source:c.populationSource??null,household_source:c.householdSource??null,source_year:c.sourceYear??null,metadata:c.metadata,updated_at:new Date().toISOString()}));
 const r=await db.from("geo_demographic_cells").upsert(rows,{onConflict:"geography_code"});if(r.error)throw new Error(r.error.message);return{imported:rows.length};
});

const managementAgreement=scope.extend({
 programmeId:uuid,territoryId:uuid,managementProvider:z.string().min(2).max(160).default("mealdeck-operations"),
 profitShareBps:z.number().int().min(0).max(10000).default(2000),minimumMonthlyFeeMinor:z.number().int().nonnegative().default(0),
 effectiveFrom:z.string().nullish(),effectiveUntil:z.string().nullish(),terms:z.record(z.string(),z.unknown()).default({})
});
export const saveManagementAgreement=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof managementAgreement>)=>managementAgreement.parse(i))
.handler(async({context,data})=>{
 const{db}=await access(context,data.tenantId,true);
 const{data:row,error}=await db.from("network_management_agreements").insert({
  tenant_id:data.tenantId,programme_id:data.programmeId,territory_id:data.territoryId,management_provider:data.managementProvider,status:"proposed",
  profit_share_bps:data.profitShareBps,minimum_monthly_fee_minor:data.minimumMonthlyFeeMinor,profit_basis:"managed_operating_profit",
  effective_from:data.effectiveFrom??null,effective_until:data.effectiveUntil??null,terms:data.terms
 }).select("*").single();
 if(error)throw new Error(error.message);return row;
});

const managementPeriod=scope.extend({
 agreementId:uuid,periodStart:z.string(),periodEnd:z.string(),netSalesMinor:z.number().int().nonnegative(),
 foodPackagingMinor:z.number().int().nonnegative().default(0),payrollMinor:z.number().int().nonnegative().default(0),premisesMinor:z.number().int().nonnegative().default(0),
 utilitiesMinor:z.number().int().nonnegative().default(0),deliveryPaymentMinor:z.number().int().nonnegative().default(0),localMarketingMinor:z.number().int().nonnegative().default(0),
 otherSiteOpexMinor:z.number().int().nonnegative().default(0),royaltyMinor:z.number().int().nonnegative().default(0),marketingLevyMinor:z.number().int().nonnegative().default(0),
 technologyMinor:z.number().int().nonnegative().default(0)
});
export const calculateManagementPeriod=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof managementPeriod>)=>managementPeriod.parse(i))
.handler(async({context,data})=>{
 const{db}=await access(context,data.tenantId,true);
 const ag=await db.from("network_management_agreements").select("*").eq("tenant_id",data.tenantId).eq("id",data.agreementId).single();
 if(ag.error)throw new Error(ag.error.message);
 const opex=data.foodPackagingMinor+data.payrollMinor+data.premisesMinor+data.utilitiesMinor+data.deliveryPaymentMinor+data.localMarketingMinor+data.otherSiteOpexMinor+
  data.royaltyMinor+data.marketingLevyMinor+data.technologyMinor;
 const managedProfit=data.netSalesMinor-opex;
 const percentFee=managedProfit>0?Math.round(managedProfit*Number(ag.data.profit_share_bps)/10000):0;
 const managementFee=managedProfit>0?Math.max(Number(ag.data.minimum_monthly_fee_minor??0),percentFee):0;
 const investorDistributable=Math.max(0,managedProfit-managementFee);
 const values={tenant_id:data.tenantId,agreement_id:data.agreementId,period_start:data.periodStart,period_end:data.periodEnd,
  net_sales_minor:data.netSalesMinor,food_packaging_minor:data.foodPackagingMinor,payroll_minor:data.payrollMinor,premises_minor:data.premisesMinor,
  utilities_minor:data.utilitiesMinor,delivery_payment_minor:data.deliveryPaymentMinor,local_marketing_minor:data.localMarketingMinor,other_site_opex_minor:data.otherSiteOpexMinor,
  royalty_minor:data.royaltyMinor,marketing_levy_minor:data.marketingLevyMinor,technology_minor:data.technologyMinor,
  managed_operating_profit_minor:managedProfit,management_fee_minor:managementFee,investor_distributable_minor:investorDistributable,status:"review",
  calculation:{opexMinor:opex,profitShareBps:ag.data.profit_share_bps,basis:"managed_operating_profit",managementFeeIsSeparateFromOpex:true}};
 const{data:row,error}=await db.from("network_management_periods").upsert(values,{onConflict:"agreement_id,period_start,period_end"}).select("*").single();
 if(error)throw new Error(error.message);return row;
});
