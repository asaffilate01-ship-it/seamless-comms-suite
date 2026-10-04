import {createFileRoute} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {AppShell} from "@/components/app/shell";
import {Card,CardContent} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {useTenant} from "@/hooks/useTenant";
import {getCreativeWorkspace} from "@/modules/creative/functions";
import {Image,FileText,Languages,Palette,RefreshCw} from "lucide-react";

export const Route=createFileRoute("/_authenticated/app/creative-studio")({
 component:CreativeStudio,
 head:()=>({meta:[{title:"Creative Studio — Omniqora"},{name:"robots",content:"noindex"}]})
});
function CreativeStudio(){
 const t=useTenant(),tenantId=t.tenantId??"";const getFn=useServerFn(getCreativeWorkspace);
 const q=useQuery({queryKey:["creative-studio",tenantId],queryFn:()=>getFn({data:{tenantId,productKey:null}}),enabled:!!tenantId,retry:false});
 const d=q.data;
 return <AppShell title="Voxentri Creative Studio" subtitle="Shared brand kits, briefs, governed AI assets, localisation, variants and approvals."
 actions={<Button size="sm" variant="outline" onClick={()=>q.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>}>
  <div className="grid gap-4 md:grid-cols-4">
   <Metric icon={Palette} label="Brand kits" value={d?.brandKits?.length??0}/>
   <Metric icon={FileText} label="Briefs" value={d?.briefs?.length??0}/>
   <Metric icon={Image} label="Assets" value={d?.assets?.length??0}/>
   <Metric icon={Languages} label="Localisation" value={d?.localisationJobs?.length??0}/>
  </div>
  <div className="mt-6 grid gap-6 xl:grid-cols-2">
   <Card><CardContent className="p-5"><h2 className="font-semibold">Creative briefs</h2><div className="mt-3 space-y-2">{(d?.briefs??[]).slice(0,12).map((x:any)=><div key={x.id} className="rounded-lg bg-muted p-3"><div className="flex items-center justify-between gap-2"><b className="text-sm">{x.objective}</b><Badge variant="outline">{x.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{x.audience}</p></div>)}{!(d?.briefs??[]).length&&<p className="text-sm text-muted-foreground">No briefs yet.</p>}</div></CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Asset review</h2><div className="mt-3 space-y-2">{(d?.assets??[]).slice(0,12).map((x:any)=><div key={x.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3 text-sm"><div><b>{x.asset_type}</b><p className="text-xs text-muted-foreground">{x.locale} · {x.channel}</p></div><Badge variant="outline">{x.status}</Badge></div>)}{!(d?.assets??[]).length&&<p className="text-sm text-muted-foreground">No assets registered.</p>}</div></CardContent></Card>
  </div>
 </AppShell>;
}
function Metric({icon:Icon,label,value}:{icon:typeof Image;label:string;value:number}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4"/></div><div className="mt-2 font-display text-2xl font-semibold">{value}</div></CardContent></Card>}
