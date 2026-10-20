import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {Badge} from "@/components/ui/badge";
import {Bot,RefreshCw,ShieldCheck} from "lucide-react";
import {toast} from "sonner";
import {getRufloPilotStatus,requestRufloPilot} from "./ruflo.functions";

/**
 * Ruflo is an optional orchestration backend, never a second tenant authority.
 * Operator-facing read-only status and approval request, not a runtime switch.
 */
export function RufloPilotPanel({tenantId,productKey}:{tenantId:string;productKey:string}){
 const getStatus=useServerFn(getRufloPilotStatus);
 const request=useServerFn(requestRufloPilot);
 const status=useQuery({
  queryKey:["ruflo-orchestrator-pilot",tenantId,productKey],
  queryFn:()=>getStatus({data:{tenantId,productKey}}),
  enabled:!!tenantId&&!!productKey,retry:false,
 });
 const [reason,setReason]=useState("Request a tenant-scoped, read-only Ruflo MCP sandbox evaluation with independent platform security review.");
 const [saving,setSaving]=useState(false);
 const pilot=status.data?.pilot;
 const binding=status.data?.binding;
 async function submit(){
  if(reason.trim().length<16||reason.length>500)return;
  setSaving(true);
  try{
   await request({data:{tenantId,productKey,reason:reason.trim()}});
   toast.success("Ruflo review requested. No agent or MCP worker was connected.");
   await status.refetch();
  }catch(e){toast.error(e instanceof Error?e.message:String(e));}
  finally{setSaving(false);}
 }
 return <Card><CardContent className="space-y-4 p-5">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h2 className="flex items-center gap-2 font-semibold"><Bot className="h-4 w-4"/> Ruflo multi-agent orchestration pilot</h2>
   <div className="flex gap-2">
    <Badge variant="outline">{binding?.status??"disabled"}</Badge>
    <Button variant="outline" size="sm" disabled={status.isFetching||!tenantId||!productKey} onClick={()=>status.refetch()}>
     <RefreshCw className="mr-1 h-3 w-3"/>Refresh
    </Button>
   </div>
  </div>
  <p className="text-sm text-muted-foreground">
   Ruflo is assessed as an optional MCP sandbox beside Omniqora's existing Intelligence, AI Factory, approved blueprints and budgeted jobs.
   This interface cannot run customer agents, install tools, disclose tenant data or enable a connector.
  </p>
  {status.error&&<p role="alert" className="text-sm text-destructive">
   Ruflo database migration or scoped access is unavailable. No Ruflo activation has taken place.
  </p>}
  <div className="grid gap-2 text-sm sm:grid-cols-3">
   <div className="rounded-md border p-3"><b>Tenant review</b><p className="mt-1 text-muted-foreground">{pilot?.status??"not requested"}</p></div>
   <div className="rounded-md border p-3"><b>Verified sandbox</b><p className="mt-1 text-muted-foreground">{binding?.status==="sandbox_verified"?"Operator-verified probe only":"Not connected"}</p></div>
   <div className="rounded-md border p-3"><b>Customer execution</b><p className="mt-1 text-muted-foreground">Disabled · worker admission unverified</p></div>
  </div>
  {binding?.status==="sandbox_verified"&&
   <p className="text-xs text-muted-foreground">Upstream: {binding.upstream_version}. Reviewed: {binding.verified_at}. Probe tools: {binding.allowed_probe_tools.join(", ")||"none"}.
    Region: {binding.data_region}. Read-only health checks only.</p>}
  {!pilot&&!status.error&&<div className="space-y-2">
   <label htmlFor="ruflo-pilot-reason" className="text-sm font-medium">Request an independent sandbox assessment</label>
   <Textarea id="ruflo-pilot-reason" maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/>
   <Button size="sm" variant="outline" disabled={saving||!tenantId||!productKey||reason.trim().length<16}
    onClick={submit}>{saving?"Requesting…":"Request Ruflo security review"}</Button>
  </div>}
  {pilot&&<p className="text-xs text-muted-foreground">
   Pilot request: {pilot.status} · Region: {pilot.data_region} · Submitted: {pilot.created_at}.
   Shortlisting does not activate credentials, memory sharing or execution.
  </p>}
  {(status.data?.receipts?.length??0)>0&&<div className="space-y-1 text-xs text-muted-foreground">
   <b>Recent isolated probe receipts</b>
   {status.data?.receipts.map(r=><p key={r.id}>{r.recorded_at} · {r.probe_key} · {r.result_status}</p>)}
  </div>}
  <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>
   Separate model-provider receipts, tenant entitlements, per-step action authorisation and independently approved source capabilities remain mandatory.
  </p>
 </CardContent></Card>;
}
