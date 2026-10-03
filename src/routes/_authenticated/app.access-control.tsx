import {createFileRoute} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useEffect,useState} from "react";
import {AppShell} from "@/components/app/shell";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {useTenant} from "@/hooks/useTenant";
import {getTenantControlPlane} from "@/lib/control-plane.functions";
import {createAccessTeam,getAccessControlWorkspace,setResourceAccessRule} from "@/modules/reconciliation/functions";
import {KeyRound,RefreshCw,Users} from "lucide-react";
import {toast} from "sonner";

export const Route=createFileRoute("/_authenticated/app/access-control")({component:AccessControl,head:()=>({meta:[{title:"Access Control — Omniqora"},{name:"robots",content:"noindex"}]})});
function AccessControl(){
 const t=useTenant(),tenantId=t.tenantId??"";const tenantFn=useServerFn(getTenantControlPlane),getFn=useServerFn(getAccessControlWorkspace),teamFn=useServerFn(createAccessTeam),ruleFn=useServerFn(setResourceAccessRule);
 const tenant=useQuery({queryKey:["acl-tenant",tenantId],queryFn:()=>tenantFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const products=(tenant.data?.products??[]).map((p:any)=>p.product_key);const[productKey,setProductKey]=useState("");
 useEffect(()=>{if(!productKey&&products[0])setProductKey(products[0]);},[productKey,products.join("|")]);
 const q=useQuery({queryKey:["acl",tenantId,productKey],queryFn:()=>getFn({data:{tenantId,productKey}}),enabled:!!tenantId&&!!productKey,retry:false});
 const[teamKey,setTeamKey]=useState(""),[teamName,setTeamName]=useState(""),[resourceId,setResourceId]=useState(""),[principalRef,setPrincipalRef]=useState("");
 async function run(fn:()=>Promise<unknown>,msg:string){try{await fn();toast.success(msg);await q.refetch();}catch(e){toast.error(e instanceof Error?e.message:String(e));}}
 return <AppShell title="Fine-grained Access Control" subtitle="Department/project teams and resource-level rules layered over tenant RLS. Documents stay tenant-wide until an explicit ACL exists."
 actions={<Button size="sm" variant="outline" onClick={()=>q.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>}>
  <Card><CardContent className="p-5"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={productKey} onChange={e=>setProductKey(e.target.value)}>{products.map((p:string)=><option key={p}>{p}</option>)}</select></CardContent></Card>
  <div className="mt-6 grid gap-6 xl:grid-cols-2">
   <Card><CardContent className="p-5"><div className="flex items-center gap-2"><Users className="h-4 w-4"/><h2 className="font-semibold">Departments / teams</h2></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><Input placeholder="team-key" value={teamKey} onChange={e=>setTeamKey(e.target.value)}/><Input placeholder="Name" value={teamName} onChange={e=>setTeamName(e.target.value)}/></div><Button className="mt-3" disabled={!teamKey||!teamName} onClick={()=>run(()=>teamFn({data:{tenantId,productKey,teamKey,name:teamName,teamType:"department"}}),"Department team created")}>Create team</Button><div className="mt-4 flex flex-wrap gap-2">{(q.data?.teams??[]).map((x:any)=><Badge key={x.id} variant="outline">{x.name}</Badge>)}</div></CardContent></Card>
   <Card><CardContent className="p-5"><div className="flex items-center gap-2"><KeyRound className="h-4 w-4"/><h2 className="font-semibold">Document/resource rule</h2></div><Input className="mt-3" placeholder="Document/resource ID" value={resourceId} onChange={e=>setResourceId(e.target.value)}/><Input className="mt-2" placeholder="User UUID, tenant role, or team UUID" value={principalRef} onChange={e=>setPrincipalRef(e.target.value)}/><Button className="mt-3" disabled={!resourceId||!principalRef} onClick={()=>run(()=>ruleFn({data:{tenantId,productKey,resourceType:"document",resourceId,principalType:"user",principalRef,permission:"read",effect:"allow",reason:"Explicit document access"}}),"Access rule saved")}>Allow user read</Button></CardContent></Card>
  </div>
  <Card className="mt-6"><CardContent className="p-5"><h2 className="font-semibold">Rules</h2><div className="mt-4 space-y-2">{(q.data?.rules??[]).map((x:any)=><div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"><div><b>{x.resource_type} · {x.resource_id}</b><p className="text-xs text-muted-foreground">{x.principal_type}:{x.principal_ref}</p></div><div className="flex gap-2"><Badge variant="outline">{x.permission}</Badge><Badge variant={x.effect==="deny"?"destructive":"outline"}>{x.effect}</Badge></div></div>)}</div></CardContent></Card>
 </AppShell>
}
