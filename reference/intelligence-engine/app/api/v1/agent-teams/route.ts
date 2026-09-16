import { env } from "cloudflare:workers";
import { requireInternalIdentity } from "@/lib/auth/authorize";

type Bindings={DB?:D1Database;ADMIN_EMAILS?:string};
type TeamInput={name?:string;department?:string;description?:string;defaultAutonomy?:string;agentKeys?:string[]};

export async function GET(request:Request){
  const bindings=env as unknown as Bindings;const auth=requireInternalIdentity(request,bindings,["owner","admin","operator","viewer"]);if("response" in auth)return auth.response;
  if(!bindings.DB)return Response.json({mode:"simulation",teams:[]});
  const rows=await bindings.DB.prepare("SELECT id, name, department, description, default_autonomy, agent_keys_json, version, status, created_at FROM agent_teams ORDER BY department, name LIMIT 100").all();
  return Response.json({teams:rows.results});
}

export async function POST(request:Request){
  const bindings=env as unknown as Bindings;const auth=requireInternalIdentity(request,bindings,["owner","admin"]);if("response" in auth)return auth.response;if(!bindings.DB)return Response.json({error:"Agent-team storage is unavailable"},{status:503});
  let body:TeamInput;try{body=await request.json() as TeamInput}catch{return Response.json({error:"Invalid JSON"},{status:400})}
  if(!body.name||!body.department||!body.description)return Response.json({error:"name, department and description are required"},{status:422});
  const allowed=["draft_only","recommend","bounded_action"];if(body.defaultAutonomy&&!allowed.includes(body.defaultAutonomy))return Response.json({error:"Invalid autonomy level"},{status:422});
  const id=crypto.randomUUID();try{await bindings.DB.prepare("INSERT INTO agent_teams (id, name, department, description, default_autonomy, agent_keys_json, status) VALUES (?, ?, ?, ?, ?, ?, 'draft')").bind(id,body.name,body.department,body.description,body.defaultAutonomy??"draft_only",JSON.stringify(body.agentKeys??[])).run()}catch{return Response.json({error:"Agent team could not be created"},{status:409})}
  return Response.json({id,status:"draft"},{status:201});
}
