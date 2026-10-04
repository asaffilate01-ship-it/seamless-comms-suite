import {createClient} from "npm:@supabase/supabase-js@2.110.8";
import {calculateJapanUkBidCost} from "../../../src/modules/automotive/landed-cost-v2.ts";
import {
  auctionProviderReadiness,
  compareAuctionLotSamples,
  getAuctionProviderLot,
  searchAuctionProvider,
  searchAuctionProvidersWithFailover,
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
type ReadProvider={providerKey:"vehicle.auction.thecarapi"|"vehicle.auction.carstack";secret:string};
function providerCandidates(requested:unknown):ReadProvider[]{
  const wanted=typeof requested==="string"?requested:"auto";
  const providers:ReadProvider[]=[];
  const theCar=Deno.env.get("THECARAPI_API_KEY")??"";
  const carStack=Deno.env.get("CARSTACK_API_TOKEN")??"";
  if(theCar)providers.push({providerKey:"vehicle.auction.thecarapi",secret:theCar});
  if(carStack)providers.push({providerKey:"vehicle.auction.carstack",secret:carStack});
  if(wanted==="auto"){
    if(!providers.length)throw new Error("No Japanese auction read provider is configured");
    return providers;
  }
  if(wanted!=="vehicle.auction.thecarapi"&&wanted!=="vehicle.auction.carstack")throw new Error("Unsupported auction read provider");
  const match=providers.find(provider=>provider.providerKey===wanted);
  if(!match)throw new Error((wanted==="vehicle.auction.thecarapi"?"TheCarAPI":"CarStack")+" is not configured");
  return [match];
}
function providerConfig(requested:unknown){return providerCandidates(requested)[0];}
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


function actor(body:any){
  const raw=body?.actor??{};
  const userId=typeof raw.userId==="string"?raw.userId:"";
  const roles=Array.isArray(raw.roles)?raw.roles.filter((r:any)=>typeof r==="string"):[];
  if(!userId)throw new Error("Authenticated AutoHashi actor is required");
  return {userId,roles,tenantId:typeof raw.tenantId==="string"?raw.tenantId:null};
}
function isApprovalActor(roles:string[]){
  return roles.some(role=>["super_admin","tenant_admin","finance"].includes(role));
}
function whole(name:string,value:any,min=0){
  const n=Number(value);
  if(!Number.isInteger(n)||n<min)throw new Error(name+" must be an integer >= "+min);
  return n;
}
function positive(name:string,value:any){
  const n=Number(value);
  if(!Number.isFinite(n)||n<=0)throw new Error(name+" must be positive");
  return n;
}
function executionEnabled(){
  return (Deno.env.get("AUTOHASHI_AUCTION_EXECUTION_ENABLED")??"").toLowerCase()==="true";
}
async function bidModel(body:any){
  const db=serviceDb(),tenantId=autohashiTenant(),productKey="autohashi";
  const current=await db.from("automotive_bid_instructions").select("*")
    .eq("tenant_id",tenantId).eq("idempotency_key",String(body.idempotencyKey??"")).maybeSingle();
  if(current.error)throw current.error;
  if(current.data){
    const model=current.data.cost_model_v2_id
      ? await db.from("automotive_bid_cost_models_v2").select("*").eq("tenant_id",tenantId).eq("id",current.data.cost_model_v2_id).single()
      : {data:null,error:null};
    if(model.error)throw model.error;
    return {instruction:current.data,costModel:model.data,reused:true,executionEnabled:executionEnabled()};
  }
  const lotId=String(body.auctionLotId??"");
  if(!lotId)throw new Error("auctionLotId is required");
  const lot=await db.from("automotive_auction_lots").select("*").eq("tenant_id",tenantId).eq("product_key",productKey).eq("id",lotId).single();
  if(lot.error)throw lot.error;
  const cost=body.cost??{};
  const proposed=whole("proposedHammerJpy",body.proposedHammerJpy);
  const input={
    fxJpyPerGbp:positive("fxJpyPerGbp",cost.fxJpyPerGbp),
    fxSource:typeof cost.fxSource==="string"?cost.fxSource:null,
    fxAsOf:typeof cost.fxAsOf==="string"?cost.fxAsOf:null,
    targetRetailGbpMinor:whole("targetRetailGbpMinor",cost.targetRetailGbpMinor),
    targetMarginGbpMinor:whole("targetMarginGbpMinor",cost.targetMarginGbpMinor),
    auctionFeesJpy:whole("auctionFeesJpy",cost.auctionFeesJpy),
    inlandTransportJpy:whole("inlandTransportJpy",cost.inlandTransportJpy),
    freightGbpMinor:whole("freightGbpMinor",cost.freightGbpMinor),
    insuranceGbpMinor:whole("insuranceGbpMinor",cost.insuranceGbpMinor),
    clearanceGbpMinor:whole("clearanceGbpMinor",cost.clearanceGbpMinor),
    complianceGbpMinor:whole("complianceGbpMinor",cost.complianceGbpMinor),
    registrationGbpMinor:whole("registrationGbpMinor",cost.registrationGbpMinor),
    deliveryGbpMinor:whole("deliveryGbpMinor",cost.deliveryGbpMinor),
    otherGbpMinor:whole("otherGbpMinor",cost.otherGbpMinor),
    dutyRateBps:whole("dutyRateBps",cost.dutyRateBps),
    taxRateBps:whole("taxRateBps",cost.taxRateBps),
    proposedHammerJpy:proposed,
  };
  const calculation=calculateJapanUkBidCost(input);
  if(proposed>calculation.maxHammerJpy)throw new Error("Proposed hammer bid exceeds the calculated reviewed maximum");
  const externalReference=typeof body.externalReference==="string"?body.externalReference:null;
  if(externalReference){
    const prior=await db.from("automotive_bid_instructions").select("id,cost_model_v2_id").eq("tenant_id",tenantId)
      .eq("external_reference",externalReference).eq("status","draft").is("customer_authorised_at",null);
    if(prior.error)throw prior.error;
    const priorRows=prior.data??[];
    if(priorRows.length){
      const cancelled=await db.from("automotive_bid_instructions").update({status:"cancelled",updated_at:new Date().toISOString()})
        .eq("tenant_id",tenantId).eq("external_reference",externalReference).eq("status","draft").is("customer_authorised_at",null);
      if(cancelled.error)throw cancelled.error;
      const modelIds=priorRows.map((row:any)=>row.cost_model_v2_id).filter(Boolean);
      if(modelIds.length){
        const superseded=await db.from("automotive_bid_cost_models_v2").update({status:"superseded"}).eq("tenant_id",tenantId).in("id",modelIds);
        if(superseded.error)throw superseded.error;
      }
    }
  }
  const insertedModel=await db.from("automotive_bid_cost_models_v2").insert({
    tenant_id:tenantId,product_key:productKey,auction_lot_id:lotId,destination_country:"GB",
    fx_jpy_per_gbp:input.fxJpyPerGbp,fx_source:input.fxSource,fx_as_of:input.fxAsOf,
    target_retail_gbp_minor:input.targetRetailGbpMinor,target_margin_gbp_minor:input.targetMarginGbpMinor,
    auction_fees_jpy:input.auctionFeesJpy,inland_transport_jpy:input.inlandTransportJpy,
    freight_gbp_minor:input.freightGbpMinor,insurance_gbp_minor:input.insuranceGbpMinor,clearance_gbp_minor:input.clearanceGbpMinor,
    compliance_gbp_minor:input.complianceGbpMinor,registration_gbp_minor:input.registrationGbpMinor,delivery_gbp_minor:input.deliveryGbpMinor,
    other_gbp_minor:input.otherGbpMinor,duty_rate_bps:input.dutyRateBps,tax_rate_bps:input.taxRateBps,proposed_hammer_jpy:proposed,
    max_hammer_jpy:calculation.maxHammerJpy,estimated_landed_gbp_minor:calculation.proposedLandedGbpMinor,
    estimated_gross_margin_gbp_minor:calculation.proposedGrossMarginGbpMinor,calculation,
    assumptions:{...calculation.assumptions,rateInputsUserReviewed:true},status:"review"
  }).select("*").single();
  if(insertedModel.error)throw insertedModel.error;
  const idempotencyKey=String(body.idempotencyKey??"");
  if(idempotencyKey.length<12)throw new Error("idempotencyKey must be at least 12 characters");
  const expiresAt=typeof body.expiresAt==="string"?body.expiresAt:null;
  const instruction=await db.from("automotive_bid_instructions").insert({
    tenant_id:tenantId,product_key:productKey,auction_lot_id:lotId,bid_model_id:null,cost_model_v2_id:insertedModel.data.id,
    execution_provider_key:"vehicle.auction.agent",max_bid_minor:proposed,currency:"JPY",status:"draft",
    external_reference:externalReference,idempotency_key:idempotencyKey,
    expires_at:expiresAt,result_payload:{reviewedMaxHammerJpy:calculation.maxHammerJpy}
  }).select("*").single();
  if(instruction.error)throw instruction.error;
  return {instruction:instruction.data,costModel:insertedModel.data,calculation,reused:false,executionEnabled:executionEnabled()};
}
async function customerAuthorise(body:any){
  const who=actor(body),db=serviceDb(),tenantId=autohashiTenant();
  const instructionId=String(body.instructionId??"");
  const current=await db.from("automotive_bid_instructions").select("*").eq("tenant_id",tenantId).eq("id",instructionId).single();
  if(current.error)throw current.error;
  if(current.data.status!=="draft")throw new Error("Only a draft bid can receive customer authorisation");
  if(current.data.customer_authorised_at)return current.data;
  if(current.data.expires_at&&new Date(current.data.expires_at).getTime()<=Date.now())throw new Error("Bid instruction has expired");
  const acknowledged=whole("acknowledgedMaxBidJpy",body.acknowledgedMaxBidJpy);
  if(acknowledged!==Number(current.data.max_bid_minor))throw new Error("Acknowledged maximum bid does not match the reviewed bid");
  const termsVersion=String(body.termsVersion??"");
  if(termsVersion.length<3)throw new Error("termsVersion is required");
  const updated=await db.from("automotive_bid_instructions").update({
    customer_actor_ref:"autohashi:user:"+who.userId,customer_authorised_at:new Date().toISOString(),
    customer_authorisation:{termsVersion,acknowledgedMaxBidJpy:acknowledged,acknowledgements:body.acknowledgements??{},actorRoles:who.roles},
    updated_at:new Date().toISOString()
  }).eq("tenant_id",tenantId).eq("id",instructionId).select("*").single();
  if(updated.error)throw updated.error;
  return updated.data;
}
async function adminAuthorise(body:any){
  const who=actor(body);
  if(!isApprovalActor(who.roles))throw new Error("Admin/finance approval role is required");
  const db=serviceDb(),tenantId=autohashiTenant(),instructionId=String(body.instructionId??"");
  const current=await db.from("automotive_bid_instructions").select("*").eq("tenant_id",tenantId).eq("id",instructionId).single();
  if(current.error)throw current.error;
  if(current.data.status!=="draft")throw new Error("Only a draft bid can be authorised");
  if(!current.data.customer_authorised_at)throw new Error("Customer authorisation is required before admin approval");
  if(current.data.expires_at&&new Date(current.data.expires_at).getTime()<=Date.now())throw new Error("Bid instruction has expired");
  const now=new Date().toISOString();
  if(current.data.cost_model_v2_id){
    const model=await db.from("automotive_bid_cost_models_v2").update({status:"approved",reviewed_actor_ref:"autohashi:user:"+who.userId,reviewed_at:now})
      .eq("tenant_id",tenantId).eq("id",current.data.cost_model_v2_id);
    if(model.error)throw model.error;
  }
  const updated=await db.from("automotive_bid_instructions").update({
    status:"authorised",authorised_actor_ref:"autohashi:user:"+who.userId,authorised_at:now,
    admin_approval_note:typeof body.note==="string"?body.note:null,updated_at:now
  }).eq("tenant_id",tenantId).eq("id",instructionId).select("*").single();
  if(updated.error)throw updated.error;
  return {...updated.data,executionEnabled:executionEnabled()};
}
async function bidStatus(body:any){
  const db=serviceDb(),tenantId=autohashiTenant(),instructionId=String(body.instructionId??"");
  const instruction=await db.from("automotive_bid_instructions").select("*").eq("tenant_id",tenantId).eq("id",instructionId).single();
  if(instruction.error)throw instruction.error;
  const [model,lot,events]=await Promise.all([
    instruction.data.cost_model_v2_id?db.from("automotive_bid_cost_models_v2").select("*").eq("tenant_id",tenantId).eq("id",instruction.data.cost_model_v2_id).maybeSingle():Promise.resolve({data:null,error:null}),
    db.from("automotive_auction_lots").select("*").eq("tenant_id",tenantId).eq("id",instruction.data.auction_lot_id).maybeSingle(),
    db.from("automotive_bid_provider_events").select("*").eq("tenant_id",tenantId).eq("bid_instruction_id",instructionId).order("received_at",{ascending:false}).limit(100)
  ]);
  if(model.error)throw model.error;if(lot.error)throw lot.error;if(events.error)throw events.error;
  return {instruction:instruction.data,costModel:model.data,auctionLot:lot.data,events:events.data??[],executionEnabled:executionEnabled()};
}
async function submitBid(body:any){
  const who=actor(body);
  if(!isApprovalActor(who.roles))throw new Error("Admin/finance approval role is required");
  if(!executionEnabled())throw new Error("Live auction execution is disabled");
  const baseUrl=(Deno.env.get("AUTOHASHI_AUCTION_AGENT_URL")??"").replace(/\/$/,"");
  const token=Deno.env.get("AUTOHASHI_AUCTION_AGENT_TOKEN")??"";
  const callbackBase=(Deno.env.get("OMNIQORA_PUBLIC_URL")??"").replace(/\/$/,"");
  if(!baseUrl||!token||!callbackBase)throw new Error("Auction execution provider is not fully configured");
  const db=serviceDb(),tenantId=autohashiTenant(),instructionId=String(body.instructionId??"");
  const current=await db.from("automotive_bid_instructions").select("*").eq("tenant_id",tenantId).eq("id",instructionId).single();
  if(current.error)throw current.error;
  if(!["authorised","error"].includes(current.data.status))throw new Error("Bid must be admin-authorised before submission");
  if(!current.data.customer_authorised_at||!current.data.authorised_at)throw new Error("Required authorisations are incomplete");
  if(current.data.expires_at&&new Date(current.data.expires_at).getTime()<=Date.now())throw new Error("Bid instruction has expired");
  const lot=await db.from("automotive_auction_lots").select("*").eq("tenant_id",tenantId).eq("id",current.data.auction_lot_id).single();
  if(lot.error)throw lot.error;
  const payload={
    idempotency_key:current.data.idempotency_key,instruction_id:current.data.id,provider_lot_id:lot.data.external_lot_id,
    auction_house:lot.data.auction_house,auction_date:lot.data.auction_at,max_bid_jpy:Number(current.data.max_bid_minor),
    customer_authorised_at:current.data.customer_authorised_at,autohashi_reference:current.data.external_reference,
    callback_url:callbackBase+"/functions/v1/automotive-auction-agent-webhook"
  };
  const attempt=Number(current.data.submission_attempts??0)+1,now=new Date().toISOString();
  try{
    const response=await fetch(baseUrl+"/v1/bids",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json","Idempotency-Key":current.data.idempotency_key},body:JSON.stringify(payload)});
    const raw=await response.text();let result:any={};
    try{result=raw?JSON.parse(raw):{};}catch{result={message:raw.slice(0,1000)}}
    const providerStatus=String(result.status??(response.ok?"accepted":"rejected")).toLowerCase();
    const acceptedMax=result.max_bid_jpy==null?Number(current.data.max_bid_minor):Number(result.max_bid_jpy);
    if(!Number.isFinite(acceptedMax)||acceptedMax>Number(current.data.max_bid_minor)){
      const violated=await db.from("automotive_bid_instructions").update({
        status:"error",limit_violation:true,last_error:"Execution provider acknowledged a bid ceiling above the authorised maximum",
        result_payload:{...current.data.result_payload,submissionResponse:result},submission_attempts:attempt,last_provider_status_at:now,updated_at:now
      }).eq("tenant_id",tenantId).eq("id",instructionId).select("*").single();
      if(violated.error)throw violated.error;
      throw new Error("Execution provider maximum-bid safety violation");
    }
    const nextStatus=response.ok&&providerStatus==="accepted"?"accepted":response.ok?"submitted":"rejected";
    const updated=await db.from("automotive_bid_instructions").update({
      status:nextStatus,provider_reference:typeof result.provider_reference==="string"?result.provider_reference:current.data.provider_reference,
      submitted_at:current.data.submitted_at??now,result_payload:{...current.data.result_payload,submissionResponse:result},
      submission_attempts:attempt,last_provider_status_at:now,last_error:response.ok?null:String(result.reason??result.message??"Provider rejected bid"),
      updated_at:now
    }).eq("tenant_id",tenantId).eq("id",instructionId).select("*").single();
    if(updated.error)throw updated.error;
    if(!response.ok)throw new Error(updated.data.last_error||"Auction execution provider rejected bid");
    return updated.data;
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    if(!message.includes("safety violation")){
      await db.from("automotive_bid_instructions").update({
        status:"error",submission_attempts:attempt,last_error:message,last_provider_status_at:now,updated_at:now
      }).eq("tenant_id",tenantId).eq("id",instructionId);
    }
    throw error;
  }
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
      return json({ok:true,executionEnabled:executionEnabled(),executionConfigured:!!Deno.env.get("AUTOHASHI_AUCTION_AGENT_URL")&&!!Deno.env.get("AUTOHASHI_AUCTION_AGENT_TOKEN"),intelligenceImportConfigured:!!Deno.env.get("AUTOHASHI_OMNIQORA_TENANT_ID"),providers:readiness});
    }
    if(body.action==="search"){
      const candidates=providerCandidates(body.providerKey);
      const filters={
        query:body.filters?.query??null,make:body.filters?.make??null,model:body.filters?.model??null,
        yearMin:body.filters?.yearMin??null,yearMax:body.filters?.yearMax??null,odometerMaxKm:body.filters?.odometerMaxKm??null,
        grade:body.filters?.grade??null,steering:body.filters?.steering??"rhd",page:body.filters?.page??1,pageSize:Math.min(50,body.filters?.pageSize??24),
      };
      const result=body.providerKey==="auto"||!body.providerKey
        ? await searchAuctionProvidersWithFailover({candidates,filters})
        : await searchAuctionProvider({providerKey:candidates[0].providerKey,secret:candidates[0].secret,filters});
      return json({ok:true,executionEnabled:false,...result});
    }
    if(body.action==="compare"){
      const candidates=providerCandidates("auto");
      const theCar=candidates.find(p=>p.providerKey==="vehicle.auction.thecarapi"),carStack=candidates.find(p=>p.providerKey==="vehicle.auction.carstack");
      if(!theCar||!carStack)return json({error:"Comparison requires both TheCarAPI and CarStack credentials"},409);
      const sampleSize=Math.min(500,Math.max(100,Number(body.sampleSize??200)));
      const filters={query:body.filters?.query??null,make:body.filters?.make??null,model:body.filters?.model??null,
        yearMin:body.filters?.yearMin??null,yearMax:body.filters?.yearMax??null,odometerMaxKm:body.filters?.odometerMaxKm??null,
        grade:body.filters?.grade??null,steering:body.filters?.steering??"rhd"};
      async function collect(provider:ReadProvider){
        const lots:any[]=[];const started=Date.now();let page=1,totalPages:number|null=null;
        while(lots.length<sampleSize){
          const result=await searchAuctionProvider({providerKey:provider.providerKey,secret:provider.secret,filters:{...filters,page,pageSize:Math.min(50,sampleSize-lots.length)}});
          lots.push(...result.lots);totalPages=result.totalPages;
          if(!result.lots.length||(totalPages!==null&&page>=totalPages))break;page++;
        }
        return {lots:lots.slice(0,sampleSize),latencyMs:Date.now()-started,pagesRead:page};
      }
      const a=await collect(theCar),b=await collect(carStack);
      return json({ok:true,requestedSampleSize:sampleSize,collected:{thecarapi:a.lots.length,carstack:b.lots.length},
        latencyMs:{thecarapi:a.latencyMs,carstack:b.latencyMs},pagesRead:{thecarapi:a.pagesRead,carstack:b.pagesRead},
        comparison:compareAuctionLotSamples(a.lots,b.lots),
        note:"Comparison reports coverage and overlap only; Japanese opening/current prices are not treated as verified hammer prices."});
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
    if(body.action==="bid.model")return json({ok:true,...await bidModel(body)});
    if(body.action==="bid.customer_authorise")return json({ok:true,instruction:await customerAuthorise(body),executionEnabled:executionEnabled()});
    if(body.action==="bid.admin_authorise")return json({ok:true,instruction:await adminAuthorise(body),executionEnabled:executionEnabled()});
    if(body.action==="bid.status")return json({ok:true,...await bidStatus(body)});
    if(body.action==="bid.submit")return json({ok:true,instruction:await submitBid(body),executionEnabled:executionEnabled()});
    return json({error:"Unsupported action"},400);
  }catch(error){
    return json({error:error instanceof Error?error.message:String(error)},502);
  }
});
