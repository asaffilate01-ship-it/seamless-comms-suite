/* eslint-disable @typescript-eslint/no-explicit-any -- Fleetora data is typed at API/SQL boundary. */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTenant } from "@/hooks/useTenant";
import { listDispatch } from "@/modules/dispatch/functions";
import {
  listMyAgentJobs, progressAgentJob, shareAgentLocation,
  attestAgentDelivery, linkAgentToUser
} from "@/modules/dispatch/agent-portal.functions";
import { MapPin, ShieldCheck, Truck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/agent")({
  component:FieldAgentWorkspace,
  head:()=>({meta:[{title:"Field Agent · Omniqora"},{name:"robots",content:"noindex"}]})
});
type AgentJob = {
  id:string;product_key:string;job_type:string;status:string;priority:string;
  external_ref?:string|null; scheduled_at?:string|null;
  stops?:Array<{id:string;position:number;stop_kind:string;address?:string|null;
    latitude:number;longitude:number;instructions?:string|null}>;
};
const next:Record<string,readonly string[]> = {
  assigned:["accepted"],accepted:["en_route"],en_route:["arrived"],
  arrived:["in_progress","collected"],in_progress:["collected","completed"],
  collected:["en_route_dropoff","completed"],en_route_dropoff:["arrived_dropoff"],
  arrived_dropoff:["completed"]
};

function FieldAgentWorkspace(){
  const tenant=useTenant();
  const tenantId=tenant.tenantId??"";
  const admin=["owner","admin","platform_admin"].includes(tenant.role??"");
  const listFn=useServerFn(listMyAgentJobs),statusFn=useServerFn(progressAgentJob);
  const positionFn=useServerFn(shareAgentLocation),podFn=useServerFn(attestAgentDelivery);
  const linkFn=useServerFn(linkAgentToUser),allFn=useServerFn(listDispatch);
  const jobs=useQuery({queryKey:["my-field-agent-jobs",tenantId],enabled:!!tenantId,
    queryFn:()=>listFn({data:{tenantId}}),retry:false});
  const all=useQuery({queryKey:["admin-field-agents",tenantId],enabled:!!tenantId&&admin,
    queryFn:()=>allFn({data:{tenantId}}),retry:false});
  const [busy,setBusy]=useState(false);
  const [selectedAgent,setSelectedAgent]=useState("");
  const [userId,setUserId]=useState("");

  async function act(fn:()=>Promise<unknown>,description:string){
    try{
      setBusy(true);
      await fn();
      await jobs.refetch();
      toast.success(description);
    }catch(e){
      toast.error(e instanceof Error?e.message:"The action was not accepted");
    }finally{setBusy(false);}
  }
  function shareGps(jobId:string){
    if(!navigator.geolocation){toast.error("Location not supported on this device");return;}
    navigator.geolocation.getCurrentPosition(({coords,timestamp})=>{
      void act(()=>positionFn({data:{tenantId,jobId,latitude:coords.latitude,
        longitude:coords.longitude,accuracy:coords.accuracy,
        observedAt:new Date(timestamp).toISOString()}}),
      "One location update shared");
    },()=>toast.error("Location was not shared"),
    {enableHighAccuracy:true,maximumAge:0,timeout:12000});
  }
  const rows=(jobs.data?.jobs??[]) as AgentJob[];
  return <AppShell title="Field Agent" subtitle="Assigned jobs, route stops and manual GPS sharing.">
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-semibold">My active jobs ({rows.length})</h2>
      <Button variant="outline" onClick={()=>void jobs.refetch()}>Refresh</Button>
    </div>
    {tenant.error&&<p role="alert" className="mt-3 text-destructive">{tenant.error}</p>}
    {jobs.error&&<p role="alert" className="mt-3 text-destructive">
      Field agent access unavailable: {String(jobs.error)}
    </p>}
    <div className="mt-4 grid gap-4">
      {rows.map(job=><JobPanel key={job.id} job={job} busy={busy}
        onStatus={status=>void act(()=>statusFn({data:{tenantId,jobId:job.id,
          status:status as "accepted"|"en_route"|"arrived"|"in_progress"|"collected"|
          "en_route_dropoff"|"arrived_dropoff"|"completed"|"failed"}}),"Status updated")}
        onGps={()=>shareGps(job.id)}
        onProof={(recipient,note)=>void act(()=>podFn({data:{tenantId,jobId:job.id,
          recipient,note}}),"Driver attestation saved")} />)}
      {!jobs.isLoading&&!jobs.error&&rows.length===0&&<Card><CardContent className="p-5 text-sm text-muted-foreground">
        No assigned work found. Your operator must link your account to a driver record and enable the Agent service.
      </CardContent></Card>}
    </div>
    {admin&&<Card className="mt-8"><CardContent className="space-y-3 p-5">
      <h2 className="font-semibold">Administrator: link a driver account</h2>
      <p className="text-sm text-muted-foreground">Select an agent and enter an existing verified tenant member's user UUID. Cross-tenant mappings are rejected.</p>
      <select aria-label="Driver agent" className="w-full rounded-md border bg-background p-2"
        value={selectedAgent} onChange={e=>setSelectedAgent(e.target.value)}>
        <option value="">Select driver</option>
        {(all.data?.agents??[]).map((a:any)=>
          <option value={a.id} key={a.id}>{a.name} · {a.product_key}</option>)}
      </select>
      <Input aria-label="Existing tenant member UUID" placeholder="Existing tenant member UUID"
        value={userId} onChange={e=>setUserId(e.target.value.trim())}/>
      <Button disabled={!selectedAgent||!userId||busy}
        onClick={()=>void act(()=>linkFn({data:{tenantId,agentId:selectedAgent,userId}}),"Driver linked")}>
        Link account
      </Button>
    </CardContent></Card>}
    <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>
      GPS is shared only when you tap Share GPS once; there is no background tracking.
      Delivery confirmation is a driver attestation, not a verified recipient signature, PIN or photograph.
    </p>
  </AppShell>;
}

function JobPanel({job,busy,onStatus,onGps,onProof}:{job:AgentJob;busy:boolean;
  onStatus:(status:string)=>void;onGps:()=>void;onProof:(recipient:string,note:string)=>void}){
  const [recipient,setRecipient]=useState(""),[note,setNote]=useState("");
  const eligibleProof=["arrived","in_progress","arrived_dropoff"].includes(job.status);
  return <Card><CardContent className="space-y-3 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-semibold">{job.job_type.replace(/_/g," ")}</h3>
        <p className="text-xs text-muted-foreground">{job.product_key} · {job.external_ref??job.id}</p>
      </div>
      <span className="rounded-full border px-3 py-1 text-sm">{job.status.replace(/_/g," ")}</span>
    </div>
    <ol className="space-y-2">{(job.stops??[]).slice().sort((a,b)=>a.position-b.position).map(s=>{
      const latitude=Number(s.latitude),longitude=Number(s.longitude);
      const url="https://www.openstreetmap.org/?mlat="+encodeURIComponent(String(latitude))+
        "&mlon="+encodeURIComponent(String(longitude));
      return <li key={s.id} className="rounded-md bg-muted/50 p-3 text-sm">
        <b>{s.position+1}. {s.stop_kind.replace(/_/g," ")}</b> · {s.address||"Coordinates available"}
        {s.instructions&&<p className="mt-1 text-muted-foreground">{s.instructions}</p>}
        <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
          className="mt-2 inline-flex items-center gap-1 text-primary underline">
          <MapPin className="h-4 w-4"/>Open navigation map
        </a>
      </li>;
    })}</ol>
    <div className="flex flex-wrap gap-2">
      {(next[job.status]??[]).map(status=><Button key={status} size="sm"
        disabled={busy} onClick={()=>onStatus(status)}>{status.replace(/_/g," ")}</Button>)}
      <Button variant="outline" size="sm" onClick={onGps} disabled={busy}>
        <Truck className="mr-2 h-4 w-4"/>Share GPS once
      </Button>
    </div>
    {eligibleProof&&<div className="space-y-2 border-t pt-3">
      <p className="font-medium text-sm">Driver delivery attestation</p>
      <Input aria-label="Recipient name" placeholder="Recipient name" value={recipient}
        onChange={e=>setRecipient(e.target.value)}/>
      <Input aria-label="Optional note" placeholder="Optional handover note" value={note}
        onChange={e=>setNote(e.target.value)}/>
      <Button size="sm" variant="outline" disabled={busy||recipient.trim().length<2}
        onClick={()=>onProof(recipient.trim(),note)}>Record attestation</Button>
    </div>}
  </CardContent></Card>;
}
