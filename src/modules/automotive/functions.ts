import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireAdminRole,requireService,requireTenantMembership,requireWriteRole} from "@/modules/platform/access";

const uuid=z.string().uuid(), product=z.string().min(2).max(80);
const scope=z.object({tenantId:uuid,productKey:product});

export const getAutomotiveWorkspace=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId); const db=context.supabase as any;
 const rs=await Promise.all([
  db.from("automotive_vehicles").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("updated_at",{ascending:false}).limit(250),
  db.from("automotive_appraisals").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(200),
  db.from("automotive_evidence").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(300),
  db.from("automotive_passport_snapshots").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("generated_at",{ascending:false}).limit(200),
  db.from("automotive_ai_findings").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(200),
  db.from("automotive_valuations").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("as_of",{ascending:false}).limit(200),
  db.from("automotive_auction_lots").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("auction_at",{ascending:false}).limit(200),
  db.from("automotive_bid_models").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(200),
  db.from("automotive_bid_cost_models_v2").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(200),
  db.from("automotive_bid_instructions").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(200),
  db.from("automotive_bid_provider_events").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("received_at",{ascending:false}).limit(300),
  db.from("automotive_auction_sheet_extractions").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(200),
  db.from("automotive_auction_comparables").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("observed_at",{ascending:false}).limit(300),
  db.from("automotive_auction_decisions").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(200),
  db.from("automotive_auction_review_corrections").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(200),
  db.from("automotive_auction_price_outcomes").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("outcome_at",{ascending:false}).limit(300),
  db.from("automotive_auction_price_curves").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("as_of",{ascending:false}).limit(300),
  db.from("automotive_auction_price_predictions").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(300),
  db.from("automotive_auction_watch_rules").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("updated_at",{ascending:false}).limit(200),
  db.from("automotive_auction_watch_matches").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("last_seen_at",{ascending:false}).limit(300),
  db.from("automotive_parts_fitment").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(200),
  db.from("automotive_compliance_checks").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("checked_at",{ascending:false}).limit(200)
 ]);
 for(const r of rs)if(r.error)throw new Error(r.error.message);
 return{vehicles:rs[0].data??[],appraisals:rs[1].data??[],evidence:rs[2].data??[],passports:rs[3].data??[],
  findings:rs[4].data??[],valuations:rs[5].data??[],auctionLots:rs[6].data??[],bidModels:rs[7].data??[],
  bidCostModelsV2:rs[8].data??[],bidInstructions:rs[9].data??[],bidProviderEvents:rs[10].data??[],
  auctionSheetExtractions:rs[11].data??[],auctionComparables:rs[12].data??[],auctionDecisions:rs[13].data??[],
  auctionCorrections:rs[14].data??[],auctionPriceOutcomes:rs[15].data??[],auctionPriceCurves:rs[16].data??[],
  auctionPredictions:rs[17].data??[],auctionWatchRules:rs[18].data??[],auctionWatchMatches:rs[19].data??[],
  fitments:rs[20].data??[],compliance:rs[21].data??[]};
});

const vehicle=scope.extend({
 vehicleId:uuid.nullish(),origin:z.enum(["uk","japan","other"]),vrm:z.string().max(32).nullish(),vin:z.string().max(64).nullish(),
 chassisNumber:z.string().max(64).nullish(),modelCode:z.string().max(80).nullish(),make:z.string().min(1).max(120),model:z.string().min(1).max(120),
 derivative:z.string().max(160).nullish(),firstRegistrationDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
 specification:z.record(z.string(),z.unknown()).default({}),provenance:z.record(z.string(),z.unknown()).default({})
});
export const saveAutomotiveVehicle=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof vehicle>)=>vehicle.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.automotive");requireWriteRole(a.role);
 if(!data.vrm&&!data.vin&&!data.chassisNumber)throw new Error("Vehicle needs VRM, VIN or chassis number");
 const db=context.supabase as any;
 const values={tenant_id:data.tenantId,product_key:data.productKey,origin:data.origin,vrm:data.vrm??null,vin:data.vin??null,
  chassis_number:data.chassisNumber??null,model_code:data.modelCode??null,make:data.make,model:data.model,derivative:data.derivative??null,
  first_registration_date:data.firstRegistrationDate??null,specification:data.specification,provenance:data.provenance,updated_at:new Date().toISOString()};
 const q=data.vehicleId?db.from("automotive_vehicles").update(values).eq("tenant_id",data.tenantId).eq("id",data.vehicleId):
  db.from("automotive_vehicles").insert({...values,status:"active"});
 const {data:row,error}=await q.select("*").single();if(error)throw new Error(error.message);return row;
});

const appraisal=scope.extend({vehicleId:uuid,requestedItems:z.array(z.string().max(120)).min(1).max(100),
 expiresAt:z.string().datetime().nullish(),allowLibraryUpload:z.boolean().default(false)});
export const createAutomotiveAppraisal=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof appraisal>)=>appraisal.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.automotive");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("automotive_appraisals").insert({tenant_id:data.tenantId,product_key:data.productKey,
  vehicle_id:data.vehicleId,status:"capture_requested",requested_items:data.requestedItems,require_fresh_capture:true,
  allow_library_upload:data.allowLibraryUpload,capture_geolocation:false,expires_at:data.expiresAt??null,created_by:context.userId}).select("*").single();
 if(error)throw new Error(error.message);return row;
});

const evidence=scope.extend({vehicleId:uuid,appraisalId:uuid.nullish(),kind:z.enum(["photo","video","document"]),
 captureItem:z.string().min(1).max(160),storageRef:z.string().min(1).max(1000),sha256:z.string().regex(/^[a-f0-9]{64}$/),
 capturedAt:z.string().datetime(),providerTimestamp:z.string().datetime().nullish(),mimeType:z.string().min(1).max(160),
 bytes:z.number().int().min(0),source:z.string().min(1).max(120),metadata:z.record(z.string(),z.unknown()).default({})});
export const recordAutomotiveEvidence=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof evidence>)=>evidence.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.automotive");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("automotive_evidence").insert({tenant_id:data.tenantId,product_key:data.productKey,
  vehicle_id:data.vehicleId,appraisal_id:data.appraisalId??null,kind:data.kind,capture_item:data.captureItem,storage_ref:data.storageRef,
  sha256:data.sha256,captured_at:data.capturedAt,provider_timestamp:data.providerTimestamp??null,mime_type:data.mimeType,bytes:data.bytes,
  source:data.source,location_captured:false,metadata_sanitised:true,metadata:data.metadata}).select("*").single();
 if(error)throw new Error(error.message);return row;
});

const passport=scope.extend({vehicleId:uuid,passport:z.record(z.string(),z.unknown()),sourceManifest:z.array(z.unknown()).max(500).default([])});
export const createVehiclePassportSnapshot=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof passport>)=>passport.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.automotive");requireWriteRole(a.role);const db=context.supabase as any;
 const current=await db.from("automotive_passport_snapshots").select("revision").eq("tenant_id",data.tenantId).eq("vehicle_id",data.vehicleId)
  .order("revision",{ascending:false}).limit(1).maybeSingle();if(current.error)throw new Error(current.error.message);
 const {data:row,error}=await db.from("automotive_passport_snapshots").insert({tenant_id:data.tenantId,product_key:data.productKey,
  vehicle_id:data.vehicleId,revision:(current.data?.revision??0)+1,passport:data.passport,source_manifest:data.sourceManifest,generated_by:context.userId})
  .select("*").single();if(error)throw new Error(error.message);return row;
});

const ai=scope.extend({vehicleId:uuid,appraisalId:uuid.nullish(),goal:z.string().min(4).max(3000),evidenceIds:z.array(uuid).max(200).default([])});
export const queueAutomotiveIntelligence=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof ai>)=>ai.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.automotive");requireWriteRole(a.role);const db=context.supabase as any;
 const {data:job,error}=await db.from("intelligence_jobs").insert({tenant_id:data.tenantId,product_key:data.productKey,
  job_type:"automotive.assessment",subject_type:"vehicle",subject_id:data.vehicleId,input:{vehicleId:data.vehicleId,appraisalId:data.appraisalId,
  evidenceIds:data.evidenceIds,goal:data.goal},requirements:{service:"omniqora.automotive",visionAllowed:true,reviewRequired:true,noGeolocation:true}})
  .select("*").single();if(error)throw new Error(error.message);return job;
});

const finding=scope.extend({vehicleId:uuid,appraisalId:uuid.nullish(),findingType:z.string().min(1).max(120),summary:z.string().min(1).max(3000),
 details:z.record(z.string(),z.unknown()).default({}),evidenceIds:z.array(uuid).max(200).default([]),
 confidence:z.number().min(0).max(1).nullish(),risk:z.enum(["low","review","high","specialist_review"]).default("review")});
export const recordAutomotiveFinding=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof finding>)=>finding.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.automotive");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("automotive_ai_findings").insert({tenant_id:data.tenantId,product_key:data.productKey,
  vehicle_id:data.vehicleId,appraisal_id:data.appraisalId??null,finding_type:data.findingType,summary:data.summary,details:data.details,
  evidence_ids:data.evidenceIds,confidence:data.confidence??null,risk:data.risk,status:"proposed"}).select("*").single();
 if(error)throw new Error(error.message);return row;
});

export const reviewAutomotiveFinding=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;findingId:string;decision:"accepted"|"rejected"})=>z.object({tenantId:uuid,findingId:uuid,decision:z.enum(["accepted","rejected"])}).parse(i))
.handler(async({context,data})=>{const a=await requireService(context,data.tenantId,"omniqora.automotive");requireAdminRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("automotive_ai_findings").update({status:data.decision,reviewed_by:context.userId,
  reviewed_at:new Date().toISOString()}).eq("tenant_id",data.tenantId).eq("id",data.findingId).select("*").single();if(error)throw new Error(error.message);return row;});

const valuation=scope.extend({vehicleId:uuid,valuationType:z.enum(["retail","trade","auction","insurance","landed_cost","max_bid"]),
 currency:z.string().regex(/^[A-Z]{3}$/),amountMinor:z.number().int(),lowMinor:z.number().int().nullish(),highMinor:z.number().int().nullish(),
 source:z.string().min(1).max(160),comparableRefs:z.array(z.unknown()).max(300).default([]),assumptions:z.record(z.string(),z.unknown()).default({}),
 confidence:z.number().min(0).max(1).nullish()});
export const recordAutomotiveValuation=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof valuation>)=>valuation.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.automotive");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("automotive_valuations").insert({tenant_id:data.tenantId,product_key:data.productKey,
  vehicle_id:data.vehicleId,valuation_type:data.valuationType,currency:data.currency,amount_minor:data.amountMinor,low_minor:data.lowMinor??null,
  high_minor:data.highMinor??null,source:data.source,comparable_refs:data.comparableRefs,assumptions:data.assumptions,
  confidence:data.confidence??null}).select("*").single();if(error)throw new Error(error.message);return row;
});

const lot=scope.extend({vehicleId:uuid.nullish(),providerKey:z.string().max(120).nullish(),externalLotId:z.string().min(1).max(160),
 auctionHouse:z.string().max(160).nullish(),auctionAt:z.string().datetime().nullish(),grade:z.string().max(40).nullish(),
 odometerKm:z.number().int().min(0).nullish(),startingPriceMinor:z.number().int().nullish(),currentPriceMinor:z.number().int().nullish(),
 currency:z.string().regex(/^[A-Z]{3}$/).nullish(),auctionSheet:z.record(z.string(),z.unknown()).default({}),images:z.array(z.unknown()).max(200).default([])});
export const upsertAuctionLot=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof lot>)=>lot.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.automotive");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("automotive_auction_lots").upsert({tenant_id:data.tenantId,product_key:data.productKey,
  vehicle_id:data.vehicleId??null,provider_key:data.providerKey??null,external_lot_id:data.externalLotId,auction_house:data.auctionHouse??null,
  auction_at:data.auctionAt??null,status:"open",grade:data.grade??null,odometer_km:data.odometerKm??null,starting_price_minor:data.startingPriceMinor??null,
  current_price_minor:data.currentPriceMinor??null,currency:data.currency??null,auction_sheet:data.auctionSheet,images:data.images,updated_at:new Date().toISOString()},
  {onConflict:"tenant_id,provider_key,external_lot_id"}).select("*").single();if(error)throw new Error(error.message);return row;
});

const bid=scope.extend({auctionLotId:uuid,destinationCountry:z.string().min(2).max(3),currency:z.string().regex(/^[A-Z]{3}$/),
 auctionFeesMinor:z.number().int().min(0).default(0),inlandTransportMinor:z.number().int().min(0).default(0),
 freightMinor:z.number().int().min(0).default(0),insuranceMinor:z.number().int().min(0).default(0),dutyMinor:z.number().int().min(0).default(0),
 taxMinor:z.number().int().min(0).default(0),registrationMinor:z.number().int().min(0).default(0),otherMinor:z.number().int().min(0).default(0),
 targetMarginMinor:z.number().int().min(0).default(0),targetRetailMinor:z.number().int().min(0),fxRate:z.number().positive().nullish(),
 fxSource:z.string().max(160).nullish(),fxAsOf:z.string().datetime().nullish(),assumptions:z.record(z.string(),z.unknown()).default({})});
export const createBidModel=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof bid>)=>bid.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.automotive");requireWriteRole(a.role);
 const nonPurchase=data.auctionFeesMinor+data.inlandTransportMinor+data.freightMinor+data.insuranceMinor+data.dutyMinor+data.taxMinor+
  data.registrationMinor+data.otherMinor+data.targetMarginMinor;
 const maxBid=Math.max(0,data.targetRetailMinor-nonPurchase);
 const {data:row,error}=await(context.supabase as any).from("automotive_bid_models").insert({tenant_id:data.tenantId,product_key:data.productKey,
  auction_lot_id:data.auctionLotId,destination_country:data.destinationCountry,fx_rate:data.fxRate??null,fx_source:data.fxSource??null,
  fx_as_of:data.fxAsOf??null,purchase_cost_minor:0,auction_fees_minor:data.auctionFeesMinor,inland_transport_minor:data.inlandTransportMinor,
  freight_minor:data.freightMinor,insurance_minor:data.insuranceMinor,duty_minor:data.dutyMinor,tax_minor:data.taxMinor,
  registration_minor:data.registrationMinor,other_minor:data.otherMinor,target_margin_minor:data.targetMarginMinor,target_retail_minor:data.targetRetailMinor,
  max_bid_minor:maxBid,currency:data.currency,assumptions:data.assumptions,status:"review"}).select("*").single();if(error)throw new Error(error.message);
 return{...row,computedMaxBidMinor:maxBid};
});

const fitment=scope.extend({partRef:z.string().min(1).max(160),vehicleId:uuid.nullish(),make:z.string().max(120).nullish(),
 model:z.string().max(120).nullish(),modelCode:z.string().max(80).nullish(),yearFrom:z.number().int().min(1900).max(2200).nullish(),
 yearTo:z.number().int().min(1900).max(2200).nullish(),engineCode:z.string().max(80).nullish(),
 fitmentStatus:z.enum(["unverified","compatible","incompatible","conditional"]).default("unverified"),
 conditions:z.record(z.string(),z.unknown()).default({}),sourceRefs:z.array(z.string().max(500)).max(100).default([])});
export const savePartsFitment=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof fitment>)=>fitment.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.automotive");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("automotive_parts_fitment").insert({tenant_id:data.tenantId,product_key:data.productKey,
  part_ref:data.partRef,vehicle_id:data.vehicleId??null,make:data.make??null,model:data.model??null,model_code:data.modelCode??null,
  year_from:data.yearFrom??null,year_to:data.yearTo??null,engine_code:data.engineCode??null,fitment_status:data.fitmentStatus,
  conditions:data.conditions,source_refs:data.sourceRefs,reviewed_by:data.fitmentStatus==="unverified"?null:context.userId,
  reviewed_at:data.fitmentStatus==="unverified"?null:new Date().toISOString()}).select("*").single();if(error)throw new Error(error.message);return row;
});

const compliance=scope.extend({vehicleId:uuid,jurisdiction:z.string().min(2).max(40),checkType:z.string().min(1).max(120),
 status:z.enum(["pending","pass","warning","fail","not_applicable"]),findings:z.array(z.unknown()).max(200).default([]),
 evidenceRefs:z.array(z.string().max(500)).max(100).default([])});
export const recordAutomotiveCompliance=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof compliance>)=>compliance.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.automotive");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("automotive_compliance_checks").insert({tenant_id:data.tenantId,product_key:data.productKey,
  vehicle_id:data.vehicleId,jurisdiction:data.jurisdiction,check_type:data.checkType,status:data.status,findings:data.findings,
  evidence_refs:data.evidenceRefs,reviewed_by:data.status==="pending"?null:context.userId}).select("*").single();if(error)throw new Error(error.message);return row;
});
