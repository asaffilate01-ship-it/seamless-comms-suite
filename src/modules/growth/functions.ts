import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement, requireWritableTenantRole } from "@/modules/platform/module-access";

const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()});
async function moduleScope(context:any,data:z.infer<typeof scope>,moduleKey:string,write=false){const access=await requireModuleEntitlement(context,{...data,moduleKey});if(write)requireWritableTenantRole(access.role);return access;}

export const listMarketingWorkspace=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof scope>)=>scope.parse(input)).handler(async({context,data})=>{await moduleScope(context,data,"marketing.core");const db=context.supabase as any;const[audiences,campaigns]=await Promise.all([db.from("marketing_audiences").select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).order("updated_at",{ascending:false}),db.from("marketing_campaigns").select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).order("updated_at",{ascending:false})]);if(audiences.error)throw new Error(audiences.error.message);if(campaigns.error)throw new Error(campaigns.error.message);return{audiences:audiences.data??[],campaigns:campaigns.data??[]};});

const audienceSchema=scope.extend({id:z.string().uuid().optional(),name:z.string().min(1).max(200),filters:z.array(z.record(z.string(),z.unknown())).max(100).default([]),status:z.enum(["draft","active","archived"]).default("draft")});
export const saveMarketingAudience=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof audienceSchema>)=>audienceSchema.parse(input)).handler(async({context,data})=>{await moduleScope(context,data,"marketing.core",true);const db=context.supabase as any;const values={tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,name:data.name,filters:data.filters,status:data.status};const q=data.id?db.from("marketing_audiences").update(values).eq("id",data.id).eq("tenant_id",data.tenantId):db.from("marketing_audiences").insert(values);const{data:row,error}=await q.select("*").single();if(error||!row)throw new Error(error?.message??"Audience could not be saved");return row;});

const campaignSchema=scope.extend({id:z.string().uuid().optional(),name:z.string().min(1).max(240),objective:z.string().min(1).max(1000),audienceId:z.string().uuid().optional().nullable(),channels:z.array(z.enum(["email","sms","whatsapp","push","web","social"])).min(1),creativeBriefId:z.string().uuid().optional().nullable(),startsAt:z.string().datetime().optional().nullable(),endsAt:z.string().datetime().optional().nullable(),status:z.enum(["draft","scheduled","running","paused","completed","cancelled"]).default("draft"),attributionWindowDays:z.number().int().min(0).max(365).optional().nullable(),metadata:z.record(z.string(),z.unknown()).default({})});
export const saveMarketingCampaign=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof campaignSchema>)=>campaignSchema.parse(input)).handler(async({context,data})=>{await moduleScope(context,data,"marketing.core",true);const db=context.supabase as any;const values={tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,name:data.name,objective:data.objective,audience_id:data.audienceId??null,channels:data.channels,creative_brief_id:data.creativeBriefId??null,starts_at:data.startsAt??null,ends_at:data.endsAt??null,status:data.status,attribution_window_days:data.attributionWindowDays??null,metadata:data.metadata};const q=data.id?db.from("marketing_campaigns").update(values).eq("id",data.id).eq("tenant_id",data.tenantId):db.from("marketing_campaigns").insert(values);const{data:row,error}=await q.select("*").single();if(error||!row)throw new Error(error?.message??"Campaign could not be saved");return row;});

export const listSalesSequences=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof scope>)=>scope.parse(input)).handler(async({context,data})=>{await moduleScope(context,data,"sales.core");const db=context.supabase as any;const{data:rows,error}=await db.from("sales_sequences").select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).order("updated_at",{ascending:false});if(error)throw new Error(error.message);return rows??[];});

const sequenceSchema=scope.extend({id:z.string().uuid().optional(),name:z.string().min(1).max(200),steps:z.array(z.record(z.string(),z.unknown())).max(100),status:z.enum(["draft","active","paused","archived"]).default("draft"),metadata:z.record(z.string(),z.unknown()).default({})});
export const saveSalesSequence=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof sequenceSchema>)=>sequenceSchema.parse(input)).handler(async({context,data})=>{await moduleScope(context,data,"sales.core",true);const db=context.supabase as any;const values={tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,name:data.name,steps:data.steps,status:data.status,metadata:data.metadata};const q=data.id?db.from("sales_sequences").update(values).eq("id",data.id).eq("tenant_id",data.tenantId):db.from("sales_sequences").insert(values);const{data:row,error}=await q.select("*").single();if(error||!row)throw new Error(error?.message??"Sales sequence could not be saved");return row;});

export const listJourneys=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof scope>)=>scope.parse(input)).handler(async({context,data})=>{await moduleScope(context,data,"journeys.core");const db=context.supabase as any;const{data:rows,error}=await db.from("journey_definitions").select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).order("updated_at",{ascending:false});if(error)throw new Error(error.message);return rows??[];});

const journeySchema=scope.extend({id:z.string().uuid().optional(),name:z.string().min(1).max(200),nodes:z.array(z.record(z.string(),z.unknown())).max(500),edges:z.array(z.record(z.string(),z.unknown())).max(1000),status:z.enum(["draft","active","paused","archived"]).default("draft")});
export const saveJourney=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof journeySchema>)=>journeySchema.parse(input)).handler(async({context,data})=>{await moduleScope(context,data,"journeys.core",true);const db=context.supabase as any;const values={tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,name:data.name,nodes:data.nodes,edges:data.edges,status:data.status};const q=data.id?db.from("journey_definitions").update(values).eq("id",data.id).eq("tenant_id",data.tenantId):db.from("journey_definitions").insert(values);const{data:row,error}=await q.select("*").single();if(error||!row)throw new Error(error?.message??"Journey could not be saved");return row;});

export const listFeedbackSurveys=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof scope>)=>scope.parse(input)).handler(async({context,data})=>{await moduleScope(context,data,"feedback.core");const db=context.supabase as any;const{data:rows,error}=await db.from("feedback_surveys").select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).order("updated_at",{ascending:false});if(error)throw new Error(error.message);return rows??[];});

const surveySchema=scope.extend({id:z.string().uuid().optional(),type:z.enum(["nps","csat","ces","custom"]),name:z.string().min(1).max(200),triggerEvent:z.string().max(160).optional().nullable(),channel:z.enum(["email","sms","whatsapp","web","app"]),status:z.enum(["draft","active","paused","archived"]).default("draft"),config:z.record(z.string(),z.unknown()).default({})});
export const saveFeedbackSurvey=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof surveySchema>)=>surveySchema.parse(input)).handler(async({context,data})=>{await moduleScope(context,data,"feedback.core",true);const db=context.supabase as any;const values={tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,survey_type:data.type,name:data.name,trigger_event:data.triggerEvent??null,channel:data.channel,status:data.status,config:data.config};const q=data.id?db.from("feedback_surveys").update(values).eq("id",data.id).eq("tenant_id",data.tenantId):db.from("feedback_surveys").insert(values);const{data:row,error}=await q.select("*").single();if(error||!row)throw new Error(error?.message??"Survey could not be saved");return row;});

export const listRfmProfiles=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{
  await moduleScope(context,data,"journeys.core");
  const db=context.supabase as any;
  const{data:rows,error}=await db.from("customer_rfm_product")
    .select("tenant_id,tenant_product_id,crm_person_id,recency_days,frequency,monetary_minor,currency,r_score,f_score,m_score,segments,calculated_at")
    .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .order("monetary_minor",{ascending:false})
    .limit(1000);
  if(error)throw new Error(error.message);
  return rows??[];
});

export const listFeedbackResponses=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>&{surveyId?:string|null})=>scope.extend({surveyId:z.string().uuid().optional().nullable()}).parse(input))
.handler(async({context,data})=>{
  await moduleScope(context,data,"feedback.core");
  const db=context.supabase as any;
  const surveyIds=(await db.from("feedback_surveys").select("id")
    .eq("tenant_id",data.tenantId)
    .eq("tenant_product_id",data.tenantProductId)).data?.map((row:any)=>row.id)??[];
  if(!surveyIds.length)return[];
  let query=db.from("feedback_responses")
    .select("id,survey_id,crm_person_id,score,comment,sentiment,source_ref,metadata,received_at")
    .eq("tenant_id",data.tenantId)
    .in("survey_id",surveyIds)
    .order("received_at",{ascending:false})
    .limit(1000);
  if(data.surveyId)query=query.eq("survey_id",data.surveyId);
  const{data:rows,error}=await query;
  if(error)throw new Error(error.message);
  return rows??[];
});


const valueEventSchema=scope.extend({
  crmPersonId:z.string().uuid(),eventKind:z.enum(["purchase","refund","adjustment"]),
  amountMinor:z.number().int(),currency:z.string().regex(/^[A-Z]{3}$/),
  sourceType:z.string().min(1).max(120),sourceRef:z.string().min(1).max(240),
  occurredAt:z.string().datetime(),metadata:z.record(z.string(),z.unknown()).default({})
});
export const recordCustomerValueEvent=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof valueEventSchema>)=>valueEventSchema.parse(input))
.handler(async({context,data})=>{
  await moduleScope(context,data,"journeys.core",true);
  const db=context.supabase as any;
  const{data:person}=await db.from("crm_people").select("id").eq("id",data.crmPersonId)
    .eq("tenant_id",data.tenantId).maybeSingle();
  if(!person)throw new Error("CRM customer not found");
  const{data:row,error}=await db.from("customer_value_events").upsert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,crm_person_id:data.crmPersonId,
    event_kind:data.eventKind,amount_minor:data.amountMinor,currency:data.currency,
    source_type:data.sourceType,source_ref:data.sourceRef,occurred_at:data.occurredAt,metadata:data.metadata
  },{onConflict:"tenant_id,tenant_product_id,source_type,source_ref,event_kind"}).select("*").single();
  if(error||!row)throw new Error(error?.message??"Customer value event could not be recorded");
  return row;
});

export const recalculateRfmProfiles=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{
  await moduleScope(context,data,"journeys.core",true);
  const db=context.supabase as any;
  const{data:count,error}=await db.rpc("recalculate_product_rfm",{
    _tenant:data.tenantId,_tenant_product:data.tenantProductId
  });
  if(error)throw new Error(error.message);
  return{profiles:Number(count??0)};
});

const journeyStartSchema=scope.extend({
  journeyId:z.string().uuid(),crmPersonId:z.string().uuid().optional().nullable(),
  subjectRef:z.string().max(240).optional().nullable(),context:z.record(z.string(),z.unknown()).default({})
}).refine((value)=>!!value.crmPersonId||!!value.subjectRef,{message:"crmPersonId or subjectRef is required"});
export const startJourneyEnrolment=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof journeyStartSchema>)=>journeyStartSchema.parse(input))
.handler(async({context,data})=>{
  await moduleScope(context,data,"journeys.core",true);
  const db=context.supabase as any;
  const{data:journey,error}=await db.from("journey_definitions").select("*")
    .eq("id",data.journeyId).eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .eq("status","active").maybeSingle();
  if(error||!journey)throw new Error("Active journey not found");
  if(data.crmPersonId){
    const{data:person}=await db.from("crm_people").select("id").eq("id",data.crmPersonId)
      .eq("tenant_id",data.tenantId).maybeSingle();
    if(!person)throw new Error("CRM customer not found");
  }
  const nodes=Array.isArray(journey.nodes)?journey.nodes:[];
  const start=nodes.find((node:any)=>node?.kind==="trigger")??nodes[0];
  if(!start?.id)throw new Error("Journey has no start node");
  const{data:row,error:insertError}=await db.from("journey_enrolments").insert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,journey_id:data.journeyId,
    crm_person_id:data.crmPersonId??null,subject_ref:data.subjectRef??null,status:"active",
    current_node_id:String(start.id),context:data.context
  }).select("*").single();
  if(insertError||!row)throw new Error(insertError?.message??"Journey enrolment could not be started");
  await db.from("journey_execution_log").insert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,enrolment_id:row.id,
    node_id:String(start.id),node_kind:String(start.kind??"trigger"),state:"started",input:data.context
  });
  return row;
});

const journeyAdvanceSchema=scope.extend({
  enrolmentId:z.string().uuid(),outcome:z.string().max(200).optional().nullable(),
  output:z.record(z.string(),z.unknown()).default({}),error:z.string().max(4000).optional().nullable()
});
export const advanceJourneyEnrolment=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof journeyAdvanceSchema>)=>journeyAdvanceSchema.parse(input))
.handler(async({context,data})=>{
  await moduleScope(context,data,"journeys.core",true);
  const db=context.supabase as any;
  const{data:enrolment}=await db.from("journey_enrolments").select("*")
    .eq("id",data.enrolmentId).eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).maybeSingle();
  if(!enrolment||!["active","waiting"].includes(enrolment.status))throw new Error("Active journey enrolment not found");
  const{data:journey}=await db.from("journey_definitions").select("nodes,edges,status")
    .eq("id",enrolment.journey_id).eq("tenant_id",data.tenantId).maybeSingle();
  if(!journey||journey.status!=="active")throw new Error("Journey is no longer active");
  const nodes=Array.isArray(journey.nodes)?journey.nodes:[];
  const edges=Array.isArray(journey.edges)?journey.edges:[];
  const current=nodes.find((node:any)=>String(node?.id)===String(enrolment.current_node_id));
  if(!current)throw new Error("Journey current node is invalid");
  const state=data.error?"failed":"completed";
  await db.from("journey_execution_log").insert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,enrolment_id:enrolment.id,
    node_id:String(current.id),node_kind:String(current.kind??"unknown"),state,
    outcome:data.outcome??null,output:data.output,error:data.error??null,completed_at:new Date().toISOString()
  });
  if(data.error){
    await db.from("journey_enrolments").update({status:"failed",last_outcome:data.outcome??null,next_run_at:null})
      .eq("id",enrolment.id);
    return{...enrolment,status:"failed"};
  }
  const outgoing=edges.filter((edge:any)=>String(edge?.from)===String(current.id));
  const nextEdge=outgoing.find((edge:any)=>edge?.condition&&String(edge.condition)===String(data.outcome??""))
    ??outgoing.find((edge:any)=>!edge?.condition)??outgoing[0];
  const next=nextEdge?nodes.find((node:any)=>String(node?.id)===String(nextEdge.to)):null;
  if(!next||current.kind==="outcome"){
    const completedAt=new Date().toISOString();
    const{data:done,error:updateError}=await db.from("journey_enrolments").update({
      status:"completed",last_outcome:data.outcome??null,next_run_at:null,completed_at:completedAt
    }).eq("id",enrolment.id).select("*").single();
    if(updateError)throw new Error(updateError.message);
    return done;
  }
  let nextRunAt:string|null=null;let nextStatus="active";
  if(next.kind==="delay"){
    const minutes=Number(next.config?.delayMinutes??next.config?.minutes??0);
    if(Number.isFinite(minutes)&&minutes>0){
      nextRunAt=new Date(Date.now()+minutes*60000).toISOString();nextStatus="waiting";
    }
  }
  const{data:updated,error:updateError}=await db.from("journey_enrolments").update({
    current_node_id:String(next.id),last_outcome:data.outcome??null,next_run_at:nextRunAt,status:nextStatus
  }).eq("id",enrolment.id).select("*").single();
  if(updateError||!updated)throw new Error(updateError?.message??"Journey could not advance");
  await db.from("journey_execution_log").insert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,enrolment_id:enrolment.id,
    node_id:String(next.id),node_kind:String(next.kind??"unknown"),state:nextStatus==="waiting"?"waiting":"started",
    input:{previousNodeId:String(current.id),outcome:data.outcome??null}
  });
  return updated;
});

export const listJourneyEnrolments=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{
  await moduleScope(context,data,"journeys.core");
  const db=context.supabase as any;
  const{data:rows,error}=await db.from("journey_enrolments").select("*")
    .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .order("started_at",{ascending:false}).limit(1000);
  if(error)throw new Error(error.message);return rows??[];
});

const salesStartSchema=scope.extend({
  sequenceId:z.string().uuid(),crmPersonId:z.string().uuid().optional().nullable(),
  subjectRef:z.string().max(240).optional().nullable(),context:z.record(z.string(),z.unknown()).default({})
}).refine((value)=>!!value.crmPersonId||!!value.subjectRef,{message:"crmPersonId or subjectRef is required"});
export const startSalesSequenceEnrolment=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof salesStartSchema>)=>salesStartSchema.parse(input))
.handler(async({context,data})=>{
  await moduleScope(context,data,"sales.core",true);
  const db=context.supabase as any;
  const{data:sequence}=await db.from("sales_sequences").select("*")
    .eq("id",data.sequenceId).eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .eq("status","active").maybeSingle();
  if(!sequence)throw new Error("Active sales sequence not found");
  const steps=Array.isArray(sequence.steps)?sequence.steps:[];
  if(!steps.length)throw new Error("Sales sequence has no steps");
  const delay=Number(steps[0]?.delayMinutes??0);
  const nextRunAt=delay>0?new Date(Date.now()+delay*60000).toISOString():new Date().toISOString();
  const{data:row,error}=await db.from("sales_sequence_enrolments").insert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,sequence_id:data.sequenceId,
    crm_person_id:data.crmPersonId??null,subject_ref:data.subjectRef??null,status:delay>0?"waiting":"active",
    current_step:0,next_run_at:nextRunAt,context:data.context
  }).select("*").single();
  if(error||!row)throw new Error(error?.message??"Sales sequence enrolment could not be started");
  return row;
});

const salesAdvanceSchema=scope.extend({
  enrolmentId:z.string().uuid(),state:z.enum(["sent","completed","skipped","failed"]),
  providerRef:z.string().max(240).optional().nullable(),outcome:z.string().max(240).optional().nullable(),
  payload:z.record(z.string(),z.unknown()).default({}),error:z.string().max(4000).optional().nullable()
});
export const advanceSalesSequenceEnrolment=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof salesAdvanceSchema>)=>salesAdvanceSchema.parse(input))
.handler(async({context,data})=>{
  await moduleScope(context,data,"sales.core",true);
  const db=context.supabase as any;
  const{data:enrolment}=await db.from("sales_sequence_enrolments").select("*")
    .eq("id",data.enrolmentId).eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).maybeSingle();
  if(!enrolment||!["active","waiting"].includes(enrolment.status))throw new Error("Active sales enrolment not found");
  const{data:sequence}=await db.from("sales_sequences").select("steps,status")
    .eq("id",enrolment.sequence_id).eq("tenant_id",data.tenantId).maybeSingle();
  if(!sequence||sequence.status!=="active")throw new Error("Sales sequence is no longer active");
  const steps=Array.isArray(sequence.steps)?sequence.steps:[];
  const step=steps[enrolment.current_step];
  if(!step)throw new Error("Sales sequence current step is invalid");
  await db.from("sales_sequence_events").insert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,enrolment_id:enrolment.id,
    step_index:enrolment.current_step,step_kind:String(step.kind??"task"),state:data.state,
    provider_ref:data.providerRef??null,outcome:data.outcome??null,payload:data.payload,error:data.error??null
  });
  if(data.state==="failed"){
    const{data:failed}=await db.from("sales_sequence_enrolments").update({status:"failed",next_run_at:null})
      .eq("id",enrolment.id).select("*").single();return failed;
  }
  const nextIndex=enrolment.current_step+1;const next=steps[nextIndex];
  if(!next){
    const{data:done}=await db.from("sales_sequence_enrolments").update({
      status:"completed",next_run_at:null,completed_at:new Date().toISOString()
    }).eq("id",enrolment.id).select("*").single();return done;
  }
  const delay=Number(next.delayMinutes??0);
  const nextRunAt=new Date(Date.now()+Math.max(0,Number.isFinite(delay)?delay:0)*60000).toISOString();
  const{data:updated,error:updateError}=await db.from("sales_sequence_enrolments").update({
    current_step:nextIndex,status:delay>0?"waiting":"active",next_run_at:nextRunAt
  }).eq("id",enrolment.id).select("*").single();
  if(updateError)throw new Error(updateError.message);return updated;
});

export const listSalesSequenceEnrolments=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{
  await moduleScope(context,data,"sales.core");
  const db=context.supabase as any;
  const{data:rows,error}=await db.from("sales_sequence_enrolments").select("*")
    .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .order("started_at",{ascending:false}).limit(1000);
  if(error)throw new Error(error.message);return rows??[];
});

const feedbackRequestSchema=scope.extend({
  surveyId:z.string().uuid(),crmPersonId:z.string().uuid().optional().nullable(),
  subjectRef:z.string().max(240).optional().nullable(),expiresInDays:z.number().int().min(1).max(90).default(14),
  metadata:z.record(z.string(),z.unknown()).default({})
}).refine((value)=>!!value.crmPersonId||!!value.subjectRef,{message:"crmPersonId or subjectRef is required"});
export const createFeedbackRequest=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof feedbackRequestSchema>)=>feedbackRequestSchema.parse(input))
.handler(async({context,data})=>{
  await moduleScope(context,data,"feedback.core",true);
  const db=context.supabase as any;
  const{data:survey}=await db.from("feedback_surveys").select("id,channel,status")
    .eq("id",data.surveyId).eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .eq("status","active").maybeSingle();
  if(!survey)throw new Error("Active feedback survey not found");
  const token=randomBytes(32).toString("base64url");
  const tokenHash=createHash("sha256").update(token).digest("hex");
  const expiresAt=new Date(Date.now()+data.expiresInDays*86400000).toISOString();
  const{data:row,error}=await db.from("feedback_requests").insert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,survey_id:data.surveyId,
    crm_person_id:data.crmPersonId??null,subject_ref:data.subjectRef??null,channel:survey.channel,
    delivery_status:"queued",token_hash:tokenHash,expires_at:expiresAt,metadata:data.metadata
  }).select("id,survey_id,channel,delivery_status,expires_at,created_at").single();
  if(error||!row)throw new Error(error?.message??"Feedback request could not be created");
  return{request:row,token};
});
