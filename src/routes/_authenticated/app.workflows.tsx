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
import { createJourney,getGrowthWorkspace } from "@/modules/growth/functions";
import { Plus } from "lucide-react";
import { toast } from "sonner";
export const Route=createFileRoute("/_authenticated/app/workflows")({component:Journeys});
function Journeys(){
 const t=useTenant();const tenantId=t.tenantId??"";const getFn=useServerFn(getGrowthWorkspace),createFn=useServerFn(createJourney);
 const q=useQuery({queryKey:["growth",tenantId],queryFn:()=>getFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const[name,setName]=useState(""),[trigger,setTrigger]=useState("marketplace.order.completed");
 async function create(){try{await createFn({data:{tenantId,name,productKey:null,triggerEvent:trigger,definition:{nodes:[{id:"start",type:"trigger"}],edges:[]}}});setName("");toast.success("Journey created");await q.refetch();}catch(e){toast.error(e instanceof Error?e.message:String(e));}}
 return <AppShell title="Customer Journeys" subtitle="Data-backed event-triggered journeys replacing the previous demo workflow cards.">
  <Card><CardContent className="grid gap-3 p-5 md:grid-cols-[1fr_1fr_auto]"><Input value={name} onChange={e=>setName(e.target.value)} placeholder="Post-order review journey"/><Input value={trigger} onChange={e=>setTrigger(e.target.value)} placeholder="marketplace.order.completed"/><Button disabled={!name||!trigger} onClick={create}><Plus className="mr-2 h-4 w-4"/>Create</Button></CardContent></Card>
  <div className="mt-6 grid gap-4 lg:grid-cols-2">{(q.data?.journeys??[]).map((j:any)=><Card key={j.id}><CardContent className="p-5"><div className="flex justify-between gap-3"><div><h3 className="font-semibold">{j.name}</h3><p className="mt-1 text-xs text-muted-foreground">{j.trigger_event}</p></div><StatusBadge status={j.status}/></div><div className="mt-4 flex gap-2"><Badge variant="outline">{(j.definition?.nodes??[]).length} nodes</Badge><Badge variant="outline">{(j.definition?.edges??[]).length} edges</Badge></div></CardContent></Card>)}{!(q.data?.journeys??[]).length&&<p className="text-sm text-muted-foreground">No journeys yet.</p>}</div>
 </AppShell>
}