import {createClient} from "npm:@supabase/supabase-js@2.110.8";
import {
  auctionProviderReadiness,
  getAuctionProviderLot,
  searchAuctionProvider,
} from "../../../src/modules/automotive/auction-providers.ts";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type,x-oq-timestamp,x-oq-signature",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
};

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
}
function hex(bytes:ArrayBuffer){
  return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function hmac(secret:string,payload:string){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(payload)));
}
function constantTimeEqual(a:string,b:string){
  if(a.length!==b.length)return false;
  let diff=0; for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i); return diff===0;
}
async function verify(req:Request,raw:string){
  const secret=Deno.env.get("OQ_BRIDGE_AUTOHASHI_A")??"";
  if(secret.length<32)return {ok:false,error:"AutoHashi bridge secret is not configured"};
  const timestamp=req.headers.get("x-oq-timestamp")??"";
  const signature=req.headers.get("x-oq-signature")??"";
  const ts=Number(timestamp);
  if(!Number.isFinite(ts)||Math.abs(Date.now()-ts)>5*60*1000)return {ok:false,error:"Bridge timestamp is invalid or expired"};
  const expected=await hmac(secret,timestamp+"."+raw);
  if(!signature||!constantTimeEqual(expected,signature.toLowerCase()))return {ok:false,error:"Bridge signature is invalid"};
  return {ok:true as const};
}
function providerConfig(requested:unknown){
  const wanted=typeof requested==="string"?requested:"auto";
  const theCar=Deno.env.get("THECARAPI_API_KEY")??"";
  const carStack=Deno.env.get("CARSTACK_API_TOKEN")??"";
  if(wanted==="vehicle.auction.thecarapi"){
    if(!theCar)throw new Error("TheCarAPI is not configured");
    return {providerKey:wanted as const,secret:theCar};
  }
  if(wanted==="vehicle.auction.carstack"){
    if(!carStack)throw new Error("CarStack is not configured");
    return {providerKey:wanted as const,secret:carStack};
  }
  if(wanted!=="auto")throw new Error("Unsupported auction read provider");
  if(theCar)return {providerKey:"vehicle.auction.thecarapi" as const,secret:theCar};
  if(carStack)return {providerKey:"vehicle.auction.carstack" as const,secret:carStack};
  throw new Error("No Japanese auction read provider is configured");
}
function serviceDb(){
  const url=Deno.env.get("SUPABASE_URL")??"";
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  if(!url||!key)throw new Error("Omniqora service database is not configured");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function autohashiTenant(){
  const tenantId=Deno.env.get("AUTOHASHI_OMNIQORA_TENANT_ID")??"";
  if(!/^[0-9a-f-]{36}$/i.test(tenantId))throw new Error("AUTOHASHI_OMNIQORA_TENANT_ID is not configured");
  return tenantId;
}
async function importLot(lot:any){
  if(!lot||typeof lot!=="object"||!lot.providerKey||!lot.externalLotId||!lot.make||!lot.model)throw new Error("Normalized auction lot is required");
  const db=serviceDb(),tenantId=autohashiTenant(),productKey="autohashi";
  let vehicle:any=null;
  if(lot.chassisNumber){
    const found=await db.from("automotive_vehicles").select("*").eq("tenant_id",tenantId).eq("product_key",productKey).eq("chassis_number",String(lot.chassisNumber)).limit(1).maybeSingle();
    if(found.error)throw found.error;
    vehicle=found.data;
    if(!vehicle){
      const created=await db.from("automotive_vehicles").insert({
        tenant_id:tenantId,product_key:productKey,origin:"japan",chassis_number:String(lot.chassisNumber),model_code:lot.modelCode??null,
        make:String(lot.make),model:String(lot.model),specification:{year:lot.year??null,grade:lot.grade??null,odometerKm:lot.odometerKm??null},
        provenance:{sourceProvider:lot.providerKey,sourceSite:lot.sourceSite??null,firstExternalLotId:lot.externalLotId},status:"active"
      }).select("*").single();
      if(created.error)throw created.error;vehicle=created.data;
    }
  }
  const saved=await db.from("automotive_auction_lots").upsert({
    tenant_id:tenantId,product_key:productKey,vehicle_id:vehicle?.id??null,provider_key:String(lot.providerKey),external_lot_id:String(lot.externalLotId),
    auction_house:lot.auctionHouse??null,auction_at:lot.auctionAt??null,status:String(lot.status??"open")==="ended"?"ended":"open",
    grade:lot.grade??null,odometer_km:lot.odometerKm??null,starting_price_minor:lot.startingPriceMinor??null,current_price_minor:lot.currentPriceMinor??null,
    currency:lot.currency??"JPY",auction_sheet:{...(lot.auctionSheet??{}),priceSemantics:lot.priceSemantics??"unknown",provenance:lot.provenance??{},
      make:lot.make,model:lot.model,year:lot.year??null,chassisNumber:lot.chassisNumber??null,modelCode:lot.modelCode??null,finalPriceMinor:lot.finalPriceMinor??null},
    images:Array.isArray(lot.images)?lot.images:[],updated_at:new Date().toISOString()
  },{onConflict:"tenant_id,provider_key,external_lot_id"}).select("*").single();
  if(saved.error)throw saved.error;
  const observed=await db.from("automotive_auction_observations").upsert({
    tenant_id:tenantId,product_key:productKey,auction_lot_id:saved.data.id,vehicle_id:vehicle?.id??null,provider_key:String(lot.providerKey),
    external_lot_id:String(lot.externalLotId),source_site:lot.sourceSite??null,source_vehicle_id:lot.sourceVehicleId??null,chassis_number:lot.chassisNumber??null,
    model_code:lot.modelCode??null,make:String(lot.make),model:String(lot.model),model_year:lot.year??null,auction_house:lot.auctionHouse??null,
    auction_at:lot.auctionAt??null,status:String(lot.status??"open"),grade:lot.grade??null,odometer_km:lot.odometerKm??null,
    starting_price_minor:lot.startingPriceMinor??null,current_price_minor:lot.currentPriceMinor??null,final_price_minor:lot.finalPriceMinor??null,
    currency:lot.currency??"JPY",price_semantics:lot.priceSemantics??"unknown",source_ref:String(lot.providerKey)+":"+String(lot.externalLotId),
    observed_at:lot.observedAt??new Date().toISOString()
  },{onConflict:"tenant_id,provider_key,external_lot_id,observed_at"}).select("*").single();
  if(observed.error)throw observed.error;
  let job:any=null;
  if(vehicle?.id){
    const queued=await db.from("intelligence_jobs").insert({
      tenant_id:tenantId,product_key:productKey,job_type:"automotive.auction_assessment",subject_type:"vehicle",subject_id:vehicle.id,
      input:{vehicleId:vehicle.id,auctionLotId:saved.data.id,providerKey:lot.providerKey,externalLotId:lot.externalLotId,
        goals:["auction_sheet_interpretation","provenance","relisting_detection","mileage_consistency","valuation_factors","max_bid_review"]},
      requirements:{service:"omniqora.automotive",visionAllowed:true,reviewRequired:true,noGeolocation:true,failClosedOnMissingProviderEvidence:true}
    }).select("*").single();
    if(queued.error)throw queued.error;job=queued.data;
  }
  return {auctionLotId:saved.data.id,vehicleId:vehicle?.id??null,observationId:observed.data.id,intelligenceJobId:job?.id??null,intelligenceQueued:!!job};
}
async function history(chassisNumber:string,days=90){
  const db=serviceDb(),tenantId=autohashiTenant();
  const since=new Date(Date.now()-Math.min(3650,Math.max(1,days))*86400000).toISOString();
  const result=await db.from("automotive_auction_observations").select("*").eq("tenant_id",tenantId).eq("product_key","autohashi")
    .eq("chassis_number",chassisNumber).gte("observed_at",since).order("observed_at",{ascending:true}).limit(500);
  if(result.error)throw result.error;
  const rows=result.data??[];let previous:number|null=null,mileageRegression=false;
  for(const row of rows){if(typeof row.odometer_km==="number"){if(previous!==null&&row.odometer_km<previous)mileageRegression=true;previous=row.odometer_km;}}
  return {rows,flags:{relisted:rows.length>1,mileageRegression},days};
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const raw=await req.text();
  const verified=await verify(req,raw);
  if(!verified.ok)return json({error:verified.error},401);
  let body:any={};
  try{body=raw?JSON.parse(raw):{};}catch{return json({error:"Invalid JSON"},400);}
  try{
    if(body.action==="health"){
      const readiness=auctionProviderReadiness({
        THECARAPI_API_KEY:Deno.env.get("THECARAPI_API_KEY"),
        CARSTACK_API_TOKEN:Deno.env.get("CARSTACK_API_TOKEN"),
      }).filter(p=>p.stage==="built_read").map(p=>({key:p.key,name:p.name,configured:p.configured,capabilities:p.capabilities}));
      return json({ok:true,executionEnabled:false,intelligenceImportConfigured:!!Deno.env.get("AUTOHASHI_OMNIQORA_TENANT_ID"),providers:readiness});
    }
    if(body.action==="search"){
      const provider=providerConfig(body.providerKey);
      const result=await searchAuctionProvider({providerKey:provider.providerKey,secret:provider.secret,filters:{
        query:body.filters?.query??null,make:body.filters?.make??null,model:body.filters?.model??null,
        yearMin:body.filters?.yearMin??null,yearMax:body.filters?.yearMax??null,odometerMaxKm:body.filters?.odometerMaxKm??null,
        grade:body.filters?.grade??null,steering:body.filters?.steering??"rhd",page:body.filters?.page??1,pageSize:Math.min(50,body.filters?.pageSize??24),
      }});
      return json({ok:true,executionEnabled:false,...result});
    }
    if(body.action==="detail"){
      if(!body.externalLotId)return json({error:"externalLotId is required"},400);
      const provider=providerConfig(body.providerKey);
      const lot=await getAuctionProviderLot({providerKey:provider.providerKey,secret:provider.secret,externalLotId:String(body.externalLotId)});
      return json({ok:true,executionEnabled:false,lot});
    }
    if(body.action==="intelligence.import")return json({ok:true,...await importLot(body.lot)});
    if(body.action==="history"){
      if(!body.chassisNumber)return json({error:"chassisNumber is required"},400);
      return json({ok:true,...await history(String(body.chassisNumber),Number(body.days??90))});
    }
    if(String(body.action??"").startsWith("bid.")){
      return json({error:"Live bid execution is disabled until a contracted Japan execution provider passes certification",executionEnabled:false},501);
    }
    return json({error:"Unsupported action"},400);
  }catch(error){
    return json({error:error instanceof Error?error.message:String(error)},502);
  }
});
