import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement } from "@/modules/platform/module-access";
import { COMPLIANCE_PACK_CATALOGUE } from "./pack-catalogue";

export const listCompliancePackCatalogue=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).handler(async()=>COMPLIANCE_PACK_CATALOGUE);

const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),workspaceId:z.string().uuid()});

export const listComplianceAssessments=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof scope>)=>scope.parse(input))
 .handler(async({context,data})=>{
   await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"compliance.core"});
   const db=context.supabase as any;
   const{data:rows,error}=await db.from("compliance_assessments").select("*").eq("workspace_id",data.workspaceId).order("created_at",{ascending:false});
   if(error)throw new Error(error.message);return rows??[];
 });

const createSchema=scope.extend({
 packId:z.string().min(1).max(120),name:z.string().min(3).max(160),legalEntity:z.string().min(2).max(200),
 assessmentScope:z.string().min(10).max(2000),authority:z.string().min(2).max(200),country:z.string().min(2).max(100),
 applicationType:z.string().max(200).optional().nullable(),locationRef:z.string().max(200).optional().nullable(),serviceTypes:z.array(z.string().max(160)).max(50).default([]),
});

export const createComplianceAssessment=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof createSchema>)=>createSchema.parse(input))
 .handler(async({context,data})=>{
   await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"compliance.core"});
   const db=context.supabase as any;
   const{data:id,error}=await db.rpc("create_compliance_assessment",{_workspace:data.workspaceId,_pack:data.packId,_name:data.name,_entity:data.legalEntity,_scope:data.assessmentScope,_authority:data.authority,_country:data.country,_application_type:data.applicationType??null,_location_ref:data.locationRef??null,_service_types:data.serviceTypes});
   if(error||!id)throw new Error(error?.message??"Compliance assessment could not be created");return{id};
 });

export const getComplianceAssessment=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof scope>&{assessmentId:string})=>scope.extend({assessmentId:z.string().uuid()}).parse(input))
 .handler(async({context,data})=>{
   await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"compliance.core"});
   const db=context.supabase as any;
   const [assessment,requirements,correspondence,inspections,obligations]=await Promise.all([
     db.from("compliance_assessments").select("*").eq("id",data.assessmentId).eq("workspace_id",data.workspaceId).single(),
     db.from("compliance_requirements").select("*").eq("assessment_id",data.assessmentId).eq("workspace_id",data.workspaceId).order("id"),
     db.from("compliance_correspondence").select("*").eq("assessment_id",data.assessmentId).eq("workspace_id",data.workspaceId).order("received_or_sent_at",{ascending:false}),
     db.from("compliance_inspections").select("*").eq("assessment_id",data.assessmentId).eq("workspace_id",data.workspaceId).order("scheduled_at",{ascending:true}),
     db.from("compliance_obligations").select("*").eq("assessment_id",data.assessmentId).eq("workspace_id",data.workspaceId).order("next_due_at",{ascending:true}),
   ]);
   if(assessment.error)throw new Error(assessment.error.message);
   return{assessment:assessment.data,requirements:requirements.data??[],correspondence:correspondence.data??[],inspections:inspections.data??[],obligations:obligations.data??[]};
 });