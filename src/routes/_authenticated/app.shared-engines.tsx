import {createFileRoute} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {AppShell} from "@/components/app/shell";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {useTenant} from "@/hooks/useTenant";
import {getSharedEnginesWorkspace} from "@/modules/shared-engines/functions";
import {BrainCircuit,Headphones,GraduationCap,LineChart,RefreshCw,Users,Database,Target} from "lucide-react";

export const Route=createFileRoute("/_authenticated/app/shared-engines")({
 component:SharedEngines,
 head:()=>({meta:[{title:"Shared Engines — Omniqora"},{name:"robots",content:"noindex"}]})
});

function SharedEngines(){
 const t=useTenant(),tenantId=t.tenantId??"";
 const getFn=useServerFn(getSharedEnginesWorkspace);
 const q=useQuery({queryKey:["shared-engines",tenantId],queryFn:()=>getFn({data:{tenantId,productKey:null}}),enabled:!!tenantId,retry:false});
 const d=q.data;
 return <AppShell title="Shared Engines" subtitle="Reusable platform engines recovered from the long-range Omniqora roadmap."
 actions={<Button size="sm" variant="outline" onClick={()=>q.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>}>
  <div className="grid gap-4 md:grid-cols-4">
   <Metric icon={Target} label="Prospect lists" value={d?.sales?.lists?.length??0}/>
   <Metric icon={Headphones} label="Contact queues" value={d?.contactCentre?.queues?.length??0}/>
   <Metric icon={BrainCircuit} label="Agent templates" value={d?.agents?.length??0}/>
   <Metric icon={GraduationCap} label="Students" value={d?.education?.students?.length??0}/>
  </div>
  <div className="mt-6 grid gap-6 xl:grid-cols-2">
   <Card><CardContent className="p-5"><h2 className="font-semibold">Revenue & relationships</h2><p className="mt-1 text-sm text-muted-foreground">Prospecting, callbacks, meetings, proposals, attribution and relationship intelligence.</p>
    <div className="mt-4 flex flex-wrap gap-2"><Badge variant="outline">Callbacks {d?.sales?.callbacks?.length??0}</Badge><Badge variant="outline">Meetings {d?.sales?.meetings?.length??0}</Badge><Badge variant="outline">Proposals {d?.sales?.proposals?.length??0}</Badge><Badge variant="outline">Attribution {d?.attribution?.length??0}</Badge><Badge variant="outline">Relationships {d?.relationships?.length??0}</Badge></div>
   </CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Knowledge & enrichment</h2><p className="mt-1 text-sm text-muted-foreground">Reviewed company memory and bounded research/enrichment jobs.</p>
    <div className="mt-4 flex flex-wrap gap-2"><Badge variant="outline">Memory facts {d?.memory?.length??0}</Badge><Badge variant="outline">Enrichment jobs {d?.enrichment?.length??0}</Badge><Badge variant="outline">BI datasets {d?.bi?.datasets?.length??0}</Badge></div>
   </CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Contact centre</h2><p className="mt-1 text-sm text-muted-foreground">Carrier-independent queues, AI-first routing, human overflow and callback control.</p>
    <div className="mt-4 flex flex-wrap gap-2"><Badge variant="outline">Queues {d?.contactCentre?.queues?.length??0}</Badge><Badge variant="outline">Sessions {d?.contactCentre?.sessions?.length??0}</Badge></div>
   </CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Education Intelligence</h2><p className="mt-1 text-sm text-muted-foreground">Student/Cohort/Course 360, interventions and residential/lab/work-placement events.</p>
    <div className="mt-4 flex flex-wrap gap-2"><Badge variant="outline">Students {d?.education?.students?.length??0}</Badge><Badge variant="outline">Interventions {d?.education?.interventions?.length??0}</Badge></div>
   </CardContent></Card>
  </div>
 </AppShell>;
}
function Metric({icon:Icon,label,value}:{icon:typeof Users;label:string;value:number}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4"/></div><div className="mt-2 font-display text-2xl font-semibold">{value}</div></CardContent></Card>}
