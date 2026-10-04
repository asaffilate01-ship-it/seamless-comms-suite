import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireService,requireWriteRole} from "@/modules/platform/access";
import {
  READ_ONLY_JAPAN_AUCTION_PROVIDERS,
  getJapanAuctionLot,
  searchJapanAuctionProvider,
  type ReadOnlyJapanAuctionProvider,
} from "./auction-providers.server";
import {persistNormalizedAuctionLot,syncAuctionProviderToDb} from "./auction-sync.server";

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

export const syncJapanAuctionProviderLots=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof previewInput>)=>previewInput.parse(i)).handler(async({context,data})=>{
  const access=await requireService(context,data.tenantId,"omniqora.automotive");
  requireWriteRole(access.role);
  const result=await syncAuctionProviderToDb(context.supabase as any,{
    tenantId:data.tenantId,
    productKey:data.productKey,
    providerKey:data.providerKey,
    filters:data.filters,
    initiatedBy:context.userId,
  });
  return {
    syncId:result.syncId,
    providerKey:data.providerKey,
    fetched:result.response.lots.length,
    upserted:result.rows.length,
    total:result.response.total,
    page:result.response.page,
  };
});

const compareInput=z.object({tenantId:uuid,productKey:z.string().min(2).max(80),filters:filters.default({page:1,limit:50})});
export const compareJapanAuctionProviders=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof compareInput>)=>compareInput.parse(i)).handler(async({context,data})=>{
  await requireService(context,data.tenantId,"omniqora.automotive");
  const results=[] as Array<{providerKey:ReadOnlyJapanAuctionProvider;lots:any[];total:number|null;elapsedMs:number}>;
  for(const providerKey of READ_ONLY_JAPAN_AUCTION_PROVIDERS){
    const started=Date.now();
    const response=await searchJapanAuctionProvider(providerKey,data.filters);
    results.push({providerKey,lots:response.lots,total:response.total??null,elapsedMs:Date.now()-started});
  }
  const metrics=results.map(result=>{
    const n=result.lots.length||1;
    const count=(predicate:(lot:any)=>boolean)=>result.lots.filter(predicate).length;
    return{
      providerKey:result.providerKey,
      sampleSize:result.lots.length,
      providerTotal:result.total,
      elapsedMs:result.elapsedMs,
      chassisCoverage:count(l=>!!l.chassisNumber)/n,
      gradeCoverage:count(l=>!!l.grade)/n,
      imageCoverage:count(l=>Array.isArray(l.images)&&l.images.length>0)/n,
      auctionHouseCoverage:count(l=>!!l.auctionHouse)/n,
      auctionDateCoverage:count(l=>!!l.auctionAt)/n,
      modelCodeCoverage:count(l=>!!l.modelCode)/n,
    };
  });
  const chassisSets=results.map(result=>new Set(result.lots.map(l=>l.chassisNumber).filter(Boolean) as string[]));
  const overlapExactChassis=chassisSets.length===2?[...chassisSets[0]].filter(chassis=>chassisSets[1].has(chassis)).length:0;
  return{filters:data.filters,metrics,overlapExactChassis};
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
  return persistNormalizedAuctionLot(context.supabase as any,{tenantId:data.tenantId,productKey:data.productKey,lot});
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
