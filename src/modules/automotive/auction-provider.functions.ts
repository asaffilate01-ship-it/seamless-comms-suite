import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireAdminRole,requireService,requireTenantMembership,requireWriteRole} from "@/modules/platform/access";
import {
  auctionProviderReadiness,
  searchAuctionProvider,
  type AuctionProviderKey,
  type NormalizedAuctionLot,
} from "@/modules/automotive/auction-providers";

const uuid=z.string().uuid();
const scope=z.object({tenantId:uuid,productKey:z.string().min(2).max(80)});
const readProvider=z.enum(["auto","vehicle.auction.thecarapi","vehicle.auction.carstack"]);
const searchInput=scope.extend({
  providerKey:readProvider.default("auto"),
  query:z.string().max(160).nullish(),
  make:z.string().max(120).nullish(),
  model:z.string().max(120).nullish(),
  yearMin:z.number().int().min(1900).max(2200).nullish(),
  yearMax:z.number().int().min(1900).max(2200).nullish(),
  odometerMaxKm:z.number().int().min(0).max(2_000_000).nullish(),
  grade:z.string().max(40).nullish(),
  steering:z.enum(["rhd","lhd"]).nullish(),
  page:z.number().int().min(1).max(10000).default(1),
  pageSize:z.number().int().min(1).max(50).default(24),
});

function envMap():Record<string,string|undefined>{return process.env as Record<string,string|undefined>;}
function resolveReadProvider(requested:"auto"|"vehicle.auction.thecarapi"|"vehicle.auction.carstack"){
  const env=envMap();
  if(requested==="vehicle.auction.thecarapi"){
    if(!env.THECARAPI_API_KEY) throw new Error("TheCarAPI is not configured on the server");
    return {providerKey:requested as const,secret:env.THECARAPI_API_KEY};
  }
  if(requested==="vehicle.auction.carstack"){
    if(!env.CARSTACK_API_TOKEN) throw new Error("CarStack is not configured on the server");
    return {providerKey:requested as const,secret:env.CARSTACK_API_TOKEN};
  }
  if(env.THECARAPI_API_KEY) return {providerKey:"vehicle.auction.thecarapi" as const,secret:env.THECARAPI_API_KEY};
  if(env.CARSTACK_API_TOKEN) return {providerKey:"vehicle.auction.carstack" as const,secret:env.CARSTACK_API_TOKEN};
  throw new Error("No Japanese auction read provider is configured");
}

export const getJapaneseAuctionProviderReadiness=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
  await requireTenantMembership(context,data.tenantId);
  return auctionProviderReadiness(envMap()).map(p=>({
    key:p.key,name:p.name,stage:p.stage,capabilities:p.capabilities,configured:p.configured,notes:p.notes,
  }));
});

export const searchJapaneseAuctionInventory=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof searchInput>)=>searchInput.parse(i)).handler(async({context,data})=>{
  const access=await requireService(context,data.tenantId,"omniqora.automotive");requireWriteRole(access.role);
  const provider=resolveReadProvider(data.providerKey);
  const db=context.supabase as any;
  const {data:run,error:runError}=await db.from("automotive_provider_sync_runs").insert({
    tenant_id:data.tenantId,product_key:data.productKey,provider_key:provider.providerKey,operation:"search",status:"started",
    query:{query:data.query,make:data.make,model:data.model,yearMin:data.yearMin,yearMax:data.yearMax,odometerMaxKm:data.odometerMaxKm,grade:data.grade,steering:data.steering,page:data.page,pageSize:data.pageSize}
  }).select("*").single();
  if(runError) throw new Error(runError.message);
  try{
    const result=await searchAuctionProvider({providerKey:provider.providerKey,secret:provider.secret,filters:data});
    await db.from("automotive_provider_sync_runs").update({
      status:"succeeded",request_id:result.requestId,items_seen:result.lots.length,completed_at:new Date().toISOString()
    }).eq("id",run.id);
    return result;
  }catch(error){
    await db.from("automotive_provider_sync_runs").update({
      status:"failed",error_message:error instanceof Error?error.message:String(error),completed_at:new Date().toISOString()
    }).eq("id",run.id);
    throw error;
  }
});

const normalizedLot=z.object({
  providerKey:z.enum(["vehicle.auction.thecarapi","vehicle.auction.carstack"]),
  externalLotId:z.string().min(1).max(240),
  sourceSite:z.string().min(1).max(120),
  sourceVehicleId:z.string().max(240).nullish(),
  auctionHouse:z.string().max(240).nullish(),
  auctionAt:z.string().datetime().nullish(),
  status:z.string().min(1).max(80),
  make:z.string().min(1).max(120),
  model:z.string().min(1).max(160),
  year:z.number().int().min(1900).max(2200).nullish(),
  chassisNumber:z.string().max(120).nullish(),
  modelCode:z.string().max(120).nullish(),
  grade:z.string().max(60).nullish(),
  odometerKm:z.number().int().min(0).nullish(),
  startingPriceMinor:z.number().int().nullish(),
  currentPriceMinor:z.number().int().nullish(),
  finalPriceMinor:z.number().int().nullish(),
  currency:z.string().regex(/^[A-Z]{3}$/),
  priceSemantics:z.enum(["opening_bid","asking_price","provider_current","reported_result","unknown"]),
  images:z.array(z.string().url()).max(200),
  auctionSheet:z.record(z.string(),z.unknown()),
  provenance:z.record(z.string(),z.unknown()),
  observedAt:z.string().datetime(),
});

export const importAuctionLotForIntelligence=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:unknown)=>scope.extend({lot:normalizedLot}).parse(i)).handler(async({context,data})=>{
  const access=await requireService(context,data.tenantId,"omniqora.automotive");requireWriteRole(access.role);
  const lot=data.lot as NormalizedAuctionLot, db=context.supabase as any;
  let vehicle:any=null;
  if(lot.chassisNumber){
    const found=await db.from("automotive_vehicles").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).eq("chassis_number",lot.chassisNumber).limit(1).maybeSingle();
    if(found.error) throw new Error(found.error.message);
    vehicle=found.data;
    if(!vehicle){
      const created=await db.from("automotive_vehicles").insert({
        tenant_id:data.tenantId,product_key:data.productKey,origin:"japan",chassis_number:lot.chassisNumber,model_code:lot.modelCode,
        make:lot.make,model:lot.model,specification:{year:lot.year,grade:lot.grade,odometerKm:lot.odometerKm},
        provenance:{sourceProvider:lot.providerKey,sourceSite:lot.sourceSite,firstExternalLotId:lot.externalLotId},status:"active"
      }).select("*").single();
      if(created.error) throw new Error(created.error.message);
      vehicle=created.data;
    }
  }
  const saved=await db.from("automotive_auction_lots").upsert({
    tenant_id:data.tenantId,product_key:data.productKey,vehicle_id:vehicle?.id??null,provider_key:lot.providerKey,
    external_lot_id:lot.externalLotId,auction_house:lot.auctionHouse,auction_at:lot.auctionAt,status:lot.status==="ended"?"ended":"open",
    grade:lot.grade,odometer_km:lot.odometerKm,starting_price_minor:lot.startingPriceMinor,current_price_minor:lot.currentPriceMinor,
    currency:lot.currency,auction_sheet:{...lot.auctionSheet,priceSemantics:lot.priceSemantics,provenance:lot.provenance,make:lot.make,model:lot.model,year:lot.year,chassisNumber:lot.chassisNumber,modelCode:lot.modelCode,finalPriceMinor:lot.finalPriceMinor},
    images:lot.images,updated_at:new Date().toISOString()
  },{onConflict:"tenant_id,provider_key,external_lot_id"}).select("*").single();
  if(saved.error) throw new Error(saved.error.message);
  const observation=await db.from("automotive_auction_observations").upsert({
    tenant_id:data.tenantId,product_key:data.productKey,auction_lot_id:saved.data.id,vehicle_id:vehicle?.id??null,provider_key:lot.providerKey,
    external_lot_id:lot.externalLotId,source_site:lot.sourceSite,source_vehicle_id:lot.sourceVehicleId,chassis_number:lot.chassisNumber,
    model_code:lot.modelCode,make:lot.make,model:lot.model,model_year:lot.year,auction_house:lot.auctionHouse,auction_at:lot.auctionAt,status:lot.status,
    grade:lot.grade,odometer_km:lot.odometerKm,starting_price_minor:lot.startingPriceMinor,current_price_minor:lot.currentPriceMinor,
    final_price_minor:lot.finalPriceMinor,currency:lot.currency,price_semantics:lot.priceSemantics,source_ref:lot.providerKey+":"+lot.externalLotId,observed_at:lot.observedAt
  },{onConflict:"tenant_id,provider_key,external_lot_id,observed_at"}).select("*").single();
  if(observation.error) throw new Error(observation.error.message);
  let job:any=null;
  if(vehicle?.id){
    const queued=await db.from("intelligence_jobs").insert({
      tenant_id:data.tenantId,product_key:data.productKey,job_type:"automotive.auction_assessment",subject_type:"vehicle",subject_id:vehicle.id,
      input:{vehicleId:vehicle.id,auctionLotId:saved.data.id,providerKey:lot.providerKey,externalLotId:lot.externalLotId,
        goals:["auction_sheet_interpretation","provenance","relisting_detection","mileage_consistency","valuation_factors","max_bid_review"]},
      requirements:{service:"omniqora.automotive",visionAllowed:true,reviewRequired:true,noGeolocation:true,failClosedOnMissingProviderEvidence:true}
    }).select("*").single();
    if(queued.error) throw new Error(queued.error.message);
    job=queued.data;
  }
  return {auctionLot:saved.data,observation:observation.data,vehicle,intelligenceJob:job};
});

export const getAuctionVehicleHistory=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:unknown)=>scope.extend({chassisNumber:z.string().min(4).max(120),days:z.number().int().min(1).max(3650).default(90)}).parse(i))
.handler(async({context,data})=>{
  await requireTenantMembership(context,data.tenantId);
  const since=new Date(Date.now()-data.days*86400000).toISOString();
  const {data:rows,error}=await(context.supabase as any).from("automotive_auction_observations").select("*")
    .eq("tenant_id",data.tenantId).eq("product_key",data.productKey).eq("chassis_number",data.chassisNumber)
    .gte("observed_at",since).order("observed_at",{ascending:true}).limit(500);
  if(error) throw new Error(error.message);
  const mileage=(rows??[]).map((r:any)=>r.odometer_km).filter((v:any)=>typeof v==="number");
  let mileageRegression=false;
  for(let i=1;i<mileage.length;i++) if(mileage[i]<mileage[i-1]) mileageRegression=true;
  return {rows:rows??[],flags:{mileageRegression,relisted:(rows?.length??0)>1}};
});

export const prepareAuctionBidInstruction=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:unknown)=>scope.extend({
  auctionLotId:uuid,bidModelId:uuid,maxBidMinor:z.number().int().min(0),idempotencyKey:z.string().min(12).max(180)
}).parse(i)).handler(async({context,data})=>{
  const access=await requireService(context,data.tenantId,"omniqora.automotive");requireWriteRole(access.role);
  const db=context.supabase as any;
  const model=await db.from("automotive_bid_models").select("*").eq("tenant_id",data.tenantId).eq("id",data.bidModelId).single();
  if(model.error) throw new Error(model.error.message);
  if(model.data.auction_lot_id!==data.auctionLotId) throw new Error("Bid model does not belong to this auction lot");
  if(data.maxBidMinor>Number(model.data.max_bid_minor)) throw new Error("Requested bid exceeds the reviewed maximum bid model");
  const created=await db.from("automotive_bid_instructions").insert({
    tenant_id:data.tenantId,product_key:data.productKey,auction_lot_id:data.auctionLotId,bid_model_id:data.bidModelId,
    max_bid_minor:data.maxBidMinor,currency:model.data.currency,status:"draft",idempotency_key:data.idempotencyKey,created_by:context.userId
  }).select("*").single();
  if(created.error) throw new Error(created.error.message);
  return created.data;
});

export const authoriseAuctionBidInstruction=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:unknown)=>scope.extend({instructionId:uuid}).parse(i)).handler(async({context,data})=>{
  const access=await requireService(context,data.tenantId,"omniqora.automotive");requireAdminRole(access.role);
  const db=context.supabase as any;
  const current=await db.from("automotive_bid_instructions").select("*").eq("tenant_id",data.tenantId).eq("id",data.instructionId).single();
  if(current.error) throw new Error(current.error.message);
  if(current.data.status!=="draft") throw new Error("Only draft bid instructions can be authorised");
  const updated=await db.from("automotive_bid_instructions").update({
    status:"authorised",authorised_by:context.userId,authorised_at:new Date().toISOString(),updated_at:new Date().toISOString()
  }).eq("tenant_id",data.tenantId).eq("id",data.instructionId).select("*").single();
  if(updated.error) throw new Error(updated.error.message);
  return {...updated.data,execution:"not_submitted",message:"Authorised instruction is stored; live execution remains disabled until an approved Japan execution provider is certified."};
});
