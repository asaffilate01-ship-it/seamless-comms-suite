import {createHash,randomUUID} from "node:crypto";
import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {validatePracticeUpload} from "@/modules/practice-delivery/files.server";

const uuid=z.string().uuid();
const bucket="practice-client-documents";

export const listPracticeRequestDocuments=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{requestId:string})=>z.object({requestId:uuid}).parse(i)).handler(async({context,data})=>{
 const db=context.supabase as any;
 const{data:request,error:reqError}=await db.from("practice_document_requests").select("id,tenant_id,product_key,client_id,status").eq("id",data.requestId).maybeSingle();
 if(reqError||!request)throw new Error("Practice request unavailable");
 const{data:rows,error}=await db.from("practice_request_documents").select("id,status,created_at,document:document_records(id,title,current_version,status,metadata)").eq("request_id",data.requestId).order("created_at");
 if(error)throw new Error(error.message);return rows??[];
});

const upload=z.object({
 requestId:uuid,fileName:z.string().min(1).max(240),mimeType:z.enum(["application/pdf","image/png","image/jpeg","text/csv"]),
 base64:z.string().min(4).max(7_100_000),response:z.string().max(10000).default("")
});
export const uploadPracticeRequestDocument=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof upload>)=>upload.parse(i)).handler(async({context,data})=>{
 const db=context.supabase as any;
 const{data:request,error:reqError}=await db.from("practice_document_requests").select("*").eq("id",data.requestId).maybeSingle();
 if(reqError||!request)throw new Error("Practice request unavailable");
 const{data:portal,error:portalError}=await db.from("practice_client_portal_access").select("portal_role,status").eq("client_id",request.client_id).eq("user_id",context.userId).eq("status","active").maybeSingle();
 if(portalError||!portal||!["client_owner","client_contributor"].includes(portal.portal_role))throw new Error("Client portal upload access required");
 if(!["outstanding","rejected"].includes(request.status))throw new Error("Open practice request required");
 const bytes=validatePracticeUpload(data.base64,data.mimeType);
 const{createHash:hash,randomUUID:rid}=await import("node:crypto");
 const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
 const existing=await admin.storage.getBucket(bucket);
 if(!existing.data){
  if(existing.error&&!String(existing.error.message).toLowerCase().includes("not found"))throw new Error("Private practice storage unavailable");
  const made=await admin.storage.createBucket(bucket,{public:false,fileSizeLimit:5242880,allowedMimeTypes:["application/pdf","image/png","image/jpeg","text/csv"]});
  if(made.error&&!String(made.error.message).toLowerCase().includes("already exists"))throw new Error("Private practice storage unavailable");
 }else if(existing.data.public)throw new Error("Practice storage must remain private");
 const safeName=data.fileName.replace(/[\\/\r\n]/g,"_");
 const storagePath=request.tenant_id+"/"+request.client_id+"/"+request.id+"/"+rid();
 const uploaded=await admin.storage.from(bucket).upload(storagePath,bytes,{contentType:data.mimeType,upsert:false});
 if(uploaded.error)throw new Error("Practice file upload failed");
 try{
  const{data:doc,error:docError}=await admin.from("document_records").insert({
   tenant_id:request.tenant_id,product_key:request.product_key,subject_type:"practice_document_request",subject_id:request.id,
   document_type:"client_upload",title:safeName,status:"active",current_version:1,
   metadata:{practiceRequestId:request.id,clientId:request.client_id,source:"client_portal"},created_by:context.userId
  }).select("*").single();
  if(docError)throw new Error(docError.message);
  const version=await admin.from("document_versions").insert({
   document_id:doc.id,tenant_id:request.tenant_id,version:1,storage_ref:bucket+":"+storagePath,mime_type:data.mimeType,
   size_bytes:bytes.length,checksum_sha256:hash("sha256").update(bytes).digest("hex"),
   metadata:{fileName:safeName,bucket,storagePath},created_by:context.userId
  });if(version.error)throw new Error(version.error.message);
  const linked=await admin.from("practice_request_documents").insert({
   tenant_id:request.tenant_id,request_id:request.id,document_id:doc.id,submitted_by:context.userId,status:"submitted"
  });if(linked.error)throw new Error(linked.error.message);
  const responded=await admin.rpc("practice_portal_respond_request",{_request:request.id,_response:data.response,_document:doc.id});
  if(responded.error)throw new Error(responded.error.message);
  return{documentId:doc.id,fileName:safeName};
 }catch(e){
  await admin.storage.from(bucket).remove([storagePath]);
  throw e;
 }
});

export const getPracticeRequestDocumentDownload=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{linkId:string})=>z.object({linkId:uuid}).parse(i)).handler(async({context,data})=>{
 const db=context.supabase as any;
 const{data:link,error}=await db.from("practice_request_documents").select("document_id,request_id,document:document_records(id,title,metadata)").eq("id",data.linkId).maybeSingle();
 if(error||!link)throw new Error("Practice document unavailable");
 const doc:any=link.document;if(!doc)throw new Error("Practice document unavailable");
 const metadata=doc.metadata??{},path=metadata.storagePath;
 const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
 if(!path)throw new Error("Practice document storage reference unavailable");
 const signed=await admin.storage.from(bucket).createSignedUrl(path,60,{download:doc.title});
 if(signed.error)throw new Error("Practice document download unavailable");
 return{url:signed.data.signedUrl,fileName:doc.title};
});
