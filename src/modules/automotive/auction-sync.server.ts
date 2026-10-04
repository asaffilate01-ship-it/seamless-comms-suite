import {searchJapanAuctionProvider,type AuctionProviderSearch,type NormalizedAuctionLot,type ReadOnlyJapanAuctionProvider} from "./auction-providers.server";

export async function resolveCanonicalAuctionVehicle(db:any,input:{tenantId:string;productKey:string;lot:NormalizedAuctionLot}){
  const {tenantId,productKey,lot}=input;
  if(!lot.chassisNumber||!lot.make||!lot.model)return null;

  const existing=await db.from("automotive_vehicles")
    .select("id")
    .eq("tenant_id",tenantId)
    .eq("product_key",productKey)
    .eq("chassis_number",lot.chassisNumber)
    .order("created_at",{ascending:true})
    .limit(1)
    .maybeSingle();
  if(existing.error)throw new Error(existing.error.message);
  if(existing.data?.id)return existing.data.id as string;

  const inserted=await db.from("automotive_vehicles").insert({
    tenant_id:tenantId,
    product_key:productKey,
    origin:"japan",
    chassis_number:lot.chassisNumber,
    model_code:lot.modelCode,
    make:lot.make,
    model:lot.model,
    specification:{year:lot.year,grade:lot.grade,odometerKm:lot.odometerKm,modelCode:lot.modelCode},
    provenance:{source:"japan_auction_sync",providerKey:lot.providerKey,externalLotId:lot.externalLotId,firstSeenAt:new Date().toISOString()},
    status:"active",
  }).select("id").single();
  if(inserted.error)throw new Error(inserted.error.message);
  return inserted.data.id as string;
}

export async function persistNormalizedAuctionLot(db:any,input:{tenantId:string;productKey:string;lot:NormalizedAuctionLot}){
  const {tenantId,productKey,lot}=input;
  const vehicleId=await resolveCanonicalAuctionVehicle(db,input);
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
    metadata:{
      ...lot.metadata,
      make:lot.make,
      model:lot.model,
      year:lot.year,
      chassis_number:lot.chassisNumber,
      model_code:lot.modelCode,
      source_url:lot.sourceUrl,
      synced_at:new Date().toISOString(),
    },
    updated_at:new Date().toISOString(),
  },{onConflict:"tenant_id,provider_key,external_lot_id"}).select("*").single();
  if(result.error)throw new Error(result.error.message);
  return result.data;
}

export async function syncAuctionProviderToDb(db:any,input:{
  tenantId:string;
  productKey:string;
  providerKey:ReadOnlyJapanAuctionProvider;
  filters:AuctionProviderSearch;
  initiatedBy?:string|null;
}){
  const started=await db.from("automotive_auction_provider_syncs").insert({
    tenant_id:input.tenantId,
    product_key:input.productKey,
    provider_key:input.providerKey,
    status:"running",
    filters:input.filters,
    initiated_by:input.initiatedBy??null,
  }).select("id").single();
  if(started.error)throw new Error(started.error.message);
  const syncId=started.data.id as string;
  try{
    const response=await searchJapanAuctionProvider(input.providerKey,input.filters);
    const rows=[];
    for(const lot of response.lots){
      rows.push(await persistNormalizedAuctionLot(db,{tenantId:input.tenantId,productKey:input.productKey,lot}));
    }
    const done=await db.from("automotive_auction_provider_syncs").update({
      status:"succeeded",
      fetched_count:response.lots.length,
      upserted_count:rows.length,
      provider_total:response.total,
      provider_request_id:response.requestId,
      finished_at:new Date().toISOString(),
    }).eq("id",syncId);
    if(done.error)throw new Error(done.error.message);
    return {syncId,response,rows};
  }catch(error){
    await db.from("automotive_auction_provider_syncs").update({
      status:"failed",
      last_error:error instanceof Error?error.message:String(error),
      finished_at:new Date().toISOString(),
    }).eq("id",syncId);
    throw error;
  }
}
