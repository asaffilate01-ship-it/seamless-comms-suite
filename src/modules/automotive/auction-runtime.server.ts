import {z} from "zod";
import {supabaseAdmin} from "@/integrations/supabase/client.server";
import {authoriseServiceScope,parseServiceAuthorization,verifyServiceSecret,type ServiceCredentialRecord} from "@/modules/platform/service-identity";
import {READ_ONLY_JAPAN_AUCTION_PROVIDERS,getJapanAuctionLot} from "./auction-providers.server";
import {persistNormalizedAuctionLot,syncAuctionProviderToDb} from "./auction-sync.server";

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
}).refine(v=>!v.yearMin||!v.yearMax||v.yearMin<=v.yearMax);

const requestSchema=z.discriminatedUnion("operation",[
  z.object({
    operation:z.literal("auction.search_sync"),
    tenantId:z.string().uuid(),
    productKey:z.string().min(2).max(80),
    providerKey:provider,
    filters:filters.default({page:1,limit:24}),
  }).strict(),
  z.object({
    operation:z.literal("auction.list"),
    tenantId:z.string().uuid(),
    productKey:z.string().min(2).max(80),
    providerKey:provider.optional(),
    limit:z.number().int().min(1).max(250).default(100),
  }).strict(),
  z.object({
    operation:z.literal("auction.hydrate"),
    tenantId:z.string().uuid(),
    productKey:z.string().min(2).max(80),
    providerKey:provider,
    externalLotId:z.string().min(1).max(200),
  }).strict(),
]);

function reply(body:unknown,status=200){
  return Response.json(body,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}

async function authenticate(request:Request){
  const {keyId,secret}=parseServiceAuthorization(request.headers.get("authorization"));
  const db=supabaseAdmin as any;
  const {data:row,error}=await db.from("platform_service_credentials")
    .select("id,key_id,secret_hash,status,expires_at,scopes")
    .eq("key_id",keyId).maybeSingle();
  if(error||!row||!verifyServiceSecret(secret,row.secret_hash))throw new Error("Service credential refused");
  const scopes=z.array(z.object({
    tenantId:z.string().uuid(),
    productKey:z.string().min(2),
    brandIds:z.array(z.string().uuid()).optional(),
    locationIds:z.array(z.string().uuid()).optional(),
    capabilities:z.array(z.string()),
  })).parse(row.scopes);
  const credential:ServiceCredentialRecord={
    id:row.id,keyId:row.key_id,secretHash:row.secret_hash,status:row.status,expiresAt:row.expires_at,scopes,
  };
  return{db,credential};
}

async function assertActiveProduct(db:any,tenantId:string,productKey:string){
  const {data,error}=await db.from("tenant_products").select("status")
    .eq("tenant_id",tenantId).eq("product_key",productKey).maybeSingle();
  if(error||!data||data.status!=="active")throw new Error("Active tenant product required");
}

function publicLot(row:any){
  const metadata=row.metadata&&typeof row.metadata==="object"?row.metadata:{};
  return{
    id:row.id,
    vehicleId:row.vehicle_id,
    providerKey:row.provider_key,
    externalLotId:row.external_lot_id,
    lotNumber:metadata.lot_number??null,
    auctionHouse:row.auction_house,
    auctionAt:row.auction_at,
    status:row.status,
    make:metadata.make??null,
    model:metadata.model??null,
    year:metadata.year??null,
    chassisNumber:metadata.chassis_number??null,
    modelCode:metadata.model_code??null,
    grade:row.grade,
    odometerKm:row.odometer_km,
    startingPriceMinor:row.starting_price_minor,
    currentPriceMinor:row.current_price_minor,
    currency:row.currency,
    auctionSheet:row.auction_sheet,
    images:row.images,
    sourceUrl:metadata.source_url??null,
    syncedAt:metadata.synced_at??row.updated_at,
  };
}

export async function serveAutomotiveAuctionRuntime(request:Request){
  try{
    const raw=await request.text();
    if(raw.length>131072)return reply({error:"Payload too large"},413);
    let parsed:unknown;
    try{parsed=JSON.parse(raw)}catch{return reply({error:"Invalid JSON"},400)}
    const input=requestSchema.parse(parsed);
    const {db,credential}=await authenticate(request);
    const capability=input.operation==="auction.list"?"automotive.auctions.read":"automotive.auctions.sync";
    authoriseServiceScope(credential,{tenantId:input.tenantId,productKey:input.productKey,capability});
    await assertActiveProduct(db,input.tenantId,input.productKey);

    if(input.operation==="auction.search_sync"){
      const result=await syncAuctionProviderToDb(db,{
        tenantId:input.tenantId,
        productKey:input.productKey,
        providerKey:input.providerKey,
        filters:input.filters,
      });
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply({
        syncId:result.syncId,
        providerKey:input.providerKey,
        total:result.response.total,
        page:result.response.page,
        lots:result.rows.map(publicLot),
      });
    }

    if(input.operation==="auction.hydrate"){
      const normalized=await getJapanAuctionLot(input.providerKey,input.externalLotId);
      const row=await persistNormalizedAuctionLot(db,{tenantId:input.tenantId,productKey:input.productKey,lot:normalized});
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply({lot:publicLot(row)});
    }

    let query=db.from("automotive_auction_lots").select("*")
      .eq("tenant_id",input.tenantId).eq("product_key",input.productKey)
      .order("auction_at",{ascending:true,nullsFirst:false}).limit(input.limit);
    if(input.providerKey)query=query.eq("provider_key",input.providerKey);
    const result=await query;
    if(result.error)throw new Error(result.error.message);
    await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
    return reply({lots:(result.data??[]).map(publicLot)});
  }catch(error){
    if(error instanceof z.ZodError)return reply({error:"Invalid automotive auction contract"},422);
    const message=error instanceof Error?error.message:"Automotive auction runtime refused";
    if(/credential|scope|authorization|expired|active tenant product/i.test(message))return reply({error:message},403);
    return reply({error:message},503);
  }
}
