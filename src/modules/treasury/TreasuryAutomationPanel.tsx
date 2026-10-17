import {useMemo,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {Card,CardContent} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {CheckCircle2,Clock3,FileText,KeyRound,Link2Off,LockKeyhole,RefreshCcw,ShieldCheck} from "lucide-react";
import {toast} from "sonner";
import {
  getTreasuryAutomationWorkspace,requestTreasurySourceSetup,
  saveTreasuryDraftSchedule,runTreasuryServerSyntheticPreview
} from "./automation.functions";
import {
  evaluateTreasurySourceReadiness,REQUIRED_TREASURY_SOURCES,REQUIRED_READ_SCOPES,
  type TreasurySourceBinding,type TreasurySourceKind,type TreasuryConnectorFamily
} from "./trusted-sources";
import {treasuryPackMarkdown,type TreasuryPack} from "./analyst-pack";

const sourceNames:Record<TreasurySourceKind,string>={
  bank_opening:"Bank account opening balances",
  bank_transactions:"Posted bank statement movements",
  cash_general_ledger:"Independent cash/general-ledger entries",
  cash_forecast:"Verified, dated cash-flow forecasts",
  liquidity_policy:"Authorised treasury liquidity policy"
};
const timezones=[
  "Europe/London","UTC","Europe/Berlin","America/New_York",
  "America/Chicago","Asia/Karachi"
];
function downloadMarkdown(file:string,text:string){
  const url=URL.createObjectURL(new Blob([text],{type:"text/markdown;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download=file;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}
export function TreasuryAutomationPanel({tenantId,enabled,role}:{
  tenantId:string;enabled:boolean;role:string|null;
}){
  const [sourceKind,setSourceKind]=useState<TreasurySourceKind>("bank_transactions");
  const [family,setFamily]=useState<TreasuryConnectorFamily>("bank_api");
  const [providerKey,setProviderKey]=useState("");
  const [reason,setReason]=useState("Request read-only treasury source sandbox qualification.");
  const [frequency,setFrequency]=useState<"daily"|"business_days">("business_days");
  const [timezone,setTimezone]=useState("Europe/London");
  const [runTime,setRunTime]=useState("08:00");
  const [previewDate,setPreviewDate]=useState(new Date().toISOString().slice(0,10));
  const [preview,setPreview]=useState<TreasuryPack|null>(null);
  const [working,setWorking]=useState<"source"|"schedule"|"preview"|null>(null);
  const [error,setError]=useState("");
  const canAdmin=role==="owner"||role==="admin"||role==="platform_admin";
  const getFn=useServerFn(getTreasuryAutomationWorkspace);
  const requestFn=useServerFn(requestTreasurySourceSetup);
  const scheduleFn=useServerFn(saveTreasuryDraftSchedule);
  const previewFn=useServerFn(runTreasuryServerSyntheticPreview);
  const workspace=useQuery({
    queryKey:["treasury-automation-phase5",tenantId],
    queryFn:()=>getFn({data:{tenantId}}),
    enabled:enabled&&!!tenantId,retry:false
  });
  const verified=workspace.data?.verifiedSources??[];
  const readiness=useMemo(()=>{
    if(!tenantId)return null;
    const bindings:TreasurySourceBinding[]=verified.map(r=>({
      tenantId:r.tenant_id,productKey:r.product_key,
      sourceKind:r.source_kind as TreasurySourceKind,
      providerFamily:r.provider_family as TreasuryConnectorFamily,
      providerKey:r.provider_key,
      connectionStatus:r.status as TreasurySourceBinding["connectionStatus"],
      readOnly:r.read_only,scopes:r.verified_scopes,
      proofReference:r.proof_reference,
      verifiedAt:r.verified_at,validUntil:r.valid_until,
      lastSuccessfulReadAt:r.last_successful_read_at
    }));
    try{return evaluateTreasurySourceReadiness({
      tenantId,bindings,at:new Date().toISOString()
    });}catch{return null;}
  },[tenantId,verified]);
  async function requestSource(){
    if(!canAdmin||!enabled||!tenantId)return;
    setWorking("source");setError("");
    try{
      const result=await requestFn({data:{
        tenantId,sourceKind,providerFamily:family,providerKey,reason:reason.trim()
      }});
      toast.success(result.alreadyExists?"Source request already recorded":"Read-only source review requested");
      await workspace.refetch();
    }catch(e){setError(e instanceof Error?e.message:"Source request failed.");}
    finally{setWorking(null);}
  }
  async function saveSchedule(){
    if(!canAdmin||!enabled||!tenantId)return;
    setWorking("schedule");setError("");
    try{
      await scheduleFn({data:{tenantId,frequency,timezone,runTime}});
      toast.success("Inactive schedule draft saved; no automatic processing enabled");
      await workspace.refetch();
    }catch(e){setError(e instanceof Error?e.message:"Draft schedule failed.");}
    finally{setWorking(null);}
  }
  async function runPreview(){
    if(!enabled||!tenantId)return;
    setWorking("preview");setPreview(null);setError("");
    try{
      const result=await previewFn({data:{tenantId,reportDate:previewDate}});
      setPreview(result.workingPaper);
      toast.success("Synthetic treasury brief calculated server-side");
    }catch(e){setError(e instanceof Error?e.message:"Preview could not be calculated.");}
    finally{setWorking(null);}
  }
  return <Card><CardContent className="space-y-5 p-5">
    <div className="flex flex-wrap justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold">Phase 5 — Read-only source onboarding & analyst scheduling</h2>
        <p className="mt-1 text-sm text-muted-foreground">Request independently verified source access and configure an inactive daily analysis proposal.</p>
      </div>
      <Badge variant="outline"><Link2Off className="mr-1 inline h-3 w-3"/>No live bank connection</Badge>
    </div>
    <div className="flex gap-2 rounded-lg border p-3 text-xs text-muted-foreground">
      <ShieldCheck className="h-4 w-4 shrink-0"/>
      The five source qualifications must be independently reviewed. Schedule proposals do not create cron jobs,
      send reports, invoke MCP tools or execute transfers. Source data and credentials are never entered here.
    </div>
    {!enabled&&<p role="status" className="flex gap-2 text-sm text-muted-foreground">
      <LockKeyhole className="mt-1 h-4 w-4"/>A verified active Finvessa tenant entitlement is required to use this panel.
    </p>}
    {enabled&&workspace.isError&&<p role="alert" className="text-sm text-destructive">
      The Phase 5 metadata tables are not available. Apply the independently reviewed database migration in staging before using connector requests.
    </p>}
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Source qualification</h3>
          <Badge variant="secondary">Read-only discovery</Badge>
        </div>
        <div className="space-y-2">
          {REQUIRED_TREASURY_SOURCES.map(kind=>{
            const binding=verified.find(x=>x.source_kind===kind);
            const requested=(workspace.data?.sourceRequests??[]).filter(x=>x.source_kind===kind);
            const passed=readiness?.covered.includes(kind)??false;
            return <div key={kind} className="rounded-md bg-muted/50 p-3 text-xs">
              <div className="flex justify-between gap-3">
                <span className="font-medium">{sourceNames[kind]}</span>
                <Badge variant="outline">{passed?"Verified (shadow only)":binding?.status??(requested.length?"Setup requested":"Not connected")}</Badge>
              </div>
              <p className="mt-1 text-muted-foreground">Required: {REQUIRED_READ_SCOPES[kind]}</p>
              {binding?.last_successful_read_at&&<p className="mt-1 text-muted-foreground">Last provider read: {new Date(binding.last_successful_read_at).toLocaleString()}</p>}
            </div>;
          })}
        </div>
        <div className="text-xs text-muted-foreground">
          {readiness?.status==="sandbox_shadow_only"
            ?"Five source contracts are ready for separate sandbox qualification; production execution is still disabled."
            :"Sources are incomplete or unverified; the system cannot run unattended."}
        </div>
        {canAdmin&&enabled&&<>
          <label className="block text-xs font-medium">Source to request
            <select className="mt-1 h-10 w-full rounded-md border bg-background p-2 text-sm"
              aria-label="Treasury requested source" value={sourceKind}
              onChange={e=>setSourceKind(e.target.value as TreasurySourceKind)}>
              {REQUIRED_TREASURY_SOURCES.map(x=><option key={x} value={x}>{sourceNames[x]}</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium">Delivery family
            <select className="mt-1 h-10 w-full rounded-md border bg-background p-2 text-sm"
              aria-label="Treasury connector family" value={family}
              onChange={e=>setFamily(e.target.value as TreasuryConnectorFamily)}>
              <option value="bank_api">Contracted bank API</option><option value="erp_api">Contracted ERP API</option>
              <option value="managed_sftp">Managed SFTP export</option><option value="managed_file">Managed file delivery</option>
            </select>
          </label>
          <label className="block text-xs font-medium">Provider identifier (non-secret)
            <Input className="mt-1" placeholder="e.g. bank-partner-name" value={providerKey}
              onChange={e=>setProviderKey(e.target.value.trim().toLowerCase())}/>
          </label>
          <label className="block text-xs font-medium">Reason for connection
            <Textarea className="mt-1" rows={2} value={reason}
              onChange={e=>setReason(e.target.value)} placeholder="Do not enter tokens, account numbers or banking credentials."/>
          </label>
          <Button disabled={working!==null||providerKey.length<2||reason.trim().length<12}
            onClick={requestSource}><KeyRound className="mr-2 h-4 w-4"/>Request independent provider setup</Button>
        </>}
      </div>
      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Daily analyst schedule draft</h3>
          <Badge variant="outline">{workspace.data?.executionEnabled === false ? "Execution disabled" : "Never active"}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          This stores a schedule preference only. No unattended bank data processing or customer notification is activated.
        </p>
        {workspace.data?.scheduleDraft&&<div className="rounded-md bg-muted p-3 text-sm">
          <p className="font-medium">Saved inactive proposal</p>
          <p className="text-xs text-muted-foreground">{workspace.data.scheduleDraft.frequency} at {workspace.data.scheduleDraft.proposed_at} ({workspace.data.scheduleDraft.timezone})</p>
        </div>}
        {canAdmin&&enabled&&<>
          <label className="block text-xs font-medium">Frequency
            <select className="mt-1 h-10 w-full rounded-md border bg-background p-2 text-sm"
              aria-label="Treasury proposed frequency" value={frequency}
              onChange={e=>setFrequency(e.target.value as "daily"|"business_days")}>
              <option value="business_days">Business days (Mon–Fri, holidays not automatically excluded)</option>
              <option value="daily">Every calendar day</option>
            </select>
          </label>
          <label className="block text-xs font-medium">Timezone
            <select className="mt-1 h-10 w-full rounded-md border bg-background p-2 text-sm"
              aria-label="Treasury schedule timezone" value={timezone} onChange={e=>setTimezone(e.target.value)}>
              {timezones.map(x=><option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium">Proposed reporting time
            <Input className="mt-1" type="time" value={runTime} onChange={e=>setRunTime(e.target.value)}/>
          </label>
          <Button variant="outline" disabled={working!==null} onClick={saveSchedule}>
            <Clock3 className="mr-2 h-4 w-4"/>Save inactive schedule proposal
          </Button>
        </>}
        <div className="border-t pt-4 space-y-3">
          <h3 className="font-semibold">Server-side synthetic brief</h3>
          <p className="text-xs text-muted-foreground">
            Execute deterministic treasury computations with a synthetic bank + ERP fixture entirely on the Omniqora server.
            This is a manual preview; it is not a real banking run, scheduler or AI model invocation.
          </p>
          <label className="block text-xs font-medium">Report date
            <Input className="mt-1 max-w-56" type="date" value={previewDate}
              max={new Date().toISOString().slice(0,10)} onChange={e=>setPreviewDate(e.target.value)}/>
          </label>
          <Button disabled={!enabled||working!==null} onClick={runPreview}>
            <RefreshCcw className="mr-2 h-4 w-4"/>Run synthetic report on server
          </Button>
          {preview&&<div className="rounded-md border p-3 space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="h-4 w-4"/>Synthetic server analysis completed</p>
            <p className="text-xs text-muted-foreground">
              {preview.currencyPositions.length} currency positions · {preview.totalFindings} findings · {preview.nextActions.length} review tasks
            </p>
            <Badge variant="outline">{preview.decision.replaceAll("_"," ")}</Badge>
            <Button variant="outline" size="sm" onClick={()=>downloadMarkdown(
              "finvessa-synthetic-server-"+preview.reportDate+".md",treasuryPackMarkdown(preview)
            )}><FileText className="mr-2 h-4 w-4"/>Download synthetic analyst brief</Button>
          </div>}
        </div>
      </div>
    </div>
    {error&&<p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
    {enabled&&<div className="flex justify-end">
      <Button size="sm" variant="outline" onClick={()=>workspace.refetch()} disabled={working!==null}>
        <RefreshCcw className="mr-2 h-4 w-4"/>Refresh source status
      </Button>
    </div>}
  </CardContent></Card>;
}
