import {useMemo,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {Activity,ChartColumn,CheckCircle2,LockKeyhole,RefreshCcw,ShieldCheck,TriangleAlert,Wallet} from "lucide-react";
import {toast} from "sonner";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {StatusBadge} from "@/components/app/shell";
import type {AiEmployee} from "./functions";
import type {AiEmployeeTask} from "./tasks.functions";
import {
 getAiWorkforceReadonlyWorkspace,requestAiWorkforceReadonlySource,
 reviewAiWorkforceReadonlySource,queueAiWorkforceReadonlyAnalysis,
 cancelAiWorkforceReadonlyAnalysis,reviewAiWorkforceReadonlyResult,
 type ReadonlyWorkspace,
} from "./readonly.functions";

type Props={tenantId:string;productKey:string;employee:AiEmployee;tasks:AiEmployeeTask[]};
type Rate=ReadonlyWorkspace["tariffs"][number];
const rateKey=(rate:Rate)=>rate.provider_key+"|"+rate.model_key+"|"+rate.currency+"|"+rate.rate_version;
const asDate=(v:string|null)=>v?new Date(v).toLocaleString():"—";
const summaryError=(e:unknown)=>e instanceof Error?e.message:String(e);

export function AIWorkforceReadonlyPanel({tenantId,productKey,employee,tasks}:Props){
 const fetchFn=useServerFn(getAiWorkforceReadonlyWorkspace);
 const sourceFn=useServerFn(requestAiWorkforceReadonlySource);
 const reviewSourceFn=useServerFn(reviewAiWorkforceReadonlySource);
 const queueFn=useServerFn(queueAiWorkforceReadonlyAnalysis);
 const cancelFn=useServerFn(cancelAiWorkforceReadonlyAnalysis);
 const reviewResultFn=useServerFn(reviewAiWorkforceReadonlyResult);
 const [busy,setBusy]=useState(false);
 const [purpose,setPurpose]=useState("Permit CRM lead-count aggregates only for the human-reviewed AI employee read-only analysis pilot.");
 const [note,setNote]=useState("");
 const [taskId,setTaskId]=useState("");
 const [chosenRate,setChosenRate]=useState("");
 const [consentConfirmed,setConsentConfirmed]=useState(false);
 const [inputTokens,setInputTokens]=useState(900);
 const [outputTokens,setOutputTokens]=useState(160);
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({});
 const query=useQuery({
  queryKey:["ai-workforce-real-crm",tenantId,productKey,employee.id],
  queryFn:()=>fetchFn({data:{tenantId,productKey:productKey as "omniqora",employeeId:employee.id}}),
  enabled:!!tenantId&&productKey==="omniqora"&&!!employee.id,retry:false,
 });
 const d=query.data;
 const source=d?.sources[0]??null;
 const sourceApproved=source?.status==="approved"&&
    !!source.expires_at&&Date.parse(source.expires_at)>Date.now();
 const pilotActive=d?.pilot?.enabled===true&&Date.parse(d.pilot.expires_at)>Date.now();
 const eligible=tasks.filter(t=>t.status==="approved_brief"&&
    t.employee_revision===employee.revision&&t.requested_capabilities.length===0);
 const activeProviders=(d?.providers??[]).filter(p=>p.provider_key==="openai"&&
    p.environment==="production"&&p.status==="active"&&!!p.last_verified_at&&
    Date.now()-Date.parse(p.last_verified_at)>=0&&
    Date.now()-Date.parse(p.last_verified_at)<86400000);
 const rates=(d?.tariffs??[]).filter(r=>r.provider_key==="openai"&&
   activeProviders.some(p=>p.provider_key===r.provider_key));
 const selected=rates.find(r=>rateKey(r)===chosenRate);
 const reservedEstimate=selected?Math.ceil(inputTokens*selected.input_minor_per_million/1000000)+
   Math.ceil(outputTokens*selected.output_minor_per_million/1000000):null;
 const matchingBudget=selected?(d?.budgets??[]).find(b=>
   b.currency===selected.currency&&
   b.period_month===new Date().toISOString().slice(0,7)+"-01"):null;
 const withinLimits=reservedEstimate!==null&&
   !!matchingBudget&&
   matchingBudget.spent_minor+matchingBudget.reserved_minor+reservedEstimate<=matchingBudget.limit_minor&&
   reservedEstimate<=Number(d?.pilot?.max_run_cost_minor??0);
 const canQueue=!!pilotActive&&!!sourceApproved&&
  employee.status==="approved_configuration"&&eligible.some(t=>t.id===taskId)&&
  !!selected&&withinLimits&&consentConfirmed&&!busy;

 async function run(action:()=>Promise<void>){
  setBusy(true);
  try{await action();await query.refetch();}
  catch(e){toast.error(summaryError(e));}
  finally{setBusy(false);}
 }
 async function requestConsent(){
  await run(async()=>{
   await sourceFn({data:{tenantId,productKey:"omniqora",purpose:purpose.trim()}});
   toast.success("CRM aggregate access requested; an independent administrator must review it.");
  });
 }
 async function reviewSource(decision:"approved"|"rejected"|"revoked"){
  if(!source)return;
  await run(async()=>{
   await reviewSourceFn({data:{tenantId,productKey:"omniqora",sourceId:source.id,
    decision,note:note.trim()}});
   setNote("");
   toast.success(decision==="approved"?"Read-only source consent approved for 24 hours":"Source permission updated.");
  });
 }
 async function queue(){
  if(!selected||!source||!canQueue)return;
  await run(async()=>{
   const result=await queueFn({data:{
    tenantId,productKey:"omniqora",employeeId:employee.id,taskId,sourceId:source.id,
    providerKey:selected.provider_key,modelKey:selected.model_key,
    currency:selected.currency,inputTokens,outputTokens,idempotencyKey:requestId,
   }});
   if(result.humanReviewRequired!==true)throw new Error("Unverified human-review requirement");
   setRequestId(crypto.randomUUID());setConsentConfirmed(false);
   toast.success("Approved CRM aggregate analysis queued with a reserved model budget.");
  });
 }
 async function cancelQueued(admissionId:string){
  await run(async()=>{
   await cancelFn({data:{tenantId,productKey:"omniqora",employeeId:employee.id,admissionId}});
   toast.success("Unclaimed task cancelled; the canonical budget reservation was released.");
  });
 }
 async function reviewOutput(admissionId:string,decision:"accepted"|"rejected"){
  await run(async()=>{
   const result=await reviewResultFn({data:{
    tenantId,productKey:"omniqora",employeeId:employee.id,admissionId,
    decision,note:(reviewNotes[admissionId]??"").trim(),
   }});
   if(result.customerActions!==0)throw new Error("Unexpected external action");
   setReviewNotes(s=>({...s,[admissionId]:""}));
   toast.success("Independent human review recorded. No external action performed.");
  });
 }
 if(productKey!=="omniqora")return <Card><CardContent className="p-5 text-sm text-muted-foreground">
   <LockKeyhole className="mr-2 inline h-4 w-4"/> The first-party read-only pilot currently supports Omniqora CRM only.
   Other SaaS products require separately validated source adapters.
 </CardContent></Card>;
 return <Card><CardContent className="space-y-5 p-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <h3 className="flex items-center gap-2 text-lg font-semibold">
     <ChartColumn className="h-5 w-5"/> First-party CRM read-only AI pilot
    </h3>
    <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
     A real model can analyse only approved tenant CRM lead-count aggregates. No customer names,
     contact details, individual records, model tools, messages, database writes or autonomous decisions.
    </p>
   </div>
   <Button size="sm" variant="outline" onClick={()=>query.refetch()} disabled={query.isFetching}>
    <RefreshCcw className="mr-2 h-4 w-4"/> Refresh
   </Button>
  </div>
  {query.isError&&<p className="rounded-md border p-3 text-sm text-destructive">
   Read-only CRM controls unavailable. Verify migrations, tenant entitlements and staging readiness.
  </p>}
  <div className="flex flex-wrap gap-2">
   <Badge variant="outline"><ShieldCheck className="mr-1 h-3 w-3"/> Independent source approval</Badge>
   <Badge variant="outline"><LockKeyhole className="mr-1 h-3 w-3"/> Operator activation only</Badge>
   <Badge variant="outline"><Wallet className="mr-1 h-3 w-3"/> Budget reservation required</Badge>
  </div>
  {!pilotActive&&<div className="rounded-md bg-muted/50 p-3 text-sm">
   <b>Real-data pilot inactive.</b>
   <p className="mt-1 text-xs text-muted-foreground">
    A trusted platform operator must authorise a time-limited staging pilot after
    model-provider, security, legal processing and cost verification. This screen cannot activate it.
   </p>
  </div>}

  <div className="grid gap-5 xl:grid-cols-2">
   <div className="space-y-3">
    <h4 className="font-semibold">1. Approved read-only source</h4>
    <p className="text-xs text-muted-foreground">
     Source: <b>omniqora.crm.leads-summary.v1</b>. Only aggregate status counts from
     first-party CRM; at least ten records required, and groups smaller than five are suppressed.
    </p>
    {source?<div className="rounded-lg border p-3">
     <div className="flex flex-wrap items-center justify-between gap-2">
      <b className="text-sm">{source.source_key}</b><StatusBadge status={source.status}/>
     </div>
     <p className="mt-2 text-xs text-muted-foreground">
      Permission expires: {asDate(source.expires_at)} · Revision {source.revision}
     </p>
     {source.review_note&&<p className="mt-2 text-xs">{source.review_note}</p>}
    </div>:<p className="text-xs text-muted-foreground">No verified source permission exists yet.</p>}
    <label className="block space-y-2 text-sm font-medium">
     <span>Source access justification</span>
     <Textarea rows={3} value={purpose} maxLength={700} onChange={e=>setPurpose(e.target.value)}/>
    </label>
    <Button variant="outline" size="sm" disabled={busy||purpose.trim().length<20}
     onClick={requestConsent}>{source?"Renew source review request":"Request read-only CRM access"}</Button>
    {source&&["requested","approved"].includes(source.status)&&<>
     <label className="block space-y-2 text-sm font-medium">
      <span>Independent review evidence</span>
      <Textarea rows={2} value={note} onChange={e=>setNote(e.target.value)}
       placeholder="Document data minimisation, tenant scope and approval grounds."/>
     </label>
     <div className="flex flex-wrap gap-2">
      {source.status==="requested"&&<>
       <Button size="sm" disabled={busy||note.trim().length<12} onClick={()=>reviewSource("approved")}>
        Approve consent
       </Button>
       <Button size="sm" variant="outline" disabled={busy||note.trim().length<12}
        onClick={()=>reviewSource("rejected")}>Reject</Button>
      </>}
      {source.status==="approved"&&<Button size="sm" variant="outline"
       disabled={busy||note.trim().length<12} onClick={()=>reviewSource("revoked")}>Revoke data access</Button>}
     </div>
    </>}
   </div>

   <div className="space-y-3">
    <h4 className="font-semibold">2. Bounded model admission</h4>
    <label className="block space-y-2 text-sm font-medium">
     <span>Approved employee task (no tools)</span>
     <select className="h-10 w-full rounded-md border bg-background px-2 text-sm"
      value={taskId} onChange={e=>setTaskId(e.target.value)}>
      <option value="">Select a current approved task</option>
      {eligible.map(t=><option value={t.id} key={t.id}>{t.title}</option>)}
     </select>
    </label>
    <label className="block space-y-2 text-sm font-medium">
     <span>Approved provider model/rate</span>
     <select className="h-10 w-full rounded-md border bg-background px-2 text-sm"
      value={chosenRate} onChange={e=>setChosenRate(e.target.value)}>
      <option value="">Select a verified model</option>
      {rates.map(rate=><option key={rateKey(rate)} value={rateKey(rate)}>
       {rate.provider_key} · {rate.model_key} · {rate.currency} · {rate.rate_version}
      </option>)}
     </select>
    </label>
    {!rates.length&&<p className="text-xs text-muted-foreground">
     No recently verified production-scoped provider binding and evaluated model rate are available for this tenant.
    </p>}
    <div className="grid grid-cols-2 gap-3">
     <label className="block space-y-2 text-sm font-medium">
      <span>Input-token ceiling</span>
      <Input inputMode="numeric" type="number" min={256} max={1200}
       value={inputTokens} onChange={e=>setInputTokens(Number(e.target.value))}/>
     </label>
     <label className="block space-y-2 text-sm font-medium">
      <span>Output-token ceiling</span>
      <Input inputMode="numeric" type="number" min={64} max={256}
       value={outputTokens} onChange={e=>setOutputTokens(Number(e.target.value))}/>
     </label>
    </div>
    <div className="rounded-md border p-3 text-xs">
     <b>Forecast reservation: {reservedEstimate===null?"Not available":reservedEstimate+" minor units"}</b>
     <p className="mt-1 text-muted-foreground">
      Available budget: {matchingBudget?
       Math.max(0,matchingBudget.limit_minor-matchingBudget.reserved_minor-matchingBudget.spent_minor)
       +" "+matchingBudget.currency+" minor units":"Not configured"}.
      Pilot cap: {d?.pilot?.max_run_cost_minor??"not approved"} minor units per run.
     </p>
    </div>
    <label className="flex items-start gap-2 text-sm">
     <input type="checkbox" checked={consentConfirmed} onChange={e=>setConsentConfirmed(e.target.checked)}/>
     <span>I authorise this reviewed aggregate-only analysis within the approved pilot
      and understand model API calls may incur charges.</span>
    </label>
    <Button disabled={!canQueue||inputTokens<256||inputTokens>1200||
      outputTokens<64||outputTokens>256||!Number.isInteger(inputTokens)||!Number.isInteger(outputTokens)}
      onClick={queue}>
     <Activity className="mr-2 h-4 w-4"/> Reserve budget and queue read-only analysis
    </Button>
   </div>
  </div>
  <div className="border-t pt-4">
   <h4 className="font-semibold">3. Model receipts and human review</h4>
   <div className="mt-3 space-y-3">
    {(d?.admissions??[]).map(a=><div key={a.id} className="rounded-lg border p-4">
     <div className="flex flex-wrap items-center justify-between gap-2">
      <b className="text-sm">{a.providerKey} · {a.modelKey}</b>
      <StatusBadge status={a.status}/>
     </div>
     <p className="mt-1 text-xs text-muted-foreground">
      Submitted {asDate(a.admittedAt)} · {a.inputTokens??"—"} input /
      {" "}{a.outputTokens??"—"} output tokens ·
      {" "}{a.meteredCostMinor===null?"No settled usage":a.meteredCostMinor+" minor units"}
     </p>
     {a.summary&&<p className="mt-3 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">
      {a.summary}
     </p>}
     {a.status==="reconciliation_required"&&
      <p className="mt-3 flex items-center gap-2 text-xs text-warning">
       <TriangleAlert className="h-4 w-4"/> Provider billing must be reconciled manually;
       the reserved amount has not been released.
      </p>}
     {a.status==="waiting_review"&&<>
      <label className="mt-3 block space-y-2 text-sm font-medium">
       <span>Independent reviewer findings</span>
       <Textarea rows={2} value={reviewNotes[a.id]??""}
        onChange={e=>setReviewNotes({...reviewNotes,[a.id]:e.target.value})}
        placeholder="Verify evidence, calculations and limitations before accepting."/>
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
       <Button size="sm" disabled={busy||(reviewNotes[a.id]??"").trim().length<12}
        onClick={()=>reviewOutput(a.id,"accepted")}>
        <CheckCircle2 className="mr-1 h-4 w-4"/> Accept analysis
       </Button>
       <Button size="sm" variant="outline" disabled={busy||(reviewNotes[a.id]??"").trim().length<12}
        onClick={()=>reviewOutput(a.id,"rejected")}>Reject analysis</Button>
      </div>
     </>}
     {a.status==="queued"&&<Button size="sm" variant="outline" className="mt-3"
      disabled={busy} onClick={()=>cancelQueued(a.id)}>Cancel and release reservation</Button>}
    </div>)}
    {!d?.admissions.length&&<p className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
     No real CRM analysis queued. This feature is disabled until the source, pilot, model and
     independent approvals are all in place.
    </p>}
   </div>
  </div>
  <p className="border-t pt-3 text-xs text-muted-foreground">
   <LockKeyhole className="mr-1 inline h-4 w-4"/> Real employee analysis is read-only.
   Generated conclusions are drafts for an independent reviewer—not permission to contact
   customers, post accounting entries, change CRM records, file returns or make payments.
  </p>
 </CardContent></Card>;
}
