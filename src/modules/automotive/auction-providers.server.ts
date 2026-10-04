export const READ_ONLY_JAPAN_AUCTION_PROVIDERS = [
  "vehicle.japan.thecarapi",
  "vehicle.japan.carstack",
] as const;

export type ReadOnlyJapanAuctionProvider = (typeof READ_ONLY_JAPAN_AUCTION_PROVIDERS)[number];

export type AuctionProviderSearch = {
  search?: string;
  make?: string;
  model?: string;
  yearMin?: number;
  yearMax?: number;
  grade?: string;
  page?: number;
  limit?: number;
};

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key:string]: JsonValue };
export type JsonObject = { [key:string]: JsonValue };

export type NormalizedAuctionLot = {
  providerKey: ReadOnlyJapanAuctionProvider;
  externalLotId: string;
  auctionHouse: string | null;
  auctionAt: string | null;
  status: string;
  make: string | null;
  model: string | null;
  year: number | null;
  grade: string | null;
  odometerKm: number | null;
  startingPriceMinor: number | null;
  currentPriceMinor: number | null;
  currency: string | null;
  chassisNumber: string | null;
  modelCode: string | null;
  sourceUrl: string | null;
  images: JsonValue[];
  auctionSheet: JsonObject;
  metadata: JsonObject;
};

export class AuctionProviderConfigError extends Error {
  constructor(public providerKey:ReadOnlyJapanAuctionProvider,message:string){
    super(message);
    this.name="AuctionProviderConfigError";
  }
}

function rec(value:unknown):Record<string,unknown>{
  return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
}
function jsonValue(value:unknown):JsonValue{
  if(value===null||typeof value==="string"||typeof value==="boolean")return value;
  if(typeof value==="number")return Number.isFinite(value)?value:null;
  if(Array.isArray(value))return value.map(jsonValue);
  if(value&&typeof value==="object"){
    const out:JsonObject={};
    for(const [key,item] of Object.entries(value as Record<string,unknown>))out[key]=jsonValue(item);
    return out;
  }
  return null;
}
function jsonObject(value:unknown):JsonObject{
  const converted=jsonValue(value);
  return converted&&typeof converted==="object"&&!Array.isArray(converted)?converted:{};
}
function arr(value:unknown):unknown[]{return Array.isArray(value)?value:[]}
function str(value:unknown):string|null{
  if(typeof value==="string"&&value.trim())return value.trim();
  if(typeof value==="number"&&Number.isFinite(value))return String(value);
  return null;
}
function num(value:unknown):number|null{
  if(typeof value==="number"&&Number.isFinite(value))return value;
  if(typeof value==="string"&&value.trim()){
    const parsed=Number(value.replaceAll(",",""));
    return Number.isFinite(parsed)?parsed:null;
  }
  return null;
}
function int(value:unknown):number|null{
  const n=num(value);
  return n===null?null:Math.trunc(n);
}
function iso(value:unknown):string|null{
  const s=str(value);
  if(!s)return null;
  const d=new Date(s);
  return Number.isNaN(d.getTime())?null:d.toISOString();
}
function imageObjects(value:unknown):JsonValue[]{
  if(Array.isArray(value))return value.slice(0,200).map(jsonValue);
  const o=rec(value);
  if(Array.isArray(o.items))return o.items.slice(0,200).map(jsonValue);
  if(Array.isArray(o.images))return o.images.slice(0,200).map(jsonValue);
  return [];
}
function uniqueImages(...values:unknown[]):JsonValue[]{
  const out:JsonValue[]=[];
  const seen=new Set<string>();
  for(const value of values){
    for(const item of imageObjects(value)){
      const safe=jsonValue(item);
      const key=typeof safe==="string"?safe:JSON.stringify(safe);
      if(!seen.has(key)){seen.add(key);out.push(safe)}
      if(out.length>=200)return out;
    }
  }
  return out;
}
function envRequired(providerKey:ReadOnlyJapanAuctionProvider,name:string){
  const value=process.env[name]?.trim();
  if(!value)throw new AuctionProviderConfigError(providerKey,`${name} is not configured on the server`);
  return value;
}
async function getJson(url:URL,headers:Record<string,string>){
  const response=await fetch(url,{method:"GET",headers:{Accept:"application/json",...headers},signal:AbortSignal.timeout(20_000)});
  const body=await response.text();
  let parsed:unknown={};
  try{parsed=body?JSON.parse(body):{}}catch{parsed={raw:body.slice(0,2000)}}
  if(!response.ok){
    const requestId=response.headers.get("x-request-id");
    throw new Error(`Auction provider request failed [${response.status}]${requestId?` request=${requestId}`:""}`);
  }
  return parsed;
}

function theCarApiId(row:Record<string,unknown>){
  // Japanese IDs can exceed JS safe integer precision. Prefer the provider's string identifier.
  const exact=str(row.auction_id_str)??str(row.source_auction_id);
  if(exact)return {id:exact,precisionUnsafe:false};
  const numeric=row.auction_id;
  if(typeof numeric==="number"&&!Number.isSafeInteger(numeric))return {id:String(numeric),precisionUnsafe:true};
  return {id:str(numeric),precisionUnsafe:false};
}

function normalizeTheCarApi(rowValue:unknown,detail=false):NormalizedAuctionLot|null{
  const envelope=rec(rowValue);
  const row=detail&&envelope.auction?rec(envelope.auction):envelope;
  const idInfo=theCarApiId(row);
  if(!idInfo.id)return null;
  const vehicleDetails=rec(row.vehicle_details);
  const identification=rec(row.car_identification);
  const vault=rec(row.vault_gallery);
  const current=num(row.current_price);
  const start=num(row.start_price)??current;
  const site=str(row.site_name)??"japan";
  const make=str(row.clean_make)??str(row.make)??str(vehicleDetails.make);
  const model=str(row.clean_model)??str(row.model_display)??str(row.model)??str(vehicleDetails.model);
  const year=int(row.production_year)??int(row.registration_year)??int(row.year);
  const currency=(str(row.currency_code_id)??str(row.currency)??"JPY")?.toUpperCase()??"JPY";
  const thumbnail=str(row.thumbnail_url);
  const images=uniqueImages(
    row.images,
    vault.images,
    thumbnail?[{url:thumbnail,kind:"thumbnail"}]:[],
  );
  const chassis=str(row.chassis_number)??str(identification.chassis_number)??str(identification.ChassisNumber)??str(vehicleDetails.chassis_number);
  const modelCode=str(row.model_code)??str(identification.model_code)??str(vehicleDetails.model_code);
  const rawHouse=str(row.auction_house)??str(row.auction_name)??str(row.auction_location)??str(identification.auction_house);
  const auctionAt=iso(row.auction_end_at)??iso(row.auction_date)??iso(row.auction_at);
  return {
    providerKey:"vehicle.japan.thecarapi",
    externalLotId:idInfo.id,
    auctionHouse:rawHouse,
    auctionAt,
    status:String(row.is_active===false?"ended":str(row.status)??"open"),
    make,
    model,
    year,
    grade:str(row.auction_grade)??str(row.grade)??str(vehicleDetails.grade),
    odometerKm:int(row.mileage)??int(row.odometer_km)??int(vehicleDetails.mileage),
    startingPriceMinor:start===null?null:Math.round(start),
    currentPriceMinor:current===null?null:Math.round(current),
    currency,
    chassisNumber:chassis,
    modelCode,
    sourceUrl:str(row.offer_link),
    images,
    auctionSheet:jsonObject({
      vehicle_details:vehicleDetails,
      car_identification:identification,
      condition:rec(row.condition),
    }),
    metadata:jsonObject({
      source_site:site,
      provider_contract_version:str(envelope.contract_version)??str(row.contract_version),
      price_semantics:site==="japan"?"opening_bid_not_hammer":"provider_current_price",
      final_price_unverified:site==="japan"&&row.final_price!=null,
      id_precision_unsafe:idInfo.precisionUnsafe,
      raw_status:str(row.status),
    }),
  };
}

function normalizeCarStack(rowValue:unknown):NormalizedAuctionLot|null{
  const row=rec(rowValue);
  const id=str(row.id);
  if(!id)return null;
  const auction=rec(row.auction), price=rec(row.price), specs=rec(row.specs), imagesObj=rec(row.images);
  const current=num(price.current),start=num(price.start)??current;
  return {
    providerKey:"vehicle.japan.carstack",
    externalLotId:id,
    auctionHouse:str(auction.house),
    auctionAt:iso(auction.date),
    status:str(auction.status)??"open",
    make:str(row.make),
    model:str(row.model),
    year:int(row.year),
    grade:str(row.grade),
    odometerKm:int(row.odometer_km),
    startingPriceMinor:start===null?null:Math.round(start),
    currentPriceMinor:current===null?null:Math.round(current),
    currency:(str(price.currency)??"JPY").toUpperCase(),
    chassisNumber:str(row.chassis_number)??str(row.chassis),
    modelCode:str(row.chassis_code)??str(row.model_code),
    sourceUrl:null,
    images:uniqueImages(imagesObj.items,imagesObj.primary_url?[{url:imagesObj.primary_url,kind:"primary"}]:[]),
    auctionSheet:jsonObject({specs}),
    metadata:jsonObject({
      lot_number:str(row.lot_number),
      title:str(row.title),
      image_total:int(imagesObj.total),
      price_semantics:"auction_price_as_supplied",
    }),
  };
}

async function searchTheCarApi(input:AuctionProviderSearch){
  const providerKey:ReadOnlyJapanAuctionProvider="vehicle.japan.thecarapi";
  const key=envRequired(providerKey,"THECARAPI_API_KEY");
  const base=process.env["THECARAPI_BASE_URL"]?.trim()||"https://api.thecarapi.com";
  const url=new URL("/api/search",base);
  url.searchParams.set("site","japan");
  url.searchParams.set("limit",String(Math.min(Math.max(input.limit??24,1),50)));
  url.searchParams.set("page",String(Math.max(input.page??1,1)));
  const search=[input.make,input.model,input.search].filter(Boolean).join(" ").trim();
  if(search)url.searchParams.set("search",search);
  if(input.make)url.searchParams.set("brand",input.make);
  if(input.yearMin)url.searchParams.set("year_from",String(input.yearMin));
  if(input.yearMax)url.searchParams.set("year_to",String(input.yearMax));
  const json=rec(await getJson(url,{"X-API-Key":key}));
  const lots=arr(json.results).map(row=>normalizeTheCarApi(row)).filter((x):x is NormalizedAuctionLot=>!!x);
  return {lots,total:int(json.total),page:int(json.page)??input.page??1,providerKey,requestId:str(json.request_id)};
}

async function detailTheCarApi(externalLotId:string){
  const providerKey:ReadOnlyJapanAuctionProvider="vehicle.japan.thecarapi";
  const key=envRequired(providerKey,"THECARAPI_API_KEY");
  const base=process.env["THECARAPI_BASE_URL"]?.trim()||"https://api.thecarapi.com";
  const url=new URL(`/api/auction/japan/${encodeURIComponent(externalLotId)}`,base);
  const json=await getJson(url,{"X-API-Key":key});
  const lot=normalizeTheCarApi(json,true);
  if(!lot)throw new Error("TheCarApi returned an invalid Japanese auction record");
  return lot;
}

async function searchCarStack(input:AuctionProviderSearch){
  const providerKey:ReadOnlyJapanAuctionProvider="vehicle.japan.carstack";
  const token=envRequired(providerKey,"CARSTACK_API_TOKEN");
  const base=process.env["CARSTACK_BASE_URL"]?.trim()||"https://carstack.dev/v1";
  const url=new URL("vehicles",base.endsWith("/")?base:base+"/");
  url.searchParams.set("per_page",String(Math.min(Math.max(input.limit??24,1),50)));
  url.searchParams.set("page",String(Math.max(input.page??1,1)));
  if(input.make)url.searchParams.append("make",input.make);
  if(input.model)url.searchParams.append("model",input.model);
  if(input.yearMin)url.searchParams.set("year_min",String(input.yearMin));
  if(input.yearMax)url.searchParams.set("year_max",String(input.yearMax));
  if(input.grade)url.searchParams.append("auction_grades",input.grade);
  const json=rec(await getJson(url,{Authorization:`Bearer ${token}`}));
  const lots=arr(json.data).map(row=>normalizeCarStack(row)).filter((x):x is NormalizedAuctionLot=>!!x);
  const meta=rec(json.meta);
  return {lots,total:int(meta.total_count),page:int(meta.page)??input.page??1,providerKey,requestId:null};
}

async function detailCarStack(externalLotId:string){
  const providerKey:ReadOnlyJapanAuctionProvider="vehicle.japan.carstack";
  const token=envRequired(providerKey,"CARSTACK_API_TOKEN");
  const base=process.env["CARSTACK_BASE_URL"]?.trim()||"https://carstack.dev/v1";
  const url=new URL(`vehicles/${encodeURIComponent(externalLotId)}`,base.endsWith("/")?base:base+"/");
  const lot=normalizeCarStack(await getJson(url,{Authorization:`Bearer ${token}`}));
  if(!lot)throw new Error("CarStack returned an invalid Japanese auction record");
  return lot;
}

export async function searchJapanAuctionProvider(providerKey:ReadOnlyJapanAuctionProvider,input:AuctionProviderSearch){
  if(providerKey==="vehicle.japan.thecarapi")return searchTheCarApi(input);
  return searchCarStack(input);
}

export async function getJapanAuctionLot(providerKey:ReadOnlyJapanAuctionProvider,externalLotId:string){
  if(providerKey==="vehicle.japan.thecarapi")return detailTheCarApi(externalLotId);
  return detailCarStack(externalLotId);
}
