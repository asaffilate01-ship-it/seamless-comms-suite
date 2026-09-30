import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app/shell";
import { ProductWorkspacePicker, useProductWorkspace } from "@/hooks/useProductWorkspace";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { getDispatchFleetWorkspace, listDispatchAgents, listDispatchJobs } from "@/modules/dispatch/functions";
import { listMobileAppProfiles } from "@/modules/mobile/functions";
import { getTenantIntegrationStatus } from "@/modules/platform/tenant-context.functions";
import { createPublicTrackingLink, listPublicTrackingLinks, revokePublicTrackingLink } from "@/modules/platform/tracking.functions";
import {
  Activity, Clock3, Gauge, MapPinned, Navigation, Route as RouteIcon,
  ShieldCheck, Smartphone, Truck, UserRoundCheck, WalletCards, Wrench,
} from "lucide-react";

export const Route=createFileRoute("/_authenticated/app/operations")({
  head:()=>({meta:[
    {title:"Dispatch & Operations — Omniqora"},
    {name:"description",content:"Universal Geo, Dispatch, Fleet and Agent operations workspace."},
    {name:"robots",content:"noindex"},
  ]}),
  component:OperationsWorkspace,
});

function OperationsWorkspace(){
  const queryClient=useQueryClient();
  const workspace=useProductWorkspace();
  const selected=workspace.selected;
  const scope=selected?{tenantId:selected.tenant_id,tenantProductId:selected.id}:null;
  const dispatchEnabled=!!scope&&selected!.moduleKeys.includes("dispatch.core");
  const geoEnabled=!!scope&&selected!.moduleKeys.includes("geo.core");
  const mobileEnabled=!!scope&&selected!.moduleKeys.includes("mobile.core");
  const isAdmin=["owner","admin"].includes(String(workspace.role??""));

  const jobsFn=useServerFn(listDispatchJobs);
  const agentsFn=useServerFn(listDispatchAgents);
  const fleetFn=useServerFn(getDispatchFleetWorkspace);
  const mobileFn=useServerFn(listMobileAppProfiles);
  const integrationFn=useServerFn(getTenantIntegrationStatus);
  const listTrackingFn=useServerFn(listPublicTrackingLinks);
  const createTrackingFn=useServerFn(createPublicTrackingLink);
  const revokeTrackingFn=useServerFn(revokePublicTrackingLink);

  const jobs=useQuery({
    queryKey:["dispatch-jobs",selected?.id],
    enabled:dispatchEnabled,
    queryFn:()=>jobsFn({data:scope!}),
    retry:false,
  });
  const resources=useQuery({
    queryKey:["dispatch-resources",selected?.id],
    enabled:dispatchEnabled,
    queryFn:()=>agentsFn({data:scope!}),
    retry:false,
  });
  const fleet=useQuery({
    queryKey:["dispatch-fleet-depth",selected?.id],
    enabled:dispatchEnabled,
    queryFn:()=>fleetFn({data:scope!}),
    retry:false,
  });
  const mobile=useQuery({
    queryKey:["mobile-app-profiles",selected?.id],
    enabled:mobileEnabled&&!!selected,
    queryFn:()=>mobileFn({data:{...scope!,productKey:selected!.product_key}}),
    retry:false,
  });
  const integrations=useQuery({
    queryKey:["operations-integrations",selected?.id],
    enabled:!!selected&&isAdmin,
    queryFn:()=>integrationFn({data:{tenantId:selected!.tenant_id,productKey:selected!.product_key}}),
    retry:false,
  });
  const trackingLinks=useQuery({
    queryKey:["public-tracking-links",selected?.id],
    enabled:!!scope&&(geoEnabled||dispatchEnabled),
    queryFn:()=>listTrackingFn({data:scope!}),
    retry:false,
  });
  const[trackingJobId,setTrackingJobId]=useState("");
  const[lastTrackingPath,setLastTrackingPath]=useState("");
  const[trackingBusy,setTrackingBusy]=useState(false);

  useEffect(()=>{
    const jobs=(jobs.data??[]) as any[];
    if(jobs.length&&!jobs.some((row)=>row.id===trackingJobId))setTrackingJobId(jobs[0].id);
    if(!jobs.length&&trackingJobId)setTrackingJobId("");
  },[jobs.data,trackingJobId]);

  async function createTracking(){
    if(!scope||!trackingJobId)return;
    try{
      setTrackingBusy(true);
      const result=await createTrackingFn({data:{
        ...scope,subjectType:"dispatch_job",subjectId:trackingJobId,expiresInHours:72,
        publicFields:["status","etaAt","latitude","longitude","heading","progress","driverName","vehicle","nextStop","pod","ratingEnabled"]
      }});
      setLastTrackingPath(result.path);
      await queryClient.invalidateQueries({queryKey:["public-tracking-links",selected?.id]});
      if(navigator.clipboard)await navigator.clipboard.writeText(window.location.origin+result.path);
      toast.success("Tracking link created"+(navigator.clipboard?" and copied":""));
    }catch(error){toast.error(error instanceof Error?error.message:"Tracking link could not be created");}
    finally{setTrackingBusy(false);}
  }

  async function revokeTracking(tokenId:string){
    if(!scope)return;
    try{
      await revokeTrackingFn({data:{...scope,tokenId}});
      await queryClient.invalidateQueries({queryKey:["public-tracking-links",selected?.id]});
      toast.success("Tracking link revoked");
    }catch(error){toast.error(error instanceof Error?error.message:"Tracking link could not be revoked");}
  }

  const jobRows=(jobs.data??[]) as any[];
  const agentRows=(resources.data?.agents??[]) as any[];
  const vehicleRows=(resources.data?.vehicles??[]) as any[];
  const shifts=(fleet.data?.shifts??[]) as any[];
  const maintenance=(fleet.data?.maintenance??[]) as any[];
  const behaviour=(fleet.data?.behaviour??[]) as any[];
  const idle=(fleet.data?.idle??[]) as any[];
  const geofences=(fleet.data?.geofences??[]) as any[];
  const positions=(fleet.data?.positions??[]) as any[];
  const utilisation=(fleet.data?.utilisation??[]) as any[];
  const wallet=(fleet.data?.wallet??[]) as any[];
  const attendance=(fleet.data?.attendance??[]) as any[];
  const appProfiles=(mobile.data?.profiles??[]) as any[];

  const activeJobs=jobRows.filter((row)=>!["completed","failed","cancelled"].includes(row.status)).length;
  const availableAgents=agentRows.filter((row)=>row.status==="available").length;
  const availableVehicles=vehicleRows.filter((row)=>row.status==="available").length;
  const maintenanceDue=maintenance.filter((row)=>["due","overdue","in_progress"].includes(row.status)).length;
  const avgUtilisation=utilisation.length
    ?utilisation.reduce((sum,row)=>sum+Number(row.utilisation_pct??0),0)/utilisation.length:null;

  const providerBindings=((integrations.data??[]) as any[]).filter((binding)=>
    binding.moduleKey==="geo.core"||binding.moduleKey==="dispatch.core"||binding.moduleKey==="mobile.core"
  );

  return <AppShell
    title="Geo, Dispatch & Agent Operations"
    subtitle="One reusable operations layer for delivery, roadside recovery, field service, parts, inspections and collections."
    actions={<ProductWorkspacePicker products={workspace.products} selectedId={workspace.selectedId} onChange={workspace.setSelectedId}/>}
  >
    {workspace.loading?<State text="Loading operations workspace…"/>:workspace.error?<State text={workspace.error} destructive/>:!selected?
      <State text="This tenant has no active Omniqora product binding. Provision one from the SaaS Factory first."/>:
      <>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Metric icon={RouteIcon} label="Active jobs" value={activeJobs}/>
          <Metric icon={UserRoundCheck} label="Available agents" value={availableAgents}/>
          <Metric icon={Truck} label="Available vehicles" value={availableVehicles}/>
          <Metric icon={Wrench} label="Maintenance due" value={maintenanceDue}/>
          <Metric icon={MapPinned} label="Geofences" value={geofences.length}/>
          <Metric icon={Gauge} label="Fleet utilisation" value={avgUtilisation===null?"—":`${avgUtilisation.toFixed(1)}%`}/>
        </div>

        <Tabs defaultValue="dispatch" className="mt-6">
          <TabsList className="mb-6 flex h-auto flex-wrap justify-start">
            <TabsTrigger value="dispatch">Dispatch</TabsTrigger>
            <TabsTrigger value="workforce">Workforce</TabsTrigger>
            <TabsTrigger value="fleet">Fleet</TabsTrigger>
            <TabsTrigger value="tracking">Geo & tracking</TabsTrigger>
            <TabsTrigger value="agent">Agent app</TabsTrigger>
            <TabsTrigger value="providers">Providers</TabsTrigger>
          </TabsList>

          <TabsContent value="dispatch">
            {!dispatchEnabled?<ModuleOff name="Dispatch" moduleKey="dispatch.core"/>:
            <Card className="overflow-hidden"><CardContent className="p-0">
              <Header title="Job control tower" subtitle="Jobs, stops, assignment state, priority and live fulfilment status."/>
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-5 py-3">Job</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Stops</th><th className="px-5 py-3">Priority</th><th className="px-5 py-3">Agent</th><th className="px-5 py-3">Status</th></tr>
                </thead>
                <tbody className="divide-y">
                  {jobRows.map((row)=><tr key={row.id}>
                    <td className="px-5 py-3"><div className="font-mono text-xs">{String(row.id).slice(0,8)}…</div>{row.external_ref&&<div className="text-xs text-muted-foreground">{row.external_ref}</div>}</td>
                    <td className="px-5 py-3">{row.job_type}</td>
                    <td className="px-5 py-3">{(row.stops??[]).length}</td>
                    <td className="px-5 py-3"><Badge variant="outline">{row.priority}</Badge></td>
                    <td className="px-5 py-3">{row.assigned_agent_id?String(row.assigned_agent_id).slice(0,8)+"…":"Unassigned"}</td>
                    <td className="px-5 py-3"><Badge variant="secondary">{row.status}</Badge></td>
                  </tr>)}
                  {!jobRows.length&&<tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">No dispatch jobs yet.</td></tr>}
                </tbody>
              </table></div>
            </CardContent></Card>}
          </TabsContent>

          <TabsContent value="workforce">
            {!dispatchEnabled?<ModuleOff name="Dispatch workforce" moduleKey="dispatch.core"/>:
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2"><CardContent className="p-0">
                <Header title="Agents & capacity" subtitle="Availability, skills, vehicle, shift end and remaining capacity."/>
                <div className="divide-y">{agentRows.map((row)=><div key={row.id} className="grid gap-3 p-4 sm:grid-cols-5 sm:items-center">
                  <div className="sm:col-span-2"><div className="font-medium">{row.display_name}</div><div className="mt-1 flex flex-wrap gap-1">{(row.skills??[]).slice(0,4).map((skill:string)=><Badge key={skill} variant="secondary">{skill}</Badge>)}</div></div>
                  <Badge variant="outline" className="w-fit">{row.status}</Badge>
                  <span className="text-sm text-muted-foreground">{row.capacity_available??"—"} capacity</span>
                  <span className="text-xs text-muted-foreground">{row.shift_ends_at?new Date(row.shift_ends_at).toLocaleString():"No active shift"}</span>
                </div>)}{!agentRows.length&&<p className="p-5 text-sm text-muted-foreground">No agents configured.</p>}</div>
              </CardContent></Card>
              <div className="space-y-4">
                <SmallStat icon={Clock3} title="Shifts" value={shifts.length} hint={`${shifts.filter((row)=>row.status==="active").length} active`}/>
                <SmallStat icon={UserRoundCheck} title="Attendance events" value={attendance.length} hint="Clock-in/out, breaks, late and absence"/>
                <SmallStat icon={WalletCards} title="Wallet entries" value={wallet.length} hint="Credits, debits and adjustments"/>
              </div>
            </div>}
          </TabsContent>

          <TabsContent value="fleet">
            {!dispatchEnabled?<ModuleOff name="Fleet" moduleKey="dispatch.core"/>:
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardContent className="p-0"><Header title="Vehicles" subtitle="Availability, assignment, maintenance state and capacity."/><div className="divide-y">{vehicleRows.map((row)=><div key={row.id} className="flex items-center justify-between gap-4 p-4"><div><div className="font-medium">{row.registration??row.vehicle_type}</div><div className="text-xs text-muted-foreground">{row.vehicle_type} · capacity {row.capacity??"—"} · odometer {row.odometer??"—"}</div></div><Badge variant="outline">{row.status}</Badge></div>)}{!vehicleRows.length&&<p className="p-5 text-sm text-muted-foreground">No vehicles configured.</p>}</div></CardContent></Card>
              <Card><CardContent className="p-0"><Header title="Maintenance" subtitle="Scheduled, due, overdue and completed vehicle work."/><div className="divide-y">{maintenance.slice(0,40).map((row)=><div key={row.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-medium">{row.title}</div><div className="text-xs text-muted-foreground">{row.maintenance_kind}{row.due_at?` · due ${new Date(row.due_at).toLocaleDateString()}`:""}</div></div><Badge variant="outline">{row.status}</Badge></div></div>)}{!maintenance.length&&<p className="p-5 text-sm text-muted-foreground">No maintenance records.</p>}</div></CardContent></Card>
              <Card><CardContent className="p-0"><Header title="Driver behaviour" subtitle="Speeding, braking, acceleration, cornering, idle and route deviation events."/><div className="divide-y">{behaviour.slice(0,40).map((row)=><div key={row.id} className="flex items-center justify-between gap-3 p-4"><div><div className="font-medium">{String(row.event_kind).replaceAll("_"," ")}</div><div className="text-xs text-muted-foreground">{new Date(row.observed_at).toLocaleString()}</div></div><Badge variant="outline">{row.severity}</Badge></div>)}{!behaviour.length&&<p className="p-5 text-sm text-muted-foreground">No behaviour events.</p>}</div></CardContent></Card>
              <Card><CardContent className="p-5"><h3 className="font-semibold">Utilisation</h3><p className="mt-1 text-xs text-muted-foreground">Daily availability, assignment, moving, idle, jobs and distance snapshots.</p><div className="mt-5 space-y-4">{utilisation.slice(0,10).map((row)=><div key={`${row.day}-${row.vehicle_id}`}><div className="flex justify-between text-sm"><span>{row.day} · {String(row.vehicle_id).slice(0,8)}…</span><span>{Number(row.utilisation_pct).toFixed(1)}%</span></div><Progress className="mt-1.5 h-1.5" value={Number(row.utilisation_pct)}/></div>)}{!utilisation.length&&<p className="text-sm text-muted-foreground">No utilisation snapshots yet.</p>}</div></CardContent></Card>
            </div>}
          </TabsContent>

          <TabsContent value="tracking">
            {!geoEnabled&&!dispatchEnabled?<ModuleOff name="Geo & tracking" moduleKey="geo.core"/>:
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Capability icon={Navigation} title="Geo abstraction" enabled={geoEnabled} body="Geocode, reverse geocode, route, ETA, optimisation and provider switching."/>
                <Capability icon={MapPinned} title="Geofencing" enabled={dispatchEnabled} body={String(geofences.length)+" configured · "+String((fleet.data?.geofenceEvents??[]).length)+" recent events"}/>
                <Capability icon={Activity} title="Historical tracks" enabled={dispatchEnabled} body={String(positions.length)+" recent positions retained in the operations view"}/>
                <Capability icon={Clock3} title="Idle monitoring" enabled={dispatchEnabled} body={String(idle.length)+" recent idle periods"}/>
              </div>
              <div className="grid gap-4 xl:grid-cols-[.75fr_1.25fr]">
                <Card><CardContent className="p-5">
                  <h3 className="font-semibold">Customer tracking link</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Create a signed, expiring, no-login link. It works on the platform host or a verified tenant tracking domain.</p>
                  <div className="mt-4 space-y-3">
                    <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={trackingJobId} onChange={(e)=>setTrackingJobId(e.target.value)}>
                      {jobRows.map((job)=><option key={job.id} value={job.id}>{(job.external_ref||String(job.id).slice(0,8))+" · "+job.job_type+" · "+job.status}</option>)}
                    </select>
                    <Button onClick={createTracking} disabled={!trackingJobId||trackingBusy}>Create 72-hour tracking link</Button>
                    {lastTrackingPath&&<div className="rounded-lg border border-dashed p-3 text-xs"><div className="font-medium">New link</div><a href={lastTrackingPath} target="_blank" rel="noreferrer" className="mt-1 block break-all text-primary underline">{window.location.origin+lastTrackingPath}</a><div className="mt-1 text-muted-foreground">The raw token is only returned at creation; the stored database value is a hash.</div></div>}
                  </div>
                </CardContent></Card>
                <Card><CardContent className="p-0">
                  <Header title="Tracking links" subtitle="Existing tokens can be audited or revoked, but their raw token cannot be recovered."/>
                  <div className="divide-y">{((trackingLinks.data??[]) as any[]).slice(0,40).map((link)=><div key={link.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><div className="font-medium">{link.subject_type+" · "+String(link.subject_id).slice(0,12)}</div><div className="text-xs text-muted-foreground">{(link.public_fields??[]).length+" public field(s) · expires "+new Date(link.expires_at).toLocaleString()}</div></div><div className="flex items-center gap-2"><Badge variant="outline">{link.revoked_at?"revoked":new Date(link.expires_at).getTime()<Date.now()?"expired":"active"}</Badge>{!link.revoked_at&&new Date(link.expires_at).getTime()>=Date.now()&&<Button size="sm" variant="outline" onClick={()=>revokeTracking(link.id)}>Revoke</Button>}</div></div>)}{!((trackingLinks.data??[]) as any[]).length&&<p className="p-5 text-sm text-muted-foreground">No tracking links have been created yet.</p>}</div>
                </CardContent></Card>
              </div>
            </div>}
          </TabsContent>

          <TabsContent value="agent">
            {!mobileEnabled?<ModuleOff name="Universal Agent App" moduleKey="mobile.core"/>:
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {appProfiles.map((profile)=><Card key={profile.id}><CardContent className="p-5">
                <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-primary"/><h3 className="font-semibold">{profile.display_name}</h3></div><p className="mt-1 text-xs text-muted-foreground">{profile.app_key}</p></div><Badge variant="outline">{profile.status}</Badge></div>
                <div className="mt-4 flex flex-wrap gap-1.5">{(profile.capabilities??[]).map((cap:string)=><Badge key={cap} variant="secondary">{cap}</Badge>)}</div>
                <div className="mt-4 text-xs text-muted-foreground">{(profile.devices??[]).length} registered device(s) visible to this user · {(profile.locales??[]).join(", ")||"default locale"}</div>
              </CardContent></Card>)}
              {!appProfiles.length&&<EmptyCard text="No Agent/mobile profile has been published for this product yet."/>}
            </div>}
          </TabsContent>

          <TabsContent value="providers">
            {!isAdmin?<State text="Provider bindings are visible to tenant owners and administrators."/>:
            <Card><CardContent className="p-0"><Header title="Operations providers" subtitle="Geo, dispatch and mobile integrations are tenant/product scoped and secrets remain server-side."/>
              <div className="divide-y">{providerBindings.map((binding:any)=><div key={binding.id} className="grid gap-2 p-4 sm:grid-cols-4 sm:items-center"><div><div className="font-medium">{binding.provider}</div><div className="text-xs text-muted-foreground">{binding.moduleKey}</div></div><span className="text-sm">{binding.integrationKind}</span><span className="text-xs text-muted-foreground">{binding.environment}</span><div className="flex items-center gap-2"><Badge variant="outline">{binding.status}</Badge>{binding.missingCredentialNames?.length?<Badge variant="secondary">{binding.missingCredentialNames.length} credential(s) needed</Badge>:<ShieldCheck className="h-4 w-4 text-primary"/>}</div></div>)}{!providerBindings.length&&<p className="p-5 text-sm text-muted-foreground">No operations provider bindings configured.</p>}</div>
            </CardContent></Card>}
          </TabsContent>
        </Tabs>
      </>}
  </AppShell>;
}

function Metric({icon:Icon,label,value}:{icon:typeof Truck;label:string;value:number|string}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary"/></div><div className="mt-2 font-display text-2xl font-semibold">{value}</div></CardContent></Card>;}
function SmallStat({icon:Icon,title,value,hint}:{icon:typeof Clock3;title:string;value:number;hint:string}){return <Card><CardContent className="p-5"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary"/><h3 className="font-semibold">{title}</h3></div><div className="mt-2 font-display text-3xl font-semibold">{value}</div><p className="mt-1 text-xs text-muted-foreground">{hint}</p></CardContent></Card>;}
function Header({title,subtitle}:{title:string;subtitle:string}){return <div className="border-b px-5 py-4"><h3 className="font-semibold">{title}</h3><p className="text-xs text-muted-foreground">{subtitle}</p></div>;}
function Capability({icon:Icon,title,body,enabled}:{icon:typeof Navigation;title:string;body:string;enabled:boolean}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between"><Icon className="h-4 w-4 text-primary"/><Badge variant="outline">{enabled?"Enabled":"Off"}</Badge></div><h3 className="mt-4 font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{body}</p></CardContent></Card>;}
function ModuleOff({name,moduleKey}:{name:string;moduleKey:string}){return <Card className="border-dashed"><CardContent className="p-6"><h3 className="font-semibold">{name} is not enabled</h3><p className="mt-2 text-sm text-muted-foreground">Enable <code>{moduleKey}</code> for this tenant product from Platform Control.</p></CardContent></Card>;}
function State({text,destructive=false}:{text:string;destructive?:boolean}){return <Card><CardContent className={`p-6 text-sm ${destructive?"text-destructive":"text-muted-foreground"}`}>{text}</CardContent></Card>;}
function EmptyCard({text}:{text:string}){return <Card className="md:col-span-2 xl:col-span-3"><CardContent className="p-6 text-sm text-muted-foreground">{text}</CardContent></Card>;}
