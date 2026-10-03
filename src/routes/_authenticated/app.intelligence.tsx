import {createFileRoute} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useEffect,useState} from "react";
import {AppShell,StatusBadge} from "@/components/app/shell";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Badge} from "@/components/ui/badge";
import {useTenant} from "@/hooks/useTenant";
import {getTenantControlPlane} from "@/lib/control-plane.functions";
import {approveAiUseCase,getIntelligenceWorkspace,reviewActionProposal,startAgentRun,suspendAiUseCase,upsertAiUseCase} from "@/modules/intelligence/functions";
import {Bot,BrainCircuit,RefreshCw,ShieldCheck,Workflow} from "lucide-react";
import {toast} from "sonner";

export const Route=createFileRoute("/_authenticated/app/intelligence")({component:Intelligence,head:()=>({meta:[{title:"AI Control — Omniqora"},{name:"robots",content:"noindex"}]})});

function Intelligence(){
 const t=useTenant(),tenantId=t.tenantId??"";const tenantFn=useServerFn(getTenantControlPlane),getFn=useServerFn(getIntelligenceWorkspace),
 saveFn=useServerFn(upsertAiUseCase),approveFn=useServerFn(approveAiUseCase),suspendFn=useServerFn(suspendAiUseCase),runFn=useServerFn(startAgentRun),reviewFn=useServerFn(reviewActionProposal);
 const tenant=useQuery({queryKey:["ai-tenant",tenantId],queryFn:()=>tenantFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const products=(tenant.data?.products??[]).map((p:any)=>p.product_key);const[productKey,setProductKey]=useState("");
 useEffect(()=>{if(!productKey&&products[0])setProductKey(products[0]);},[productKey,products.join("|")]);
 const q=useQuery({queryKey:["ai-control",tenantId,productKey],queryFn:()=>getFn({data:{tenantId,productKey}}),enabled:!!tenantId&&!!productKey,retry:false});
 const[key,setKey]=useState(""),[name,setName]=useState(""),[purpose,setPurpose]=useState(""),[goal,setGoal]=useState("");
 async function run(action:()=>Promise<unknown>,msg:string){try{await action();toast.success(msg);await q.refetch();}catch(e){toast.error(e instanceof Error?e.message:String(e));}}
 return <AppShell title="AI Control & Governance" subtitle="Provider-neutral use-case governance, bounded specialist agents, typed jobs, approvals and action proposals."
 actions={<Button size="sm" variant="outline" onClick={()=>q.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>}>
  <Card><CardContent className="grid gap-3 p-5 md:grid-cols-2"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={productKey} onChange={e=>setProductKey(e.target.value)}>{products.map((p:string)=><option key={p}>{p}</option>)}</select><div className="flex flex-wrap gap-2">{(q.data?.providers??[]).map((p:any)=><Badge key={p.id} variant="outline">{p.provider_key} · {p.status}</Badge>)}</div></CardContent></Card>
  <div className="mt-6 grid gap-4 md:grid-cols-4"><Metric icon={ShieldCheck} label="Use cases" value={q.data?.useCases?.length??0}/><Metric icon={Bot} label="Agent runs" value={q.data?.runs?.length??0}/><Metric icon={Workflow} label="Jobs" value={q.data?.jobs?.length??0}/><Metric icon={BrainCircuit} label="Pending proposals" value={(q.data?.proposals??[]).filter((x:any)=>x.status==="pending").length}/></div>
  <div className="mt-6 grid gap-6 xl:grid-cols-2">
   <Card><CardContent className="p-5"><h2 className="font-semibold">Register / assess AI use case</h2>
    <div className="mt-3 grid gap-2 sm:grid-cols-2"><Input placeholder="use-case-key" value={key} onChange={e=>setKey(e.target.value)}/><Input placeholder="Name" value={name} onChange={e=>setName(e.target.value)}/></div>
    <Textarea className="mt-2" placeholder="Purpose and intended business outcome" value={purpose} onChange={e=>setPurpose(e.target.value)}/>
    <Button className="mt-3" disabled={!key||!name||purpose.length<10} onClick={()=>run(()=>saveFn({data:{tenantId,productKey,useCaseKey:key,name,purpose,dataClasses:[],allowedTools:[],providerRoute:{},monthlyBudgetMinor:null,budgetCurrency:null,evidenceRefs:[]}}),"Use case assessed")}>Save assessment</Button>
    <div className="mt-4 space-y-2">{(q.data?.useCases??[]).slice(0,10).map((u:any)=><div key={u.id} className="rounded-lg bg-muted p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><b>{u.name}</b><p className="text-xs text-muted-foreground">{u.use_case_key} · risk {u.risk_level}</p></div><StatusBadge status={u.status}/></div><div className="mt-2 flex gap-2"><Button size="sm" variant="outline" disabled={u.status!=="assessed"} onClick={()=>run(()=>approveFn({data:{tenantId,useCaseId:u.id}}),"Use case approved")}>Approve</Button><Button size="sm" variant="ghost" onClick={()=>run(()=>suspendFn({data:{tenantId,useCaseId:u.id}}),"Use case suspended")}>Suspend</Button></div></div>)}</div>
   </CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Run bounded specialist</h2><Textarea className="mt-3" placeholder="Goal" value={goal} onChange={e=>setGoal(e.target.value)}/>
    <div className="mt-3 flex flex-wrap gap-2">{["discovery","finance","technical","compliance","product","transaction","accounting","tax","operations"].map(profile=><Button key={profile} size="sm" variant="outline" disabled={goal.length<4} onClick={()=>run(()=>runFn({data:{tenantId,productKey,useCaseId:null,profile:profile as any,goal,maxSteps:8,providerKey:null,model:null,inputVersion:null}}),`${profile} run queued`)}>{profile}</Button>)}</div>
    <div className="mt-4 space-y-2">{(q.data?.runs??[]).slice(0,10).map((x:any)=><div key={x.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3 text-sm"><div className="min-w-0"><b>{x.profile}</b><p className="truncate text-xs text-muted-foreground">{x.goal}</p></div><StatusBadge status={x.status}/></div>)}</div>
   </CardContent></Card>
  </div>
  <Card className="mt-6"><CardContent className="p-5"><h2 className="font-semibold">Action approval queue</h2><p className="mt-1 text-xs text-muted-foreground">Agent proposals do not execute themselves. Review remains separate from model output.</p><div className="mt-4 space-y-2">{(q.data?.proposals??[]).map((p:any)=><div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"><div><b>{p.action_key}</b><p className="text-xs text-muted-foreground">{p.target_type}{p.target_id?" · "+p.target_id:""}</p><p className="mt-1 text-xs">{p.rationale}</p></div><div className="flex items-center gap-2"><StatusBadge status={p.status}/>{p.status==="pending"&&<><Button size="sm" variant="outline" onClick={()=>run(()=>reviewFn({data:{tenantId,proposalId:p.id,decision:"approved"}}),"Proposal approved")}>Approve</Button><Button size="sm" variant="ghost" onClick={()=>run(()=>reviewFn({data:{tenantId,proposalId:p.id,decision:"rejected"}}),"Proposal rejected")}>Reject</Button></>}</div></div>)}</div></CardContent></Card>
 </AppShell>;
}
function Metric({icon:Icon,label,value}:{icon:typeof Bot;label:string;value:number}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4"/></div><div className="mt-2 font-display text-2xl font-semibold">{value}</div></CardContent></Card>}
