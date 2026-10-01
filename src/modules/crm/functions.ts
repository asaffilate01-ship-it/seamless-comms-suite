import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid=z.string().uuid();
const scope=z.object({tenantId:uuid});

async function crmAccess(context:any,tenantId:string,write=false){
  const db=context.supabase as any;
  const [member,platform,entitlement]=await Promise.all([
    db.from("tenant_members").select("role").eq("tenant_id",tenantId).eq("user_id",context.userId).maybeSingle(),
    db.rpc("is_platform_admin",{_user:context.userId}),
    db.rpc("has_tenant_entitlement",{_tenant:tenantId,_service:"omniqora.crm"}),
  ]);
  if(member.error)throw new Error(member.error.message);
  if(platform.error)throw new Error(platform.error.message);
  if(entitlement.error)throw new Error(entitlement.error.message);
  if(!member.data&&!platform.data)throw new Error("CRM tenant access denied");
  if(!entitlement.data)throw new Error("Omniqora CRM entitlement required");
  const role=platform.data?"platform_admin":String(member.data?.role??"viewer");
  if(write&&!["platform_admin","owner","admin","agent"].includes(role))throw new Error("CRM write access denied");
  return{db,role};
}

export const listCrmPeople=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((input:z.infer<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{
  const{db}=await crmAccess(context,data.tenantId);
  const{data:rows,error}=await db.from("crm_people").select("*").eq("tenant_id",data.tenantId).order("updated_at",{ascending:false}).limit(500);
  if(error)throw new Error(error.message);return rows??[];
});

const person=scope.extend({
 id:uuid.optional(),companyId:uuid.nullish(),whatsappContactId:uuid.nullish(),
 displayName:z.string().trim().min(1).max(200),firstName:z.string().trim().max(120).nullish(),
 lastName:z.string().trim().max(120).nullish(),email:z.string().email().max(320).nullish(),
 phoneE164:z.string().regex(/^\+[1-9][0-9]{6,14}$/).nullish(),locale:z.string().max(20).nullish(),
 lifecycleStage:z.enum(["subscriber","lead","contact","prospect","customer","former_customer","partner","supplier"]).default("contact"),
 marketingConsent:z.boolean().default(false),sourceProductKey:z.string().max(80).nullish(),
 externalRef:z.string().max(200).nullish(),tags:z.array(z.string().max(80)).max(100).default([]),
 channelPreferences:z.record(z.string(),z.unknown()).default({}),metadata:z.record(z.string(),z.unknown()).default({})
});
export const saveCrmPerson=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof person>)=>person.parse(input))
.handler(async({context,data})=>{
  const{db}=await crmAccess(context,data.tenantId,true);
  const values={tenant_id:data.tenantId,company_id:data.companyId??null,whatsapp_contact_id:data.whatsappContactId??null,
    display_name:data.displayName,first_name:data.firstName??null,last_name:data.lastName??null,email:data.email??null,
    phone_e164:data.phoneE164??null,locale:data.locale??null,lifecycle_stage:data.lifecycleStage,
    marketing_consent:data.marketingConsent,source_product_key:data.sourceProductKey??null,external_ref:data.externalRef??null,
    tags:data.tags,channel_preferences:data.channelPreferences,metadata:data.metadata};
  const query=data.id?db.from("crm_people").update(values).eq("id",data.id).eq("tenant_id",data.tenantId):
    db.from("crm_people").insert({...values,owner_user_id:context.userId});
  const{data:row,error}=await query.select("*").single();
  if(error||!row)throw new Error(error?.message??"CRM person could not be saved");
  await db.from("crm_activities").insert({tenant_id:data.tenantId,activity_type:"system_event",
    summary:data.id?"CRM person updated":"CRM person created",person_id:row.id,actor_user_id:context.userId,
    source_product_key:data.sourceProductKey??null,metadata:{}});
  return row;
});

export const listCrmCompanies=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((input:z.infer<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{
  const{db}=await crmAccess(context,data.tenantId);
  const{data:rows,error}=await db.from("crm_companies").select("*").eq("tenant_id",data.tenantId).order("updated_at",{ascending:false}).limit(500);
  if(error)throw new Error(error.message);return rows??[];
});
const company=scope.extend({
 id:uuid.optional(),name:z.string().trim().min(1).max(240),legalName:z.string().trim().max(240).nullish(),
 website:z.string().url().max(500).nullish(),industry:z.string().max(160).nullish(),
 status:z.enum(["active","inactive","prospect","customer","partner","supplier"]).default("active"),
 sourceProductKey:z.string().max(80).nullish(),externalRef:z.string().max(200).nullish(),
 metadata:z.record(z.string(),z.unknown()).default({})
});
export const saveCrmCompany=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof company>)=>company.parse(input))
.handler(async({context,data})=>{
  const{db}=await crmAccess(context,data.tenantId,true);
  const values={tenant_id:data.tenantId,name:data.name,legal_name:data.legalName??null,website:data.website??null,
    industry:data.industry??null,status:data.status,source_product_key:data.sourceProductKey??null,
    external_ref:data.externalRef??null,metadata:data.metadata};
  const query=data.id?db.from("crm_companies").update(values).eq("id",data.id).eq("tenant_id",data.tenantId):
    db.from("crm_companies").insert({...values,owner_user_id:context.userId});
  const{data:row,error}=await query.select("*").single();
  if(error||!row)throw new Error(error?.message??"CRM company could not be saved");
  await db.from("crm_activities").insert({tenant_id:data.tenantId,activity_type:"system_event",
    summary:data.id?"CRM company updated":"CRM company created",company_id:row.id,actor_user_id:context.userId,metadata:{}});
  return row;
});

export const listCrmPipelines=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((input:z.infer<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{
  const{db}=await crmAccess(context,data.tenantId);
  const ensured=await db.rpc("crm_ensure_default_pipeline",{_tenant:data.tenantId});
  if(ensured.error)throw new Error(ensured.error.message);
  const{data:pipelines,error}=await db.from("crm_pipelines").select("*").eq("tenant_id",data.tenantId).eq("is_active",true).order("name");
  if(error)throw new Error(error.message);
  const ids=(pipelines??[]).map((p:any)=>p.id);
  const stages=ids.length?await db.from("crm_pipeline_stages").select("*").eq("tenant_id",data.tenantId).in("pipeline_id",ids).order("position"):{data:[],error:null};
  if(stages.error)throw new Error(stages.error.message);
  return(pipelines??[]).map((p:any)=>({...p,stages:(stages.data??[]).filter((s:any)=>s.pipeline_id===p.id)}));
});

export const listCrmLeads=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((input:z.infer<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{const{db}=await crmAccess(context,data.tenantId);const{data:rows,error}=await db.from("crm_leads").select("*").eq("tenant_id",data.tenantId).order("updated_at",{ascending:false}).limit(500);if(error)throw new Error(error.message);return rows??[];});
const lead=scope.extend({id:uuid.optional(),personId:uuid.nullish(),companyId:uuid.nullish(),title:z.string().trim().min(1).max(240),
 source:z.string().max(120).nullish(),status:z.enum(["new","working","qualified","unqualified","converted","closed"]).default("new"),
 score:z.number().min(0).max(1000).nullish(),sourceProductKey:z.string().max(80).nullish(),externalRef:z.string().max(200).nullish(),
 metadata:z.record(z.string(),z.unknown()).default({})});
export const saveCrmLead=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof lead>)=>lead.parse(input))
.handler(async({context,data})=>{
 const{db}=await crmAccess(context,data.tenantId,true);
 const values={tenant_id:data.tenantId,person_id:data.personId??null,company_id:data.companyId??null,title:data.title,source:data.source??null,
 status:data.status,score:data.score??null,source_product_key:data.sourceProductKey??null,external_ref:data.externalRef??null,metadata:data.metadata};
 const query=data.id?db.from("crm_leads").update(values).eq("id",data.id).eq("tenant_id",data.tenantId):
  db.from("crm_leads").insert({...values,owner_user_id:context.userId});
 const{data:row,error}=await query.select("*").single();if(error||!row)throw new Error(error?.message??"CRM lead could not be saved");
 await db.from("crm_activities").insert({tenant_id:data.tenantId,activity_type:"lead_event",summary:data.id?"Lead updated":"Lead created",
  lead_id:row.id,person_id:row.person_id,company_id:row.company_id,actor_user_id:context.userId,metadata:{status:row.status}});
 return row;
});

export const listCrmOpportunities=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((input:z.infer<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{const{db}=await crmAccess(context,data.tenantId);const{data:rows,error}=await db.from("crm_opportunities").select("*").eq("tenant_id",data.tenantId).order("updated_at",{ascending:false}).limit(500);if(error)throw new Error(error.message);return rows??[];});
const opportunity=scope.extend({id:uuid.optional(),pipelineId:uuid,stageId:uuid,personId:uuid.nullish(),companyId:uuid.nullish(),
 title:z.string().trim().min(1).max(240),amount:z.number().nonnegative().nullish(),currency:z.string().regex(/^[A-Z]{3}$/).nullish(),
 probabilityPercent:z.number().int().min(0).max(100).nullish(),expectedCloseAt:z.string().datetime().nullish(),
 status:z.enum(["open","won","lost","cancelled"]).default("open"),sourceProductKey:z.string().max(80).nullish(),
 externalRef:z.string().max(200).nullish(),metadata:z.record(z.string(),z.unknown()).default({})});
export const saveCrmOpportunity=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof opportunity>)=>opportunity.parse(input))
.handler(async({context,data})=>{
 const{db}=await crmAccess(context,data.tenantId,true);
 const stage=await db.from("crm_pipeline_stages").select("id,pipeline_id,probability_percent,is_closed_won,is_closed_lost")
  .eq("tenant_id",data.tenantId).eq("id",data.stageId).eq("pipeline_id",data.pipelineId).maybeSingle();
 if(stage.error||!stage.data)throw new Error("CRM pipeline stage not found");
 const status=stage.data.is_closed_won?"won":stage.data.is_closed_lost?"lost":data.status;
 const values={tenant_id:data.tenantId,pipeline_id:data.pipelineId,stage_id:data.stageId,person_id:data.personId??null,
 company_id:data.companyId??null,title:data.title,amount:data.amount??null,currency:data.currency??null,
 probability_percent:data.probabilityPercent??stage.data.probability_percent,expected_close_at:data.expectedCloseAt??null,status,
 source_product_key:data.sourceProductKey??null,external_ref:data.externalRef??null,metadata:data.metadata};
 const query=data.id?db.from("crm_opportunities").update(values).eq("id",data.id).eq("tenant_id",data.tenantId):
  db.from("crm_opportunities").insert({...values,owner_user_id:context.userId});
 const{data:row,error}=await query.select("*").single();if(error||!row)throw new Error(error?.message??"CRM opportunity could not be saved");
 await db.from("crm_activities").insert({tenant_id:data.tenantId,activity_type:"opportunity_event",
  summary:data.id?"Opportunity updated":"Opportunity created",opportunity_id:row.id,person_id:row.person_id,
  company_id:row.company_id,actor_user_id:context.userId,metadata:{status:row.status,stageId:row.stage_id}});
 return row;
});

export const listCrmTasks=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((input:z.infer<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{const{db}=await crmAccess(context,data.tenantId);const{data:rows,error}=await db.from("crm_tasks").select("*").eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(500);if(error)throw new Error(error.message);return rows??[];});
const task=scope.extend({id:uuid.optional(),title:z.string().trim().min(1).max(240),description:z.string().max(4000).nullish(),
 status:z.enum(["open","in_progress","completed","cancelled"]).default("open"),priority:z.enum(["low","normal","high","urgent"]).default("normal"),
 dueAt:z.string().datetime().nullish(),assigneeUserId:uuid.nullish(),relatedType:z.enum(["person","company","lead","opportunity","case","conversation","external"]).nullish(),
 relatedId:z.string().max(200).nullish(),sourceProductKey:z.string().max(80).nullish(),externalRef:z.string().max(200).nullish(),
 metadata:z.record(z.string(),z.unknown()).default({})});
export const saveCrmTask=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof task>)=>task.parse(input))
.handler(async({context,data})=>{
 const{db}=await crmAccess(context,data.tenantId,true);
 const values={tenant_id:data.tenantId,title:data.title,description:data.description??null,status:data.status,priority:data.priority,
 due_at:data.dueAt??null,assignee_user_id:data.assigneeUserId??null,related_type:data.relatedType??null,related_id:data.relatedId??null,
 source_product_key:data.sourceProductKey??null,external_ref:data.externalRef??null,metadata:data.metadata};
 const query=data.id?db.from("crm_tasks").update(values).eq("id",data.id).eq("tenant_id",data.tenantId):
  db.from("crm_tasks").insert({...values,created_by:context.userId});
 const{data:row,error}=await query.select("*").single();if(error||!row)throw new Error(error?.message??"CRM task could not be saved");
 await db.from("crm_activities").insert({tenant_id:data.tenantId,activity_type:"task",summary:data.id?"Task updated":"Task created",
  actor_user_id:context.userId,metadata:{taskId:row.id,status:row.status}});
 return row;
});

const customer360=scope.extend({personId:uuid});
export const getCustomer360=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((input:z.infer<typeof customer360>)=>customer360.parse(input))
.handler(async({context,data})=>{
 const{db}=await crmAccess(context,data.tenantId);
 const personResult=await db.from("crm_people").select("*,company:crm_companies(*)").eq("tenant_id",data.tenantId).eq("id",data.personId).maybeSingle();
 if(personResult.error||!personResult.data)throw new Error("CRM person not found");
 const person=personResult.data;
 const [activities,tasks,leads,opportunities]=await Promise.all([
  db.from("crm_activities").select("*").eq("tenant_id",data.tenantId).eq("person_id",data.personId).order("occurred_at",{ascending:false}).limit(200),
  db.from("crm_tasks").select("*").eq("tenant_id",data.tenantId).eq("related_type","person").eq("related_id",data.personId).order("created_at",{ascending:false}).limit(100),
  db.from("crm_leads").select("*").eq("tenant_id",data.tenantId).eq("person_id",data.personId).order("updated_at",{ascending:false}).limit(100),
  db.from("crm_opportunities").select("*").eq("tenant_id",data.tenantId).eq("person_id",data.personId).order("updated_at",{ascending:false}).limit(100),
 ]);
 for(const r of [activities,tasks,leads,opportunities])if(r.error)throw new Error(r.error.message);
 let conversations:any[]=[];let messages:any[]=[];
 if(person.whatsapp_contact_id){
  const conv=await db.from("conversations").select("id,status,last_message_at,last_inbound_at,channel_id").eq("tenant_id",data.tenantId)
   .eq("contact_id",person.whatsapp_contact_id).order("last_message_at",{ascending:false}).limit(50);
  if(conv.error)throw new Error(conv.error.message);conversations=conv.data??[];
  const ids=conversations.map((row:any)=>row.id);
  if(ids.length){const msg=await db.from("messages").select("id,conversation_id,direction,msg_type,body,status,created_at")
    .eq("tenant_id",data.tenantId).in("conversation_id",ids).order("created_at",{ascending:false}).limit(300);
   if(msg.error)throw new Error(msg.error.message);messages=msg.data??[];}
 }
 return{person,activities:activities.data??[],tasks:tasks.data??[],leads:leads.data??[],
  opportunities:opportunities.data??[],conversations,messages};
});
