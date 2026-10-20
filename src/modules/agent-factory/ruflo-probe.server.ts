import {z,ZodError} from "zod";
import {
 authoriseServiceScope,parseServiceAuthorization,verifyServiceSecret,
 type ServiceCredentialRecord,
} from "@/modules/platform/service-identity";

const identity=z.object({
 tenantId:z.string().uuid(),
 productKey:z.string().regex(/^[a-z0-9][a-z0-9.-]{1,80}$/),
 region:z.string().regex(/^[A-Z]{2}$/),
}).strict();
const uuid=z.string().uuid();
const report=z.enum(["passed","failed","timed_out","denied"]);
const failure=z.enum(["policy_denied","protocol_error","timeout","probe_error","lease_expired"]);
const requestSchema=z.discriminatedUnion("operation",[
 identity.extend({operation:z.literal("probe.claim")}),
 identity.extend({operation:z.literal("probe.preflight"),taskId:uuid,claimToken:uuid}),
 identity.extend({
  operation:z.literal("probe.finish"),taskId:uuid,claimToken:uuid,
  result:report,receiptRef:z.string().min(8).max(160).regex(/^[A-Za-z0-9_-]+$/),
  errorCode:failure.nullish(),
 }),
 identity.extend({operation:z.literal("probe.reap")}),
]);

function reply(body:unknown,status=200){
 return Response.json(body,{status,headers:{
  "cache-control":"no-store","x-content-type-options":"nosniff",
  "referrer-policy":"no-referrer",
 }});
}

/**
 * Dedicated, tenant+product-bound worker gateway. Not a customer-facing
 * agent runtime. Requests contain metadata and bounded read-only tool names.
 * The service role is held only by the Omniqora server, never Ruflo itself.
 */
export async function serveRufloProbeWorker(request:Request){
 try{
  if(request.headers.get("content-type")?.split(";")[0] !=="application/json")
   return reply({error:"JSON required"},415);
  const length=Number(request.headers.get("content-length")??0);
  if(!Number.isFinite(length)||length>8192)return reply({error:"Payload exceeds limit"},413);
  const raw=await request.text();
  if(raw.length>8192)return reply({error:"Payload exceeds limit"},413);
  const input=requestSchema.parse(JSON.parse(raw));
  const {keyId,secret}=parseServiceAuthorization(request.headers.get("authorization"));
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const db=supabaseAdmin as any;
  const found=await db.from("platform_service_credentials")
   .select("id,key_id,secret_hash,status,expires_at,scopes")
   .eq("key_id",keyId).maybeSingle();
  if(found.error||!found.data||!verifyServiceSecret(secret,found.data.secret_hash))
   return reply({error:"Worker credential refused"},401);
  const scoped=z.array(z.object({
   tenantId:z.string().uuid(),productKey:z.string().min(2),
   brandIds:z.array(uuid).optional(),locationIds:z.array(uuid).optional(),
   capabilities:z.array(z.string().min(1).max(128)),
  })).parse(found.data.scopes);
  const credential:ServiceCredentialRecord={
   id:found.data.id,keyId:found.data.key_id,secretHash:found.data.secret_hash,
   status:found.data.status,expiresAt:found.data.expires_at,scopes:scoped,
  };
  const capability=input.operation==="probe.finish"?"ruflo.probe.finish":
   input.operation==="probe.reap"?"ruflo.probe.reap":"ruflo.probe.claim";
  const approvedScope=authoriseServiceScope(credential,{
   tenantId:input.tenantId,productKey:input.productKey,capability,
  });
  // The shared service helper can match sub-location scopes if no location
  // was requested: never allow a sub-location to become product-wide.
  if(approvedScope.brandIds?.length||approvedScope.locationIds?.length)
   return reply({error:"Product-wide Ruflo probe scope required"},403);
  const tenant=await db.from("tenants").select("country_code")
   .eq("id",input.tenantId).maybeSingle();
  if(tenant.error||!tenant.data||tenant.data.country_code!==input.region)
   return reply({error:"Tenant region mismatch"},403);
  const entitlement=await db.rpc("has_tenant_entitlement",{
   _tenant:input.tenantId,_service:"omniqora.intelligence-runtime",
  });
  if(entitlement.error||!entitlement.data)
   return reply({error:"Tenant AI runtime entitlement required"},403);
  let result;
  if(input.operation==="probe.claim"){
   result=await db.rpc("claim_ruflo_probe",{
    _tenant:input.tenantId,_product:input.productKey,
    _region:input.region,_worker:keyId,
   });
  }else if(input.operation==="probe.preflight"){
   result=await db.rpc("preflight_ruflo_probe",{
    _tenant:input.tenantId,_product:input.productKey,
    _task:input.taskId,_claim:input.claimToken,_worker:keyId,
   });
  }else if(input.operation==="probe.finish"){
   result=await db.rpc("finish_ruflo_probe",{
    _tenant:input.tenantId,_product:input.productKey,_task:input.taskId,
    _claim:input.claimToken,_worker:keyId,_result:input.result,
    _receipt_ref:input.receiptRef,_error_code:input.errorCode??null,
   });
  }else{
   result=await db.rpc("reap_ruflo_probes",{
    _tenant:input.tenantId,_product:input.productKey,
   });
  }
  if(result.error)return reply({error:"Ruflo probe operation was refused"},409);
  return reply({ok:true,data:result.data});
 }catch(err){
  if(err instanceof ZodError||err instanceof SyntaxError)
   return reply({error:"Invalid Ruflo worker request"},400);
  // Authentication and database details must not leak to untrusted callers.
  return reply({error:"Ruflo worker request unavailable or refused"},403);
 }
}
