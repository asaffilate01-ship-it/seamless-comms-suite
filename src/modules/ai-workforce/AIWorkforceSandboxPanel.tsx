import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {Beaker,CalendarClock,LockKeyhole,RefreshCcw,ShieldCheck,TriangleAlert} from "lucide-react";
import {toast} from "sonner";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {StatusBadge} from "@/components/app/shell";
import type {AiEmployee} from "./functions";
import type {AiEmployeeTask} from "./tasks.functions";
import {
 getAiWorkforceSandboxWorkspace,queueAiWorkforceFixtureRehearsal,
 cancelAiWorkforceFixtureRehearsal,
} from "./sandbox.functions";

const choices=[
 {key:"fixture.crm.pipeline",name:"Synthetic CRM pipeline"},
 {key:"fixture.dishbee.orders",name:"Synthetic food orders"},
 {key:"fixture.finance.cashflow",name:"Synthetic cashflow"},
] as const;
type Fixture=typeof choices[number]["key"];
type Props={tenantId:string;productKey:string;employee:AiEmployee;tasks:AiEmployeeTask[]};

export function AIWorkforceSandboxPanel({tenantId,productKey,employee,tasks}:Props){
 const fetchFn=useServerFn(getAiWorkforceSandboxWorkspace);
 const queueFn=useServerFn(queueAiWorkforceFixtureRehearsal);
 const cancelFn=useServerFn(cancelAiWorkforceFixtureRehearsal);
 const [fixture,setFixture]=useState<Fixture>("fixture.crm.pipeline");
 const [taskId,setTaskId]=useState("");
 const [busy,setBusy]=useState(false);
 const q=useQuery({
  queryKey:["ai-workforce-sandbox",tenantId,productKey,employee.id],
  queryFn:()=>fetchFn({data:{tenantId,productKey,employeeId:employee.id}}),
  enabled:!!tenantId&&!!productKey&&!!employee.id,retry:false,
 });
 const eligible=tasks.filter(t=>t.status==="approved_brief"&&
   t.employee_revision===employee.revision&&t.requested_capabilities.length===0);
 const canQueue=q.data?.enabled===true&&
   employee.status==="approved_configuration"&&eligible.some(t=>t.id===taskId);
 const failures=q.data?.admissions.filter(a=>a.status==="failed")??[];

 async function queueFixture(){
  if(!canQueue||busy)return;
  setBusy(true);
  try{
   const response=await queueFn({data:{
    tenantId,productKey,employeeId:employee.id,taskId,fixtureKey:fixture,idempotencyKey:crypto.randomUUID(),
   }});
   if(response.syntheticOnly!==true||response.modelCalls!==0)
    throw new Error("Unsafe sandbox admission refused");
   toast.success("Synthetic job queued. No customer data, AI model or external app accessed.");
   await q.refetch();
  }catch(e){toast.error(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 async function cancelQueued(admissionId:string){
  setBusy(true);
  try{
   await cancelFn({data:{tenantId,productKey,employeeId:employee.id,admissionId}});
   toast.success("Unclaimed synthetic rehearsal cancelled");
   await q.refetch();
  }catch(e){toast.error(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 return <Card><CardContent className="space-y-4 p-5">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
     <h3 className="flex items-center gap-2 text-lg font-semibold">
      <Beaker className="h-5 w-5"/> AI Workforce synthetic sandbox
     </h3>
     <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
      Safely rehearse the task lifecycle using hard-coded public test figures. This does not run
      a language model, schedule work, access a tenant database or connect an external app.
     </p>
    </div>
    <Button size="sm" variant="outline" onClick={()=>q.refetch()} disabled={q.isFetching}>
     <RefreshCcw className="mr-2 h-4 w-4"/> Refresh receipts
    </Button>
   </div>
   {q.isError?<p className="rounded-md border p-3 text-sm text-destructive">
    Sandbox schema or entitlement unavailable. Do not retry against production.
   </p>:null}
   <div className="flex flex-wrap items-center gap-2">
    <Badge variant="outline"><LockKeyhole className="mr-1 h-3 w-3"/> Inactive by default</Badge>
    <Badge variant="outline"><ShieldCheck className="mr-1 h-3 w-3"/> Zero model calls</Badge>
    <Badge variant="outline"><CalendarClock className="mr-1 h-3 w-3"/> Manual operator pass</Badge>
   </div>
   {!q.data?.enabled&&<div className="rounded-lg bg-muted/50 p-3 text-sm">
     <b>No approved sandbox pilot is currently active.</b>
     <p className="mt-1 text-xs text-muted-foreground">
      A platform operator must explicitly approve a time-limited tenant/product sandbox.
      The feature cannot activate from this screen.
     </p>
   </div>}
   <div className="grid gap-3 md:grid-cols-2">
    <label className="block space-y-2 text-sm font-medium">
     <span>Approved, no-tool task brief</span>
     <select value={taskId} onChange={e=>setTaskId(e.target.value)}
       className="h-10 w-full rounded-md border bg-background px-2 text-sm">
      <option value="">Select eligible task</option>
      {eligible.map(t=><option key={t.id} value={t.id}>{t.title} · v{t.revision}</option>)}
     </select>
    </label>
    <label className="block space-y-2 text-sm font-medium">
     <span>Safe fixture dataset</span>
     <select value={fixture} onChange={e=>setFixture(e.target.value as Fixture)}
       className="h-10 w-full rounded-md border bg-background px-2 text-sm">
      {choices.map(c=><option key={c.key} value={c.key}>{c.name}</option>)}
     </select>
    </label>
   </div>
   <div className="flex flex-wrap items-center gap-3">
    <Button disabled={!canQueue||busy||q.isError} onClick={queueFixture}>
     <Beaker className="mr-2 h-4 w-4"/> Queue synthetic rehearsal
    </Button>
    <span className="text-xs text-muted-foreground">
      Jobs only progress when an authorised operator manually invokes the sandbox worker.
     </span>
   </div>
   <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
    <span>Operator limit: {q.data?.dailyLimit??0}/day</span>
    <span>Recent employee requests today: {q.data?.admittedToday??0}</span>
    <span>Recorded failures: {failures.length}</span>
   </div>
   <div>
    <h4 className="font-semibold">Rehearsal receipts</h4>
    <div className="mt-2 space-y-3">
     {(q.data?.admissions??[]).map(a=><div key={a.id} className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
       <span className="text-sm font-medium">{a.fixtureKey.replace("fixture.","")}</span>
       <StatusBadge status={a.status}/>
      </div>
      {a.summary&&<p className="mt-2 text-sm">{a.summary}</p>}
      {a.findings.length>0&&<div className="mt-2 grid gap-2 sm:grid-cols-2">
       {a.findings.map((f,i)=><div key={i} className="rounded-md bg-muted/50 p-2 text-xs">
        <span className="block text-muted-foreground">{f.observation}</span>
        <strong>{f.value} {f.unit.replaceAll("_"," ")}</strong>
       </div>)}
      </div>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
       <span className="text-xs text-muted-foreground">
        Synthetic fixture · £0 AI cost · No tool access
       </span>
       {a.status==="queued"&&<Button size="sm" variant="outline"
        disabled={busy} onClick={()=>cancelQueued(a.id)}>Cancel queued</Button>}
      </div>
     </div>)}
     {!q.data?.admissions.length&&<p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      No sandbox receipts yet. Approved task briefs can be rehearsed after operator activation.
     </p>}
    </div>
   </div>
   <p className="flex items-start gap-2 border-t pt-3 text-xs text-muted-foreground">
    <TriangleAlert className="h-4 w-4 shrink-0"/>
    Synthetic rehearsal success does not validate real provider credentials, model accuracy,
    tool permissions, business outcomes or production deployment.
   </p>
 </CardContent></Card>;
}
