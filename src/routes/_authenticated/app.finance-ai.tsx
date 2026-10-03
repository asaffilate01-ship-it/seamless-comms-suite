import {createFileRoute} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useEffect,useState} from "react";
import {AppShell,StatusBadge} from "@/components/app/shell";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {useTenant} from "@/hooks/useTenant";
import {getTenantControlPlane} from "@/lib/control-plane.functions";
import {createAccountingIntake,createPayrollRunV3,createPracticeClient,createSecretarialFiling,createTaxResearchCase,getFinanceIntelligenceWorkspace,
 startAccountsPreparation,upsertNominalAccount} from "@/modules/finance-intelligence/functions";
import {RefreshCw,ReceiptText,Scale,Landmark,BrainCircuit} from "lucide-react";
import {toast} from "sonner";

export const Route=createFileRoute("/_authenticated/app/finance-ai")({component:FinanceAi,head:()=>({meta:[{title:"Finance & Tax AI — Omniqora"},{name:"robots",content:"noindex"}]})});

function FinanceAi(){
 const t=useTenant(),tenantId=t.tenantId??"";const tenantFn=useServerFn(getTenantControlPlane),workspaceFn=useServerFn(getFinanceIntelligenceWorkspace);
 const clientFn=useServerFn(createPracticeClient),intakeFn=useServerFn(createAccountingIntake),taxFn=useServerFn(createTaxResearchCase),
  accountFn=useServerFn(upsertNominalAccount),prepFn=useServerFn(startAccountsPreparation),payrollFn=useServerFn(createPayrollRunV3),
  filingFn=useServerFn(createSecretarialFiling);
 const tenant=useQuery({queryKey:["finance-ai-tenant",tenantId],queryFn:()=>tenantFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const products=(tenant.data?.products??[]).map((p:any)=>p.product_key);const[productKey,setProductKey]=useState("");
 useEffect(()=>{if(!productKey&&products[0])setProductKey(products[0]);},[productKey,products.join("|")]);
 const q=useQuery({queryKey:["finance-ai",tenantId,productKey],queryFn:()=>workspaceFn({data:{tenantId,productKey}}),enabled:!!tenantId&&!!productKey,retry:false});
 const[clientRef,setClientRef]=useState(""),[clientName,setClientName]=useState(""),[accountCode,setAccountCode]=useState(""),
  [accountName,setAccountName]=useState(""),[taxQuestion,setTaxQuestion]=useState(""),[periodEnd,setPeriodEnd]=useState(new Date().toISOString().slice(0,10)),
  [employerRef,setEmployerRef]=useState(""),[payPeriod,setPayPeriod]=useState(""),[filingType,setFilingType]=useState("confirmation-statement");
 async function run(fn:()=>Promise<unknown>,msg:string){try{await fn();toast.success(msg);await q.refetch();}catch(e){toast.error(e instanceof Error?e.message:String(e));}}
 return <AppShell title="Finance, Practice & Tax AI" subtitle="Practice operations, bookkeeping AI, trial balance/accounts preparation, asset register, payroll, company-secretarial and evidence-backed tax research."
  actions={<Button variant="outline" size="sm" onClick={()=>q.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>}>
  <Card><CardContent className="p-5"><label className="text-xs text-muted-foreground">Product workspace</label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={productKey} onChange={e=>setProductKey(e.target.value)}>{products.map((p:string)=><option key={p}>{p}</option>)}</select></CardContent></Card>
  <div className="mt-6 grid gap-4 md:grid-cols-4">
   <Metric icon={Landmark} label="Clients" value={q.data?.clients?.length??0}/><Metric icon={ReceiptText} label="Intake jobs" value={q.data?.ingestionJobs?.length??0}/>
   <Metric icon={BrainCircuit} label="Accounts prep" value={q.data?.accountsPrep?.length??0}/><Metric icon={Scale} label="Tax cases" value={q.data?.taxCases?.length??0}/>
  </div>
  <div className="mt-6 grid gap-6 xl:grid-cols-2">
   <Card><CardContent className="p-5"><h2 className="font-semibold">Practice client</h2>
    <Input className="mt-3" placeholder="Client reference" value={clientRef} onChange={e=>setClientRef(e.target.value)}/>
    <Input className="mt-2" placeholder="Client / business name" value={clientName} onChange={e=>setClientName(e.target.value)}/>
    <Button className="mt-3" disabled={!clientRef||!clientName||!productKey} onClick={()=>run(()=>clientFn({data:{tenantId,productKey,clientRef,displayName:clientName,metadata:{}}}),"Client saved")}>Save client</Button>
    <div className="mt-4 space-y-2">{(q.data?.clients??[]).slice(0,8).map((x:any)=><div key={x.id} className="flex items-center justify-between rounded-lg bg-muted p-3 text-sm"><div><b>{x.display_name}</b><p className="text-xs text-muted-foreground">{x.client_ref}</p></div><StatusBadge status={x.status}/></div>)}</div>
   </CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Nominal ledger + intake</h2>
    <div className="mt-3 grid gap-2 sm:grid-cols-2"><Input placeholder="Account code" value={accountCode} onChange={e=>setAccountCode(e.target.value)}/><Input placeholder="Account name" value={accountName} onChange={e=>setAccountName(e.target.value)}/></div>
    <Button className="mt-2" variant="outline" disabled={!clientRef||!accountCode||!accountName} onClick={()=>run(()=>accountFn({data:{tenantId,productKey,clientRef,code:accountCode,name:accountName,accountType:"expense"}}),"Nominal account saved")}>Add nominal account</Button>
    <div className="mt-4 flex flex-wrap gap-2">{["receipt","invoice","statement","csv","pdf","scan"].map(k=><Button key={k} size="sm" variant="outline" disabled={!clientRef} onClick={()=>run(()=>intakeFn({data:{tenantId,productKey,clientRef,sourceKind:k as any,documentId:null}}),`${k} intake queued`)}>{k}</Button>)}</div>
    <p className="mt-3 text-xs text-muted-foreground">Extraction posts to review first. Nothing reaches the ledger until the proposed journal is balanced and explicitly posted.</p>
   </CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Accounts preparation</h2>
    <Input className="mt-3" type="date" value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)}/>
    <Button className="mt-3" disabled={!clientRef||!periodEnd} onClick={()=>run(()=>prepFn({data:{tenantId,productKey,clientRef,periodStart:periodEnd.slice(0,4)+"-01-01",periodEnd,priorPeriodEnd:null,inputRefs:{}}}),"Accounts preparation queued")}>Queue accounts prep</Button>
    <div className="mt-4 flex flex-wrap gap-2">{(q.data?.accountsPrep??[]).slice(0,10).map((x:any)=><Badge key={x.id} variant="outline">{x.client_ref} · {x.status}</Badge>)}</div>
   </CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Tax intelligence</h2>
    <Input className="mt-3" placeholder="Research question" value={taxQuestion} onChange={e=>setTaxQuestion(e.target.value)}/>
    <Button className="mt-3" disabled={!clientRef||taxQuestion.length<4} onClick={()=>run(()=>taxFn({data:{tenantId,productKey,clientRef,jurisdiction:"GB",taxType:"general",period:null,question:taxQuestion}}),"Tax research queued")}>Start evidence-backed research</Button>
    <div className="mt-4 space-y-2">{(q.data?.taxCases??[]).slice(0,8).map((x:any)=><div key={x.id} className="rounded-lg bg-muted p-3 text-sm"><div className="flex justify-between gap-2"><b className="line-clamp-1">{x.question}</b><StatusBadge status={x.status}/></div><p className="mt-1 text-xs text-muted-foreground">{x.jurisdiction} · {x.tax_type}</p></div>)}</div>
   </CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Payroll control</h2>
    <div className="mt-3 grid gap-2 sm:grid-cols-2"><Input placeholder="Employer reference" value={employerRef} onChange={e=>setEmployerRef(e.target.value)}/><Input placeholder="Period e.g. 2026-10" value={payPeriod} onChange={e=>setPayPeriod(e.target.value)}/></div>
    <Button className="mt-3" disabled={!employerRef||!payPeriod} onClick={()=>run(()=>payrollFn({data:{tenantId,productKey,employerRef,periodKey:payPeriod,payDate:periodEnd}}),"Payroll review run created")}>Create payroll run</Button>
    <div className="mt-4 space-y-2">{(q.data?.payrollRuns??[]).slice(0,8).map((x:any)=><div key={x.id} className="flex items-center justify-between rounded-lg bg-muted p-3 text-sm"><div><b>{x.employer_ref} · {x.period_key}</b><p className="text-xs text-muted-foreground">{x.pay_date}</p></div><StatusBadge status={x.status}/></div>)}</div>
    <p className="mt-3 text-xs text-muted-foreground">Calculation lines move the run into review; approval is separate from any HMRC/provider submission.</p>
   </CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Company secretarial</h2>
    <Input className="mt-3" placeholder="Filing type" value={filingType} onChange={e=>setFilingType(e.target.value)}/>
    <Button className="mt-3" disabled={!(q.data?.companies??[])[0]||!filingType} onClick={()=>run(()=>filingFn({data:{tenantId,entityId:(q.data?.companies??[])[0].id,filingType,periodEnd:null,dueAt:null,providerKey:null,payload:{},evidenceDocumentId:null}}),"Filing prepared for review")}>Prepare filing for first entity</Button>
    <div className="mt-4 space-y-2">{(q.data?.companies??[]).slice(0,8).map((x:any)=><div key={x.id} className="flex items-center justify-between rounded-lg border p-3 text-sm"><div><b>{x.legal_name}</b><p className="text-xs text-muted-foreground">{x.company_number||x.jurisdiction}</p></div><StatusBadge status={x.status}/></div>)}</div>
    <p className="mt-3 text-xs text-muted-foreground">Preparation and independent approval are internal controls; the provider connector must confirm an external filing before it is marked submitted/accepted.</p>
   </CardContent></Card>
  </div>
 </AppShell>;
}
function Metric({icon:Icon,label,value}:{icon:typeof Landmark;label:string;value:number}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4"/></div><div className="mt-2 font-display text-2xl font-semibold">{value}</div></CardContent></Card>}
