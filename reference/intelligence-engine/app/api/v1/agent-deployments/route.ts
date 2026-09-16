import { env } from "cloudflare:workers";
import { requireInternalIdentity } from "@/lib/auth/authorize";

type Bindings={DB?:D1Database;ADMIN_EMAILS?:string};
type DeploymentInput={tenantId?:string;teamId?:string;industryPack?:string;autonomyLevel?:string;knowledgeScopes?:string[];channelScopes?:string[];monthlyRunLimit?:number};

export async function GET(request:Request){
  const bindings=env as unknown as Bindings;const auth=requireInternalIdentity(request,bindings,["owner","admin","operator","viewer"]);if("response" in auth)return auth.response;if(!bindings.DB)return Response.json({mode:"simulation",deployments:[]});
  const tenant=new URL(request.url).searchParams.get("tenant");if(!tenant)return Response.json({error:"tenant query parameter is required"},{status:422});
  const rows=await bindings.DB.prepare("SELECT d.id, d.tenant_id, d.team_id, t.name AS team_name, d.industry_pack, d.autonomy_level, d.monthly_run_limit, d.status, d.updated_at FROM tenant_agent_deployments d JOIN agent_teams t ON t.id = d.team_id WHERE d.tenant_id = ? ORDER BY t.department, t.name").bind(tenant).all();return Response.json({deployments:rows.results});
}

export async function POST(request:Request){
  const bindings=env as unknown as Bindings;const auth=requireInternalIdentity(request,bindings,["owner","admin","operator"]);if("response" in auth)return auth.response;if(!bindings.DB)return Response.json({error:"Deployment storage is unavailable"},{status:503});
  let body:DeploymentInput;try{body=await request.json() as DeploymentInput}catch{return Response.json({error:"Invalid JSON"},{status:400})}
  if(!body.tenantId||!body.teamId||!body.industryPack)return Response.json({error:"tenantId, teamId and industryPack are required"},{status:422});
  const autonomy=body.autonomyLevel??"draft_only";if(!["draft_only","recommend","bounded_action"].includes(autonomy))return Response.json({error:"Invalid autonomy level"},{status:422});
  const [tenant,team]=await Promise.all([bindings.DB.prepare("SELECT id FROM tenants WHERE id = ? LIMIT 1").bind(body.tenantId).first(),bindings.DB.prepare("SELECT id FROM agent_teams WHERE id = ? LIMIT 1").bind(body.teamId).first()]);if(!tenant||!team)return Response.json({error:"Tenant or agent team not found"},{status:404});
  const id=crypto.randomUUID();try{await bindings.DB.prepare("INSERT INTO tenant_agent_deployments (id, tenant_id, team_id, industry_pack, autonomy_level, knowledge_scope_json, channel_scope_json, monthly_run_limit, status, deployed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'simulation', ?)").bind(id,body.tenantId,body.teamId,body.industryPack,autonomy,JSON.stringify(body.knowledgeScopes??[]),JSON.stringify(body.channelScopes??[]),Math.max(0,body.monthlyRunLimit??0),auth.identity.id).run()}catch{return Response.json({error:"Agent team is already deployed for this tenant"},{status:409})}
  return Response.json({id,status:"simulation"},{status:201});
}
