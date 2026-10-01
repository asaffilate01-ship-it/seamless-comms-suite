import { createFileRoute } from "@tanstack/react-router";
import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/app/shell";
import { ProductWorkspacePicker, useProductWorkspace } from "@/hooks/useProductWorkspace";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listMarketingWorkspace, saveMarketingCampaign } from "@/modules/growth/functions";
import { Megaphone, Plus } from "lucide-react";

export const Route=createFileRoute("/_authenticated/app/campaigns")({
  head:()=>({meta:[{title:"Campaigns — Omniqora"},{name:"robots",content:"noindex"}]}),
  component:Campaigns,
});

function Campaigns(){
  const queryClient=useQueryClient();
  const workspace=useProductWorkspace();
  const selected=workspace.selected;
  const scope=selected?{tenantId:selected.tenant_id,tenantProductId:selected.id}:null;
  const enabled=!!scope&&selected!.moduleKeys.includes("marketing.core");
  const listFn=useServerFn(listMarketingWorkspace);
  const saveFn=useServerFn(saveMarketingCampaign);
  const query=useQuery({
    queryKey:["campaigns-live",selected?.id],
    enabled,
    queryFn:()=>listFn({data:scope!}),
    retry:false,
  });

  const[name,setName]=useState("");
  const[objective,setObjective]=useState("");
  const[channels,setChannels]=useState<Array<"email"|"sms"|"whatsapp"|"push"|"web"|"social">>(["whatsapp"]);
  const[audienceId,setAudienceId]=useState("");
  const[status,setStatus]=useState<"draft"|"scheduled"|"running"|"paused"|"completed"|"cancelled">("draft");
  const[busy,setBusy]=useState(false);
  const campaigns=(query.data?.campaigns??[]) as any[];
  const audiences=(query.data?.audiences??[]) as any[];

  async function create(event:FormEvent){
    event.preventDefault();if(!scope)return;
    try{
      setBusy(true);
      await saveFn({data:{
        ...scope,name:name.trim(),objective:objective.trim(),audienceId:audienceId||null,
        channels,creativeBriefId:null,startsAt:null,endsAt:null,status,
        attributionWindowDays:30,metadata:{createdFrom:"campaigns_workspace"}
      }});
      setName("");setObjective("");setAudienceId("");setStatus("draft");
      await queryClient.invalidateQueries({queryKey:["campaigns-live",selected?.id]});
      await queryClient.invalidateQueries({queryKey:["growth-marketing",selected?.id]});
      toast.success("Campaign saved");
    }catch(error){toast.error(errorText(error));}
    finally{setBusy(false);}
  }

  return <AppShell
    title="Campaigns"
    subtitle="Real tenant-scoped campaigns using Omniqora Marketing; delivery remains gated by audience, consent and configured channel providers."
    actions={<ProductWorkspacePicker products={workspace.products} selectedId={workspace.selectedId} onChange={workspace.setSelectedId}/>}
  >
    {workspace.loading?<State text="Loading product workspace…"/>:workspace.error?<State text={workspace.error} destructive/>:!selected?
      <State text="Provision a product before creating campaigns."/>:!enabled?
      <State text="Enable marketing.core for this tenant product in Tenant Manager."/>:query.isPending?
      <State text="Loading campaigns…"/>:query.error?<State text={errorText(query.error)} destructive/>:
      <div className="grid gap-6 xl:grid-cols-[.75fr_1.25fr]">
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-2"><Plus className="h-4 w-4 text-primary"/><h2 className="font-semibold">New campaign</h2></div>
          <form onSubmit={create} className="mt-4 space-y-3">
            <Field label="Name"><Input required value={name} onChange={(e)=>setName(e.target.value)}/></Field>
            <Field label="Objective"><textarea required className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" value={objective} onChange={(e)=>setObjective(e.target.value)}/></Field>
            <Field label="Audience"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={audienceId} onChange={(e)=>setAudienceId(e.target.value)}><option value="">All eligible / resolve later</option>{audiences.map((a:any)=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            <Field label="Channels"><div className="flex flex-wrap gap-2">{(["email","sms","whatsapp","push","web","social"] as const).map((channel)=><label key={channel} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><input type="checkbox" checked={channels.includes(channel)} onChange={(e)=>setChannels((old)=>e.target.checked?[...old,channel]:old.filter((v)=>v!==channel))}/>{channel}</label>)}</div></Field>
            <Field label="Status"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={status} onChange={(e)=>setStatus(e.target.value as any)}><option>draft</option><option>scheduled</option><option>paused</option></select></Field>
            <Button type="submit" disabled={busy||!channels.length}><Megaphone className="mr-2 h-4 w-4"/>Save campaign</Button>
          </form>
        </CardContent></Card>

        <Card className="overflow-hidden"><CardContent className="p-0">
          <div className="border-b px-5 py-4"><h2 className="font-semibold">Campaigns</h2><p className="text-xs text-muted-foreground">{campaigns.length} real database record(s)</p></div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Campaign</th><th className="px-5 py-3">Channels</th><th className="px-5 py-3">Audience</th><th className="px-5 py-3">Window</th><th className="px-5 py-3">Status</th></tr></thead>
            <tbody className="divide-y">{campaigns.map((c:any)=><tr key={c.id}><td className="px-5 py-3"><div className="font-medium">{c.name}</div><div className="max-w-md truncate text-xs text-muted-foreground">{c.objective}</div></td><td className="px-5 py-3">{(c.channels??[]).join(", ")}</td><td className="px-5 py-3">{audiences.find((a:any)=>a.id===c.audience_id)?.name??"—"}</td><td className="px-5 py-3 text-xs text-muted-foreground">{c.starts_at?new Date(c.starts_at).toLocaleString():"not scheduled"}</td><td className="px-5 py-3"><Badge variant="outline">{c.status}</Badge></td></tr>)}{!campaigns.length&&<tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">No campaigns yet.</td></tr>}</tbody>
          </table></div>
        </CardContent></Card>
      </div>}
  </AppShell>;
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div><Label className="text-xs text-muted-foreground">{label}</Label><div className="mt-1">{children}</div></div>;}
function State({text,destructive=false}:{text:string;destructive?:boolean}){return <Card><CardContent className={"p-6 text-sm "+(destructive?"text-destructive":"text-muted-foreground")}>{text}</CardContent></Card>;}
function errorText(error:unknown){return error instanceof Error?error.message:String(error);}
