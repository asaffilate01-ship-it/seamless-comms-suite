import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement, requireWritableTenantRole } from "@/modules/platform/module-access";

const subjectTypes=z.enum(["dispatch_job","order","booking","case","external"]);
const allowedFields=z.enum([
  "status","etaAt","latitude","longitude","heading","progress","driverName",
  "driverPhoneMasked","vehicle","nextStop","message","pod","ratingEnabled"
]);
const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()});

async function trackingScope(context:any,data:z.infer<typeof scope>,write=false){
  const access=await requireModuleEntitlement(context,{...data,moduleKey:"geo.core"}).catch(async()=>{
    return requireModuleEntitlement(context,{...data,moduleKey:"dispatch.core"});
  });
  if(write)requireWritableTenantRole(access.role);
  return access;
}

const createSchema=scope.extend({
  subjectType:subjectTypes,subjectId:z.string().min(1).max(200),
  publicFields:z.array(allowedFields).min(1).max(20),
  expiresInHours:z.number().int().min(1).max(24*30).default(72)
});
export const createPublicTrackingLink=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof createSchema>)=>createSchema.parse(input))
.handler(async({context,data})=>{
  await trackingScope(context,data,true);
  const db=context.supabase as any;
  if(data.subjectType==="dispatch_job"){
    const{data:job}=await db.from("dispatch_jobs").select("id,status")
      .eq("id",data.subjectId).eq("tenant_id",data.tenantId)
      .eq("tenant_product_id",data.tenantProductId).maybeSingle();
    if(!job)throw new Error("Dispatch job not found");
  }
  const token=randomBytes(32).toString("base64url");
  const tokenHash=createHash("sha256").update(token).digest("hex");
  const expiresAt=new Date(Date.now()+data.expiresInHours*3600000).toISOString();
  const{data:row,error}=await db.from("public_tracking_tokens").insert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,token_hash:tokenHash,
    subject_type:data.subjectType,subject_id:data.subjectId,public_fields:data.publicFields,
    expires_at:expiresAt,created_by:context.userId
  }).select("id,subject_type,subject_id,public_fields,expires_at,created_at").single();
  if(error||!row)throw new Error(error?.message??"Tracking link could not be created");
  return{...row,token,path:"/track/"+token};
});

export const listPublicTrackingLinks=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{
  await trackingScope(context,data);
  const db=context.supabase as any;
  const{data:rows,error}=await db.from("public_tracking_tokens")
    .select("id,subject_type,subject_id,public_fields,expires_at,revoked_at,created_at")
    .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .order("created_at",{ascending:false}).limit(500);
  if(error)throw new Error(error.message);
  return rows??[];
});

const revokeSchema=scope.extend({tokenId:z.string().uuid()});
export const revokePublicTrackingLink=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof revokeSchema>)=>revokeSchema.parse(input))
.handler(async({context,data})=>{
  await trackingScope(context,data,true);
  const db=context.supabase as any;
  const{data:row,error}=await db.from("public_tracking_tokens")
    .update({revoked_at:new Date().toISOString()})
    .eq("id",data.tokenId).eq("tenant_id",data.tenantId)
    .eq("tenant_product_id",data.tenantProductId)
    .select("id,revoked_at").single();
  if(error||!row)throw new Error(error?.message??"Tracking link could not be revoked");
  return row;
});

const snapshotSchema=scope.extend({
  subjectType:subjectTypes,subjectId:z.string().min(1).max(200),
  status:z.string().max(120).optional().nullable(),etaAt:z.string().datetime().optional().nullable(),
  lat:z.number().min(-90).max(90).optional().nullable(),lng:z.number().min(-180).max(180).optional().nullable(),
  heading:z.number().min(0).lt(360).optional().nullable(),progress:z.number().min(0).max(100).optional().nullable(),
  publicPayload:z.record(z.string(),z.unknown()).default({})
});
export const saveTrackingSnapshot=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof snapshotSchema>)=>snapshotSchema.parse(input))
.handler(async({context,data})=>{
  await trackingScope(context,data,true);
  const db=context.supabase as any;
  const{data:existing}=await db.from("tracking_snapshots").select("revision")
    .eq("tenant_id",data.tenantId).eq("subject_type",data.subjectType).eq("subject_id",data.subjectId).maybeSingle();
  const{data:row,error}=await db.from("tracking_snapshots").upsert({
    tenant_id:data.tenantId,subject_type:data.subjectType,subject_id:data.subjectId,
    status:data.status??null,eta_at:data.etaAt??null,latitude:data.lat??null,longitude:data.lng??null,
    heading:data.heading??null,progress:data.progress??null,public_payload:data.publicPayload,
    revision:(existing?.revision??0)+1,updated_at:new Date().toISOString()
  },{onConflict:"tenant_id,subject_type,subject_id"}).select("*").single();
  if(error||!row)throw new Error(error?.message??"Tracking snapshot could not be saved");
  return row;
});
