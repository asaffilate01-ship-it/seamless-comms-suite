export type AuctionProviderKey =
  | "vehicle.auction.thecarapi"
  | "vehicle.auction.carstack"
  | "vehicle.auction.agent"
  | "vehicle.auction.aucnet"
  | "vehicle.auction.iauc"
  | "vehicle.auction.uss"
  | "vehicle.auction.taa"
  | "vehicle.auction.caa"
  | "vehicle.auction.ju"
  | "vehicle.auction.arai";

export type AuctionProviderCapability =
  | "inventory.read"
  | "lot.detail"
  | "auction_sheet.read"
  | "images.read"
  | "history.read"
  | "results.read"
  | "bid.submit"
  | "bid.amend"
  | "bid.cancel"
  | "bid.status"
  | "invoice.read"
  | "payment.status"
  | "transport.status"
  | "export.status"
  | "shipping.status"
  | "documents.read";

export type AuctionProviderStage = "built_read" | "planned_execution" | "future_direct";

export type AuctionProviderDefinition = {
  key: AuctionProviderKey;
  name: string;
  stage: AuctionProviderStage;
  capabilities: AuctionProviderCapability[];
  requiredSecretNames: string[];
  notes: string;
};

export const AUTOHASHI_AUCTION_PROVIDERS: readonly AuctionProviderDefinition[] = [
  {
    key: "vehicle.auction.thecarapi",
    name: "TheCarAPI Japan",
    stage: "built_read",
    capabilities: ["inventory.read","lot.detail","auction_sheet.read","images.read","history.read","results.read"],
    requiredSecretNames: ["THECARAPI_API_KEY"],
    notes: "Read-only normalized Japanese auction/reseller inventory. Japanese price fields are treated as opening/source evidence unless a verified result is supplied.",
  },
  {
    key: "vehicle.auction.carstack",
    name: "CarStack Japan",
    stage: "built_read",
    capabilities: ["inventory.read","lot.detail","images.read"],
    requiredSecretNames: ["CARSTACK_API_TOKEN"],
    notes: "Read-only Japanese auction inventory and partner-watermarked images.",
  },
  {
    key: "vehicle.auction.agent",
    name: "Licensed Japan auction execution agent",
    stage: "planned_execution",
    capabilities: ["bid.submit","bid.amend","bid.cancel","bid.status","results.read","invoice.read","payment.status","transport.status","export.status","shipping.status","documents.read"],
    requiredSecretNames: ["AUTOHASHI_AUCTION_AGENT_URL","AUTOHASHI_AUCTION_AGENT_TOKEN"],
    notes: "Execution is disabled until a contracted agent implements the AutoHashi agent contract and passes staging certification.",
  },
  {
    key: "vehicle.auction.aucnet",
    name: "AUCNET",
    stage: "future_direct",
    capabilities: ["inventory.read","lot.detail","auction_sheet.read","images.read","history.read","bid.submit","bid.status","results.read"],
    requiredSecretNames: [],
    notes: "Future direct/member integration subject to Japanese entity, licence, membership and data-interface approval.",
  },
  {
    key: "vehicle.auction.iauc",
    name: "i-AUC",
    stage: "future_direct",
    capabilities: ["inventory.read","lot.detail","auction_sheet.read","images.read","bid.submit","bid.status","results.read"],
    requiredSecretNames: [],
    notes: "Future direct/member integration; do not automate browser/member access without an authorised interface.",
  },
  {
    key: "vehicle.auction.uss",
    name: "USS / CIS",
    stage: "future_direct",
    capabilities: ["inventory.read","lot.detail","auction_sheet.read","images.read","history.read","bid.submit","bid.status","results.read"],
    requiredSecretNames: [],
    notes: "Future direct member integration only under USS-authorised system/data access; no CIS scraping.",
  },
  {key:"vehicle.auction.taa",name:"TAA",stage:"future_direct",capabilities:["inventory.read","lot.detail","auction_sheet.read","images.read","bid.submit","bid.status","results.read"],requiredSecretNames:[],notes:"Future direct/member or licensed-agent route."},
  {key:"vehicle.auction.caa",name:"CAA",stage:"future_direct",capabilities:["inventory.read","lot.detail","auction_sheet.read","images.read","bid.submit","bid.status","results.read"],requiredSecretNames:[],notes:"Future direct/member or licensed-agent route."},
  {key:"vehicle.auction.ju",name:"JU",stage:"future_direct",capabilities:["inventory.read","lot.detail","auction_sheet.read","images.read","bid.submit","bid.status","results.read"],requiredSecretNames:[],notes:"Future direct/member or licensed-agent route."},
  {key:"vehicle.auction.arai",name:"ARAI",stage:"future_direct",capabilities:["inventory.read","lot.detail","auction_sheet.read","images.read","bid.submit","bid.status","results.read"],requiredSecretNames:[],notes:"Future direct/member or licensed-agent route."},
] as const;

export type AuctionSearchInput = {
  query?: string | null;
  make?: string | null;
  model?: string | null;
  yearMin?: number | null;
  yearMax?: number | null;
  odometerMaxKm?: number | null;
  grade?: string | null;
  steering?: "rhd" | "lhd" | null;
  page?: number;
  pageSize?: number;
};

export type NormalizedAuctionLot = {
  providerKey: AuctionProviderKey;
  externalLotId: string;
  sourceSite: string;
  sourceVehicleId: string | null;
  auctionHouse: string | null;
  auctionAt: string | null;
  status: string;
  make: string;
  model: string;
  year: number | null;
  chassisNumber: string | null;
  modelCode: string | null;
  grade: string | null;
  odometerKm: number | null;
  startingPriceMinor: number | null;
  currentPriceMinor: number | null;
  finalPriceMinor: number | null;
  currency: string;
  priceSemantics: "opening_bid" | "asking_price" | "provider_current" | "reported_result" | "unknown";
  images: string[];
  auctionSheet: Record<string, unknown>;
  provenance: Record<string, unknown>;
  observedAt: string;
};

export type AuctionSearchResult = {
  providerKey: AuctionProviderKey;
  lots: NormalizedAuctionLot[];
  page: number;
  pageSize: number;
  totalCount: number | null;
  totalPages: number | null;
  requestId: string | null;
};

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : null;
}
function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}
function int(value: unknown): number | null {
  const valueNumber=num(value); return valueNumber===null?null:Math.trunc(valueNumber);
}
function firstText(...values: unknown[]) {
  for (const value of values) { const candidate=text(value); if(candidate) return candidate; }
  return null;
}
function firstNumber(...values: unknown[]) {
  for (const value of values) { const candidate=num(value); if(candidate!==null) return candidate; }
  return null;
}
function imageUrls(value: unknown): string[] {
  const rows=Array.isArray(value)?value:[];
  return rows.map((row:any)=>firstText(row?.served_url,row?.url,row?.image_url,row?.src,row)).filter((url):url is string=>!!url);
}

export function normaliseTheCarApiLot(input: unknown): NormalizedAuctionLot {
  const row=record(input), vehicle=record(row.vehicle_details), identification=record(row.car_identification);
  const gallery=imageUrls(row.vault_gallery);
  const external=firstText(row.auction_id_str,row.source_auction_id,row.auction_id,row.id);
  if(!external) throw new Error("TheCarAPI result is missing auction_id_str/source id");
  const sourceSite=firstText(row.site_name,row.site,"japan") ?? "japan";
  const origin=firstText(row.country,row.origin,vehicle.country,"JP") ?? "JP";
  const current=firstNumber(row.current_price,row.price);
  const start=firstNumber(row.start_price,current);
  const final=firstNumber(row.final_price);
  const japan=sourceSite.toLowerCase()==="japan" || origin.toUpperCase()==="JP";
  return {
    providerKey:"vehicle.auction.thecarapi",
    externalLotId:external,
    sourceSite,
    sourceVehicleId:firstText(row.car_id,row.vehicle_id,identification.car_id),
    auctionHouse:firstText(row.auction_house,row.auction_name,row.auction,identification.auction_house),
    auctionAt:firstText(row.auction_date,row.auction_at,row.end_date,row.end_at,row.date),
    status:firstText(row.status,row.auction_status,row.is_active===false?"ended":"open") ?? "open",
    make:firstText(row.clean_make,row.make,row.brand,vehicle.make,"Unknown") ?? "Unknown",
    model:firstText(row.clean_model,row.model,vehicle.model,"Unknown") ?? "Unknown",
    year:int(firstNumber(row.production_year,row.year,row.registration_year,vehicle.year)),
    chassisNumber:firstText(row.chassis_number,row.vin_ocr,row.vin,vehicle.vin,identification.chassis_number),
    modelCode:firstText(row.model_code,row.chassis_code,vehicle.model_code),
    grade:firstText(row.auction_grade,row.grade,vehicle.auction_grade),
    odometerKm:int(firstNumber(row.mileage,row.kilometers,row.odometer_km,vehicle.mileage)),
    startingPriceMinor:start===null?null:Math.round(start),
    currentPriceMinor:current===null?null:Math.round(current),
    finalPriceMinor:final===null?null:Math.round(final),
    currency:firstText(row.currency_code_id,row.currency,"JPY") ?? "JPY",
    priceSemantics:final!==null?"reported_result":japan?"opening_bid":"provider_current",
    images:gallery.length?gallery:imageUrls(row.images),
    auctionSheet:record(row.auction_sheet ?? vehicle.auction_sheet ?? identification.auction_sheet),
    provenance:{source:"thecarapi",site:sourceSite,origin,sourceAuctionId:external,detailsPending:row.details_pending??null},
    observedAt:new Date().toISOString(),
  };
}

export function normaliseCarStackLot(input: unknown): NormalizedAuctionLot {
  const row=record(input), auction=record(row.auction), price=record(row.price), specs=record(row.specs), images=record(row.images);
  const external=firstText(row.id,row.vehicle_id,row.lot_number);
  if(!external) throw new Error("CarStack result is missing id");
  const allImages=Array.isArray(images.items)?images.items.map((item:any)=>firstText(item?.url)).filter((url):url is string=>!!url):[];
  const primary=firstText(images.primary_url);
  if(primary&&!allImages.includes(primary)) allImages.unshift(primary);
  return {
    providerKey:"vehicle.auction.carstack",
    externalLotId:external,
    sourceSite:"carstack",
    sourceVehicleId:firstText(row.id),
    auctionHouse:firstText(auction.house,row.auction_house),
    auctionAt:firstText(auction.date,row.auction_date),
    status:firstText(auction.status,row.status,"upcoming") ?? "upcoming",
    make:firstText(row.make,"Unknown") ?? "Unknown",
    model:firstText(row.model,"Unknown") ?? "Unknown",
    year:int(row.year),
    chassisNumber:firstText(row.vin,row.chassis_number),
    modelCode:firstText(row.chassis_code),
    grade:firstText(row.grade),
    odometerKm:int(row.odometer_km),
    startingPriceMinor:int(price.start),
    currentPriceMinor:int(price.current),
    finalPriceMinor:int(price.final),
    currency:firstText(price.currency,"JPY") ?? "JPY",
    priceSemantics:num(price.final)!==null&&num(price.final)!==0?"reported_result":"provider_current",
    images:allImages,
    auctionSheet:record(row.auction_sheet),
    provenance:{source:"carstack",lotNumber:firstText(row.lot_number),steering:firstText(specs.steering),title:firstText(row.title)},
    observedAt:new Date().toISOString(),
  };
}

export function buildTheCarApiSearchUrl(input: AuctionSearchInput) {
  const url=new URL("https://api.thecarapi.com/api/search");
  url.searchParams.set("site","japan");
  url.searchParams.set("country","JP");
  if(input.query) url.searchParams.set("search",input.query);
  if(input.make) url.searchParams.set("brand",input.make);
  if(input.model) url.searchParams.set("model",input.model);
  if(input.yearMin) url.searchParams.set("production_year_from",String(input.yearMin));
  if(input.yearMax) url.searchParams.set("production_year_to",String(input.yearMax));
  if(input.odometerMaxKm) url.searchParams.set("kilometers_to",String(input.odometerMaxKm));
  if(input.steering) url.searchParams.set("steering",input.steering==="rhd"?"right":"left");
  url.searchParams.set("page",String(Math.max(1,input.page??1)));
  url.searchParams.set("limit",String(Math.min(50,Math.max(1,input.pageSize??24))));
  return url;
}

export function buildCarStackSearchUrl(input: AuctionSearchInput) {
  const url=new URL("https://carstack.dev/v1/vehicles");
  if(input.query) url.searchParams.set("q",input.query);
  if(input.make) url.searchParams.append("make",input.make);
  if(input.model) url.searchParams.append("model",input.model);
  if(input.yearMin) url.searchParams.set("year_min",String(input.yearMin));
  if(input.yearMax) url.searchParams.set("year_max",String(input.yearMax));
  if(input.odometerMaxKm) url.searchParams.set("odometer_max",String(input.odometerMaxKm));
  if(input.grade) url.searchParams.append("auction_grades",input.grade);
  if(input.steering) url.searchParams.append("steering",input.steering);
  url.searchParams.set("page",String(Math.max(1,input.page??1)));
  url.searchParams.set("per_page",String(Math.min(50,Math.max(1,input.pageSize??24))));
  return url;
}

async function readJson(response: Response) {
  const raw=await response.text();
  let body:any={};
  try{body=raw?JSON.parse(raw):{}}catch{throw new Error("Auction provider returned non-JSON response");}
  if(!response.ok) {
    const message=firstText(body?.error?.message,body?.error,body?.message,raw.slice(0,300)) ?? "provider request failed";
    throw new Error("Auction provider error ["+response.status+"]: "+message);
  }
  return body;
}

export async function searchAuctionProvider(input: {
  providerKey: "vehicle.auction.thecarapi" | "vehicle.auction.carstack";
  secret: string;
  filters: AuctionSearchInput;
  signal?: AbortSignal;
}): Promise<AuctionSearchResult> {
  if(!input.secret) throw new Error("Auction provider credential is not configured");
  if(input.providerKey==="vehicle.auction.thecarapi") {
    const response=await fetch(buildTheCarApiSearchUrl(input.filters),{headers:{"X-API-Key":input.secret,"Accept":"application/json","Accept-Encoding":"gzip"},signal:input.signal});
    const body=await readJson(response);
    const rows=Array.isArray(body.results)?body.results:Array.isArray(body.data)?body.data:[];
    const lots=rows.map(normaliseTheCarApiLot);
    return {providerKey:input.providerKey,lots,page:int(body.page)??input.filters.page??1,pageSize:int(body.limit)??input.filters.pageSize??24,totalCount:int(body.total_count??body.total),totalPages:int(body.total_pages??body.max_page),requestId:firstText(body.request_id)};
  }
  const response=await fetch(buildCarStackSearchUrl(input.filters),{headers:{Authorization:"Bearer "+input.secret,Accept:"application/json"},signal:input.signal});
  const body=await readJson(response);
  const rows=Array.isArray(body.data)?body.data:[];
  const meta=record(body.meta);
  return {providerKey:input.providerKey,lots:rows.map(normaliseCarStackLot),page:int(meta.page)??input.filters.page??1,pageSize:int(meta.per_page)??input.filters.pageSize??24,totalCount:int(meta.total_count),totalPages:int(meta.total_pages),requestId:null};
}

export async function getAuctionProviderLot(input:{
  providerKey:"vehicle.auction.thecarapi"|"vehicle.auction.carstack";
  externalLotId:string;
  secret:string;
  signal?:AbortSignal;
}):Promise<NormalizedAuctionLot>{
  if(!input.secret) throw new Error("Auction provider credential is not configured");
  const encoded=encodeURIComponent(input.externalLotId);
  if(input.providerKey==="vehicle.auction.thecarapi"){
    const response=await fetch("https://api.thecarapi.com/api/auction/japan/"+encoded,{headers:{"X-API-Key":input.secret,Accept:"application/json"},signal:input.signal});
    const body=await readJson(response);
    return normaliseTheCarApiLot(body.auction??body.data??body);
  }
  const response=await fetch("https://carstack.dev/v1/vehicles/"+encoded,{headers:{Authorization:"Bearer "+input.secret,Accept:"application/json"},signal:input.signal});
  const body=await readJson(response);
  return normaliseCarStackLot(body.data??body);
}

export function auctionProviderReadiness(env: Record<string,string|undefined>) {
  return AUTOHASHI_AUCTION_PROVIDERS.map(provider=>({
    ...provider,
    configured:provider.stage==="built_read" && provider.requiredSecretNames.every(name=>!!env[name]),
  }));
}
