import {createFileRoute} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useEffect,useState} from "react";
import {AppShell,StatusBadge} from "@/components/app/shell";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {useTenant} from "@/hooks/useTenant";
import {getTenantControlPlane} from "@/lib/control-plane.functions";
import {createAdvisoryEngagement,createDecisionCase,getDecisionWorkspace} from "@/modules/reconciliation/functions";
import {BrainCircuit,RefreshCw,Scale,TrendingUp} from "lucide-react";
import {toast} from "sonner";

export const Route=createFileRoute("/_authenticated/app/decision-intelligence")({component:DecisionIntelligence,head:()=>({meta:[{title:"Decision Intelligence — Omniqora"},{name:"robots",content:"noindex"}]})});
function DecisionIntelligence(){
 const t=useTenant(),tenantId=t.tenantId??"";const tenantFn=useServerFn(getTenantControlPlane),getFn=useServerFn(getDecisionWorkspace),caseFn=useServerFn(createDecisionCase),engagementFn=useServerFn(createAdvisoryEngagement);
 const tenant=useQuery({queryKey:["decision-tenant",tenantId],queryFn:()=>tenantFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const products=(tenant.data?.products??[]).map((p:any)=>p.product_key);const[productKey,setProductKey]=useState("");
 useEffect(()=>{if(!productKey&&products[0])setProductKey(products[0]);},[productKey,products.join("|")]);
 const q=useQuery({queryKey:["decision-intelligence",tenantId,productKey],queryFn:()=>getFn({data:{tenantId,productKey}}),enabled:!!tenantId&&!!productKey,retry:false});
 const[key,setKey]=useState(""),[title,setTitle]=useState(""),[question,setQuestion]=useState(""),[domain,setDomain]=useState("advisory"),[engagementTitle,setEngagementTitle]=useState("");
 async function run(fn:()=>Promise<unknown>,msg:string){try{await fn();toast.success(msg);await q.refetch();}catch(e){toast.error(e instanceof Error?e.message:String(e));}}
 return <AppShell title="Decision & Adviser Intelligence" subtitle="Evidence-preserving decisions, outcome review, approved lessons, model challenger evaluation and QITT-style adviser engagements."
 actions={<Button size="sm" variant="outline" onClick={()=>q.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>}>
  <Card><CardContent className="p-5"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={productKey} onChange={e=>setProductKey(e.target.value)}>{products.map((p:string)=><option key={p}>{p}</option>)}</select></CardContent></Card>
  <div className="mt-6 grid gap-4 md:grid-cols-4"><Metric icon={Scale} label="Decision cases" value={q.data?.cases?.length??0}/><Metric icon={TrendingUp} label="Outcome reviews" value={(q.data?.decisions??[]).reduce((n:number,x:any)=>n+(x.outcomes?.length??0),0)}/><Metric icon={BrainCircuit} label="Model candidates" value={q.data?.models?.length??0}/><Metric icon={Scale} label="Advisory engagements" value={q.data?.engagements?.length??0}/></div>
  <div className="mt-6 grid gap-6 xl:grid-cols-2">
   <Card><CardContent className="p-5"><h2 className="font-semibold">New decision case</h2><div className="mt-3 grid gap-2 sm:grid-cols-2"><Input placeholder="case-key" value={key} onChange={e=>setKey(e.target.value)}/><Input placeholder="Domain" value={domain} onChange={e=>setDomain(e.target.value)}/></div><Input className="mt-2" placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)}/><Textarea className="mt-2" placeholder="Decision question" value={question} onChange={e=>setQuestion(e.target.value)}/><Button className="mt-3" disabled={!key||!title||question.length<5} onClick={()=>run(()=>caseFn({data:{tenantId,productKey,caseKey:key,title,question,domain}}),"Decision case created")}>Create</Button>
    <div className="mt-4 space-y-2">{(q.data?.cases??[]).slice(0,10).map((x:any)=><div key={x.id} className="flex items-center justify-between rounded-lg border p-3 text-sm"><div><b>{x.title}</b><p className="text-xs text-muted-foreground">{x.domain} · {x.question}</p></div><StatusBadge status={x.status}/></div>)}</div>
   </CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">QITT-style advisory engagement</h2><Input className="mt-3" placeholder="Engagement title" value={engagementTitle} onChange={e=>setEngagementTitle(e.target.value)}/><Button className="mt-3" disabled={!engagementTitle} onClick={()=>run(()=>engagementFn({data:{tenantId,productKey,templateKey:"qitt-business-diagnostic",title:engagementTitle}}),"Advisory engagement created")}>Create diagnostic</Button>
    <div className="mt-4 space-y-2">{(q.data?.engagements??[]).slice(0,10).map((x:any)=><div key={x.id} className="flex items-center justify-between rounded-lg bg-muted p-3 text-sm"><b>{x.title}</b><StatusBadge status={x.status}/></div>)}</div>
   </CardContent></Card>
  </div>
 </AppShell>
}
function Metric({icon:Icon,label,value}:{icon:typeof Scale;label:string;value:number}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4"/></div><div className="mt-2 font-display text-2xl font-semibold">{value}</div></CardContent></Card>}
