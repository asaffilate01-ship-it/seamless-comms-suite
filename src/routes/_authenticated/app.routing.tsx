import {createFileRoute} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useEffect,useState} from "react";
import {AppShell,StatusBadge} from "@/components/app/shell";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {useTenant} from "@/hooks/useTenant";
import {getTenantControlPlane} from "@/lib/control-plane.functions";
import {applyDispatchRecommendation,applyRoutingOptimisation,createRoutingOptimisation,generateDispatchRecommendations,getRoutingWorkspace,runNativeRoutingOptimisation,saveRoutingPolicy} from "@/modules/routing/functions";
import {GitBranch,MapPinned,RefreshCw,Route as RouteIcon,Truck} from "lucide-react";
import {toast} from "sonner";

export const RouteDef=createFileRoute("/_authenticated/app/routing")({component:RoutingWorkspace,head:()=>({meta:[{title:"Native Routing — Omniqora"},{name:"robots",content:"noindex"}]})});
export {RouteDef as Route};

function RoutingWorkspace(){
 const t=useTenant(),tenantId=t.tenantId??"";const tenantFn=useServerFn(getTenantControlPlane),getFn=useServerFn(getRoutingWorkspace),policyFn=useServerFn(saveRoutingPolicy),createFn=useServerFn(createRoutingOptimisation),runFn=useServerFn(runNativeRoutingOptimisation),applyFn=useServerFn(applyRoutingOptimisation),recommendFn=useServerFn(generateDispatchRecommendations),applyRecFn=useServerFn(applyDispatchRecommendation);
 const tenant=useQuery({queryKey:["routing-tenant",tenantId],queryFn:()=>tenantFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const products=(tenant.data?.products??[]).map((p:any)=>p.product_key);const[productKey,setProductKey]=useState("");
 useEffect(()=>{if(!productKey&&products[0])setProductKey(products[0]);},[productKey,products.join("|")]);
 const q=useQuery({queryKey:["routing",tenantId,productKey],queryFn:()=>getFn({data:{tenantId,productKey}}),enabled:!!tenantId&&!!productKey,retry:false});
 async function run(fn:()=>Promise<unknown>,msg:string){try{await fn();toast.success(msg);await q.refetch();}catch(e){toast.error(e instanceof Error?e.message:String(e));}}
 const unassigned=(q.data?.jobs??[]).filter((x:any)=>x.status==="unassigned"),latest=(q.data?.optimisations??[])[0];
 return <AppShell title="Native Routing & VRP" subtitle="Omniqora-owned assignment, batching, time windows, capacity/skills, re-optimisation and provider scoring. No Jungleworks dependency."
 actions={<Button size="sm" variant="outline" onClick={()=>q.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>}>
  <Card><CardContent className="p-5"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={productKey} onChange={e=>setProductKey(e.target.value)}>{products.map((p:string)=><option key={p}>{p}</option>)}</select></CardContent></Card>
  <div className="mt-6 grid gap-4 md:grid-cols-4"><Metric icon={Truck} label="Unassigned jobs" value={unassigned.length}/><Metric icon={RouteIcon} label="Optimisations" value={q.data?.optimisations?.length??0}/><Metric icon={MapPinned} label="Matrix jobs" value={q.data?.matrixJobs?.length??0}/><Metric icon={GitBranch} label="Recommendations" value={(q.data?.recommendations??[]).filter((x:any)=>x.status==="candidate").length}/></div>
  <div className="mt-6 grid gap-6 xl:grid-cols-2">
   <Card><CardContent className="p-5"><h2 className="font-semibold">Routing policy</h2><p className="mt-1 text-xs text-muted-foreground">Google/Mapbox/openrouteservice matrices are optional adapters. Haversine fallback and the VRP solver stay native.</p><Button className="mt-4" onClick={()=>run(()=>policyFn({data:{tenantId,productKey,policyKey:"default",objective:"balanced",providerOrder:["maps.google","maps.mapbox","maps.openrouteservice"],allowHaversineFallback:true,maxStopsPerRoute:100,reoptimiseTriggers:["job_added","job_cancelled","agent_unavailable","vehicle_unavailable","sla_risk","traffic_change"]}}),"Routing policy saved")}>Save native default</Button><div className="mt-4 flex flex-wrap gap-2">{(q.data?.providerRanking??[]).map((x:any)=><Badge key={x.provider_key} variant="outline">{x.provider_key} · {Number(x.score).toFixed(1)}</Badge>)}</div></CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Run optimiser</h2><div className="mt-3 flex flex-wrap gap-2"><Button onClick={()=>run(()=>createFn({data:{tenantId,productKey,reason:"manual",objective:"balanced"}}),"Optimisation queued")}>Queue</Button>{latest?.status==="queued"&&<Button variant="outline" onClick={()=>run(()=>runFn({data:{tenantId,optimisationId:latest.id}}),"Native route plan built")}>Run native solver</Button>}{latest?.status==="review"&&<Button onClick={()=>run(()=>applyFn({data:{tenantId,optimisationId:latest.id}}),"Route plan applied")}>Approve & apply</Button>}</div>{latest&&<div className="mt-4 rounded-lg border p-3 text-sm"><div className="flex justify-between"><b>{latest.algorithm}</b><StatusBadge status={latest.status}/></div><p className="mt-1 text-xs text-muted-foreground">{latest.reason} · {latest.objective}</p><p className="mt-2 text-xs">{latest.routes?.length??0} route(s) · {latest.score?.distanceMetres??0} m · {latest.score?.constraintBreaches??0} breach(es)</p></div>}</CardContent></Card>
  </div>
  <Card className="mt-6"><CardContent className="p-5"><h2 className="font-semibold">Automatic assignment</h2><div className="mt-4 space-y-2">{unassigned.slice(0,12).map((job:any)=>{const rec=(q.data?.recommendations??[]).find((r:any)=>r.job_id===job.id&&r.status==="candidate");return <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"><div><b>{job.job_type}</b><p className="text-xs text-muted-foreground">{job.priority} · {(job.stops??[]).length} stop(s)</p></div><div className="flex gap-2">{rec?<><Badge variant="outline">score {Number(rec.score).toFixed(1)}</Badge><Button size="sm" onClick={()=>run(()=>applyRecFn({data:{tenantId,recommendationId:rec.id}}),"Assignment applied")}>Apply</Button></>:<Button size="sm" variant="outline" onClick={()=>run(()=>recommendFn({data:{tenantId,productKey,jobId:job.id,limit:5}}),"Assignment candidates generated")}>Recommend</Button>}</div></div>})}</div></CardContent></Card>
 </AppShell>
}
function Metric({icon:Icon,label,value}:{icon:typeof RouteIcon;label:string;value:number}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4"/></div><div className="mt-2 font-display text-2xl font-semibold">{value}</div></CardContent></Card>}
