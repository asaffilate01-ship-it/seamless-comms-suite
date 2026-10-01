import { createHash } from "node:crypto";

function reply(body:unknown,status=200){
 return Response.json(body,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});
}
function pick(payload:Record<string,unknown>,fields:string[]){
 const out:Record<string,unknown>={};for(const field of fields){if(field in payload)out[field]=payload[field];}return out;
}
export async function servePublicTracking(token:string){
 if(!/^[A-Za-z0-9_-]{32,200}$/.test(token))return reply({error:"Tracking link not found"},404);
 const hash=createHash("sha256").update(token).digest("hex");
 const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
 const{data:row}=await db.from("public_tracking_tokens").select("tenant_id,subject_type,subject_id,public_fields,expires_at,revoked_at")
  .eq("token_hash",hash).maybeSingle();
 if(!row||row.revoked_at||Date.parse(row.expires_at)<=Date.now())return reply({error:"Tracking link not found"},404);
 const{data:snapshot}=await db.from("tracking_snapshots").select("status,eta_at,latitude,longitude,heading,progress,public_payload,revision,updated_at")
  .eq("tenant_id",row.tenant_id).eq("subject_type",row.subject_type).eq("subject_id",row.subject_id).maybeSingle();
 if(!snapshot)return reply({subject:{type:row.subject_type,id:row.subject_id},status:"pending",updatedAt:null});
 const base:Record<string,unknown>={
  status:snapshot.status,etaAt:snapshot.eta_at,latitude:snapshot.latitude,longitude:snapshot.longitude,
  heading:snapshot.heading,progress:snapshot.progress,revision:snapshot.revision,updatedAt:snapshot.updated_at,
  ...(snapshot.public_payload??{})
 };
 return reply({subject:{type:row.subject_type,id:row.subject_id},...pick(base,row.public_fields??[])});
}
