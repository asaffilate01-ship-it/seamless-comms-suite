import { createHash } from "node:crypto";
function reply(body:unknown,status=200){return Response.json(body,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});}
export async function servePublicTracking(token:string){
 if(!/^[A-Za-z0-9_-]{32,200}$/.test(token))return reply({error:"Tracking link not found"},404);
 const hash=createHash("sha256").update(token).digest("hex");
 const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
 const{data:row}=await db.from("public_tracking_tokens").select("tenant_id,subject_type,subject_id,public_fields,expires_at,revoked_at").eq("token_hash",hash).maybeSingle();
 if(!row||row.revoked_at||Date.parse(row.expires_at)<=Date.now())return reply({error:"Tracking link not found"},404);
 const{data:s}=await db.from("tracking_snapshots").select("*").eq("tenant_id",row.tenant_id).eq("subject_type",row.subject_type).eq("subject_id",row.subject_id).maybeSingle();
 if(!s)return reply({subject:{type:row.subject_type,id:row.subject_id},status:"pending",updatedAt:null});
 const source:any={status:s.status,etaAt:s.eta_at,latitude:s.latitude,longitude:s.longitude,heading:s.heading,progress:s.progress,updatedAt:s.updated_at,...(s.public_payload??{})};
 const payload:any={subject:{type:row.subject_type,id:row.subject_id}};for(const f of row.public_fields??[])if(f in source)payload[f]=source[f];
 return reply(payload);
}
