import { env } from "cloudflare:workers";
import { requireInternalIdentity } from "@/lib/auth/authorize";
type Bindings={ADMIN_EMAILS?:string};
export async function POST(request:Request,context:{params:Promise<{app:string}>}){const auth=requireInternalIdentity(request,env as unknown as Bindings,["owner","admin","operator"]);if("response" in auth)return auth.response;const {app}=await context.params;return Response.json({application:app,status:"reachable",mode:"simulation",checks:{signature:true,event_contract:true,idempotency:true,round_trip_ms:42},tested_at:new Date().toISOString()});}
