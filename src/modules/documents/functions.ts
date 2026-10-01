import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement, requireWritableTenantRole } from "@/modules/platform/module-access";

const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()});

export const listDocuments=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof scope>&{documentType?:string|null;entityType?:string|null;entityId?:string|null})=>
 scope.extend({documentType:z.string().max(120).optional().nullable(),entityType:z.string().max(120).optional().nullable(),entityId:z.string().max(240).optional().nullable()}).parse(i))
.handler(async({context,data})=>{
 await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"documents.core"});
 const db=context.supabase as any;
 if(data.entityType&&data.entityId){
  const{data:links,error}=await db.from("platform_document_links").select("document_id,relationship")
   .eq("tenant_id",data.tenantId).eq("entity_type",data.entityType).eq("entity_id",data.entityId);
  if(error)throw new Error(error.message);
  const ids=(links??[]).map((x:any)=>x.document_id);if(!ids.length)return[];
  let q=db.from("platform_documents").select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).in("id",ids).neq("status","deleted").order("updated_at",{ascending:false});
  if(data.documentType)q=q.eq("document_type",data.documentType);
  const{data:rows,error:docsError}=await q;if(docsError)throw new Error(docsError.message);return rows??[];
 }
 let q=db.from("platform_documents").select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).neq("status","deleted").order("updated_at",{ascending:false}).limit(1000);
 if(data.documentType)q=q.eq("document_type",data.documentType);
 const{data:rows,error}=await q;if(error)throw new Error(error.message);return rows??[];
});

const createSchema=scope.extend({
 documentKey:z.string().max(200).optional().nullable(),title:z.string().min(1).max(240),
 documentType:z.string().min(1).max(120),locale:z.string().max(20).optional().nullable(),
 tags:z.array(z.string().max(100)).max(100).default([]),metadata:z.record(z.string(),z.unknown()).default({})
});
export const createDocument=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof createSchema>)=>createSchema.parse(i))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"documents.core"});
 requireWritableTenantRole(access.role);const db=context.supabase as any;
 const{data:row,error}=await db.from("platform_documents").insert({
  tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,document_key:data.documentKey??null,
  title:data.title,document_type:data.documentType,status:"draft",owner_user_id:context.userId,
  locale:data.locale??null,tags:data.tags,current_version:0,metadata:data.metadata
 }).select("*").single();
 if(error||!row)throw new Error(error?.message??"Document could not be created");return row;
});

const versionSchema=scope.extend({
 documentId:z.string().uuid(),storageRef:z.string().min(1).max(1000),fileName:z.string().min(1).max(300),
 mimeType:z.string().min(1).max(160),sizeBytes:z.number().int().nonnegative(),
 sha256:z.string().regex(/^[0-9a-f]{64}$/),source:z.enum(["upload","generated","import","provider"]),
 notes:z.string().max(2000).optional().nullable()
});
export const addDocumentVersion=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof versionSchema>)=>versionSchema.parse(i))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"documents.core"});
 requireWritableTenantRole(access.role);
 const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
 const{data:doc}=await admin.from("platform_documents").select("id").eq("id",data.documentId).eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).maybeSingle();
 if(!doc)throw new Error("Document not found");
 const{data:version,error}=await admin.rpc("add_platform_document_version",{
  _tenant:data.tenantId,_document:data.documentId,_storage_ref:data.storageRef,_file_name:data.fileName,
  _mime_type:data.mimeType,_size_bytes:data.sizeBytes,_sha256:data.sha256,_source:data.source,
  _created_by:context.userId,_notes:data.notes??null
 });
 if(error||!version)throw new Error(error?.message??"Document version could not be added");return{version};
});

export const linkDocument=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof scope>&{documentId:string;entityType:string;entityId:string;relationship?:string})=>
 scope.extend({documentId:z.string().uuid(),entityType:z.string().min(1).max(120),entityId:z.string().min(1).max(240),relationship:z.string().max(120).default("attachment")}).parse(i))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"documents.core"});
 requireWritableTenantRole(access.role);const db=context.supabase as any;
 const{data:doc}=await db.from("platform_documents").select("id").eq("id",data.documentId).eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).maybeSingle();
 if(!doc)throw new Error("Document not found");
 const{error}=await db.from("platform_document_links").upsert({
  document_id:data.documentId,tenant_id:data.tenantId,entity_type:data.entityType,entity_id:data.entityId,relationship:data.relationship
 },{onConflict:"document_id,entity_type,entity_id,relationship"});
 if(error)throw new Error(error.message);return{ok:true};
});
