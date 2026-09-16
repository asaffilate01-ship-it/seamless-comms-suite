import { env } from "cloudflare:workers";
import { requireInternalIdentity } from "@/lib/auth/authorize";
type Bindings={DB?:D1Database;ADMIN_EMAILS?:string};
type Decision={decision?:"approved"|"rejected";note?:string};
export async function POST(request:Request,context:{params:Promise<{approval:string}>}){
  const bindings=env as unknown as Bindings;const auth=requireInternalIdentity(request,bindings,["owner","admin","operator"]);if("response" in auth)return auth.response;if(!bindings.DB)return Response.json({error:"Approval storage is unavailable"},{status:503});
  const {approval}=await context.params;let body:Decision;try{body=await request.json() as Decision}catch{return Response.json({error:"Invalid JSON"},{status:400})}if(!body.decision||!["approved","rejected"].includes(body.decision))return Response.json({error:"decision must be approved or rejected"},{status:422});
  const item=await bindings.DB.prepare("SELECT id, requested_by, status FROM approvals WHERE id = ? LIMIT 1").bind(approval).first<{id:string;requested_by:string;status:string}>();if(!item)return Response.json({error:"Approval not found"},{status:404});if(item.status!=="pending")return Response.json({error:"Approval has already been decided"},{status:409});if(item.requested_by===auth.identity.id)return Response.json({error:"Two-person control: requester cannot approve their own action"},{status:403});
  const auditId=crypto.randomUUID();await bindings.DB.batch([bindings.DB.prepare("UPDATE approvals SET status = ?, decided_by = ?, decision_note = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'").bind(body.decision,auth.identity.id,body.note??null,approval),bindings.DB.prepare("INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, metadata_json) VALUES (?, ?, 'approval.decided', 'approval', ?, ?)").bind(auditId,auth.identity.id,approval,JSON.stringify({decision:body.decision}))]);return Response.json({approval_id:approval,status:body.decision});
}
