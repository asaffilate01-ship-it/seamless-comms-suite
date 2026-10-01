import { z } from "zod";
import { authoriseServiceScope, parseServiceAuthorization, verifyServiceSecret, type ServiceCredentialRecord } from "@/modules/platform/service-identity";

const base=z.object({tenantId:z.string().uuid(),productKey:z.string().min(2).max(80)});
const schema=z.discriminatedUnion("operation",[
 base.extend({operation:z.literal("person.upsert"),externalRef:z.string().min(1).max(200),displayName:z.string().min(1).max(200),
  email:z.string().email().max(320).nullish(),phoneE164:z.string().regex(/^\+[1-9][0-9]{6,14}$/).nullish(),
  locale:z.string().max(20).nullish(),lifecycleStage:z.enum(["subscriber","lead","contact","prospect","customer","former_customer","partner","supplier"]).default("contact"),
  marketingConsent:z.boolean().default(false),tags:z.array(z.string().max(80)).max(100).default([]),metadata:z.record(z.string(),z.unknown()).default({})}),
 base.extend({operation:z.literal("company.upsert"),externalRef:z.string().min(1).max(200),name:z.string().min(1).max(240),
  legalName:z.string().max(240).nullish(),website:z.string().url().max(500).nullish(),industry:z.string().max(160).nullish(),
  status:z.enum(["active","inactive","prospect","customer","partner","supplier"]).default("active"),metadata:z.record(z.string(),z.unknown()).default({})}),
 base.extend({operation:z.literal("activity.record"),externalRef:z.string().min(1).max(200),activityType:z.enum(["note","call","email","sms","whatsapp","meeting","task","status_change","lead_event","opportunity_event","case_event","system_event"]),
  summary:z.string().min(1).max(1000),personExternalRef:z.string().max(200).nullish(),companyExternalRef:z.string().max(200).nullish(),
  occurredAt:z.string().datetime().optional(),metadata:z.record(z.string(),z.unknown()).default({})}),
 base.extend({operation:z.literal("person.get"),externalRef:z.string().min(1).max(200)})
]);

function reply(body:unknown,status=200){return Response.json(body,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});}

async function auth(request:Request){
 const{keyId,secret}=parseServiceAuthorization(request.headers.get("authorization"));
 const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
 const{data:row,error}=await db.from("platform_service_credentials").select("id,key_id,secret_hash,status,expires_at,scopes").eq("key_id",keyId).maybeSingle();
 if(error||!row||!verifyServiceSecret(secret,row.secret_hash))throw new Error("Service credential refused");
 const scopes=z.array(z.object({tenantId:z.string().uuid(),productKey:z.string().min(2),brandIds:z.array(z.string().uuid()).optional(),locationIds:z.array(z.string().uuid()).optional(),capabilities:z.array(z.string())})).parse(row.scopes);
 const credential:ServiceCredentialRecord={id:row.id,keyId:row.key_id,secretHash:row.secret_hash,status:row.status,expiresAt:row.expires_at,scopes};
 return{db,credential};
}

async function entitlement(db:any,tenantId:string){
 const{data,error}=await db.from("tenant_services").select("status,valid_until").eq("tenant_id",tenantId).eq("service_key","omniqora.crm").maybeSingle();
 if(error)throw new Error(error.message);
 if(!data||!["active","trial"].includes(data.status)||(data.valid_until&&Date.parse(data.valid_until)<=Date.now()))throw new Error("Omniqora CRM entitlement required");
}

export async function serveCrmService(request:Request){
 try{
  const raw=await request.text();if(raw.length>262144)return reply({error:"Payload too large"},413);
  let json:unknown;try{json=JSON.parse(raw);}catch{return reply({error:"Invalid JSON"},400);}
  const input=schema.parse(json);const{db,credential}=await auth(request);
  authoriseServiceScope(credential,{tenantId:input.tenantId,productKey:input.productKey,capability:input.operation==="person.get"?"crm.read":"crm.write"});
  await entitlement(db,input.tenantId);

  if(input.operation==="person.get"){
   const{data,error}=await db.from("crm_people").select("*").eq("tenant_id",input.tenantId).eq("source_product_key",input.productKey).eq("external_ref",input.externalRef).maybeSingle();
   if(error)throw new Error(error.message);return data?reply(data):reply({error:"CRM person not found"},404);
  }

  if(input.operation==="person.upsert"){
   const values={tenant_id:input.tenantId,source_product_key:input.productKey,external_ref:input.externalRef,display_name:input.displayName,
    email:input.email??null,phone_e164:input.phoneE164??null,locale:input.locale??null,lifecycle_stage:input.lifecycleStage,
    marketing_consent:input.marketingConsent,tags:input.tags,metadata:input.metadata};
   const existing=await db.from("crm_people").select("id").eq("tenant_id",input.tenantId).eq("source_product_key",input.productKey).eq("external_ref",input.externalRef).maybeSingle();
   if(existing.error)throw new Error(existing.error.message);
   const query=existing.data?db.from("crm_people").update(values).eq("id",existing.data.id):db.from("crm_people").insert(values);
   const{data,error}=await query.select("*").single();if(error||!data)throw new Error(error?.message??"CRM person write failed");
   await db.from("crm_activities").insert({tenant_id:input.tenantId,activity_type:"system_event",summary:existing.data?"Source person updated":"Source person created",person_id:data.id,source_product_key:input.productKey,external_ref:"person:"+input.externalRef,metadata:{}});
   await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
   return reply(data,existing.data?200:201);
  }

  if(input.operation==="company.upsert"){
   const values={tenant_id:input.tenantId,source_product_key:input.productKey,external_ref:input.externalRef,name:input.name,
    legal_name:input.legalName??null,website:input.website??null,industry:input.industry??null,status:input.status,metadata:input.metadata};
   const existing=await db.from("crm_companies").select("id").eq("tenant_id",input.tenantId).eq("source_product_key",input.productKey).eq("external_ref",input.externalRef).maybeSingle();
   if(existing.error)throw new Error(existing.error.message);
   const query=existing.data?db.from("crm_companies").update(values).eq("id",existing.data.id):db.from("crm_companies").insert(values);
   const{data,error}=await query.select("*").single();if(error||!data)throw new Error(error?.message??"CRM company write failed");
   await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
   return reply(data,existing.data?200:201);
  }

  let personId:null|string=null;let companyId:null|string=null;
  if(input.personExternalRef){
   const r=await db.from("crm_people").select("id").eq("tenant_id",input.tenantId).eq("source_product_key",input.productKey).eq("external_ref",input.personExternalRef).maybeSingle();
   if(r.error)throw new Error(r.error.message);personId=r.data?.id??null;
  }
  if(input.companyExternalRef){
   const r=await db.from("crm_companies").select("id").eq("tenant_id",input.tenantId).eq("source_product_key",input.productKey).eq("external_ref",input.companyExternalRef).maybeSingle();
   if(r.error)throw new Error(r.error.message);companyId=r.data?.id??null;
  }
  const existing=await db.from("crm_activities").select("id").eq("tenant_id",input.tenantId).eq("source_product_key",input.productKey).eq("external_ref",input.externalRef).maybeSingle();
  if(existing.error)throw new Error(existing.error.message);
  if(existing.data)return reply({id:existing.data.id,idempotent:true});
  const{data,error}=await db.from("crm_activities").insert({tenant_id:input.tenantId,activity_type:input.activityType,summary:input.summary,
   person_id:personId,company_id:companyId,source_product_key:input.productKey,external_ref:input.externalRef,
   occurred_at:input.occurredAt??new Date().toISOString(),metadata:input.metadata}).select("*").single();
  if(error||!data)throw new Error(error?.message??"CRM activity write failed");
  await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
  return reply(data,201);
 }catch(error){
  if(error instanceof z.ZodError)return reply({error:"Invalid CRM service contract"},422);
  const message=error instanceof Error?error.message:"CRM service refused";
  if(/credential|scope|entitlement|authorization|expired/i.test(message))return reply({error:message},403);
  return reply({error:message},503);
 }
}
