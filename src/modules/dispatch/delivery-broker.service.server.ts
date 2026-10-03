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
    operation:z.literal("route.select"),
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

export async function serveDeliveryBroker(request:Request){
  try{
    const raw=await request.text();
    if(raw.length>262144)return reply({error:"Payload too large"},413);
    let value:unknown;
    try{value=JSON.parse(raw)}catch{return reply({error:"Invalid JSON"},400)}
    const input=schema.parse(value);
    const{db,credential}=await authenticate(request);

    const capability=input.operation==="quote.request"
      ?"delivery.quote"
      :input.operation==="route.select"
        ?"delivery.route"
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

    if(input.operation==="route.select"){
      const{data:requestRow,error:requestError}=await db.from("delivery_quote_requests")
        .select("tenant_id,product_key,status").eq("id",input.requestId).maybeSingle();
      if(requestError||!requestRow||requestRow.tenant_id!==input.tenantId||requestRow.product_key!==input.productKey){
        throw new Error("Delivery quote request not found");
      }
      const{data,error}=await db.rpc("delivery_select_best_quote",{_request:input.requestId});
      if(error)throw new Error(error.message);
      const{data:quote,error:quoteError}=await db.from("delivery_quotes")
        .select("id,provider_key,provider_quote_ref,price_minor,pickup_eta_minutes,delivery_eta_minutes,expires_at,score")
        .eq("id",data).single();
      if(quoteError)throw new Error(quoteError.message);
      return reply({selectedQuote:quote});
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
