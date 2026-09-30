import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const allowedMime=new Set([
  "image/jpeg","image/png","image/webp","image/heic","image/heif","image/tiff",
  "application/pdf","text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);

function safeFileName(value:string){
  const normalized=value.normalize("NFKC").replace(/[^A-Za-z0-9._ -]+/g,"_").replace(/\s+/g," ").trim();
  if(!normalized||normalized==="."||normalized==="..")throw new Error("Invalid file name");
  return normalized.slice(0,220);
}

async function clientAccountingAccess(context:any,input:{tenantId:string;tenantProductId:string;practiceClientId:string}){
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const[{data:tp},{data:client},{data:grant},{data:service},{data:portal}]=await Promise.all([
    admin.from("tenant_products").select("id,status").eq("id",input.tenantProductId).eq("tenant_id",input.tenantId).maybeSingle(),
    admin.from("practice_clients").select("id").eq("id",input.practiceClientId).eq("tenant_id",input.tenantId)
      .eq("tenant_product_id",input.tenantProductId).maybeSingle(),
    admin.from("tenant_module_entitlements").select("enabled,starts_at,ends_at").eq("tenant_id",input.tenantId)
      .eq("tenant_product_id",input.tenantProductId).eq("module_key","accounting_ai.core").eq("enabled",true).maybeSingle(),
    admin.from("practice_client_services").select("enabled,starts_at,ends_at").eq("practice_client_id",input.practiceClientId)
      .eq("module_key","accounting_ai.core").eq("enabled",true).maybeSingle(),
    admin.from("practice_client_users").select("id,status,portal_role").eq("practice_client_id",input.practiceClientId)
      .eq("user_id",context.userId).eq("status","active").maybeSingle()
  ]);
  if(!tp||tp.status!=="active"||!client)throw new Error("Active practice/client scope required");
  const now=Date.now();const active=(x:any)=>!!x?.enabled&&(!x.starts_at||Date.parse(x.starts_at)<=now)&&(!x.ends_at||Date.parse(x.ends_at)>now);
  if(!active(grant)||!active(service))throw new Error("AI Bookkeeping is not enabled for this client");
  const db=context.supabase as any;
  const{data:member}=await db.from("tenant_members").select("role").eq("tenant_id",input.tenantId).eq("user_id",context.userId).maybeSingle();
  if(!member&&!portal)throw new Error("Practice/client access required");
  return{staff:!!member,portalRole:portal?.portal_role??null,admin};
}

const uploadSchema=z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),practiceClientId:z.string().uuid(),
  batchId:z.string().uuid(),
  sourceType:z.enum(["receipt","purchase_invoice","sales_invoice","bank_statement","credit_card_statement","opening_accounts","opening_trial_balance","journal","other"]),
  fileName:z.string().min(1).max(260),mimeType:z.string().min(1).max(160)
});

export const createAccountingUploadUrl=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof uploadSchema>)=>uploadSchema.parse(input))
.handler(async({context,data})=>{
  const access=await clientAccountingAccess(context,data);
  if(!allowedMime.has(data.mimeType))throw new Error("Unsupported accounting upload type");
  const fileName=safeFileName(data.fileName);
  const{data:batch}=await access.admin.from("accounting_intake_batches").select("id,status")
    .eq("id",data.batchId).eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .eq("practice_client_id",data.practiceClientId).maybeSingle();
  if(!batch||!["draft","uploaded","review","failed"].includes(batch.status))throw new Error("Open accounting intake batch required");

  const sessionId=randomUUID();
  const storageRef="accounting/"+data.tenantId+"/"+data.practiceClientId+"/"+data.batchId+"/"+sessionId+"/"+fileName;
  const expiresAt=new Date(Date.now()+15*60*1000).toISOString();
  const{error:sessionError}=await access.admin.from("accounting_upload_sessions").insert({
    id:sessionId,tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,
    practice_client_id:data.practiceClientId,batch_id:data.batchId,requested_by:context.userId,
    source_type:data.sourceType,storage_ref:storageRef,file_name:fileName,mime_type:data.mimeType,
    state:"initiated",expires_at:expiresAt
  });
  if(sessionError)throw new Error(sessionError.message);

  const bucket=process.env.OMNIQORA_DOCUMENT_BUCKET??"documents";
  const storage=(access.admin as any).storage.from(bucket);
  const{data:signed,error:signedError}=await storage.createSignedUploadUrl(storageRef);
  if(signedError||!signed){
    await access.admin.from("accounting_upload_sessions").delete().eq("id",sessionId);
    throw new Error(signedError?.message??"Signed upload URL could not be created");
  }
  return{
    sessionId,bucket,storageRef,fileName,mimeType:data.mimeType,expiresAt,
    signedUrl:signed.signedUrl??signed.signedURL??null,
    token:signed.token??null,
    maxBytes:52428800
  };
});

export const finalizeAccountingUpload=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{sessionId:string;sizeBytes:number;sha256:string})=>z.object({
  sessionId:z.string().uuid(),sizeBytes:z.number().int().min(1).max(52428800),sha256:z.string().regex(/^[0-9a-f]{64}$/)
}).parse(input))
.handler(async({context,data})=>{
  const db=context.supabase as any;
  const{data:result,error}=await db.rpc("finalize_accounting_upload",{
    _session:data.sessionId,_size_bytes:data.sizeBytes,_sha256:data.sha256
  });
  if(error||!result)throw new Error(error?.message??"Accounting upload could not be finalised");
  return result;
});

export const listClientAccountingQuestions=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{tenantId:string;tenantProductId:string;practiceClientId:string;openOnly?:boolean})=>z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),practiceClientId:z.string().uuid(),openOnly:z.boolean().default(true)
}).parse(input))
.handler(async({context,data})=>{
  const access=await clientAccountingAccess(context,data);
  const db=context.supabase as any;
  let q=db.from("accounting_review_items")
    .select("id,proposal_id,issue_type,question,options,evidence_refs,status,answer,answered_at,created_at,proposal:accounting_staging_entries(id,practice_client_id,transaction_date,counterparty,description,gross_minor,currency,treatment,confidence)")
    .eq("tenant_id",data.tenantId).in("audience",access.staff?["staff","client","both"]:["client","both"])
    .order("created_at",{ascending:true}).limit(1000);
  if(data.openOnly)q=q.in("status",["open","answered"]);
  const{data:rows,error}=await q;if(error)throw new Error(error.message);
  return(rows??[]).filter((row:any)=>row.proposal?.practice_client_id===data.practiceClientId);
});

export const answerClientAccountingQuestion=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{tenantId:string;tenantProductId:string;practiceClientId:string;reviewItemId:string;answer:Record<string,unknown>})=>z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),practiceClientId:z.string().uuid(),
  reviewItemId:z.string().uuid(),answer:z.record(z.string(),z.unknown())
}).parse(input))
.handler(async({context,data})=>{
  const access=await clientAccountingAccess(context,data);
  if(access.staff)throw new Error("Practice staff should resolve accounting review items in the staff review workflow");
  const db=context.supabase as any;
  const{data:row}=await db.from("accounting_review_items")
    .select("id,proposal:accounting_staging_entries(practice_client_id)")
    .eq("id",data.reviewItemId).eq("tenant_id",data.tenantId).maybeSingle();
  if(!row||(row as any).proposal?.practice_client_id!==data.practiceClientId)throw new Error("Client accounting question not found");
  const{data:result,error}=await db.rpc("answer_accounting_review_item",{
    _review_item:data.reviewItemId,_answer:data.answer
  });
  if(error||!result)throw new Error(error?.message??"Accounting question could not be answered");
  return result;
});
