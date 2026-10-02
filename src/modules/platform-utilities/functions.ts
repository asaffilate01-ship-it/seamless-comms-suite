import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const uuid=z.string().uuid();
const scope=z.object({tenantId:uuid});

export const getPlatformUtilities=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 const db=context.supabase as any;
 const rs=await Promise.all([
  db.from("automation_workflows").select("*").eq("tenant_id",data.tenantId).order("updated_at",{ascending:false}),
  db.from("automation_runs").select("*").eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(100),
  db.from("document_records").select("*").eq("tenant_id",data.tenantId).order("updated_at",{ascending:false}).limit(100),
  db.from("form_definitions").select("*").eq("tenant_id",data.tenantId).order("updated_at",{ascending:false}),
  db.from("support_tickets").select("*").eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(100),
  db.from("notification_outbox").select("*").eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(100)
 ]);
 for(const r of rs)if(r.error)throw new Error(r.error.message);
 return{workflows:rs[0].data??[],runs:rs[1].data??[],documents:rs[2].data??[],forms:rs[3].data??[],tickets:rs[4].data??[],notifications:rs[5].data??[]};
});

const workflow=scope.extend({productKey:z.string().max(80).nullish(),name:z.string().min(1).max(160),triggerEvent:z.string().min(3).max(160)});
export const createAutomationWorkflow=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof workflow>)=>workflow.parse(i)).handler(async({context,data})=>{
 const{data:row,error}=await(context.supabase as any).from("automation_workflows").insert({
  tenant_id:data.tenantId,product_key:data.productKey??null,name:data.name,trigger_event:data.triggerEvent,status:"active",
  definition:{nodes:[{id:"trigger",type:"trigger"},{id:"notify",type:"notification"}],edges:[{from:"trigger",to:"notify"}]},created_by:context.userId
 }).select("*").single();if(error)throw new Error(error.message);return row;
});
const doc=scope.extend({productKey:z.string().max(80).nullish(),title:z.string().min(1).max(200),documentType:z.string().min(1).max(100),subjectType:z.string().max(80).nullish(),subjectId:z.string().max(200).nullish(),storageRef:z.string().min(1).max(1000),mimeType:z.string().max(120).nullish()});
export const createDocumentRecord=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof doc>)=>doc.parse(i)).handler(async({context,data})=>{
 const db=context.supabase as any;const d=await db.from("document_records").insert({tenant_id:data.tenantId,product_key:data.productKey??null,title:data.title,document_type:data.documentType,subject_type:data.subjectType??null,subject_id:data.subjectId??null,created_by:context.userId}).select("*").single();if(d.error)throw new Error(d.error.message);
 const v=await db.from("document_versions").insert({document_id:d.data.id,tenant_id:data.tenantId,version:1,storage_ref:data.storageRef,mime_type:data.mimeType??null,created_by:context.userId});if(v.error)throw new Error(v.error.message);return d.data;
});
const form=scope.extend({productKey:z.string().max(80).nullish(),formKey:z.string().regex(/^[a-z0-9-]{1,100}$/),name:z.string().min(1).max(160),schema:z.record(z.string(),z.unknown()).default({fields:[],sections:[]})});
export const createFormDefinition=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof form>)=>form.parse(i)).handler(async({context,data})=>{
 const{data:row,error}=await(context.supabase as any).from("form_definitions").insert({tenant_id:data.tenantId,product_key:data.productKey??null,form_key:data.formKey,name:data.name,status:"active",schema:data.schema}).select("*").single();if(error)throw new Error(error.message);return row;
});
const ticket=scope.extend({productKey:z.string().max(80).nullish(),subject:z.string().min(1).max(240),description:z.string().max(5000).nullish(),priority:z.enum(["low","normal","high","urgent"]).default("normal")});
export const createSupportTicket=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof ticket>)=>ticket.parse(i)).handler(async({context,data})=>{
 const{data:row,error}=await(context.supabase as any).from("support_tickets").insert({tenant_id:data.tenantId,product_key:data.productKey??null,subject:data.subject,description:data.description??null,priority:data.priority,status:"open",channel:"internal"}).select("*").single();if(error)throw new Error(error.message);return row;
});
export const searchUtilities=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;query:string})=>z.object({tenantId:uuid,query:z.string().min(1).max(200)}).parse(i)).handler(async({context,data})=>{
 const r=await(context.supabase as any).rpc("search_tenant",{_tenant:data.tenantId,_query:data.query,_limit:50});if(r.error)throw new Error(r.error.message);return r.data??[];
});
