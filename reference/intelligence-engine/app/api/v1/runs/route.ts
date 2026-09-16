import { env } from "cloudflare:workers";
import { requireInternalIdentity } from "@/lib/auth/authorize";
type Bindings={DB?:D1Database;ADMIN_EMAILS?:string};
export async function GET(request:Request){const bindings=env as unknown as Bindings;const auth=requireInternalIdentity(request,bindings,["owner","admin","operator","viewer"]);if("response" in auth)return auth.response;if(!bindings.DB)return Response.json({mode:"simulation",runs:[]});const rows=await bindings.DB.prepare("SELECT id, workflow_id, application_id, status, mode, started_by, started_at, finished_at, duration_ms, estimated_cost_pence FROM workflow_runs ORDER BY started_at DESC LIMIT 100").all();return Response.json({runs:rows.results});}
