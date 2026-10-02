import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell,StatusBadge } from "@/components/app/shell";
import { Card,CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/hooks/useTenant";
import { getTenantControlPlane } from "@/lib/control-plane.functions";
import { createPayrollRun,createSecretarialEntity,enableVerticalPackage,getVerticalPackages } from "@/modules/verticals/functions";
import { Boxes,RefreshCw } from "lucide-react";
import { toast } from "sonner";
export const Route=createFileRoute("/_authenticated/app/vertical-packages")({component:Verticals,head:()=>({meta:[{title:"Vertical Packages — Omniqora"},{name:"robots",content:"noindex"}]})});
function Verticals(){
 const t=useTenant();const tenantId=t.tenantId??"";const tenantFn=useServerFn(getTenantControlPlane),getFn=useServerFn(getVerticalPackages),enableFn=useServerFn(enableVerticalPackage),payrollFn=useServerFn(createPayrollRun),companyFn=useServerFn(createSecretarialEntity);
 const td=useQuery({queryKey:["vertical-tenant",tenantId],queryFn:()=>tenantFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const[productKey,setProductKey]=useState("");const products=td.data?.products??[];if(!productKey&&products[0]?.product_key)queueMicrotask(()=>setProductKey(products[0].product_key));
 const q=useQuery({queryKey:["vertical-packages",tenantId,productKey],queryFn:()=>getFn({data:{tenantId,productKey}}),enabled:!!tenantId,retry:false});
 const[companyName,setCompanyName]=useState(""),[employer,setEmployer]=useState(""),[period,setPeriod]=useState("");
 async function run(fn:()=>Promise<unknown>,m:string){try{await fn();toast.success(m);await q.refetch();}catch(e){toast.error(e instanceof Error?e.message:String(e));}}
 return <AppShell title="Vertical Packages" subtitle="Regulated/industry packages consuming the shared Omniqora engines instead of duplicating them." actions={<Button variant="outline" size="sm" onClick={()=>q.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>}>
  <Card><CardContent className="p-5"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={productKey} onChange={e=>setProductKey(e.target.value)}>{products.map((p:any)=><option key={p.product_key}>{p.product_key}</option>)}</select></CardContent></Card>
  <div className="mt-6 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{(q.data?.catalogue??[]).map((p:any)=>{const enabled=(q.data?.enabled??[]).find((x:any)=>x.package_key===p.package_key&&x.product_key===productKey);return <Card key={p.package_key}><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{p.name}</h2><p className="mt-1 text-xs text-muted-foreground">{p.description}</p></div><Badge variant="outline">{p.implementation_status}</Badge></div><div className="mt-3 flex flex-wrap gap-2">{(p.required_services??[]).map((s:string)=><Badge key={s} variant="secondary">{s}</Badge>)}</div><div className="mt-4 flex items-center justify-between">{enabled?<StatusBadge status={enabled.status}/>:<span className="text-xs text-muted-foreground">Not enabled</span>}<Button size="sm" variant="outline" disabled={!productKey||p.implementation_status==="catalogue_only"||p.implementation_status==="draft_branch"} onClick={()=>run(()=>enableFn({data:{tenantId,productKey,packageKey:p.package_key}}),"Package evaluated")}>Enable</Button></div></CardContent></Card>})}</div>
  <div className="mt-6 grid gap-6 xl:grid-cols-2">
   <Card><CardContent className="p-5"><h2 className="font-semibold">Payroll run</h2><Input className="mt-3" value={employer} onChange={e=>setEmployer(e.target.value)} placeholder="Employer ref"/><Input className="mt-2" value={period} onChange={e=>setPeriod(e.target.value)} placeholder="2026-10"/><Button className="mt-3" disabled={!employer||!period||!productKey} onClick={()=>run(()=>payrollFn({data:{tenantId,productKey,employerRef:employer,periodKey:period,payDate:new Date().toISOString().slice(0,10)}}),"Payroll draft created")}>Create draft run</Button></CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Company secretarial entity</h2><Input className="mt-3" value={companyName} onChange={e=>setCompanyName(e.target.value)} placeholder="Legal company name"/><Button className="mt-3" disabled={!companyName||!productKey} onClick={()=>run(()=>companyFn({data:{tenantId,productKey,legalName:companyName,jurisdiction:"GB",companyNumber:null}}),"Company record created")}>Create entity</Button></CardContent></Card>
  </div>
 </AppShell>
}