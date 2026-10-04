import {z} from "zod";
import {authoriseServiceScope,parseServiceAuthorization,verifyServiceSecret,type ServiceCredentialRecord} from "@/modules/platform/service-identity";

const uuid=z.string().uuid();
const request=z.discriminatedUnion("operation",[
 z.object({operation:z.literal("projection.push"),tenantId:uuid,productKey:z.literal("dishbee"),sourceEventId:z.string().min(1).max(160),entityType:z.enum(["location","user","menu_item","recipe","ingredient","supplier","equipment"]),externalId:z.string().min(1).max(200),action:z.enum(["upsert","archive"]),revision:z.number().int().min(1),payload:z.record(z.string(),z.unknown()).default({})}),
 z.object({operation:z.literal("compliance.summary"),tenantId:uuid,productKey:z.literal("dishbee")})
]);

function reply(body:unknown,status=200){return Response.json(body,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
function endpoint(country:string){
 const prefix=country==="GB"?"HACCORA_UK":country==="DE"?"HACCORA_DE":null;
 if(!prefix)throw new Error("Haccora is not available for this tenant country");
 const functionUrl=process.env[`${prefix}_FUNCTION_URL`],secret=process.env[`${prefix}_SYNC_SECRET`];
 if(!functionUrl||!secret||secret.length<32)throw new Error("Haccora bridge is not configured");
 const url=new URL(functionUrl);if(url.protocol!=="https:")throw new Error("Haccora bridge must use HTTPS");
 return{url:url.toString(),secret};
}
async function auth(httpRequest:Request,input:z.infer<typeof request>){
 const {keyId,secret}=parseServiceAuthorization(httpRequest.headers.get("authorization"));
 const {supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
 const {data:row,error}=await db.from("platform_service_credentials").select("id,key_id,secret_hash,status,expires_at,scopes").eq("key_id",keyId).maybeSingle();
 if(error||!row||!verifyServiceSecret(secret,row.secret_hash))throw new Error("Service credential refused");
 const scopes=z.array(z.object({tenantId:uuid,productKey:z.string().min(2),brandIds:z.array(uuid).optional(),locationIds:z.array(uuid).optional(),capabilities:z.array(z.string())})).parse(row.scopes);
 const credential:ServiceCredentialRecord={id:row.id,keyId:row.key_id,secretHash:row.secret_hash,status:row.status,expiresAt:row.expires_at,scopes};
 const capability=input.operation==="projection.push"?"haccora.projection.write":"haccora.compliance.read";
 authoriseServiceScope(credential,{tenantId:input.tenantId,productKey:"dishbee",capability});
 return{db,credential};
}
async function postHaccora(config:ReturnType<typeof endpoint>,body:Record<string,unknown>){
 const response=await fetch(config.url,{method:"POST",headers:{"content-type":"application/json","x-omniqora-sync-secret":config.secret},body:JSON.stringify(body)});
 const data=await response.json().catch(()=>({error:"invalid_haccora_response"}));
 if(!response.ok)throw new Error(String((data as any).error??`haccora_${response.status}`));
 return data;
}

export async function serveHaccoraBridge(httpRequest:Request){
 if(httpRequest.method!=="POST")return reply({error:"Method not allowed"},405);
 let json:unknown;try{json=await httpRequest.json();}catch{return reply({error:"Invalid JSON"},400);}
 const parsed=request.safeParse(json);if(!parsed.success)return reply({error:"Invalid request"},422);
 const input=parsed.data;
 try{
  const {db,credential}=await auth(httpRequest,input);
  const [tenant,entitlement,connection]=await Promise.all([
   db.from("tenants").select("country_code").eq("id",input.tenantId).maybeSingle(),
   db.rpc("has_tenant_entitlement",{_tenant:input.tenantId,_service:"haccora.dishbee-sync"}),
   db.from("product_connections").select("external_tenant_id,status").eq("tenant_id",input.tenantId).eq("product_key","haccora").eq("status","connected").limit(1).maybeSingle()
  ]);
  if(tenant.error||!tenant.data)throw new Error("Tenant is unavailable");
  if(entitlement.error||!entitlement.data)throw new Error("Haccora for Dishbee entitlement required");
  if(connection.error||!connection.data)throw new Error("Haccora workspace is not connected");
  const config=endpoint(tenant.data.country_code);
  const result=input.operation==="projection.push"
   ?await postHaccora(config,{action:"sync_projection",omniqoraTenantId:input.tenantId,sourceProduct:"dishbee",sourceEventId:input.sourceEventId,entityType:input.entityType,externalId:input.externalId,operation:input.action,revision:input.revision,payload:input.payload})
   :await postHaccora(config,{action:"compliance_summary",omniqoraTenantId:input.tenantId});
  await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
  return reply(result);
 }catch(error){const message=error instanceof Error?error.message:"Haccora bridge failed";return reply({error:message},message.includes("credential")||message.includes("scope")?403:503);}
}
