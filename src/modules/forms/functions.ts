import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement, requireAdminTenantRole, requireWritableTenantRole } from "@/modules/platform/module-access";

const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()});
const createForm=scope.extend({
 formKey:z.string().regex(/^[a-z0-9][a-z0-9._-]{1,119}$/),name:z.string().min(2).max(200),
 localeKeys:z.array(z.string().min(2).max(20)).min(1).max(50),
 fields:z.array(z.unknown()).max(500),sections:z.array(z.unknown()).max(100),
 metadata:z.record(z.string(),z.unknown()).default({})
});
export const createTenantForm=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof createForm>)=>createForm.parse(i))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"forms.core"});
 requireAdminTenantRole(access.role);const db=context.supabase as any;
 const{data:def,error}=await db.from("form_definitions").insert({
  tenant_id:data.tenantId,product_key:null,form_key:data.formKey,name:data.name
 }).select("id").single();
 if(error||!def)throw new Error(error?.message??"Form definition could not be created");
 const{error:ve}=await db.from("form_versions").insert({
  definition_id:def.id,tenant_id:data.tenantId,version:1,status:"draft",
  locale_keys:data.localeKeys,fields:data.fields,sections:data.sections,metadata:data.metadata,created_by:context.userId
 });
 if(ve)throw new Error(ve.message);return{id:def.id,version:1};
});

export const publishTenantForm=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof scope>&{definitionId:string;version:number})=>scope.extend({definitionId:z.string().uuid(),version:z.number().int().positive()}).parse(i))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"forms.core"});
 requireAdminTenantRole(access.role);const db=context.supabase as any;
 const{data:v}=await db.from("form_versions").select("definition_id,version").eq("definition_id",data.definitionId)
  .eq("tenant_id",data.tenantId).eq("version",data.version).maybeSingle();
 if(!v)throw new Error("Form version not found");
 await db.from("form_versions").update({status:"retired"}).eq("definition_id",data.definitionId).eq("tenant_id",data.tenantId).eq("status","active");
 const{error}=await db.from("form_versions").update({status:"active"}).eq("definition_id",data.definitionId).eq("tenant_id",data.tenantId).eq("version",data.version);
 if(error)throw new Error(error.message);
 await db.from("form_definitions").update({active_version:data.version}).eq("id",data.definitionId).eq("tenant_id",data.tenantId);
 return{ok:true};
});

const submission=scope.extend({
 definitionId:z.string().uuid(),formVersion:z.number().int().positive(),subjectType:z.string().max(80).optional().nullable(),
 subjectId:z.string().max(200).optional().nullable(),answers:z.record(z.string(),z.unknown()).default({}),submit:z.boolean().default(false)
});
export const saveFormSubmission=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof submission>)=>submission.parse(i))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"forms.core"});
 requireWritableTenantRole(access.role);const db=context.supabase as any;
 const{data:v}=await db.from("form_versions").select("definition_id,version,status").eq("definition_id",data.definitionId)
  .eq("version",data.formVersion).or(`tenant_id.eq.${data.tenantId},tenant_id.is.null`).maybeSingle();
 if(!v||!["active","draft"].includes(v.status))throw new Error("Form version not available");
 const{data:row,error}=await db.from("form_submissions").insert({
  tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,definition_id:data.definitionId,
  form_version:data.formVersion,subject_type:data.subjectType??null,subject_id:data.subjectId??null,
  status:data.submit?"submitted":"draft",answers:data.answers,submitted_by:data.submit?context.userId:null,
  submitted_at:data.submit?new Date().toISOString():null,revision:1
 }).select("*").single();
 if(error||!row)throw new Error(error?.message??"Form submission could not be saved");return row;
});
