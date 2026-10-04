import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireAdminRole,requireService,requireTenantMembership,requireWriteRole} from "@/modules/platform/access";

const uuid=z.string().uuid(),product=z.string().min(2).max(80);
const scope=z.object({tenantId:uuid,productKey:product});

export const getConnectorHub=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const rs=await Promise.all([
  db.from("provider_catalogue").select("*").neq("status","retired").order("provider_kind").order("name"),
  db.from("product_provider_requirements").select("*").eq("product_key",data.productKey).order("provider_key"),
  db.from("provider_bindings").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("provider_key"),
  db.from("connector_health_checks").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("checked_at",{ascending:false}).limit(100),
  db.from("connector_sync_state").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("provider_key"),
  db.from("connector_webhook_inbox").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("received_at",{ascending:false}).limit(100),
  db.from("connector_reconciliations").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(100),
  db.from("communication_identities").select("*").eq("tenant_id",data.tenantId).or(`product_key.eq.${data.productKey},product_key.is.null`).order("channel"),
  db.from("communication_events").select("*").eq("tenant_id",data.tenantId).or(`product_key.eq.${data.productKey},product_key.is.null`).order("occurred_at",{ascending:false}).limit(100),
  db.from("reception_settings").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).maybeSingle(),
  db.from("reception_requests").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(100)
 ]);
 for(const r of rs)if(r.error)throw new Error(r.error.message);
 return{catalogue:rs[0].data??[],requirements:rs[1].data??[],bindings:rs[2].data??[],health:rs[3].data??[],sync:rs[4].data??[],
  webhookInbox:rs[5].data??[],reconciliations:rs[6].data??[],communicationIdentities:rs[7].data??[],communicationEvents:rs[8].data??[],
  receptionSettings:rs[9].data??null,receptionRequests:rs[10].data??[]};
});

const health=scope.extend({providerKey:z.string().min(2).max(120),bindingId:uuid.nullish(),
 status:z.enum(["healthy","degraded","failed","unverified"]),latencyMs:z.number().int().min(0).nullish(),detail:z.record(z.string(),z.unknown()).default({})});
export const recordConnectorHealth=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof health>)=>health.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.connectors");requireWriteRole(a.role);const db=context.supabase as any;
 const {data:row,error}=await db.from("connector_health_checks").insert({tenant_id:data.tenantId,product_key:data.productKey,provider_key:data.providerKey,
  binding_id:data.bindingId??null,status:data.status,latency_ms:data.latencyMs??null,detail:data.detail}).select("*").single();if(error)throw new Error(error.message);
 await db.from("provider_bindings").update({status:data.status==="healthy"?"active":data.status==="failed"?"failed":"degraded",
  last_verified_at:new Date().toISOString()}).eq("tenant_id",data.tenantId).eq("product_key",data.productKey).eq("provider_key",data.providerKey);
 return row;
});

const sync=scope.extend({providerKey:z.string().min(2).max(120),status:z.enum(["idle","running","degraded","failed","paused"]),
 cursor:z.string().max(2000).nullish(),watermark:z.string().datetime().nullish(),lastError:z.string().max(2000).nullish(),
 metrics:z.record(z.string(),z.unknown()).default({})});
export const setConnectorSyncState=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof sync>)=>sync.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.connectors");requireWriteRole(a.role);const now=new Date().toISOString();
 const {data:row,error}=await(context.supabase as any).from("connector_sync_state").upsert({tenant_id:data.tenantId,product_key:data.productKey,
  provider_key:data.providerKey,status:data.status,cursor:data.cursor??null,watermark:data.watermark??null,last_error:data.lastError??null,metrics:data.metrics,
  last_started_at:data.status==="running"?now:undefined,last_completed_at:data.status==="idle"?now:undefined,updated_at:now},
  {onConflict:"tenant_id,product_key,provider_key"}).select("*").single();if(error)throw new Error(error.message);return row;
});

const reconciliation=scope.extend({providerKey:z.string().min(2).max(120),reconciliationType:z.string().min(1).max(120),
 sourceSummary:z.record(z.string(),z.unknown()).default({}),targetSummary:z.record(z.string(),z.unknown()).default({}),
 differences:z.array(z.unknown()).max(1000).default([]),evidenceRefs:z.array(z.string().max(500)).max(200).default([])});
export const createConnectorReconciliation=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof reconciliation>)=>reconciliation.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.connectors");requireWriteRole(a.role);
 const status=data.differences.length?"warning":"matched";const {data:row,error}=await(context.supabase as any).from("connector_reconciliations").insert({
  tenant_id:data.tenantId,product_key:data.productKey,provider_key:data.providerKey,reconciliation_type:data.reconciliationType,status,
  source_summary:data.sourceSummary,target_summary:data.targetSummary,differences:data.differences,evidence_refs:data.evidenceRefs}).select("*").single();
 if(error)throw new Error(error.message);return row;
});

const identity=scope.extend({channel:z.enum(["whatsapp","sms","email","voice","push","web_chat","social"]),providerKey:z.string().max(120).nullish(),
 address:z.string().min(1).max(320),displayName:z.string().max(160).nullish(),config:z.record(z.string(),z.unknown()).default({})});
export const upsertCommunicationIdentity=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof identity>)=>identity.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.connect");requireAdminRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("communication_identities").upsert({tenant_id:data.tenantId,product_key:data.productKey,
  channel:data.channel,provider_key:data.providerKey??null,address:data.address,display_name:data.displayName??null,config:data.config,status:"configured",
  updated_at:new Date().toISOString()},{onConflict:"tenant_id,channel,address"}).select("*").single();if(error)throw new Error(error.message);return row;
});

const reception=scope.extend({enabled:z.boolean(),greeting:z.string().max(1000).nullish(),businessHours:z.record(z.string(),z.unknown()).default({}),
 escalationRules:z.record(z.string(),z.unknown()).default({}),allowedActions:z.array(z.string().max(120)).max(100).default([]),
 config:z.record(z.string(),z.unknown()).default({})});
export const saveReceptionSettings=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof reception>)=>reception.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.connect");requireAdminRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("reception_settings").upsert({tenant_id:data.tenantId,product_key:data.productKey,
  enabled:data.enabled,greeting:data.greeting??null,business_hours:data.businessHours,escalation_rules:data.escalationRules,allowed_actions:data.allowedActions,
  config:data.config,updated_at:new Date().toISOString()},{onConflict:"tenant_id,product_key"}).select("*").single();if(error)throw new Error(error.message);return row;
});

export const resolveReceptionRequest=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;requestId:string;status:"triaged"|"escalated"|"resolved"|"closed"})=>z.object({tenantId:uuid,requestId:uuid,
 status:z.enum(["triaged","escalated","resolved","closed"])}).parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.connect");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("reception_requests").update({status:data.status,assigned_user_id:context.userId,
  updated_at:new Date().toISOString()}).eq("tenant_id",data.tenantId).eq("id",data.requestId).select("*").single();if(error)throw new Error(error.message);return row;
});
