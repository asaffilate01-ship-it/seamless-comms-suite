import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireTenantMembership} from "@/modules/platform/access";

/**
 * Read-only, server-side metadata search of the official MCP Registry.
 * No remote server's MCP endpoint is contacted, installed, approved or invoked.
 * The target hostname is a fixed constant, never supplied by a client.
 */
const registryOrigin="https://registry.modelcontextprotocol.io";
const inputSchema=z.object({
 tenantId:z.string().uuid(),
 search:z.string().trim().max(80).default(""),
 cursor:z.string().max(512).nullish(),
}).strict();

export interface DiscoveredMcpServer {
 name:string;
 version:string;
 description:string;
 status:"discovery_only";
}
const small=(value:unknown,max:number)=>
 typeof value==="string"?value.replace(/[\u0000-\u001f\u007f]/g," ").slice(0,max):"";

export const searchPublicMcpRegistry=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((i:z.input<typeof inputSchema>)=>inputSchema.parse(i))
 .handler(async({context,data})=>{
  await requireTenantMembership(context,data.tenantId);
  const url=new URL("/v0.1/servers",registryOrigin);
  url.searchParams.set("limit","25");
  url.searchParams.set("version","latest");
  if(data.search)url.searchParams.set("search",data.search);
  if(data.cursor)url.searchParams.set("cursor",data.cursor);
  let response:Response;
  try{
   response=await fetch(url.toString(),{method:"GET",redirect:"error",
    headers:{accept:"application/json"},
    signal:AbortSignal.timeout(8000)});
  }catch{throw new Error("Public MCP directory is temporarily unavailable");}
  if(!response.ok)throw new Error("Public MCP directory did not return available metadata");
  const length=Number(response.headers.get("content-length")??0);
  if(!Number.isFinite(length)||length>1024*1024)throw new Error("MCP directory response exceeded limit");
  const payload=await response.text();
  if(payload.length>1024*1024)throw new Error("MCP directory response exceeded limit");
  let parsed:unknown;
  try{parsed=JSON.parse(payload);}catch{throw new Error("Invalid MCP directory response");}
  const schema=z.object({
   servers:z.array(z.object({
    server:z.object({name:z.string().min(1),version:z.string().optional(),
     description:z.string().optional()}).passthrough(),
   }).passthrough()).max(50),
   metadata:z.object({nextCursor:z.string().nullish()}).optional(),
  }).passthrough();
  const result=schema.safeParse(parsed);
  if(!result.success)throw new Error("Unsupported MCP directory response");
  const servers:DiscoveredMcpServer[]=result.data.servers.map(({server})=>({
   name:small(server.name,200),version:small(server.version,80),
   description:small(server.description,400),status:"discovery_only" as const,
  }));
  return{
   source:registryOrigin,
   servers,
   nextCursor:small(result.data.metadata?.nextCursor,512)||null,
   fetchedAt:new Date().toISOString(),
   warning:"Metadata only. Servers are unverified and no tools are connected or authorised.",
  };
 });
