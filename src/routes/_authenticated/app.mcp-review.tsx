import {createFileRoute,Link} from "@tanstack/react-router";
import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {AppShell} from "@/components/app/shell";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {Badge} from "@/components/ui/badge";
import {ShieldCheck,Cable,RefreshCw} from "lucide-react";
import {toast} from "sonner";
import {listAgentMcpPlatformReview,reviewAgentMcpSetup} from "@/modules/agent-factory/operations.functions";
import {RufloReviewPanel} from "@/modules/agent-factory/RufloReviewPanel";

export const Route=createFileRoute("/_authenticated/app/mcp-review")({
 component:McpReview,
 head:()=>({meta:[{title:"MCP Connector Security Review — Omniqora"},{name:"robots",content:"noindex"}]}),
});
function McpReview(){
 const getFn=useServerFn(listAgentMcpPlatformReview);
 const reviewFn=useServerFn(reviewAgentMcpSetup);
 const q=useQuery({queryKey:["mcp-platform-reviews"],queryFn:()=>getFn({data:{}}),retry:false});
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState("");
 async function decide(id:string,decision:"shortlisted"|"rejected"|"revoked"){
  const reviewNote=(notes[id]??"").trim();
  if(reviewNote.length<16){toast.error("Add a review note of at least 16 characters");return;}
  setBusy(id);
  try{
   await reviewFn({data:{requestId:id,decision,reviewNote}});
   toast.success("Review recorded. No credentials or tools have been connected.");
   await q.refetch();
  }catch(e){toast.error(e instanceof Error?e.message:String(e));}
  finally{setBusy("");}
 }
 return <AppShell title="MCP Connector Security Review" subtitle="Platform-only review of requested registry server names. Shortlisted does not mean connected.">
  <div className="space-y-4">
   <Card><CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
    <p className="max-w-2xl text-sm text-muted-foreground"><ShieldCheck className="mr-2 inline h-4 w-4"/>An independent platform reviewer can shortlist a connector for provenance, transport, permissions, OAuth and vendor risk checks. This screen deliberately cannot execute, install, fund or grant tools.</p>
    <Button variant="outline" size="sm" onClick={()=>q.refetch()} disabled={q.isFetching}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>
   </CardContent></Card>
   {q.isLoading&&<p className="text-sm text-muted-foreground">Checking platform review permissions…</p>}
   {q.error&&<Card><CardContent className="p-5 text-sm text-destructive">Platform administrator access or a completed migration is required. No requests are available to this account.</CardContent></Card>}
   <div className="space-y-3">{(q.data??[]).map(item=><Card key={item.id}><CardContent className="space-y-3 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><b className="inline-flex items-center gap-2 break-all"><Cable className="h-4 w-4"/>{item.registry_name} · {item.registry_version}</b><Badge variant="outline">{item.status}</Badge></div>
    <p className="text-xs text-muted-foreground">Product: {item.product_key} · Tenant ID: {item.tenant_id} · Requested: {item.created_at}</p>
    <p className="text-sm">{item.reason}</p>
    <label className="text-xs font-medium">Independent evidence and review notes
     <Textarea className="mt-1" value={notes[item.id]??""} onChange={e=>setNotes(v=>({...v,[item.id]:e.target.value}))} placeholder="Publisher identity, upstream source, scopes, licensing and required independent checks…"/>
    </label>
    <div className="flex flex-wrap gap-2">
     <Button size="sm" disabled={busy===item.id} onClick={()=>decide(item.id,"shortlisted")}>Shortlist for secure setup</Button>
     <Button size="sm" variant="outline" disabled={busy===item.id} onClick={()=>decide(item.id,"rejected")}>Reject</Button>
     {item.status==="shortlisted"&&<Button size="sm" variant="destructive" disabled={busy===item.id} onClick={()=>decide(item.id,"revoked")}>Revoke shortlist</Button>}
    </div>
   </CardContent></Card>)}</div>
   {!q.isLoading&&!q.error&&q.data?.length===0&&<Card><CardContent className="p-5 text-sm text-muted-foreground">No pending setup requests.</CardContent></Card>}
   <RufloReviewPanel/>
   <Link to="/app/intelligence" className="text-sm text-primary underline">Back to AI Agent Factory</Link>
  </div>
 </AppShell>;
}
