import {z} from "zod";
import {
  authoriseServiceScope,
  parseServiceAuthorization,
  verifyServiceSecret,
  type ServiceCredentialRecord,
} from "@/modules/platform/service-identity";

const point=z.record(z.string(),z.unknown());

const base=z.object({
  tenantId:z.string().uuid(),
  productKey:z.string().min(2).max(80),
});

const schema=z.discriminatedUnion("operation",[
  base.extend({
    operation:z.literal("quote.request"),
    locationId:z.string().uuid().nullable().optional(),
    externalOrderRef:z.string().min(1).max(200),
    pickup:point,
    dropoff:point,
    readyAt:z.string().datetime().nullable().optional(),
    orderValueMinor:z.number().int().nonnegative().default(0),
    currency:z.string().min(3).max(3).default("GBP"),
    metadata:z.record(z.string(),z.unknown()).default({}),
  }),
  base.extend({
    operation:z.literal("quote.execute"),
    requestId:z.string().uuid(),
  }),
  base.extend({
    operation:z.literal("route.select"),
    requestId:z.string().uuid(),
  }),
  base.extend({
    operation:z.literal("book.execute"),
    requestId:z.string().uuid(),
  }),
  base.extend({
    operation:z.literal("request.get"),
    requestId:z.string().uuid(),
  }),
  base.extend({
    operation:z.literal("job.get"),
    requestId:z.string().uuid(),
  }),
]);

function reply(body:unknown,status=200){
  return Response.json(body,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});
}

function asObject(value:unknown){
  return value&&typeof value==="object"&&!Array.isArray(value)
    ?value as Record<string,unknown>
    :{};
}

function number(value:unknown,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

async function authenticate(request:Request){
  const{keyId,secret}=parseServiceAuthorization(request.headers.get("authorization"));
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const db=supabaseAdmin as any;
  const{data:row,error}=await db.from("platform_service_credentials")
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
    id:row.id,keyId:row.key_id,secretHash:row.secret_hash,status:row.status,
    expiresAt:row.expires_at,scopes,
  };
  return{db,credential};
}

async function assertProduct(db:any,tenantId:string,productKey:string){
  const{data,error}=await db.from("tenant_products").select("status")
    .eq("tenant_id",tenantId).eq("product_key",productKey).maybeSingle();
  if(error||!data||data.status!=="active")throw new Error("Active tenant product required");
}

async function connectorRequest(baseUrl:string,token:string,path:string,body:unknown){
  const response=await fetch(baseUrl.replace(/\/$/,"")+path,{
    method:"POST",
    headers:{"content-type":"application/json","authorization":"Bearer "+token},
    body:JSON.stringify(body),
    signal:AbortSignal.timeout(10_000),
  });
  const text=await response.text();
  let payload:Record<string,unknown>={};
  if(text){
    try{payload=JSON.parse(text) as Record<string,unknown>}
    catch{payload={raw:text}}
  }
  if(!response.ok)throw new Error(String(payload["error"]??payload["message"]??("connector_http_"+response.status)));
  return payload;
}

function envToken(handle:unknown){
  const key=String(handle??"").trim();
  if(!/^[A-Z0-9_]{3,120}$/.test(key))return"";
  return String(process.env[key]??"").trim();
}

async function loadRequest(db:any,tenantId:string,productKey:string,requestId:string){
  const{data,error}=await db.from("delivery_quote_requests")
    .select("*").eq("id",requestId).eq("tenant_id",tenantId).eq("product_key",productKey).maybeSingle();
  if(error)throw new Error(error.message);
  if(!data)throw new Error("Delivery quote request not found");
  return data;
}

async function executeQuotes(db:any,input:{tenantId:string;productKey:string;requestId:string}){
  const req=await loadRequest(db,input.tenantId,input.productKey,input.requestId);
  const{data:accounts,error}=await db.from("delivery_provider_accounts")
    .select("*")
    .eq("tenant_id",input.tenantId)
    .eq("product_key",input.productKey)
    .eq("enabled",true);
  if(error)throw new Error(error.message);

  const candidates=(accounts??[]).filter((row:any)=>
    row.location_id==null||req.location_id==null||row.location_id===req.location_id
  );
  if(!candidates.length)throw new Error("No delivery provider account configured");

  await db.from("delivery_quote_requests")
    .update({status:"quoting",updated_at:new Date().toISOString()})
    .eq("id",req.id);

  const outcomes=await Promise.allSettled(candidates.map(async(account:any)=>{
    const provider=String(account.provider_key);
    const settings=asObject(account.settings);

    if(provider==="own_fleet"){
      const pickup=asObject(req.pickup);
      const dropoff=asObject(req.dropoff);
      const pickupLat=number(pickup["lat"]??pickup["latitude"],NaN);
      const pickupLng=number(pickup["lng"]??pickup["longitude"],NaN);
      const dropLat=number(dropoff["lat"]??dropoff["latitude"],NaN);
      const dropLng=number(dropoff["lng"]??dropoff["longitude"],NaN);
      const coordsReady=[pickupLat,pickupLng,dropLat,dropLng].every(Number.isFinite);
      if(!coordsReady)return null;

      const{count}=await db.from("dispatch_agents")
        .select("id",{count:"exact",head:true})
        .eq("tenant_id",input.tenantId)
        .eq("product_key",input.productKey)
        .eq("status","available");

      const available=(count??0)>0||settings["allowWithoutAvailableAgent"]===true;
      if(!available)return null;

      const price=Math.max(0,Math.round(number(settings["effectiveCostMinor"],0)));
      const pickupEta=Math.max(0,Math.round(number(settings["pickupEtaMinutes"],10)));
      const deliveryEta=Math.max(pickupEta,Math.round(number(settings["deliveryEtaMinutes"],30)));
      const quoteRef="own:"+req.id+":"+Date.now();

      const{data,error:quoteError}=await db.rpc("server_record_delivery_quote",{
        _request:req.id,
        _provider_account:account.id,
        _provider:provider,
        _quote_ref:quoteRef,
        _price:price,
        _pickup_eta:pickupEta,
        _delivery_eta:deliveryEta,
        _expires_at:new Date(Date.now()+5*60_000).toISOString(),
        _available:true,
        _raw:{availableDrivers:count??0},
      });
      if(quoteError)throw new Error(quoteError.message);
      return data;
    }

    const baseUrl=String(settings["connectorBaseUrl"]??"").trim();
    const token=envToken(account.credential_handle);
    if(!baseUrl||!token)return null;
    const payload=await connectorRequest(baseUrl,token,"/quote",{
      provider,
      request:{
        pickup:req.pickup,
        dropoff:req.dropoff,
        readyAt:req.ready_at,
        orderValueMinor:req.order_value_minor,
        currency:req.currency,
      },
    });
    if(payload["available"]===false)return null;
    const quoteRef=String(payload["quoteRef"]??"");
    if(!quoteRef)return null;
    const price=Math.max(0,Math.round(number(payload["priceMinor"]??payload["pricePence"],0)));
    const pickupEta=Math.max(0,Math.round(number(payload["pickupEtaMinutes"],0)));
    const deliveryEta=Math.max(0,Math.round(number(payload["deliveryEtaMinutes"],0)));
    const expiresAt=typeof payload["expiresAt"]==="string"?payload["expiresAt"]:null;

    const{data,error:quoteError}=await db.rpc("server_record_delivery_quote",{
      _request:req.id,
      _provider_account:account.id,
      _provider:provider,
      _quote_ref:quoteRef,
      _price:price,
      _pickup_eta:pickupEta,
      _delivery_eta:deliveryEta,
      _expires_at:expiresAt,
      _available:true,
      _raw:payload,
    });
    if(quoteError)throw new Error(quoteError.message);
    return data;
  }));

  const succeeded=outcomes.filter(row=>row.status==="fulfilled"&&row.value).length;
  if(!succeeded)throw new Error("No delivery provider returned a quote");

  const{data:selected,error:selectError}=await db.rpc("delivery_select_best_quote",{_request:req.id});
  if(selectError)throw new Error(selectError.message);
  const{data:quote,error:quoteError}=await db.from("delivery_quotes")
    .select("id,provider_key,provider_quote_ref,price_minor,pickup_eta_minutes,delivery_eta_minutes,expires_at,score")
    .eq("id",selected).single();
  if(quoteError)throw new Error(quoteError.message);
  return{requestId:req.id,quoteCount:succeeded,selectedQuote:quote};
}

async function executeBooking(db:any,input:{tenantId:string;productKey:string;requestId:string}){
  const req=await loadRequest(db,input.tenantId,input.productKey,input.requestId);
  let quoteId=req.selected_quote_id as string|null;
  if(!quoteId){
    const{data,error}=await db.rpc("delivery_select_best_quote",{_request:req.id});
    if(error)throw new Error(error.message);
    quoteId=String(data);
  }
  const{data:quote,error:quoteError}=await db.from("delivery_quotes")
    .select("*").eq("id",quoteId).single();
  if(quoteError)throw new Error(quoteError.message);
  const{data:account,error:accountError}=await db.from("delivery_provider_accounts")
    .select("*").eq("id",quote.provider_account_id).maybeSingle();
  if(accountError)throw new Error(accountError.message);
  if(!account)throw new Error("Delivery provider account not found");

  const provider=String(quote.provider_key);
  let externalRef="";
  let trackingUrl:string|null=null;
  let dispatchJobId:string|null=null;
  let courier:Record<string,unknown>={};

  if(provider==="own_fleet"){
    const pickup=asObject(req.pickup);
    const dropoff=asObject(req.dropoff);
    const pickupLat=number(pickup["lat"]??pickup["latitude"],NaN);
    const pickupLng=number(pickup["lng"]??pickup["longitude"],NaN);
    const dropLat=number(dropoff["lat"]??dropoff["latitude"],NaN);
    const dropLng=number(dropoff["lng"]??dropoff["longitude"],NaN);
    if(![pickupLat,pickupLng,dropLat,dropLng].every(Number.isFinite)){
      throw new Error("Own-fleet delivery requires pickup/dropoff coordinates");
    }

    const{data:agent,error:agentError}=await db.from("dispatch_agents")
      .select("id,name,phone")
      .eq("tenant_id",input.tenantId)
      .eq("product_key",input.productKey)
      .eq("status","available")
      .order("updated_at",{ascending:false})
      .limit(1)
      .maybeSingle();
    if(agentError)throw new Error(agentError.message);
    if(!agent)throw new Error("No own-fleet driver available");

    const job=await db.from("dispatch_jobs").insert({
      tenant_id:input.tenantId,
      product_key:input.productKey,
      location_id:req.location_id,
      job_type:"delivery",
      status:"assigned",
      priority:"normal",
      external_ref:req.external_order_ref,
      assigned_agent_id:agent.id,
      metadata:{deliveryBrokerRequestId:req.id},
    }).select("id").single();
    if(job.error||!job.data)throw new Error(job.error?.message??"Dispatch job could not be created");
    dispatchJobId=job.data.id;
    await db.from("dispatch_job_stops").insert([
      {
        job_id:dispatchJobId,tenant_id:input.tenantId,position:0,stop_kind:"pickup",
        latitude:pickupLat,longitude:pickupLng,address:String(pickup["address"]??""),
        contact_name:String(pickup["contactName"]??""),contact_phone:String(pickup["contactPhone"]??""),
        instructions:String(pickup["instructions"]??""),
      },
      {
        job_id:dispatchJobId,tenant_id:input.tenantId,position:1,stop_kind:"dropoff",
        latitude:dropLat,longitude:dropLng,address:String(dropoff["address"]??""),
        contact_name:String(dropoff["contactName"]??""),contact_phone:String(dropoff["contactPhone"]??""),
        instructions:String(dropoff["instructions"]??""),
      },
    ]);
    await db.from("dispatch_agents").update({status:"busy",updated_at:new Date().toISOString()}).eq("id",agent.id);
    externalRef=String(dispatchJobId);
    courier={agentId:agent.id,name:agent.name,phone:agent.phone};
  }else{
    const settings=asObject(account.settings);
    const baseUrl=String(settings["connectorBaseUrl"]??"").trim();
    const token=envToken(account.credential_handle);
    if(!baseUrl||!token)throw new Error("Delivery connector is not configured");
    const payload=await connectorRequest(baseUrl,token,"/deliveries",{
      provider,
      quoteRef:quote.provider_quote_ref,
      orderRef:req.external_order_ref,
      requestId:req.id,
    });
    externalRef=String(payload["deliveryRef"]??"");
    if(!externalRef)throw new Error("Delivery connector reference missing");
    trackingUrl=typeof payload["trackingUrl"]==="string"?payload["trackingUrl"]:null;
    courier=asObject(payload["courier"]);
  }

  const{data:jobId,error:jobError}=await db.rpc("server_upsert_delivery_broker_job",{
    _request:req.id,
    _quote:quote.id,
    _provider_account:account.id,
    _provider:provider,
    _external_delivery_ref:externalRef,
    _dispatch_job:dispatchJobId,
    _status:provider==="own_fleet"?"driver_assigned":"accepted",
    _price:quote.price_minor,
    _currency:req.currency,
    _tracking_url:trackingUrl,
    _courier:courier,
    _metadata:{bookedBy:"omniqora.delivery-broker"},
  });
  if(jobError)throw new Error(jobError.message);

  return{
    jobId,
    provider,
    deliveryRef:externalRef,
    trackingUrl,
    priceMinor:Number(quote.price_minor),
    currency:String(req.currency),
  };
}

export async function serveDeliveryBroker(request:Request){
  try{
    const raw=await request.text();
    if(raw.length>262144)return reply({error:"Payload too large"},413);
    let value:unknown;
    try{value=JSON.parse(raw)}catch{return reply({error:"Invalid JSON"},400)}
    const input=schema.parse(value);
    const{db,credential}=await authenticate(request);

    const capability=
      input.operation==="quote.request"||input.operation==="quote.execute"
        ?"delivery.quote"
        :input.operation==="route.select"
          ?"delivery.route"
          :input.operation==="book.execute"
            ?"delivery.book"
            :"delivery.read";

    authoriseServiceScope(credential,{
      tenantId:input.tenantId,
      productKey:input.productKey,
      locationId:"locationId" in input?input.locationId:undefined,
      capability,
    });
    await assertProduct(db,input.tenantId,input.productKey);

    if(input.operation==="quote.request"){
      const{data,error}=await db.rpc("delivery_create_quote_request",{
        _tenant:input.tenantId,
        _product:input.productKey,
        _location:input.locationId??null,
        _external_order_ref:input.externalOrderRef,
        _pickup:input.pickup,
        _dropoff:input.dropoff,
        _ready_at:input.readyAt??null,
        _order_value_minor:input.orderValueMinor,
        _currency:input.currency.toUpperCase(),
        _metadata:input.metadata,
      });
      if(error)throw new Error(error.message);
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply({requestId:data,status:"pending"},201);
    }

    if(input.operation==="quote.execute"){
      const result=await executeQuotes(db,input);
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply(result);
    }

    if(input.operation==="route.select"){
      const req=await loadRequest(db,input.tenantId,input.productKey,input.requestId);
      const{data,error}=await db.rpc("delivery_select_best_quote",{_request:input.requestId});
      if(error)throw new Error(error.message);
      const{data:quote,error:quoteError}=await db.from("delivery_quotes")
        .select("id,provider_key,provider_quote_ref,price_minor,pickup_eta_minutes,delivery_eta_minutes,expires_at,score")
        .eq("id",data).single();
      if(quoteError)throw new Error(quoteError.message);
      return reply({requestId:req.id,selectedQuote:quote});
    }

    if(input.operation==="book.execute"){
      const result=await executeBooking(db,input);
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply(result,201);
    }

    if(input.operation==="request.get"){
      const{data,error}=await db.from("delivery_quote_requests")
        .select("id,tenant_id,product_key,location_id,external_order_ref,status,selected_quote_id,ready_at,order_value_minor,currency,created_at,updated_at")
        .eq("id",input.requestId).eq("tenant_id",input.tenantId).eq("product_key",input.productKey).maybeSingle();
      if(error)throw new Error(error.message);
      if(!data)return reply({error:"Delivery quote request not found"},404);
      const{data:quotes,error:quotesError}=await db.from("delivery_quotes")
        .select("id,provider_key,price_minor,pickup_eta_minutes,delivery_eta_minutes,expires_at,available,selected,score")
        .eq("request_id",input.requestId).order("price_minor");
      if(quotesError)throw new Error(quotesError.message);
      return reply({request:data,quotes:quotes??[]});
    }

    const{data,error}=await db.from("delivery_broker_jobs")
      .select("id,request_id,provider_key,status,price_minor,currency,tracking_url,courier,picked_up_at,delivered_at,updated_at")
      .eq("request_id",input.requestId).eq("tenant_id",input.tenantId).eq("product_key",input.productKey).maybeSingle();
    if(error)throw new Error(error.message);
    return data?reply({job:data}):reply({job:null},404);
  }catch(error){
    if(error instanceof z.ZodError)return reply({error:"Invalid delivery broker contract"},422);
    const message=error instanceof Error?error.message:"Delivery broker refused";
    if(/credential|scope|authorization|expired|active tenant product/i.test(message))return reply({error:message},403);
    if(/not found/i.test(message))return reply({error:message},404);
    return reply({error:message},503);
  }
}
