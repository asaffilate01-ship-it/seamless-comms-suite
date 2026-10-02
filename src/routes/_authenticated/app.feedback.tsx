import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app/shell";
import { Card,CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/hooks/useTenant";
import { createFeedbackSurvey,getGrowthWorkspace } from "@/modules/growth/functions";
import { toast } from "sonner";
export const Route=createFileRoute("/_authenticated/app/feedback")({component:Feedback});
function Feedback(){
 const t=useTenant();const tenantId=t.tenantId??"";const getFn=useServerFn(getGrowthWorkspace),createFn=useServerFn(createFeedbackSurvey);
 const q=useQuery({queryKey:["growth",tenantId],queryFn:()=>getFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const[name,setName]=useState("Post-order NPS");const responses=(q.data?.responses??[]) as any[];const nps=responses.filter(r=>{const s=(q.data?.surveys??[]).find((x:any)=>x.id===r.survey_id);return s?.survey_type==="nps";});const promoters=nps.filter(r=>Number(r.score)>=9).length,detractors=nps.filter(r=>Number(r.score)<=6).length;const score=nps.length?Math.round((promoters-detractors)*100/nps.length):0;
 return <AppShell title="Feedback, NPS & Reviews" subtitle="NPS, CSAT, CES and recovery signals feeding Customer 360.">
  <div className="grid gap-4 md:grid-cols-3"><Metric label="NPS" value={String(score)}/><Metric label="Responses" value={String(responses.length)}/><Metric label="Negative recovery" value={String(responses.filter(r=>r.sentiment==="negative"&&r.recovery_status!=="resolved").length)}/></div>
  <Card className="mt-6">
   <CardContent className="flex flex-wrap gap-3 p-5">
    <Input className="max-w-md" value={name} onChange={(event)=>setName(event.target.value)}/>
    <Button
     onClick={async () => {
      try {
       await createFn({data:{tenantId,name,productKey:null,surveyType:"nps",triggerEvent:"marketplace.order.completed"}});
       toast.success("NPS survey created");
       await q.refetch();
      } catch (error) {
       toast.error(error instanceof Error ? error.message : String(error));
      }
     }}
    >
     Create NPS survey
    </Button>
   </CardContent>
  </Card>
  <div className="mt-6 grid gap-4 md:grid-cols-2">{(q.data?.surveys??[]).map((s:any)=><Card key={s.id}><CardContent className="p-5"><div className="flex justify-between"><b>{s.name}</b><Badge variant="outline">{s.survey_type}</Badge></div><p className="mt-2 text-xs text-muted-foreground">Trigger: {s.trigger_event||"manual"}</p></CardContent></Card>)}</div>
 </AppShell>
}
function Metric({label,value}:{label:string;value:string}){return <Card><CardContent className="p-5"><p className="text-xs uppercase text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>}
