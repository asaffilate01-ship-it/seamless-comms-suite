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
import { listTenantPartners, saveTenantPartner } from "@/modules/partners/functions";
import { Handshake, Plus, ShieldCheck } from "lucide-react";

export const Route=createFileRoute("/_authenticated/app/partners")({
  head:()=>({meta:[{title:"Partners & Third Parties — Omniqora"},{name:"robots",content:"noindex"}]}),
  component:Partners,
});

function Partners(){
  const queryClient=useQueryClient();
  const workspace=useProductWorkspace();
  const selected=workspace.selected;
  const scope=selected?{tenantId:selected.tenant_id,tenantProductId:selected.id}:null;
  const listFn=useServerFn(listTenantPartners);
  const saveFn=useServerFn(saveTenantPartner);
  const query=useQuery({
    queryKey:["tenant-partners-live",selected?.id],
    enabled:!!scope,
    queryFn:()=>listFn({data:scope!}),
    retry:false,
  });

  const[name,setName]=useState("");
  const[type,setType]=useState("");
  const[email,setEmail]=useState("");
  const[country,setCountry]=useState("");
  const[sla,setSla]=useState("");
  const[dataScope,setDataScope]=useState("");
  const[serviceScope,setServiceScope]=useState("");
  const[busy,setBusy]=useState(false);
  const rows=(query.data??[]) as any[];

  async function create(event:FormEvent){
    event.preventDefault();if(!scope)return;
    try{
      setBusy(true);
      await saveFn({data:{
        ...scope,name:name.trim(),partnerType:type.trim(),legalName:null,
        countryCode:country.trim().toUpperCase()||null,contactEmail:email||null,contactPhone:null,
        status:"pending_review",verificationStatus:"pending",
        slaTargetPercent:sla?Number(sla):null,
        dataScope:dataScope.split(",").map((v)=>v.trim()).filter(Boolean),
        serviceScope:serviceScope.split(",").map((v)=>v.trim()).filter(Boolean),
        commissionConfig:{},metadata:{createdFrom:"partners_workspace"}
      }});
      setName("");setType("");setEmail("");setCountry("");setSla("");setDataScope("");setServiceScope("");
      await queryClient.invalidateQueries({queryKey:["tenant-partners-live",selected?.id]});
      toast.success("Partner created");
    }catch(error){toast.error(errorText(error));}
    finally{setBusy(false);}
  }

  return <AppShell
    title="Partners & Third Parties"
    subtitle="Real tenant-scoped partner registry, data scope, service scope, SLA targets and assignments."
    actions={<ProductWorkspacePicker products={workspace.products} selectedId={workspace.selectedId} onChange={workspace.setSelectedId}/>}
  >
    {workspace.loading?<State text="Loading product workspace…"/>:workspace.error?<State text={workspace.error} destructive/>:!selected?
      <State text="Provision a tenant product before adding partners."/>:query.isPending?
      <State text="Loading partners…"/>:query.error?<State text={errorText(query.error)} destructive/>:
      <div className="grid gap-6 xl:grid-cols-[.72fr_1.28fr]">
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-2"><Plus className="h-4 w-4 text-primary"/><h2 className="font-semibold">New partner</h2></div>
          <form onSubmit={create} className="mt-4 space-y-3">
            <Field label="Partner name"><Input required value={name} onChange={(e)=>setName(e.target.value)}/></Field>
            <Field label="Partner type"><Input required value={type} onChange={(e)=>setType(e.target.value)} placeholder="courier, legal provider, supplier…"/></Field>
            <Field label="Contact email"><Input type="email" value={email} onChange={(e)=>setEmail(e.target.value)}/></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Country code"><Input maxLength={2} value={country} onChange={(e)=>setCountry(e.target.value.toUpperCase())} placeholder="GB"/></Field>
              <Field label="SLA target %"><Input type="number" min={0} max={100} value={sla} onChange={(e)=>setSla(e.target.value)}/></Field>
            </div>
            <Field label="Permitted data scope"><Input value={dataScope} onChange={(e)=>setDataScope(e.target.value)} placeholder="customer_name, address, phone"/></Field>
            <Field label="Service scope"><Input value={serviceScope} onChange={(e)=>setServiceScope(e.target.value)} placeholder="delivery, recovery, legal referral"/></Field>
            <Button type="submit" disabled={busy}><Handshake className="mr-2 h-4 w-4"/>Create pending partner</Button>
          </form>
        </CardContent></Card>

        <Card className="overflow-hidden"><CardContent className="p-0">
          <div className="border-b px-5 py-4"><h2 className="font-semibold">Partner registry</h2><p className="text-xs text-muted-foreground">{rows.length} actual partner record(s)</p></div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Partner</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Active assignments</th><th className="px-5 py-3">SLA</th><th className="px-5 py-3">Verification</th><th className="px-5 py-3">Status</th></tr></thead>
            <tbody className="divide-y">{rows.map((row:any)=><tr key={row.id}><td className="px-5 py-3"><div className="font-medium">{row.name}</div><div className="text-xs text-muted-foreground">{row.contact_email||row.country_code||"—"}</div></td><td className="px-5 py-3">{row.partner_type}</td><td className="px-5 py-3">{row.activeAssignments}</td><td className="px-5 py-3">{row.slaPerformance==null?(row.sla_target_percent==null?"—":"target "+row.sla_target_percent+"%"):row.slaPerformance+"%"}</td><td className="px-5 py-3">{row.verification_status==="verified"?<span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-primary"/>verified</span>:row.verification_status}</td><td className="px-5 py-3"><Badge variant="outline">{row.status}</Badge></td></tr>)}{!rows.length&&<tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">No partners yet.</td></tr>}</tbody>
          </table></div>
        </CardContent></Card>
      </div>}
  </AppShell>;
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div><Label className="text-xs text-muted-foreground">{label}</Label><div className="mt-1">{children}</div></div>;}
function State({text,destructive=false}:{text:string;destructive?:boolean}){return <Card><CardContent className={"p-6 text-sm "+(destructive?"text-destructive":"text-muted-foreground")}>{text}</CardContent></Card>;}
function errorText(error:unknown){return error instanceof Error?error.message:String(error);}
