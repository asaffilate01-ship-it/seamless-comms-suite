import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()});
async function partnerScope(context:any,data:z.infer<typeof scope>,write=false){
  const db=context.supabase as any;
  const[{data:membership,error:memberError},{data:product,error:productError}]=await Promise.all([
    db.from("tenant_members").select("role").eq("tenant_id",data.tenantId).eq("user_id",context.userId).maybeSingle(),
    db.from("tenant_products").select("id,status").eq("id",data.tenantProductId).eq("tenant_id",data.tenantId).maybeSingle()
  ]);
  if(memberError||!membership)throw new Error("Tenant access required");
  if(productError||!product||product.status!=="active")throw new Error("Active tenant product required");
  if(write&&!["owner","admin"].includes(membership.role))throw new Error("Tenant owner/admin access required");
  return membership.role as string;
}

export const listTenantPartners=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{
  await partnerScope(context,data);
  const db=context.supabase as any;
  const{data:partners,error}=await db.from("tenant_partners").select("*")
    .eq("tenant_id",data.tenantId)
    .or("tenant_product_id.is.null,tenant_product_id.eq."+data.tenantProductId)
    .order("updated_at",{ascending:false});
  if(error)throw new Error(error.message);
  const ids=(partners??[]).map((p:any)=>p.id);
  const assignments=ids.length
    ?await db.from("tenant_partner_assignments").select("*").eq("tenant_id",data.tenantId).in("partner_id",ids).order("created_at",{ascending:false}).limit(2000)
    :{data:[],error:null};
  if(assignments.error)throw new Error(assignments.error.message);
  return(partners??[]).map((partner:any)=>{
    const rows=(assignments.data??[]).filter((a:any)=>a.partner_id===partner.id);
    const measured=rows.filter((a:any)=>a.status==="completed"&&a.sla_met!==null);
    return{
      ...partner,
      activeAssignments:rows.filter((a:any)=>["offered","accepted","in_progress"].includes(a.status)).length,
      assignments:rows,
      slaPerformance:measured.length?Math.round(measured.filter((a:any)=>a.sla_met).length/measured.length*100):null
    };
  });
});

const partnerSchema=scope.extend({
  id:z.string().uuid().optional(),name:z.string().trim().min(2).max(240),
  partnerType:z.string().trim().min(2).max(120),legalName:z.string().max(240).optional().nullable(),
  countryCode:z.string().length(2).optional().nullable(),contactEmail:z.string().email().optional().nullable(),
  contactPhone:z.string().max(40).optional().nullable(),
  status:z.enum(["draft","pending_review","active","suspended","closed"]).default("draft"),
  verificationStatus:z.enum(["unverified","pending","verified","failed"]).default("unverified"),
  slaTargetPercent:z.number().min(0).max(100).optional().nullable(),
  dataScope:z.array(z.string().max(120)).max(100).default([]),
  serviceScope:z.array(z.string().max(120)).max(100).default([]),
  commissionConfig:z.record(z.string(),z.unknown()).default({}),
  metadata:z.record(z.string(),z.unknown()).default({})
});
export const saveTenantPartner=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof partnerSchema>)=>partnerSchema.parse(input))
.handler(async({context,data})=>{
  await partnerScope(context,data,true);
  const db=context.supabase as any;
  const values={
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,name:data.name,
    partner_type:data.partnerType,legal_name:data.legalName??null,country_code:data.countryCode??null,
    contact_email:data.contactEmail??null,contact_phone:data.contactPhone??null,status:data.status,
    verification_status:data.verificationStatus,sla_target_percent:data.slaTargetPercent??null,
    data_scope:data.dataScope,service_scope:data.serviceScope,commission_config:data.commissionConfig,
    metadata:data.metadata
  };
  const q=data.id
    ?db.from("tenant_partners").update(values).eq("id",data.id).eq("tenant_id",data.tenantId)
    :db.from("tenant_partners").insert({...values,created_by:context.userId});
  const{data:row,error}=await q.select("*").single();
  if(error||!row)throw new Error(error?.message??"Partner could not be saved");
  return row;
});

const assignmentSchema=scope.extend({
  partnerId:z.string().uuid(),subjectType:z.string().min(1).max(120),
  subjectId:z.string().min(1).max(240),dueAt:z.string().datetime().optional().nullable(),
  dataPayload:z.record(z.string(),z.unknown()).default({})
});
export const createPartnerAssignment=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof assignmentSchema>)=>assignmentSchema.parse(input))
.handler(async({context,data})=>{
  await partnerScope(context,data,true);
  const db=context.supabase as any;
  const{data:partner}=await db.from("tenant_partners").select("id,status")
    .eq("id",data.partnerId).eq("tenant_id",data.tenantId).maybeSingle();
  if(!partner||partner.status!=="active")throw new Error("Active partner required");
  const{data:row,error}=await db.from("tenant_partner_assignments").insert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,partner_id:data.partnerId,
    subject_type:data.subjectType,subject_id:data.subjectId,due_at:data.dueAt??null,
    data_payload:data.dataPayload,status:"offered",created_by:context.userId
  }).select("*").single();
  if(error||!row)throw new Error(error?.message??"Partner assignment could not be created");
  return row;
});

const transitionSchema=scope.extend({
  assignmentId:z.string().uuid(),
  status:z.enum(["accepted","declined","in_progress","completed","cancelled","breached"]),
  outcome:z.record(z.string(),z.unknown()).default({})
});
export const transitionPartnerAssignment=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof transitionSchema>)=>transitionSchema.parse(input))
.handler(async({context,data})=>{
  await partnerScope(context,data,true);
  const db=context.supabase as any;
  const{data:current}=await db.from("tenant_partner_assignments").select("*")
    .eq("id",data.assignmentId).eq("tenant_id",data.tenantId)
    .eq("tenant_product_id",data.tenantProductId).maybeSingle();
  if(!current)throw new Error("Partner assignment not found");
  const now=new Date().toISOString();
  const patch:any={status:data.status,outcome:data.outcome};
  if(data.status==="accepted")patch.accepted_at=now;
  if(data.status==="completed"){
    patch.completed_at=now;
    patch.sla_met=current.due_at?Date.now()<=Date.parse(current.due_at):null;
  }
  const{data:row,error}=await db.from("tenant_partner_assignments").update(patch)
    .eq("id",data.assignmentId).select("*").single();
  if(error||!row)throw new Error(error?.message??"Partner assignment could not be updated");
  return row;
});
