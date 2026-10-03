import {createFileRoute} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useEffect,useState} from "react";
import {AppShell} from "@/components/app/shell";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {useTenant} from "@/hooks/useTenant";
import {getTenantControlPlane} from "@/lib/control-plane.functions";
import {generateDailyBrief,getDailyBriefWorkspace} from "@/modules/reconciliation/functions";
import {CalendarCheck,RefreshCw} from "lucide-react";
import {toast} from "sonner";

export const Route=createFileRoute("/_authenticated/app/daily-brief")({component:DailyBrief,head:()=>({meta:[{title:"Daily Brief — Omniqora"},{name:"robots",content:"noindex"}]})});
function DailyBrief(){
 const t=useTenant(),tenantId=t.tenantId??"";const tenantFn=useServerFn(getTenantControlPlane),getFn=useServerFn(getDailyBriefWorkspace),generateFn=useServerFn(generateDailyBrief);
 const tenant=useQuery({queryKey:["brief-tenant",tenantId],queryFn:()=>tenantFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const products=(tenant.data?.products??[]).map((p:any)=>p.product_key);const[productKey,setProductKey]=useState("");
 useEffect(()=>{if(!productKey&&products[0])setProductKey(products[0]);},[productKey,products.join("|")]);
 const q=useQuery({queryKey:["daily-brief",tenantId,productKey],queryFn:()=>getFn({data:{tenantId,productKey}}),enabled:!!tenantId&&!!productKey,retry:false});
 async function generate(){try{await generateFn({data:{tenantId,productKey}});toast.success("Today's brief regenerated");await q.refetch();}catch(e){toast.error(e instanceof Error?e.message:String(e));}}
 const run=(q.data?.runs??[])[0],items=run?.items??[],summary=run?.summary??{};
 return <AppShell title="Welcome to your day" subtitle="Outstanding tasks, approvals, blockers and deadlines in one evidence-linked operating brief."
  actions={<><Button size="sm" variant="outline" onClick={()=>q.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button><Button size="sm" onClick={generate}><CalendarCheck className="mr-2 h-4 w-4"/>Generate today</Button></>}>
  <Card><CardContent className="p-5"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={productKey} onChange={e=>setProductKey(e.target.value)}>{products.map((p:string)=><option key={p}>{p}</option>)}</select></CardContent></Card>
  <div className="mt-6 grid gap-4 md:grid-cols-4">{["tasks","approvals","blockers","deadlines"].map(k=><Card key={k}><CardContent className="p-5"><div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div><div className="mt-2 font-display text-2xl font-semibold">{summary[k]??0}</div></CardContent></Card>)}</div>
  <Card className="mt-6"><CardContent className="p-5"><h2 className="font-semibold">Today</h2><div className="mt-4 space-y-2">{items.length?items.map((x:any)=><div key={x.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3 text-sm"><div><b>{x.title}</b><p className="mt-1 text-xs text-muted-foreground">{x.detail||x.source_type||""}</p></div><div className="flex gap-2"><Badge variant="outline">{x.category}</Badge><Badge variant={x.priority==="urgent"?"destructive":"outline"}>{x.priority}</Badge></div></div>):<p className="text-sm text-muted-foreground">Generate today's brief to collect current work.</p>}</div></CardContent></Card>
 </AppShell>
}
