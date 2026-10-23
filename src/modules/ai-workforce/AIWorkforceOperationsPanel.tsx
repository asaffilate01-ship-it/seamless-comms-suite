import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {AlertTriangle,Clock3,KeyRound,LockKeyhole,RefreshCcw,ShieldAlert,ShieldCheck} from "lucide-react";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {getAiWorkforceOperationsWorkspace} from "./operations.functions";

type Props={tenantId:string;productKey:string;employeeId:string};
const when=(value:string|null)=>value?new Date(value).toLocaleString():"—";
function Stat({title,value}:{title:string;value:number|string}){
 return <div className="rounded-lg border p-3">
  <p className="text-xs text-muted-foreground">{title}</p>
  <p className="mt-1 text-xl font-semibold">{value}</p>
 </div>;
}
export function AIWorkforceOperationsPanel({tenantId,productKey,employeeId}:Props){
 const getFn=useServerFn(getAiWorkforceOperationsWorkspace);
 const query=useQuery({
  queryKey:["ai-workforce-operations",tenantId,productKey,employeeId],
  queryFn:()=>getFn({data:{tenantId,productKey:productKey as "omniqora",employeeId}}),
  enabled:!!tenantId&&productKey==="omniqora"&&!!employeeId,retry:false,
 });
 if(productKey!=="omniqora")return null;
 const data=query.data;
 return <Card><CardContent className="space-y-4 p-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <h3 className="flex items-center gap-2 text-lg font-semibold">
     <ShieldCheck className="h-5 w-5"/> AI Workforce operations and safety
    </h3>
    <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
     Operator-approved worker allowlist, outstanding usage investigations and stalled jobs.
     These signals do not independently authorise a live model run.
    </p>
   </div>
   <Button variant="outline" size="sm" disabled={query.isFetching} onClick={()=>query.refetch()}>
    <RefreshCcw className="mr-2 h-4 w-4"/> Refresh safety status
   </Button>
  </div>
  {query.isError&&<p className="rounded-md border p-3 text-sm text-destructive">
   Operational checks unavailable; verify the Phase 4E migration and permissions.
  </p>}
  <div className="flex flex-wrap gap-2">
   <Badge variant="outline"><LockKeyhole className="mr-1 h-3 w-3"/> Operator-controlled only</Badge>
   <Badge variant="outline">
    {data?.pilotActive?"Time-limited pilot enabled":"Pilot disabled"}
   </Badge>
   <Badge variant="outline"><KeyRound className="mr-1 h-3 w-3"/> No browser worker keys</Badge>
  </div>
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
   <Stat title="Active worker permits" value={data?.totals.activePermits??0}/>
   <Stat title="Remaining claims" value={data?.totals.claimSlotsRemaining??0}/>
   <Stat title="Outstanding charge reviews" value={data?.totals.uncertainCharges??0}/>
   <Stat title="Stalled worker leases" value={data?.totals.staleWorkers??0}/>
   <Stat title="Results awaiting human review" value={data?.totals.waitingReview??0}/>
   <Stat title="Currencies with held reserves" value={data?.totals.heldReservesByCurrency.length??0}/>
  </div>
  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
   {(data?.totals.heldReservesByCurrency??[]).map(x=>
    <Badge key={x.currency} variant="outline">
     Reserved {x.amountMinor} minor units · {x.currency}
    </Badge>)}
   {!data?.totals.heldReservesByCurrency.length&&
    <span>No outstanding unverified provider charges in the recent employee window.</span>}
  </div>
  <div className="grid gap-4 lg:grid-cols-2">
   <div className="min-w-0 space-y-3">
    <h4 className="font-semibold">Approved worker references</h4>
    <p className="text-xs text-muted-foreground">
     Each permit is limited by tenant, product, model, expiry and claim count.
     A provider credential is independently required and is never displayed here.
    </p>
    {(data?.workerPermits??[]).map(w=><div key={w.workerRef} className="rounded-lg border p-3">
     <div className="flex flex-wrap items-center justify-between gap-2">
      <b className="text-sm">{w.workerRef}</b><Badge variant="outline">{w.status}</Badge>
     </div>
     <p className="mt-1 text-xs text-muted-foreground">
      {w.modelKey} · {w.usedClaims}/{w.maxClaims} claims · expires {when(w.expiresAt)}
     </p>
    </div>)}
    {!data?.workerPermits.length&&<p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
     No operator-approved worker identity exists. All real CRM worker claims remain blocked.
    </p>}
   </div>
   <div className="min-w-0 space-y-3">
    <h4 className="font-semibold">Operational investigations</h4>
    {(data?.issues??[]).map(item=><div key={item.admissionId} className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
       {item.reason==="uncertain_provider_charge"
        ?<ShieldAlert className="h-4 w-4 text-warning"/>
        :item.reason==="stale_worker"
         ?<Clock3 className="h-4 w-4 text-warning"/>
         :<ShieldCheck className="h-4 w-4 text-muted-foreground"/>}
       <b className="text-sm">{item.reason.replaceAll("_"," ")}</b>
      </div>
      <p className="mt-2 break-all text-xs text-muted-foreground">
       Admission {item.admissionId} · {item.status}
      </p>
      <p className="mt-1 text-xs">
       Reserved: {item.reservedMinor??"unknown"} {item.currency??"currency unknown"} minor units ·
       Settled: {item.actualMinor??"not reconciled"} minor units
      </p>
      {item.lockedAt&&<p className="mt-1 text-xs text-muted-foreground">
       Worker lease: {when(item.lockedAt)}
      </p>}
     </div>)}
    {!data?.issues.length&&<p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
     No stalled leases, uncertain charges or pending reviews in the recent employee window.
    </p>}
   </div>
  </div>
  <div className="rounded-lg border p-4">
   <h4 className="flex items-center gap-2 font-semibold">
    <AlertTriangle className="h-4 w-4"/> Emergency stop and stale-job quarantine
   </h4>
   <p className="mt-2 text-xs text-muted-foreground">
    A trusted operator can revoke the pilot and all worker permits, or quarantine stalled
    provider calls while preserving unresolved budget reserves. These privileged actions
    cannot be initiated from the browser and do not silently clear model charges.
   </p>
   <div className="mt-3 space-y-2">
    {(data?.events??[]).slice(0,8).map(event=><div key={event.id}
      className="flex flex-wrap justify-between gap-2 border-b py-1.5 text-xs">
      <span>{event.eventKey.replaceAll("_"," ")}
        {event.workerRef?" · "+event.workerRef:""}
      </span><span className="text-muted-foreground">{when(event.createdAt)}</span>
    </div>)}
    {!data?.events.length&&<p className="text-xs text-muted-foreground">
      No operator activity recorded for this tenant.
    </p>}
   </div>
  </div>
 </CardContent></Card>;
}
