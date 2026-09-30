import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ProductWorkspacePicker, useProductWorkspace } from "@/hooks/useProductWorkspace";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listFeedbackResponses,
  listFeedbackSurveys,
  listJourneys,
  listMarketingWorkspace,
  listRfmProfiles,
  listSalesSequences,
  listJourneyEnrolments,
  listSalesSequenceEnrolments,
  recalculateRfmProfiles,
} from "@/modules/growth/functions";
import { Activity, GitBranch, HeartHandshake, Megaphone, Target, UsersRound } from "lucide-react";

export const Route=createFileRoute("/_authenticated/app/growth")({
  head:()=>({meta:[
    {title:"Growth & Journeys — Omniqora"},
    {name:"description",content:"Shared marketing, RFM, sales engagement, journeys and feedback workspace."},
    {name:"robots",content:"noindex"},
  ]}),
  component:GrowthWorkspace,
});

function GrowthWorkspace(){
  const queryClient=useQueryClient();
  const workspace=useProductWorkspace();
  const selected=workspace.selected;
  const scope=selected?{tenantId:selected.tenant_id,tenantProductId:selected.id}:null;
  const has=(key:string)=>!!selected?.moduleKeys.includes(key);

  const marketingFn=useServerFn(listMarketingWorkspace);
  const salesFn=useServerFn(listSalesSequences);
  const journeysFn=useServerFn(listJourneys);
  const rfmFn=useServerFn(listRfmProfiles);
  const surveysFn=useServerFn(listFeedbackSurveys);
  const responsesFn=useServerFn(listFeedbackResponses);
  const journeyEnrolmentsFn=useServerFn(listJourneyEnrolments);
  const salesEnrolmentsFn=useServerFn(listSalesSequenceEnrolments);
  const recalcRfmFn=useServerFn(recalculateRfmProfiles);

  const marketing=useQuery({
    queryKey:["growth-marketing",selected?.id],
    enabled:!!scope&&has("marketing.core"),
    queryFn:()=>marketingFn({data:scope!}),
    retry:false,
  });
  const sales=useQuery({
    queryKey:["growth-sales",selected?.id],
    enabled:!!scope&&has("sales.core"),
    queryFn:()=>salesFn({data:scope!}),
    retry:false,
  });
  const journeys=useQuery({
    queryKey:["growth-journeys",selected?.id],
    enabled:!!scope&&has("journeys.core"),
    queryFn:()=>journeysFn({data:scope!}),
    retry:false,
  });
  const rfm=useQuery({
    queryKey:["growth-rfm",selected?.id],
    enabled:!!scope&&has("journeys.core"),
    queryFn:()=>rfmFn({data:scope!}),
    retry:false,
  });
  const surveys=useQuery({
    queryKey:["growth-surveys",selected?.id],
    enabled:!!scope&&has("feedback.core"),
    queryFn:()=>surveysFn({data:scope!}),
    retry:false,
  });
  const responses=useQuery({
    queryKey:["growth-feedback-responses",selected?.id],
    enabled:!!scope&&has("feedback.core"),
    queryFn:()=>responsesFn({data:{...scope!,surveyId:null}}),
    retry:false,
  });
  const journeyEnrolments=useQuery({
    queryKey:["growth-journey-enrolments",selected?.id],
    enabled:!!scope&&has("journeys.core"),
    queryFn:()=>journeyEnrolmentsFn({data:scope!}),
    retry:false,
  });
  const salesEnrolments=useQuery({
    queryKey:["growth-sales-enrolments",selected?.id],
    enabled:!!scope&&has("sales.core"),
    queryFn:()=>salesEnrolmentsFn({data:scope!}),
    retry:false,
  });

  async function recalculateRfm(){
    if(!scope)return;
    try{
      const result=await recalcRfmFn({data:scope});
      await queryClient.invalidateQueries({queryKey:["growth-rfm",selected?.id]});
      toast.success(`Recalculated ${result.profiles} RFM profile(s)`);
    }catch(error){
      toast.error(error instanceof Error?error.message:"RFM recalculation failed");
    }
  }

  const profiles=(rfm.data??[]) as any[];
  const segmentCounts=new Map<string,number>();
  for(const profile of profiles){
    for(const segment of profile.segments??[])segmentCounts.set(String(segment),(segmentCounts.get(String(segment))??0)+1);
  }
  const feedbackRows=(responses.data??[]) as any[];
  const journeyRuns=(journeyEnrolments.data??[]) as any[];
  const salesRuns=(salesEnrolments.data??[]) as any[];
  const scored=feedbackRows.filter((row)=>typeof row.score==="number");
  const averageScore=scored.length?scored.reduce((sum,row)=>sum+Number(row.score),0)/scored.length:null;

  return <AppShell
    title="Growth & Customer Intelligence"
    subtitle="Marketing, RFM, sales engagement, visual journeys and feedback as reusable Omniqora engines."
    actions={<div className="flex items-center gap-2"><ProductWorkspacePicker products={workspace.products} selectedId={workspace.selectedId} onChange={workspace.setSelectedId}/><Link to="/app/journey-builder"><Button size="sm" variant="outline">Journey Builder</Button></Link></div>}
  >
    {workspace.loading?<Loading/>:workspace.error?<ErrorCard message={workspace.error}/>:!selected?
      <Empty/>:
      <>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Metric icon={UsersRound} label="RFM profiles" value={profiles.length}/>
          <Metric icon={Megaphone} label="Campaigns" value={(marketing.data?.campaigns??[]).length}/>
          <Metric icon={Target} label="Sales sequences" value={`${(sales.data??[]).length} / ${salesRuns.filter((row)=>["active","waiting"].includes(row.status)).length} active`}/>
          <Metric icon={GitBranch} label="Journeys" value={`${(journeys.data??[]).length} / ${journeyRuns.filter((row)=>["active","waiting"].includes(row.status)).length} active`}/>
          <Metric icon={HeartHandshake} label="Surveys" value={(surveys.data??[]).length}/>
          <Metric icon={Activity} label="Avg feedback" value={averageScore===null?"—":averageScore.toFixed(1)}/>
        </div>

        <Tabs defaultValue="rfm" className="mt-6">
          <TabsList className="mb-6 flex h-auto flex-wrap justify-start">
            <TabsTrigger value="rfm">RFM</TabsTrigger>
            <TabsTrigger value="journeys">Journeys</TabsTrigger>
            <TabsTrigger value="sales">Sales</TabsTrigger>
            <TabsTrigger value="marketing">Marketing</TabsTrigger>
            <TabsTrigger value="feedback">Feedback</TabsTrigger>
          </TabsList>

          <TabsContent value="rfm">
            {!has("journeys.core")?<ModuleOff name="Journeys / RFM" moduleKey="journeys.core"/>:
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2"><CardContent className="p-0">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                  <div><h3 className="font-semibold">Customer value profiles</h3><p className="text-xs text-muted-foreground">Product-scoped recency, frequency, monetary value and calculated segments.</p></div>
                  <Button size="sm" variant="outline" onClick={recalculateRfm}>Recalculate RFM</Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Recency</th><th className="px-5 py-3">Frequency</th><th className="px-5 py-3">Monetary</th><th className="px-5 py-3">Segments</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {profiles.slice(0,50).map((row:any)=><tr key={row.crm_person_id}>
                        <td className="px-5 py-3 font-mono text-xs">{String(row.crm_person_id).slice(0,8)}…</td>
                        <td className="px-5 py-3">{row.recency_days??"—"} days</td>
                        <td className="px-5 py-3">{row.frequency}</td>
                        <td className="px-5 py-3">{formatMoney(row.monetary_minor,row.currency)}</td>
                        <td className="px-5 py-3"><div className="flex flex-wrap gap-1">{(row.segments??[]).map((s:string)=><Badge key={s} variant="secondary">{s}</Badge>)}</div></td>
                      </tr>)}
                      {!profiles.length&&<tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No RFM profiles calculated yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </CardContent></Card>
              <Card><CardContent className="p-5">
                <h3 className="font-semibold">Segments</h3>
                <div className="mt-4 space-y-3">
                  {[...segmentCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([segment,count])=>
                    <div key={segment} className="flex items-center justify-between gap-3"><span className="text-sm">{segment}</span><Badge variant="outline">{count}</Badge></div>
                  )}
                  {!segmentCounts.size&&<p className="text-sm text-muted-foreground">Segments appear here after RFM projection runs.</p>}
                </div>
              </CardContent></Card>
            </div>}
          </TabsContent>

          <TabsContent value="journeys">
            {!has("journeys.core")?<ModuleOff name="Customer Journeys" moduleKey="journeys.core"/>:
            <EntityGrid rows={(journeys.data??[]) as any[]} empty="No journeys yet." render={(row)=><>
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{row.name}</h3><p className="text-xs text-muted-foreground">{(row.nodes??[]).length} nodes · {(row.edges??[]).length} edges</p></div><Badge variant="outline">{row.status}</Badge></div>
              <p className="mt-4 text-xs text-muted-foreground">Trigger → conditions → AI decisions → actions → delays → branches → outcomes.</p>
              <div className="mt-3 text-xs font-medium">{journeyRuns.filter((run)=>run.journey_id===row.id&&["active","waiting"].includes(run.status)).length} active enrolment(s)</div>
            </>}/>}
          </TabsContent>

          <TabsContent value="sales">
            {!has("sales.core")?<ModuleOff name="Sales Engagement" moduleKey="sales.core"/>:
            <EntityGrid rows={(sales.data??[]) as any[]} empty="No sales sequences yet." render={(row)=><>
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{row.name}</h3><p className="text-xs text-muted-foreground">{(row.steps??[]).length} steps</p></div><Badge variant="outline">{row.status}</Badge></div>
              <div className="mt-4 flex flex-wrap gap-1.5">{(row.steps??[]).slice(0,6).map((step:any,index:number)=><Badge key={index} variant="secondary">{step.kind??"step"}</Badge>)}</div>
              <div className="mt-3 text-xs font-medium">{salesRuns.filter((run)=>run.sequence_id===row.id&&["active","waiting"].includes(run.status)).length} active enrolment(s)</div>
            </>}/>}
          </TabsContent>

          <TabsContent value="marketing">
            {!has("marketing.core")?<ModuleOff name="Marketing" moduleKey="marketing.core"/>:
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardContent className="p-0"><SectionHeader title="Audiences" subtitle="Reusable tenant-scoped segments and filters."/><SimpleRows rows={(marketing.data?.audiences??[]) as any[]} primary="name" secondary="status"/></CardContent></Card>
              <Card><CardContent className="p-0"><SectionHeader title="Campaigns" subtitle="Email, SMS, WhatsApp, push, web and social activation."/><SimpleRows rows={(marketing.data?.campaigns??[]) as any[]} primary="name" secondary="status"/></CardContent></Card>
            </div>}
          </TabsContent>

          <TabsContent value="feedback">
            {!has("feedback.core")?<ModuleOff name="Feedback / NPS" moduleKey="feedback.core"/>:
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardContent className="p-0"><SectionHeader title="Surveys" subtitle="NPS, CSAT, CES and custom feedback triggers."/><SimpleRows rows={(surveys.data??[]) as any[]} primary="name" secondary="survey_type"/></CardContent></Card>
              <Card><CardContent className="p-0"><SectionHeader title="Recent responses" subtitle="Scores, sentiment and recovery signals."/>
                <div className="divide-y">{feedbackRows.slice(0,30).map((row:any)=><div key={row.id} className="p-4"><div className="flex items-center justify-between"><span className="font-medium">{row.score??"—"}</span><Badge variant="outline">{row.sentiment??"unclassified"}</Badge></div>{row.comment&&<p className="mt-2 text-sm text-muted-foreground">{row.comment}</p>}</div>)}{!feedbackRows.length&&<p className="p-5 text-sm text-muted-foreground">No responses yet.</p>}</div>
              </CardContent></Card>
            </div>}
          </TabsContent>
        </Tabs>
      </>}
  </AppShell>;
}

function Metric({icon:Icon,label,value}:{icon:typeof Activity;label:string;value:number|string}){
  return <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary"/></div><div className="mt-2 font-display text-2xl font-semibold">{value}</div></CardContent></Card>;
}
function SectionHeader({title,subtitle}:{title:string;subtitle:string}){return <div className="border-b px-5 py-4"><h3 className="font-semibold">{title}</h3><p className="text-xs text-muted-foreground">{subtitle}</p></div>;}
function SimpleRows({rows,primary,secondary}:{rows:any[];primary:string;secondary:string}){return <div className="divide-y">{rows.slice(0,40).map((row)=><div key={row.id} className="flex items-center justify-between gap-3 p-4"><span className="font-medium">{row[primary]}</span><Badge variant="outline">{String(row[secondary]??"—")}</Badge></div>)}{!rows.length&&<p className="p-5 text-sm text-muted-foreground">No records yet.</p>}</div>;}
function EntityGrid({rows,empty,render}:{rows:any[];empty:string;render:(row:any)=>React.ReactNode}){return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.map((row)=><Card key={row.id}><CardContent className="p-5">{render(row)}</CardContent></Card>)}{!rows.length&&<Card className="md:col-span-2 xl:col-span-3"><CardContent className="p-6 text-sm text-muted-foreground">{empty}</CardContent></Card>}</div>;}
function ModuleOff({name,moduleKey}:{name:string;moduleKey:string}){return <Card className="border-dashed"><CardContent className="p-6"><h3 className="font-semibold">{name} is not enabled for this tenant product</h3><p className="mt-2 text-sm text-muted-foreground">Enable <code>{moduleKey}</code> from the landlord/tenant module entitlements before using this workspace.</p></CardContent></Card>;}
function ErrorCard({message}:{message:string}){return <Card><CardContent className="p-6 text-sm text-destructive">{message}</CardContent></Card>;}
function Empty(){return <Card className="border-dashed"><CardContent className="p-6 text-sm text-muted-foreground">This tenant has no active Omniqora product binding yet. Provision a product from the SaaS Factory first.</CardContent></Card>;}
function Loading(){return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading product workspace…</CardContent></Card>;}
function formatMoney(minor:number|string,currency:string){const value=Number(minor??0)/100;try{return new Intl.NumberFormat(undefined,{style:"currency",currency:currency||"GBP"}).format(value);}catch{return `${currency??""} ${value.toFixed(2)}`;}}
