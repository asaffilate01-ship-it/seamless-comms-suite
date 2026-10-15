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
import {applyDispatchRecommendation,applyRoutingOptimisation,createRoutingOptimisation,queueRoadMatrixForOptimisation,createRoutingMatrixJob,runRoadMatrixPreview,generateDispatchRecommendations,getRoutingWorkspace,runNativeRoutingOptimisation,saveRoutingPolicy} from "@/modules/routing/functions";
import {GitBranch,MapPinned,RefreshCw,Route as RouteIcon,Truck} from "lucide-react";
import {toast} from "sonner";

export const RouteDef=createFileRoute("/_authenticated/app/routing")({component:RoutingWorkspace,head:()=>({meta:[{title:"Native Routing — Omniqora"},{name:"robots",content:"noindex"}]})});
export {RouteDef as Route};

function RoutingWorkspace(){
 const t=useTenant(),tenantId=t.tenantId??"";const tenantFn=useServerFn(getTenantControlPlane),getFn=useServerFn(getRoutingWorkspace),policyFn=useServerFn(saveRoutingPolicy),createFn=useServerFn(createRoutingOptimisation),runFn=useServerFn(runNativeRoutingOptimisation),applyFn=useServerFn(applyRoutingOptimisation),recommendFn=useServerFn(generateDispatchRecommendations),applyRecFn=useServerFn(applyDispatchRecommendation),queueMatrixFn=useServerFn(createRoutingMatrixJob),queuePlanMatrixFn=useServerFn(queueRoadMatrixForOptimisation),runMatrixFn=useServerFn(runRoadMatrixPreview);
 const tenant=useQuery({queryKey:["routing-tenant",tenantId],queryFn:()=>tenantFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const products=(tenant.data?.products??[]).map((p:any)=>p.product_key);const[productKey,setProductKey]=useState("");
 useEffect(()=>{if(!productKey&&products[0])setProductKey(products[0]);},[productKey,products.join("|")]);
 const q=useQuery({queryKey:["routing",tenantId,productKey],queryFn:()=>getFn({data:{tenantId,productKey}}),enabled:!!tenantId&&!!productKey,retry:false});
 async function run(fn:()=>Promise<unknown>,msg:string){try{await fn();toast.success(msg);await q.refetch();}catch(e){toast.error(e instanceof Error?e.message:String(e));}}
 const unassigned=(q.data?.jobs??[]).filter((x:any)=>x.status==="unassigned"),latest=(q.data?.optimisations??[])[0];
 const plannedMatrix=(q.data?.matrixJobs??[]).find((matrix:any)=>matrix.id===latest?.matrix_job_id);
 const canRun=latest?.status==="queued"&&(!latest.matrix_job_id||
  (plannedMatrix?.status==="completed"&&["road","traffic"].includes(plannedMatrix?.quality)));
 const geoPoints=unassigned.flatMap((j:any)=>(j.stops??[]).slice().sort((a:any,b:any)=>a.position-b.position)).filter((s:any)=>Number.isFinite(Number(s.latitude))&&Number.isFinite(Number(s.longitude))).slice(0,8).map((s:any)=>({lat:Number(s.latitude),lng:Number(s.longitude)}));
 const matrixJobs=(q.data?.matrixJobs??[]) as any[];
 const newest=matrixJobs[0] as any|undefined;
 const sample=(newest?.cells??[]).find((c:any)=>c.origin_index===0&&c.destination_index===Math.min(1,(newest?.destinations?.length??1)-1));
 return <AppShell title="Native Routing & VRP" subtitle="Omniqora-owned assignment, batching, time windows, capacity/skills, re-optimisation and provider scoring. No Jungleworks dependency."
 actions={<Button size="sm" variant="outline" onClick={()=>q.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>}>
  <Card><CardContent className="p-5"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={productKey} onChange={e=>setProductKey(e.target.value)}>{products.map((p:string)=><option key={p}>{p}</option>)}</select></CardContent></Card>
  <div className="mt-6 grid gap-4 md:grid-cols-4"><Metric icon={Truck} label="Unassigned jobs" value={unassigned.length}/><Metric icon={RouteIcon} label="Optimisations" value={q.data?.optimisations?.length??0}/><Metric icon={MapPinned} label="Matrix jobs" value={q.data?.matrixJobs?.length??0}/><Metric icon={GitBranch} label="Recommendations" value={(q.data?.recommendations??[]).filter((x:any)=>x.status==="candidate").length}/></div>
  <div className="mt-6 grid gap-6 xl:grid-cols-2">
   <Card><CardContent className="p-5"><h2 className="font-semibold">Routing policy</h2><p className="mt-1 text-xs text-muted-foreground">Google/Mapbox/openrouteservice matrices are optional adapters. Haversine fallback and the VRP solver stay native.</p><Button className="mt-4" onClick={()=>run(()=>policyFn({data:{tenantId,productKey,policyKey:"default",objective:"balanced",providerOrder:["maps.google","maps.mapbox","maps.openrouteservice"],allowHaversineFallback:true,maxStopsPerRoute:100,reoptimiseTriggers:["job_added","job_cancelled","agent_unavailable","vehicle_unavailable","sla_risk","traffic_change"]}}),"Routing policy saved")}>Save native default</Button><div className="mt-4 flex flex-wrap gap-2">{(q.data?.providerRanking??[]).map((x:any)=><Badge key={x.provider_key} variant="outline">{x.provider_key} · {Number(x.score).toFixed(1)}</Badge>)}</div></CardContent></Card>
   <Card><CardContent className="p-5 space-y-3">
    <div><h2 className="font-semibold">Run fleet optimiser</h2>
     <p className="mt-1 text-xs text-muted-foreground">
      Use an operator-approved road matrix to choose drivers by verified road journey time.
      Pilot capacity: eight unique locations; larger jobs remain in native estimated planning.
     </p></div>
    <div className="flex flex-wrap gap-2">
     <Button size="sm" onClick={()=>run(()=>createFn({data:{tenantId,productKey,reason:"manual",objective:"balanced"}}),
      "New optimisation queued")}>Queue optimisation</Button>
     {latest?.status==="queued"&&!latest.matrix_job_id&&
      <Button size="sm" variant="outline" onClick={()=>run(()=>queuePlanMatrixFn({data:{tenantId,optimisationId:latest.id}}),
       "Matrix requested for this route")}>Prepare verified road matrix</Button>}
     {latest?.status==="queued"&&plannedMatrix?.status==="queued"&&
      <Button size="sm" variant="outline" onClick={()=>run(()=>runMatrixFn({data:{
       tenantId,productKey,matrixJobId:plannedMatrix.id}}),
       "Road matrix calculated")}>Calculate road distances</Button>}
     {canRun&&<Button size="sm" variant="outline"
       onClick={()=>run(()=>runFn({data:{tenantId,optimisationId:latest.id}}),"Route plan built")}>
       {latest?.matrix_job_id?"Plan using verified road times":"Plan with estimates only"}
      </Button>}
     {latest?.status==="review"&&<Button size="sm"
       onClick={()=>run(()=>applyFn({data:{tenantId,optimisationId:latest.id}}),
       "Reviewed route assignment applied")}>Review & apply</Button>}
    </div>
    {latest&&<div className="rounded-lg border p-3 text-sm space-y-1">
     <div className="flex flex-wrap items-center justify-between gap-2">
      <b>{latest.algorithm}</b><StatusBadge status={latest.status}/></div>
     <p className="text-xs text-muted-foreground">{latest.reason} · {latest.objective}</p>
     <p className="text-xs">{latest.routes?.length??0} route(s) ·
       {" "}{latest.score?.distanceMetres??0} metres ·
       {" "}{latest.score?.constraintBreaches??0} constraint breaches</p>
     {plannedMatrix&&<p className="text-xs">Source road matrix:
       {" "}{plannedMatrix.status} · {plannedMatrix.quality??"not verified"}
       {plannedMatrix.status==="fallback"?" — estimated only; cannot be used for road-aware routing":""}
      </p>}
     {latest.input_snapshot?.routeQuality==="straight_line_estimate"&&
      <p className="text-xs text-muted-foreground">Straight-line estimated route.
       Times shown are planning heuristics, not verified road ETAs.</p>}
     {["road","traffic"].includes(latest.input_snapshot?.routeQuality)&&
      <p className="text-xs">Verified {latest.input_snapshot.routeQuality} route costs
       from {latest.input_snapshot.providerKey}.</p>}
    </div>}
   </CardContent></Card>
  </div>
  <Card className="mt-6"><CardContent className="space-y-3 p-5">
   <div><h2 className="font-semibold">Road-network matrix preview</h2>
    <p className="mt-1 text-xs text-muted-foreground">
     Compare driving distances using a separately approved openrouteservice connector.
     If unavailable, a policy-approved straight-line fallback shows distance only, never a road ETA.
     Google traffic-aware routing is held behind separate licensing and activation review.
    </p>
   </div>
   <p className="text-xs text-muted-foreground">
    Up to 8×8 stops per preview, maximum eight requests and 256 route pairs per tenant/product per UTC day.
    API provider charges and billing alerts remain separate from these request limits.
   </p>
   <div className="flex flex-wrap gap-2">
    <Button size="sm" disabled={!tenantId||!productKey||geoPoints.length<2} onClick={()=>run(async()=>{
      await queueMatrixFn({data:{tenantId,productKey,travelMode:"driving",
       origins:geoPoints,destinations:geoPoints,trafficAware:false,
       requestKey:crypto.randomUUID()}});
     },"Road matrix preview queued")}>Queue road matrix</Button>
    {newest?.status==="queued"&&<Button size="sm" variant="outline"
     onClick={()=>run(()=>runMatrixFn({data:{tenantId,productKey,matrixJobId:newest.id}}),
      "Road matrix computed")}>Calculate approved matrix</Button>}
   </div>
   {newest&&<div className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center gap-2"><b>{newest.provider_key??"Awaiting provider"}</b>
      <StatusBadge status={newest.status}/><Badge variant="outline">{newest.quality??"pending"}</Badge></div>
    {sample&&<p className="mt-2 text-xs">
     Sample route pair: {sample.distance_metres!=null?Number(sample.distance_metres).toLocaleString()+" m":"unreachable"}
     {" · "}{sample.duration_seconds!=null?Number(sample.duration_seconds).toLocaleString()+" seconds":"No verified road ETA"}
    </p>}
    {newest.status==="failed"&&<p role="alert" className="mt-2 text-xs text-destructive">
     Preview failed. Provider readiness and service logs require operator review.</p>}
    {newest.quality==="straight_line_estimate"&&<p className="mt-2 text-xs text-muted-foreground">
     Straight-line only. Do not use this preview as driving time or live dispatch evidence.</p>}
   </div>}
  </CardContent></Card>
  <Card className="mt-6"><CardContent className="p-5"><h2 className="font-semibold">Automatic assignment</h2><div className="mt-4 space-y-2">{unassigned.slice(0,12).map((job:any)=>{const rec=(q.data?.recommendations??[]).find((r:any)=>r.job_id===job.id&&r.status==="candidate");return <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"><div><b>{job.job_type}</b><p className="text-xs text-muted-foreground">{job.priority} · {(job.stops??[]).length} stop(s)</p></div><div className="flex gap-2">{rec?<><Badge variant="outline">score {Number(rec.score).toFixed(1)}</Badge><Button size="sm" onClick={()=>run(()=>applyRecFn({data:{tenantId,recommendationId:rec.id}}),"Assignment applied")}>Apply</Button></>:<Button size="sm" variant="outline" onClick={()=>run(()=>recommendFn({data:{tenantId,productKey,jobId:job.id,limit:5}}),"Assignment candidates generated")}>Recommend</Button>}</div></div>})}</div></CardContent></Card>
 </AppShell>
}
function Metric({icon:Icon,label,value}:{icon:typeof RouteIcon;label:string;value:number}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4"/></div><div className="mt-2 font-display text-2xl font-semibold">{value}</div></CardContent></Card>}
