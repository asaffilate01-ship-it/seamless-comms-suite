import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireService,requireWriteRole} from "@/modules/platform/access";
import {
  READ_ONLY_JAPAN_AUCTION_PROVIDERS,
  getJapanAuctionLot,
  searchJapanAuctionProvider,
  type NormalizedAuctionLot,
  type ReadOnlyJapanAuctionProvider,
} from "./auction-providers.server";

const uuid=z.string().uuid();
const provider=z.enum(READ_ONLY_JAPAN_AUCTION_PROVIDERS);
const filters=z.object({
  search:z.string().max(160).optional(),
  make:z.string().max(80).optional(),
  model:z.string().max(120).optional(),
  yearMin:z.number().int().min(1900).max(2200).optional(),
  yearMax:z.number().int().min(1900).max(2200).optional(),
  grade:z.string().max(20).optional(),
  page:z.number().int().min(1).max(10000).default(1),
  limit:z.number().int().min(1).max(50).default(24),
}).refine(v=>!v.yearMin||!v.yearMax||v.yearMin<=v.yearMax,{message:"yearMin must not exceed yearMax"});

const previewInput=z.object({tenantId:uuid,productKey:z.string().min(2).max(80),providerKey:provider,filters:filters.default({page:1,limit:24})});
export const previewJapanAuctionProvider=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof previewInput>)=>previewInput.parse(i)).handler(async({context,data})=>{
  await requireService(context,data.tenantId,"omniqora.automotive");
  return searchJapanAuctionProvider(data.providerKey,data.filters);
});

async function resolveCanonicalVehicle(db:any,input:{tenantId:string;productKey:string;lot:NormalizedAuctionLot}){
  const {tenantId,productKey,lot}=input;
  if(!lot.chassisNumber||!lot.make||!lot.model)return null;

  const existing=await db.from("automotive_vehicles")
    .select("id,provenance,specification")
    .eq("tenant_id",tenantId)
    .eq("product_key",productKey)
    .eq("chassis_number",lot.chassisNumber)
    .order("created_at",{ascending:true})
    .limit(1)
    .maybeSingle();
  if(existing.error)throw new Error(existing.error.message);
  if(existing.data?.id)return existing.data.id as string;

  const provenance={
    source:"japan_auction_sync",
    providerKey:lot.providerKey,
    externalLotId:lot.externalLotId,
    firstSeenAt:new Date().toISOString(),
  };
  const specification={year:lot.year,grade:lot.grade,odometerKm:lot.odometerKm,modelCode:lot.modelCode};
  const inserted=await db.from("automotive_vehicles").insert({
    tenant_id:tenantId,
    product_key:productKey,
    origin:"japan",
    chassis_number:lot.chassisNumber,
    model_code:lot.modelCode,
    make:lot.make,
    model:lot.model,
    specification,
    provenance,
    status:"active",
  }).select("id").single();
  if(inserted.error)throw new Error(inserted.error.message);
  return inserted.data.id as string;
}

async function persistLot(db:any,input:{tenantId:string;productKey:string;lot:NormalizedAuctionLot}){
  const {tenantId,productKey,lot}=input;
  const vehicleId=await resolveCanonicalVehicle(db,input);
  const metadata={
    ...lot.metadata,
    make:lot.make,
    model:lot.model,
    year:lot.year,
    chassis_number:lot.chassisNumber,
    model_code:lot.modelCode,
    source_url:lot.sourceUrl,
    synced_at:new Date().toISOString(),
  };
  const result=await db.from("automotive_auction_lots").upsert({
    tenant_id:tenantId,
    product_key:productKey,
    vehicle_id:vehicleId,
    provider_key:lot.providerKey,
    external_lot_id:lot.externalLotId,
    auction_house:lot.auctionHouse,
    auction_at:lot.auctionAt,
    status:lot.status||"open",
    grade:lot.grade,
    odometer_km:lot.odometerKm,
    starting_price_minor:lot.startingPriceMinor,
    current_price_minor:lot.currentPriceMinor,
    currency:lot.currency,
    auction_sheet:lot.auctionSheet,
    images:lot.images,
    metadata,
    updated_at:new Date().toISOString(),
  },{onConflict:"tenant_id,provider_key,external_lot_id"}).select("*").single();
  if(result.error)throw new Error(result.error.message);
  return result.data;
}

const syncInput=previewInput;
export const syncJapanAuctionProviderLots=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof syncInput>)=>syncInput.parse(i)).handler(async({context,data})=>{
  const access=await requireService(context,data.tenantId,"omniqora.automotive");
  requireWriteRole(access.role);
  const db=context.supabase as any;
  const startedAt=new Date().toISOString();
  const started=await db.from("automotive_auction_provider_syncs").insert({
    tenant_id:data.tenantId,
    product_key:data.productKey,
    provider_key:data.providerKey,
    status:"running",
    filters:data.filters,
    started_at:startedAt,
    initiated_by:context.userId,
  }).select("id").single();
  if(started.error)throw new Error(started.error.message);
  const syncId=started.data.id as string;
  try{
    const response=await searchJapanAuctionProvider(data.providerKey,data.filters);
    const rows=[];
    for(const lot of response.lots)rows.push(await persistLot(db,{tenantId:data.tenantId,productKey:data.productKey,lot}));
    const finishedAt=new Date().toISOString();
    const done=await db.from("automotive_auction_provider_syncs").update({
      status:"succeeded",
      fetched_count:response.lots.length,
      upserted_count:rows.length,
      provider_total:response.total,
      provider_request_id:response.requestId,
      finished_at:finishedAt,
    }).eq("id",syncId);
    if(done.error)throw new Error(done.error.message);
    return {syncId,providerKey:data.providerKey,fetched:response.lots.length,upserted:rows.length,total:response.total,page:response.page};
  }catch(error){
    await db.from("automotive_auction_provider_syncs").update({
      status:"failed",
      last_error:error instanceof Error?error.message:String(error),
      finished_at:new Date().toISOString(),
    }).eq("id",syncId);
    throw error;
  }
});

const detailInput=z.object({
  tenantId:uuid,
  productKey:z.string().min(2).max(80),
  providerKey:provider,
  externalLotId:z.string().min(1).max(200),
});
export const hydrateJapanAuctionLot=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof detailInput>)=>detailInput.parse(i)).handler(async({context,data})=>{
  const access=await requireService(context,data.tenantId,"omniqora.automotive");
  requireWriteRole(access.role);
  const lot=await getJapanAuctionLot(data.providerKey,data.externalLotId);
  return persistLot(context.supabase as any,{tenantId:data.tenantId,productKey:data.productKey,lot});
});

const historyInput=z.object({tenantId:uuid,productKey:z.string().min(2).max(80),vehicleId:uuid,days:z.number().int().min(1).max(730).default(90)});
export const getVehicleAuctionHistory=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof historyInput>)=>historyInput.parse(i)).handler(async({context,data})=>{
  await requireService(context,data.tenantId,"omniqora.automotive");
  const since=new Date(Date.now()-data.days*86400000).toISOString();
  const db=context.supabase as any;
  const result=await db.from("automotive_auction_lots")
    .select("*")
    .eq("tenant_id",data.tenantId)
    .eq("product_key",data.productKey)
    .eq("vehicle_id",data.vehicleId)
    .gte("created_at",since)
    .order("auction_at",{ascending:true,nullsFirst:false});
  if(result.error)throw new Error(result.error.message);
  const lots=result.data??[];
  const flags:{type:string;summary:string;lotIds:string[]}[]=[];
  for(let i=1;i<lots.length;i++){
    const previous=lots[i-1],current=lots[i];
    const before=Number(previous.odometer_km),after=Number(current.odometer_km);
    if(Number.isFinite(before)&&Number.isFinite(after)&&after+100<before){
      flags.push({
        type:"mileage_regression",
        summary:`Mileage fell from ${before.toLocaleString()} km to ${after.toLocaleString()} km across auction appearances.`,
        lotIds:[previous.id,current.id],
      });
    }
  }
  return {vehicleId:data.vehicleId,days:data.days,lots,flags};
});

export type {ReadOnlyJapanAuctionProvider};
