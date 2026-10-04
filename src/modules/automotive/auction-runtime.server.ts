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
  z.object({
    operation:z.literal("auction.bid.queue"),
    tenantId:z.string().uuid(),
    productKey:z.string().min(2).max(80),
    auctionLotId:z.string().uuid(),
    sourceRequestRef:z.string().min(1).max(200),
    maxBidMinor:z.number().int().positive(),
    currency:z.string().regex(/^[A-Z]{3}$/),
    providerKey:z.literal("vehicle.japan.agent").default("vehicle.japan.agent"),
    riskReviewStatus:z.enum(["low","review","high","specialist_review"]).default("review"),
    authorisedByRef:z.string().max(200).nullish(),
    notes:z.string().max(2000).nullish(),
  }).strict(),
  z.object({
    operation:z.literal("auction.bid.get"),
    tenantId:z.string().uuid(),
    productKey:z.string().min(2).max(80),
    sourceRequestRef:z.string().min(1).max(200),
  }).strict(),
  z.object({
    operation:z.literal("auction.history"),
    tenantId:z.string().uuid(),
    productKey:z.string().min(2).max(80),
    auctionLotId:z.string().uuid(),
    days:z.number().int().min(1).max(730).default(90),
  }).strict(),
  z.object({
    operation:z.literal("auction.assess"),
    tenantId:z.string().uuid(),
    productKey:z.string().min(2).max(80),
    auctionLotId:z.string().uuid(),
    goal:z.string().min(4).max(3000).default("Assess auction-sheet consistency, visible condition, provenance risks, mileage anomalies, relisting signals and bid-relevant concerns. Do not infer a clean history from missing evidence."),
  }).strict(),
  z.object({
    operation:z.literal("auction.assessment.get"),
    tenantId:z.string().uuid(),
    productKey:z.string().min(2).max(80),
    auctionLotId:z.string().uuid(),
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

function publicBid(row:any){
  return{
    id:row.id,
    auctionLotId:row.auction_lot_id,
    sourceRequestRef:row.source_request_ref,
    providerKey:row.provider_key,
    executionMode:row.execution_mode,
    maxBidMinor:row.max_bid_minor,
    currency:row.currency,
    status:row.status,
    externalBidRef:row.external_bid_ref,
    riskReviewStatus:row.risk_review_status,
    createdAt:row.created_at,
    updatedAt:row.updated_at,
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
    const capability=
      ["auction.list","auction.bid.get","auction.history","auction.assessment.get"].includes(input.operation)?"automotive.auctions.read":
      input.operation==="auction.bid.queue"?"automotive.auctions.bid.request":
      input.operation==="auction.assess"?"automotive.auctions.assess":
      "automotive.auctions.sync";
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

    if(input.operation==="auction.history"){
      const anchor=await db.from("automotive_auction_lots").select("vehicle_id")
        .eq("tenant_id",input.tenantId).eq("product_key",input.productKey).eq("id",input.auctionLotId).maybeSingle();
      if(anchor.error||!anchor.data)throw new Error("Auction lot not found");
      if(!anchor.data.vehicle_id)return reply({vehicleId:null,days:input.days,lots:[],flags:[{type:"identity_pending",summary:"No canonical chassis-linked vehicle exists for this lot yet."}]});
      const since=new Date(Date.now()-input.days*86400000).toISOString();
      const history=await db.from("automotive_auction_lots").select("*")
        .eq("tenant_id",input.tenantId).eq("product_key",input.productKey).eq("vehicle_id",anchor.data.vehicle_id)
        .gte("created_at",since).order("auction_at",{ascending:true,nullsFirst:false});
      if(history.error)throw new Error(history.error.message);
      const lots=history.data??[];
      const flags:{type:string;summary:string;lotIds?:string[]}[]=[];
      for(let i=1;i<lots.length;i++){
        const previous=lots[i-1],current=lots[i];
        const before=Number(previous.odometer_km),after=Number(current.odometer_km);
        if(Number.isFinite(before)&&Number.isFinite(after)&&after+100<before){
          flags.push({type:"mileage_regression",summary:`Mileage fell from ${before.toLocaleString()} km to ${after.toLocaleString()} km across auction appearances.`,lotIds:[previous.id,current.id]});
        }
        if(previous.grade&&current.grade&&String(previous.grade)!==String(current.grade)){
          flags.push({type:"grade_changed",summary:`Auction grade changed from ${previous.grade} to ${current.grade}.`,lotIds:[previous.id,current.id]});
        }
      }
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply({vehicleId:anchor.data.vehicle_id,days:input.days,lots:lots.map(publicLot),flags});
    }

    if(input.operation==="auction.assess"){
      const entitlement=await db.rpc("has_tenant_entitlement",{_tenant:input.tenantId,_service:"omniqora.intelligence-runtime"});
      if(entitlement.error||!entitlement.data)throw new Error("Omniqora intelligence entitlement required");
      const lot=await db.from("automotive_auction_lots").select("id,vehicle_id,provider_key,external_lot_id,auction_house,auction_at,grade,odometer_km,starting_price_minor,current_price_minor,currency,auction_sheet,images,metadata")
        .eq("tenant_id",input.tenantId).eq("product_key",input.productKey).eq("id",input.auctionLotId).maybeSingle();
      if(lot.error||!lot.data)throw new Error("Auction lot not found");
      const existing=await db.from("intelligence_jobs").select("id,status,created_at")
        .eq("tenant_id",input.tenantId).eq("product_key",input.productKey).eq("subject_type","auction_lot").eq("subject_id",input.auctionLotId)
        .in("status",["queued","claimed","running","waiting_review"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
      if(existing.error)throw new Error(existing.error.message);
      if(existing.data)return reply({job:existing.data,idempotent:true},202);
      const queued=await db.from("intelligence_jobs").insert({
        tenant_id:input.tenantId,product_key:input.productKey,job_type:"automotive.auction_assessment",subject_type:"auction_lot",subject_id:input.auctionLotId,priority:"normal",
        input:{auctionLot:lot.data,vehicleId:lot.data.vehicle_id,goal:input.goal},
        requirements:{service:"omniqora.automotive",visionAllowed:true,reviewRequired:true,citationsRequired:true,noGeolocation:true,
          checks:["auction_sheet_vs_structured_fields","visible_damage","mileage_history","relisting_history","grade_consistency","bid_risk"]}
      }).select("id,status,created_at").single();
      if(queued.error)throw new Error(queued.error.message);
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply({job:queued.data},202);
    }

    if(input.operation==="auction.assessment.get"){
      const jobs=await db.from("intelligence_jobs").select("id,status,result,error,provider_key,model,created_at,updated_at,completed_at")
        .eq("tenant_id",input.tenantId).eq("product_key",input.productKey).eq("subject_type","auction_lot").eq("subject_id",input.auctionLotId)
        .order("created_at",{ascending:false}).limit(10);
      if(jobs.error)throw new Error(jobs.error.message);
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply({jobs:jobs.data??[]});
    }

    if(input.operation==="auction.bid.queue"){
      const lot=await db.from("automotive_auction_lots").select("id,status,currency")
        .eq("tenant_id",input.tenantId).eq("product_key",input.productKey).eq("id",input.auctionLotId).maybeSingle();
      if(lot.error||!lot.data)throw new Error("Auction lot not found");
      if(["sold","cancelled","closed"].includes(String(lot.data.status).toLowerCase()))throw new Error("Auction lot is no longer open");
      const existing=await db.from("automotive_auction_bid_requests").select("*")
        .eq("tenant_id",input.tenantId).eq("source_system","autohashi").eq("source_request_ref",input.sourceRequestRef).maybeSingle();
      if(existing.error)throw new Error(existing.error.message);
      if(existing.data){
        const same=Number(existing.data.max_bid_minor)===input.maxBidMinor&&existing.data.currency===input.currency&&existing.data.auction_lot_id===input.auctionLotId;
        if(!same)throw new Error("Existing AutoHashi bid request conflicts with this authorisation");
        return reply({bid:publicBid(existing.data),idempotent:true});
      }
      const inserted=await db.from("automotive_auction_bid_requests").insert({
        tenant_id:input.tenantId,
        product_key:input.productKey,
        auction_lot_id:input.auctionLotId,
        source_system:"autohashi",
        source_request_ref:input.sourceRequestRef,
        provider_key:input.providerKey,
        execution_mode:"manual",
        max_bid_minor:input.maxBidMinor,
        currency:input.currency,
        status:"pending_partner",
        authorised_by_ref:input.authorisedByRef??null,
        risk_review_status:input.riskReviewStatus,
        notes:input.notes??"Authorised in AutoHashi. Pending Japan-side execution; not yet submitted to an auction house.",
      }).select("*").single();
      if(inserted.error)throw new Error(inserted.error.message);
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply({bid:publicBid(inserted.data),transmittedToAuctionHouse:false},202);
    }

    if(input.operation==="auction.bid.get"){
      const result=await db.from("automotive_auction_bid_requests").select("*")
        .eq("tenant_id",input.tenantId).eq("product_key",input.productKey)
        .eq("source_system","autohashi").eq("source_request_ref",input.sourceRequestRef).maybeSingle();
      if(result.error||!result.data)throw new Error("Bid request not found");
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply({bid:publicBid(result.data)});
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
