import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {eventMatches} from "@/modules/platform/events";

const scope=z.object({tenantId:z.string().uuid()});

async function access(context:any,tenantId:string,write=false){
  const db=context.supabase as any;
  const [member,platform]=await Promise.all([
    db.from("tenant_members").select("role").eq("tenant_id",tenantId).eq("user_id",context.userId).maybeSingle(),
    db.rpc("is_platform_admin",{_user:context.userId}),
  ]);
  if(member.error)throw new Error(member.error.message);
  if(platform.error)throw new Error(platform.error.message);
  if(!member.data&&!platform.data)throw new Error("Connected operations tenant access denied");
  const role=platform.data?"platform_admin":String(member.data?.role??"viewer");
  if(write&&!["platform_admin","owner","admin","manager","agent"].includes(role))throw new Error("Connected operations write access denied");
  return{db,role,isPlatformAdmin:!!platform.data};
}

async function emitInternalProductEvent(db:any,input:{
  tenantId:string;productKey:string;eventType:string;subjectType:string;subjectId:string;
  idempotencyKey:string;payload:Record<string,unknown>;
}){
  const existing=await db.from("platform_events").select("id").eq("tenant_id",input.tenantId)
    .eq("product_key",input.productKey).eq("idempotency_key",input.idempotencyKey).maybeSingle();
  if(existing.error)throw new Error(existing.error.message);
  if(existing.data)return existing.data.id as string;

  const inserted=await db.from("platform_events").insert({
    tenant_id:input.tenantId,product_key:input.productKey,event_type:input.eventType,event_version:1,
    occurred_at:new Date().toISOString(),source_service:"omniqora.connected-operations",
    subject_type:input.subjectType,subject_id:input.subjectId,idempotency_key:input.idempotencyKey,
    data_classification:"internal",payload:input.payload,
  }).select("id").single();
  if(inserted.error||!inserted.data)throw new Error(inserted.error?.message??"Event could not be created");

  const subscriptions=await db.from("platform_event_subscriptions").select("id,event_patterns,product_key")
    .eq("tenant_id",input.tenantId).eq("status","active");
  if(subscriptions.error)throw new Error(subscriptions.error.message);
  const matching=(subscriptions.data??[]).filter((s:any)=>
    (!s.product_key||s.product_key===input.productKey)&&
    (s.event_patterns??[]).some((pattern:string)=>eventMatches(pattern,input.eventType))
  );
  if(matching.length){
    const fanout=await db.from("platform_event_deliveries").insert(matching.map((s:any)=>({
      event_id:inserted.data.id,subscription_id:s.id,tenant_id:input.tenantId,status:"queued",
    })));
    if(fanout.error&&fanout.error.code!=="23505")throw new Error(fanout.error.message);
  }
  return inserted.data.id as string;
}

export const getConnectedOperations=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((input:z.infer<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{
  const{db}=await access(context,data.tenantId);
  const results=await Promise.all([
    db.from("connected_operation_targets").select("*").eq("tenant_id",data.tenantId).order("status").order("name"),
    db.from("pricing_intelligence_queue").select("*").eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(500),
    db.from("display_orchestration_links").select("*").eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(500),
  ]);
  for(const r of results)if(r.error)throw new Error(r.error.message);
  return{targets:results[0].data??[],pricing:results[1].data??[],displayLinks:results[2].data??[]};
});

export const decideConnectedPricingRecommendation=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((input:unknown)=>scope.extend({
  recommendationId:z.string().uuid(),decision:z.enum(["approved","rejected"]),
}).parse(input))
.handler(async({context,data})=>{
  const{db}=await access(context,data.tenantId,true);
  const decided=await db.rpc("decide_pricing_recommendation",{
    _tenant:data.tenantId,_recommendation:data.recommendationId,_decision:data.decision,
  });
  if(decided.error)throw new Error(decided.error.message);
  const row=Array.isArray(decided.data)?decided.data[0]:decided.data;
  if(!row)throw new Error("Pricing recommendation was not returned");

  const eventId=await emitInternalProductEvent(db,{
    tenantId:data.tenantId,productKey:String(row.product_key),eventType:"omniqora.pricing.decision",
    subjectType:"menu_item",subjectId:String(row.external_item_ref),
    idempotencyKey:"pricing-decision:"+row.id+":"+data.decision,
    payload:{
      recommendationId:row.id,decision:data.decision,externalItemRef:row.external_item_ref,
      externalLocationRef:row.external_location_ref,channelKey:row.channel_key,fulfilment:row.fulfilment,
      currency:row.currency,currentMinor:Number(row.current_minor),recommendedMinor:Number(row.recommended_minor),
      targetMarginBps:row.target_margin_bps,sourceRef:row.source_ref,
    },
  });
  return{recommendation:row,eventId};
});

export const createConnectedDisplayAssignment=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((input:unknown)=>scope.extend({
  productKey:z.string().min(2).max(80),
  externalProfileRef:z.string().min(1).max(200),
  externalLocationRef:z.string().max(200).nullish(),
  campaignRef:z.string().max(200).nullish(),
  contentRef:z.string().max(200).nullish(),
  assignmentType:z.enum(["campaign","promotion","emergency","daypart","sponsor"]).default("campaign"),
  startsAt:z.string().datetime().nullish(),endsAt:z.string().datetime().nullish(),
  targeting:z.record(z.string(),z.unknown()).default({}),
  metadata:z.record(z.string(),z.unknown()).default({}),
}).parse(input))
.handler(async({context,data})=>{
  const{db}=await access(context,data.tenantId,true);
  const inserted=await db.from("display_orchestration_links").insert({
    tenant_id:data.tenantId,product_key:data.productKey,external_profile_ref:data.externalProfileRef,
    external_location_ref:data.externalLocationRef??null,campaign_ref:data.campaignRef??null,content_ref:data.contentRef??null,
    assignment_type:data.assignmentType,status:data.startsAt?"scheduled":"active",starts_at:data.startsAt??null,ends_at:data.endsAt??null,
    targeting:data.targeting,metadata:data.metadata,created_by:context.userId,
  }).select("*").single();
  if(inserted.error)throw new Error(inserted.error.message);

  const eventId=await emitInternalProductEvent(db,{
    tenantId:data.tenantId,productKey:data.productKey,eventType:"omniqora.display.assignment",
    subjectType:"display_profile",subjectId:data.externalProfileRef,
    idempotencyKey:"display-assignment:"+inserted.data.id,
    payload:{
      assignmentId:inserted.data.id,externalProfileRef:data.externalProfileRef,
      externalLocationRef:data.externalLocationRef??null,campaignRef:data.campaignRef??null,
      contentRef:data.contentRef??null,assignmentType:data.assignmentType,status:inserted.data.status,
      startsAt:data.startsAt??null,endsAt:data.endsAt??null,targeting:data.targeting,metadata:data.metadata,
    },
  });
  return{assignment:inserted.data,eventId};
});
