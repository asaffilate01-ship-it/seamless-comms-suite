import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {Badge} from "@/components/ui/badge";
import {Bot,RefreshCw,ShieldCheck} from "lucide-react";
import {toast} from "sonner";
import {getRufloPilotStatus,requestRufloPilot,queueRufloHealthProbe,stopRufloSandbox} from "./ruflo.functions";
import {evaluateRufloStagingReadiness} from "./ruflo-readiness";

/**
 * Ruflo is an optional orchestration backend, never a second tenant authority.
 * Operator-facing read-only status and approval request, not a runtime switch.
 */
export function RufloPilotPanel({tenantId,productKey}:{tenantId:string;productKey:string}){
 const getStatus=useServerFn(getRufloPilotStatus);
 const request=useServerFn(requestRufloPilot);
 const queueProbe=useServerFn(queueRufloHealthProbe);
 const stopSandbox=useServerFn(stopRufloSandbox);
 const status=useQuery({
  queryKey:["ruflo-orchestrator-pilot",tenantId,productKey],
  queryFn:()=>getStatus({data:{tenantId,productKey}}),
  enabled:!!tenantId&&!!productKey,retry:false,
 });
 const [reason,setReason]=useState("Request a tenant-scoped, read-only Ruflo MCP sandbox evaluation with independent platform security review.");
 const [saving,setSaving]=useState(false);
 const [probeBusy,setProbeBusy]=useState(false);
 const [probeName,setProbeName]=useState<"swarm_health"|"swarm_status"|"agent_list">("swarm_health");
 const [stopReason,setStopReason]=useState("");
 const [stopping,setStopping]=useState(false);
 const pilot=status.data?.pilot;
 const binding=status.data?.binding;
 const staging=status.data?.staging;
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
 async function enqueueProbe(){
  setProbeBusy(true);
  try{
   await queueProbe({data:{tenantId,productKey,probeName,idempotencyKey:crypto.randomUUID()}});
   toast.success("Read-only Ruflo health probe queued; execution requires an independently authorised sandbox worker.");
   await status.refetch();
  }catch(e){toast.error(e instanceof Error?e.message:String(e));}
  finally{setProbeBusy(false);}
 }
 const readiness=evaluateRufloStagingReadiness({pilot:pilot??null,binding:binding??null,staging:staging??null});
 const stagingApproved=readiness.checks.find(c=>c.key==="stage")?.passed??false;
 const recent=(status.data?.probes??[]).filter(p=>Date.parse(p.created_at)>=Date.now()-86400000);
 const counts={
  total:recent.length,passed:recent.filter(p=>p.status==="passed").length,
  failed:recent.filter(p=>["failed","timed_out"].includes(p.status)).length,
  denied:recent.filter(p=>p.status==="denied").length,
 };
 async function emergencyStop(){
  if(stopReason.trim().length<16||stopping)return;
  setStopping(true);
  try{
   const result=await stopSandbox({data:{tenantId,productKey,reason:stopReason.trim()}});
   toast.success("Ruflo staging suspended. "+result.queuedProbesDenied+" queued probe(s) denied.");
   setStopReason("");
   await status.refetch();
  }catch(e){toast.error(e instanceof Error?e.message:String(e));}
  finally{setStopping(false);}
 }
 const runnable=readiness.stagingProbeEligibleForRequest&&
  binding.allowed_probe_tools.includes(probeName) &&
  !status.data?.probes?.some(p=>p.status==="queued"||p.status==="processing");
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
  <div className="grid gap-2 text-sm sm:grid-cols-4">
   <div className="rounded-md border p-3"><b>Tenant review</b><p className="mt-1 text-muted-foreground">{pilot?.status??"not requested"}</p></div>
   <div className="rounded-md border p-3"><b>Verified sandbox</b><p className="mt-1 text-muted-foreground">{binding?.status==="sandbox_verified"?"Operator-verified probe only":"Not connected"}</p></div>
   <div className="rounded-md border p-3"><b>Staging interlock</b><p className="mt-1 text-muted-foreground">{stagingApproved?"Approved until "+staging?.expires_at:staging?.status??"Disabled by default"}</p></div>
   <div className="rounded-md border p-3"><b>Customer execution</b><p className="mt-1 text-muted-foreground">Disabled · worker admission unverified</p></div>
  </div>
  {binding?.status==="sandbox_verified"&&
   <p className="text-xs text-muted-foreground">Upstream: {binding.upstream_version}. Reviewed: {binding.verified_at}. MCP manifest: {binding.probe_manifest_sha256?.slice(0,12)??"not pinned"}. Probe tools: {binding.allowed_probe_tools.join(", ")||"none"}.
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
  {pilot&&<div className="space-y-2 rounded-md border p-3">
   <p className="text-sm font-medium">Staging health probe queue</p>
   <p className="text-xs text-muted-foreground">No customer prompts or data. Allowed tools only: swarm_health, swarm_status and agent_list. Each tenant/product is limited to one open probe and five daily requests. Only a separately deployed, verified, read-only worker may perform a probe.</p>
   <div className="flex flex-wrap gap-2">
    <select aria-label="Read-only Ruflo tool" className="rounded-md border bg-background px-2 py-1 text-sm"
     value={probeName} onChange={e=>setProbeName(e.target.value as typeof probeName)}>
     <option value="swarm_health">Swarm health</option>
     <option value="swarm_status">Swarm status</option>
     <option value="agent_list">Agent list</option>
    </select>
    <Button size="sm" variant="outline" onClick={enqueueProbe} disabled={!runnable||probeBusy||status.isFetching}>
     {probeBusy?"Queueing…":"Queue read-only staging probe"}
    </Button>
   </div>
   {!runnable&&<p className="text-xs text-muted-foreground">Independent pilot shortlisting, verified sandbox binding, a live staging interlock and an available probe slot are required.</p>}
   {(status.data?.probes?.length??0)>0&&<div className="space-y-1">
    {status.data?.probes?.slice(0,8).map(p=><p className="text-xs text-muted-foreground" key={p.id}>
     {p.probe_key} · {p.status} · {p.created_at} · attempts {p.attempts}
    </p>)}
   </div>}
  </div>}
  {pilot&&<div className="space-y-2 rounded-md border p-3">
   <h3 className="text-sm font-semibold">Staging readiness checklist</h3>
   <p className="text-xs text-muted-foreground">These checks display the operator view only. SQL admission and worker rechecks remain authoritative; customer-agent execution is disabled.</p>
   <div className="grid gap-2 sm:grid-cols-2">
    {readiness.checks.map(check=><div key={check.key} className="rounded-md bg-muted/50 p-2">
     <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium">{check.label}</span>
      <Badge variant="outline">{check.passed?"Passed":"Blocked"}</Badge>
     </div>
     <p className="mt-1 text-xs text-muted-foreground">{check.description}</p>
    </div>)}
   </div>
  </div>}
  {pilot&&<div className="space-y-3 rounded-md border p-3">
   <h3 className="text-sm font-semibold">Sandbox health and emergency controls</h3>
   <p className="text-xs text-muted-foreground">
    Last 24 hours: {counts.total} probe requests · {counts.passed} passed · {counts.failed} failed/timed out · {counts.denied} denied.
    These are sandbox health checks, not customer agent tasks.
   </p>
   {staging?.status==="suspended"&&<p className="text-xs text-muted-foreground">
    Suspended: {staging.stopped_at??"time unavailable"}. Reason: {staging.stop_reason??"no reason returned"}.
    Re-activation requires a new independently reviewed staging release, not this page.
   </p>}
   {(binding?.status==="sandbox_verified"||stagingApproved)&&<div className="space-y-2">
    <label htmlFor="ruflo-stop-reason" className="text-xs font-medium">Emergency stop reason (minimum 16 characters)</label>
    <Textarea id="ruflo-stop-reason" maxLength={500} value={stopReason}
     onChange={e=>setStopReason(e.target.value)}
     placeholder="State the audit/security reason for suspending this tenant's Ruflo sandbox"/>
    <Button size="sm" variant="destructive" disabled={stopping||stopReason.trim().length<16}
     onClick={emergencyStop}>{stopping?"Stopping…":"Suspend Ruflo staging"}</Button>
   </div>}
  </div>}
  {(status.data?.receipts?.length??0)>0&&<div className="space-y-1 text-xs text-muted-foreground">
   <b>Recent isolated probe receipts</b>
   {status.data?.receipts.map(r=><p key={r.id}>{r.recorded_at} · {r.probe_key} · {r.result_status}</p>)}
  </div>}
  <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>
   Separate model-provider receipts, tenant entitlements, per-step action authorisation and independently approved source capabilities remain mandatory.
  </p>
 </CardContent></Card>;
}
