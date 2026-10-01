import { createFileRoute, Link } from "@tanstack/react-router";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OMNIQORA_MODULES } from "@/modules/platform/registry";
import {
  getManagedTenantProductConfiguration,
  listManageableTenantProducts,
  setManagedTenantMemberRole,
  setManagedTenantProductStatus,
} from "@/modules/platform/tenant-management.functions";
import {
  decideTenantModuleRequest,
  requestTenantModule,
  setTenantModuleEntitlement,
} from "@/modules/platform/module-management.functions";
import { createTenantInvitation } from "@/modules/platform/operator.functions";
import {
  AlertTriangle, Boxes, Building2, CheckCircle2, CircleOff, Globe2,
  KeyRound, MapPin, PlugZap, ShieldCheck, UserPlus,
} from "lucide-react";

export const Route=createFileRoute("/_authenticated/app/tenant-manager")({
  head:()=>({meta:[
    {title:"Tenant Manager — Omniqora"},
    {name:"description",content:"Post-launch landlord and tenant administration for Omniqora SaaS products."},
    {name:"robots",content:"noindex"},
  ]}),
  component:TenantManager,
});

function TenantManager(){
  const queryClient=useQueryClient();
  const listFn=useServerFn(listManageableTenantProducts);
  const detailFn=useServerFn(getManagedTenantProductConfiguration);
  const setModuleFn=useServerFn(setTenantModuleEntitlement);
  const requestModuleFn=useServerFn(requestTenantModule);
  const decideRequestFn=useServerFn(decideTenantModuleRequest);
  const statusFn=useServerFn(setManagedTenantProductStatus);
  const memberRoleFn=useServerFn(setManagedTenantMemberRole);
  const inviteFn=useServerFn(createTenantInvitation);

  const list=useQuery({queryKey:["manageable-tenant-products"],queryFn:()=>listFn(),retry:false});
  const rows=(list.data??[]) as any[];
  const[selectedId,setSelectedId]=useState("");

  useEffect(()=>{
    if(rows.length&&!rows.some((row)=>row.tenant_product_id===selectedId)){
      setSelectedId(rows[0].tenant_product_id);
    }
  },[rows,selectedId]);

  const selected=rows.find((row)=>row.tenant_product_id===selectedId)??rows[0]??null;
  const detail=useQuery({
    queryKey:["managed-tenant-product",selected?.tenant_product_id],
    enabled:!!selected,
    queryFn:()=>detailFn({data:{tenantProductId:selected.tenant_product_id}}),
    retry:false,
  });
  const data=detail.data as any;
  const operatorMode=["platform","landlord"].includes(String(data?.access?.actorKind??""));
  const activeKeys=new Set<string>(data?.activeModuleKeys??[]);
  const entitlementsByKey=new Map<string,any>((data?.entitlements??[]).map((row:any)=>[row.module_key,row]));
  const openRequests=(data?.moduleRequests??[]).filter((row:any)=>row.status==="requested");
  const[busy,setBusy]=useState("");
  const[inviteEmail,setInviteEmail]=useState("");
  const[inviteRole,setInviteRole]=useState<"owner"|"admin"|"agent"|"viewer">("owner");
  const[inviteToken,setInviteToken]=useState("");

  async function refresh(){
    await queryClient.invalidateQueries({queryKey:["managed-tenant-product",selected?.tenant_product_id]});
  }

  async function toggleModule(moduleKey:string,enabled:boolean){
    if(!selected)return;
    try{
      setBusy("module:"+moduleKey);
      await setModuleFn({data:{tenantProductId:selected.tenant_product_id,moduleKey,enabled}});
      await refresh();
      toast.success(enabled?"Module enabled":"Module disabled");
    }catch(error){toast.error(errorText(error));}
    finally{setBusy("");}
  }

  async function requestModuleAccess(moduleKey:string){
    if(!selected)return;
    try{
      setBusy("request:"+moduleKey);
      await requestModuleFn({data:{tenantProductId:selected.tenant_product_id,moduleKey,reason:"Requested from Tenant Manager"}});
      await refresh();
      toast.success("Module request sent");
    }catch(error){toast.error(errorText(error));}
    finally{setBusy("");}
  }

  async function decide(requestId:string,decision:"approved"|"rejected"){
    try{
      setBusy("decision:"+requestId);
      await decideRequestFn({data:{requestId,decision,note:"Decision from Tenant Manager"}});
      await refresh();
      toast.success(decision==="approved"?"Request approved":"Request rejected");
    }catch(error){toast.error(errorText(error));}
    finally{setBusy("");}
  }

  async function changeStatus(status:"active"|"suspended"|"cancelled"){
    if(!selected)return;
    const action=status==="cancelled"
      ?"Cancel this tenant product? This changes lifecycle state but does not delete data."
      :status==="suspended"
        ?"Suspend this tenant product? Runtime access will stop until reactivated."
        :"Reactivate this tenant product?";
    if(!window.confirm(action))return;
    try{
      setBusy("status");
      await statusFn({data:{tenantProductId:selected.tenant_product_id,status}});
      await Promise.all([refresh(),queryClient.invalidateQueries({queryKey:["manageable-tenant-products"]})]);
      toast.success("Tenant product status updated");
    }catch(error){toast.error(errorText(error));}
    finally{setBusy("");}
  }

  async function changeMemberRole(userId:string,role:"owner"|"admin"|"agent"|"viewer"){
    if(!selected)return;
    try{
      setBusy("member:"+userId);
      await memberRoleFn({data:{tenantProductId:selected.tenant_product_id,userId,role}});
      await refresh();
      toast.success("Member role updated");
    }catch(error){toast.error(errorText(error));}
    finally{setBusy("");}
  }

  async function invite(event:FormEvent){
    event.preventDefault();
    if(!selected)return;
    try{
      setBusy("invite");
      const result=await inviteFn({data:{
        tenantId:selected.tenant_id,productKey:selected.product_key,regionKey:selected.region_key,
        email:inviteEmail,role:inviteRole,expiresInHours:168
      }});
      setInviteToken(String((result as any).token??""));
      setInviteEmail("");
      await refresh();
      toast.success("Invitation created");
    }catch(error){toast.error(errorText(error));}
    finally{setBusy("");}
  }

  const readiness=data?.readiness;
  const moduleRows=useMemo(()=>OMNIQORA_MODULES.map((module)=>({
    module,
    entitlement:entitlementsByKey.get(module.key),
    active:activeKeys.has(module.key),
    pending:openRequests.some((request:any)=>request.module_key===module.key)
  })),[data?.entitlements,data?.activeModuleKeys,data?.moduleRequests]);

  return <AppShell
    title="Landlord & Tenant Manager"
    subtitle="Post-launch control for product status, modules/add-ons, domains, branding, integrations, locations and ownership."
    actions={<div className="flex items-center gap-2">
      <Link to="/app/tenant-launch"><Button size="sm" variant="outline">Launch tenant</Button></Link>
      <Link to="/app/platform-control"><Button size="sm" variant="outline">Platform Control</Button></Link>
    </div>}
  >
    {list.isPending?<State text="Loading manageable tenants…"/>:list.error?<State text={errorText(list.error)} destructive/>:!rows.length?
      <State text="No tenant products are manageable by this account yet."/>:
      <>
        <Card><CardContent className="p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <Field label="Tenant product">
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={selected?.tenant_product_id??""} onChange={(e)=>setSelectedId(e.target.value)}>
                {rows.map((row)=><option key={row.tenant_product_id} value={row.tenant_product_id}>{row.tenant_name+" · "+row.product_key+" · "+row.region_key}</option>)}
              </select>
            </Field>
            {data?.tenantProduct&&operatorMode&&<div className="flex flex-wrap gap-2">
              {data.tenantProduct.status!=="active"&&<Button size="sm" onClick={()=>changeStatus("active")} disabled={busy==="status"}>Activate</Button>}
              {data.tenantProduct.status==="active"&&<Button size="sm" variant="outline" onClick={()=>changeStatus("suspended")} disabled={busy==="status"}>Suspend</Button>}
              {data.tenantProduct.status!=="cancelled"&&<Button size="sm" variant="destructive" onClick={()=>changeStatus("cancelled")} disabled={busy==="status"}>Cancel product</Button>}
            </div>}
          </div>
        </CardContent></Card>

        {detail.isPending?<State text="Loading tenant configuration…"/>:detail.error?<State text={errorText(detail.error)} destructive/>:data&&<>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <Metric icon={Building2} label="Tenant" value={data.tenant?.name??"—"}/>
            <Metric icon={Boxes} label="Modules" value={data.activeModuleKeys?.length??0}/>
            <Metric icon={Globe2} label="Verified domains" value={(data.domains??[]).filter((row:any)=>row.verification_status==="verified").length}/>
            <Metric icon={MapPin} label="Locations" value={(data.locations??[]).filter((row:any)=>row.status==="active").length}/>
            <Metric icon={PlugZap} label="Active integrations" value={(data.integrations??[]).filter((row:any)=>row.status==="active").length}/>
            <Metric icon={readiness?.readyForConfiguredModules?ShieldCheck:AlertTriangle} label="Readiness" value={readiness?.readyForConfiguredModules?"Ready":String(readiness?.blockers??0)+" blocker(s)"}/>
          </div>

          <Tabs defaultValue="modules" className="mt-6">
            <TabsList className="mb-6 flex h-auto flex-wrap justify-start">
              <TabsTrigger value="modules">Modules & add-ons</TabsTrigger>
              <TabsTrigger value="readiness">Readiness</TabsTrigger>
              <TabsTrigger value="brand">Brand & domains</TabsTrigger>
              <TabsTrigger value="integrations">Integrations</TabsTrigger>
              <TabsTrigger value="locations">Locations</TabsTrigger>
              <TabsTrigger value="commercials">Commercials</TabsTrigger>
              <TabsTrigger value="people">Ownership</TabsTrigger>
            </TabsList>

            <TabsContent value="modules" className="space-y-5">
              {!!openRequests.length&&<Card><CardContent className="p-0">
                <Header title="Open module requests" subtitle={operatorMode?"Approve or reject tenant add-on requests.":"Your landlord/platform operator will review these requests."}/>
                <div className="divide-y">{openRequests.map((request:any)=><div key={request.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div><div className="font-medium">{request.module_key}</div><div className="text-xs text-muted-foreground">{(request.reason||"No reason supplied")+" · "+new Date(request.created_at).toLocaleString()}</div></div>
                  {operatorMode?<div className="flex gap-2"><Button size="sm" onClick={()=>decide(request.id,"approved")} disabled={busy==="decision:"+request.id}>Approve</Button><Button size="sm" variant="outline" onClick={()=>decide(request.id,"rejected")} disabled={busy==="decision:"+request.id}>Reject</Button></div>:<Badge variant="outline">requested</Badge>}
                </div>)}</div>
              </CardContent></Card>}

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {moduleRows.map(({module,entitlement,active,pending})=><Card key={module.key}><CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="font-semibold">{module.name}</h3><p className="mt-0.5 text-xs text-muted-foreground">{module.key}</p></div>
                    <Badge variant={active?"default":"outline"}>{active?"enabled":pending?"requested":"off"}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{module.description}</p>
                  <div className="mt-4 text-xs text-muted-foreground">{entitlement?.source?"Source: "+entitlement.source:"Not entitled"}</div>
                  <div className="mt-4">
                    {operatorMode?
                      <Button size="sm" variant={active?"outline":"default"} onClick={()=>toggleModule(module.key,!active)} disabled={busy==="module:"+module.key}>{active?"Disable":"Enable"}</Button>:
                      !active&&!pending?<Button size="sm" variant="outline" onClick={()=>requestModuleAccess(module.key)} disabled={busy==="request:"+module.key}>Request add-on</Button>:
                      null}
                  </div>
                </CardContent></Card>)}
              </div>
            </TabsContent>

            <TabsContent value="readiness">
              <div className="grid gap-4 lg:grid-cols-[.7fr_1.3fr]">
                <Card><CardContent className="p-6">
                  <div className="flex items-center gap-2">{readiness?.readyForConfiguredModules?<CheckCircle2 className="h-5 w-5 text-primary"/>:<AlertTriangle className="h-5 w-5 text-destructive"/>}<h3 className="font-semibold">Configured-module readiness</h3></div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <Mini label="Blockers" value={readiness?.blockers??0}/>
                    <Mini label="Warnings" value={readiness?.warnings??0}/>
                  </div>
                  <p className="mt-4 text-xs text-muted-foreground">Readiness is scoped to currently enabled modules. It does not switch production DNS or provider credentials automatically.</p>
                </CardContent></Card>
                <Card><CardContent className="p-0"><Header title="Issues" subtitle="Production dependencies needing attention before a clean launch."/>
                  <div className="divide-y">{(readiness?.issues??[]).map((issue:any,index:number)=><div key={issue.code+index} className="flex gap-3 p-4">
                    {issue.severity==="blocker"?<CircleOff className="mt-0.5 h-4 w-4 text-destructive"/>:<AlertTriangle className="mt-0.5 h-4 w-4 text-muted-foreground"/>}
                    <div><div className="font-medium">{issue.message}</div><div className="mt-1 text-xs text-muted-foreground">{[issue.moduleKey,issue.integrationKind,issue.severity].filter(Boolean).join(" · ")+(issue.missingCredentialNames?.length?" · missing: "+issue.missingCredentialNames.join(", "):"")}</div></div>
                  </div>)}{!(readiness?.issues??[]).length&&<p className="p-5 text-sm text-muted-foreground">No readiness issues detected for the enabled modules.</p>}</div>
                </CardContent></Card>
              </div>
            </TabsContent>

            <TabsContent value="brand">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card><CardContent className="p-0"><Header title="Brand profiles" subtitle="Tenant-owned identity, white-label mode and presentation."/>
                  <div className="divide-y">{(data.brands??[]).map((brand:any)=><div key={brand.id} className="p-4">
                    <div className="flex items-start justify-between gap-3"><div><div className="font-medium">{brand.name}</div><div className="text-xs text-muted-foreground">{brand.brand_key+" · "+brand.branding_mode+" · revision "+brand.revision}</div></div><Badge variant="outline">{brand.status}</Badge></div>
                    <div className="mt-3 grid gap-1 text-xs text-muted-foreground"><span>{brand.website_url||"No website URL"}</span><span>{brand.support_email||"No support email"}</span><span>{Object.keys(brand.social_links??{}).filter((key)=>brand.social_links[key]).length+" social link(s)"}</span></div>
                  </div>)}{!(data.brands??[]).length&&<p className="p-5 text-sm text-muted-foreground">No brand profile yet.</p>}</div>
                </CardContent></Card>
                <Card><CardContent className="p-0"><Header title="Domains" subtitle="Custom domains are tenant/product isolated and verified before branded use."/>
                  <div className="divide-y">{(data.domains??[]).map((domain:any)=><div key={domain.id} className="flex items-center justify-between gap-3 p-4"><div><div className="font-medium">{domain.hostname}</div><div className="text-xs text-muted-foreground">{domain.purpose+(domain.is_primary?" · primary":"")}</div></div><Badge variant="outline">{domain.verification_status}</Badge></div>)}{!(data.domains??[]).length&&<p className="p-5 text-sm text-muted-foreground">No custom domains configured.</p>}</div>
                </CardContent></Card>
                <Card className="lg:col-span-2"><CardContent className="p-0"><Header title="Communication identities" subtitle="Email, WhatsApp, SMS and voice identities remain inactive until verification."/>
                  <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Channel</th><th className="px-5 py-3">Purpose</th><th className="px-5 py-3">Identity</th><th className="px-5 py-3">Verification</th><th className="px-5 py-3">Active</th></tr></thead><tbody className="divide-y">{(data.communicationIdentities??[]).map((item:any)=><tr key={item.id}><td className="px-5 py-3">{item.channel}</td><td className="px-5 py-3">{item.purpose}</td><td className="px-5 py-3">{item.identity_value}</td><td className="px-5 py-3"><Badge variant="outline">{item.verification_status}</Badge></td><td className="px-5 py-3">{item.active?"Yes":"No"}</td></tr>)}{!(data.communicationIdentities??[]).length&&<tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No communication identities configured.</td></tr>}</tbody></table></div>
                </CardContent></Card>
              </div>
            </TabsContent>

            <TabsContent value="integrations">
              <Card className="overflow-hidden"><CardContent className="p-0"><Header title="Provider bindings" subtitle="Only safe status metadata is shown; provider secret references and values are not returned."/>
                <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Module</th><th className="px-5 py-3">Provider</th><th className="px-5 py-3">Kind</th><th className="px-5 py-3">Environment</th><th className="px-5 py-3">Credentials</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y">{(data.integrations??[]).map((item:any)=><tr key={item.id}><td className="px-5 py-3">{item.module_key??"—"}</td><td className="px-5 py-3">{item.provider}</td><td className="px-5 py-3">{item.integration_kind}</td><td className="px-5 py-3">{item.environment}</td><td className="px-5 py-3">{item.credentialReferencesConfigured?<span className="inline-flex items-center gap-1"><KeyRound className="h-3.5 w-3.5"/>Configured</span>:"Missing"}</td><td className="px-5 py-3"><Badge variant="outline">{item.status}</Badge></td></tr>)}{!(data.integrations??[]).length&&<tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">No provider bindings configured.</td></tr>}</tbody></table></div>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="locations">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(data.locations??[]).map((location:any)=><Card key={location.id}><CardContent className="p-5">
                <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{location.name}</h3><p className="text-xs text-muted-foreground">{location.location_key+" · "+location.kind}</p></div><Badge variant="outline">{location.status}</Badge></div>
                <div className="mt-4 space-y-1 text-sm text-muted-foreground"><div>{(location.country_code||"No country")+" · "+(location.locale||"default locale")}</div><div>{(location.time_zone||"default timezone")+" · "+(location.currency||"default currency")}</div></div>
              </CardContent></Card>)}{!(data.locations??[]).length&&<EmptyCard text="No locations configured."/>}</div>
            </TabsContent>

            <TabsContent value="commercials">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card><CardContent className="p-0"><Header title="Subscription" subtitle="Plan lifecycle for this tenant product."/><div className="divide-y">{(data.subscriptions??[]).map((sub:any)=><div key={sub.id} className="p-4"><div className="flex items-center justify-between"><div><div className="font-medium">{sub.plan_key}</div><div className="text-xs text-muted-foreground">{(sub.provider||"manual")+(sub.current_period_end?" · renews/ends "+new Date(sub.current_period_end).toLocaleDateString():"")}</div></div><Badge variant="outline">{sub.status}</Badge></div></div>)}{!(data.subscriptions??[]).length&&<p className="p-5 text-sm text-muted-foreground">No live subscription record; entitlements may be provisioned by blueprint or manually.</p>}</div></CardContent></Card>
                <Card><CardContent className="p-0"><Header title="Add-on catalogue" subtitle="Commercial add-ons available to this product."/><div className="divide-y">{(data.availableAddons??[]).map((addon:any)=><div key={addon.addon_key} className="flex items-center justify-between gap-3 p-4"><div><div className="font-medium">{addon.name}</div><div className="text-xs text-muted-foreground">{addon.module_key+" · "+addon.billing_interval}</div></div><div className="text-sm font-medium">{formatMoney(addon.price_minor,addon.currency)}</div></div>)}{!(data.availableAddons??[]).length&&<p className="p-5 text-sm text-muted-foreground">No priced add-ons configured.</p>}</div></CardContent></Card>
              </div>
            </TabsContent>

            <TabsContent value="people">
              <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
                <Card><CardContent className="p-0"><Header title="Tenant members" subtitle="Every tenant must retain at least one owner."/><div className="divide-y">{(data.members??[]).map((member:any)=><div key={member.user_id} className="grid gap-3 p-4 sm:grid-cols-[1fr_180px] sm:items-center"><div><div className="font-mono text-xs">{member.user_id}</div><div className="text-xs text-muted-foreground">Tenant identity</div></div><select className="h-9 rounded-md border bg-background px-3 text-sm" value={member.role} onChange={(e)=>changeMemberRole(member.user_id,e.target.value as any)} disabled={busy==="member:"+member.user_id}>{["owner","admin","agent","viewer"].map((role)=><option key={role}>{role}</option>)}</select></div>)}{!(data.members??[]).length&&<p className="p-5 text-sm text-muted-foreground">No tenant members yet. Invite an owner to hand over the tenant.</p>}</div></CardContent></Card>
                <Card><CardContent className="p-5">
                  <div className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary"/><h3 className="font-semibold">Invite tenant user</h3></div>
                  <form onSubmit={invite} className="mt-4 space-y-3">
                    <Field label="Email"><Input required type="email" value={inviteEmail} onChange={(e)=>setInviteEmail(e.target.value)}/></Field>
                    <Field label="Role"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={inviteRole} onChange={(e)=>setInviteRole(e.target.value as any)}>{["owner","admin","agent","viewer"].map((role)=><option key={role}>{role}</option>)}</select></Field>
                    <Button type="submit" disabled={busy==="invite"}>Create invitation</Button>
                  </form>
                  {inviteToken&&<div className="mt-4 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Invitation token was created and is shown only in this session. Deliver it through the approved invitation channel.</div>}
                </CardContent></Card>
                <Card className="xl:col-span-2"><CardContent className="p-0"><Header title="Recent invitations" subtitle="Emails are visible; invitation token hashes are never returned."/><div className="divide-y">{(data.invitations??[]).slice(0,30).map((invite:any)=><div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><div className="font-medium">{invite.email}</div><div className="text-xs text-muted-foreground">{invite.role+" · expires "+new Date(invite.expires_at).toLocaleString()}</div></div><Badge variant="outline">{invite.accepted_at?"accepted":invite.revoked_at?"revoked":new Date(invite.expires_at).getTime()<Date.now()?"expired":"pending"}</Badge></div>)}{!(data.invitations??[]).length&&<p className="p-5 text-sm text-muted-foreground">No invitations.</p>}</div></CardContent></Card>
              </div>
            </TabsContent>
          </Tabs>
        </>}
      </>}
  </AppShell>;
}

function Metric({icon:Icon,label,value}:{icon:typeof Building2;label:string;value:number|string}){
  return <Card><CardContent className="p-5"><div className="flex items-center justify-between gap-2"><span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary"/></div><div className="mt-2 truncate font-display text-2xl font-semibold">{value}</div></CardContent></Card>;
}
function Mini({label,value}:{label:string;value:number|string}){return <div className="rounded-lg bg-surface-2 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-display text-2xl font-semibold">{value}</div></div>;}
function Header({title,subtitle}:{title:string;subtitle:string}){return <div className="border-b px-5 py-4"><h3 className="font-semibold">{title}</h3><p className="text-xs text-muted-foreground">{subtitle}</p></div>;}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div><Label className="text-xs text-muted-foreground">{label}</Label><div className="mt-1">{children}</div></div>;}
function State({text,destructive=false}:{text:string;destructive?:boolean}){return <Card><CardContent className={"p-6 text-sm "+(destructive?"text-destructive":"text-muted-foreground")}>{text}</CardContent></Card>;}
function EmptyCard({text}:{text:string}){return <Card className="md:col-span-2 xl:col-span-3"><CardContent className="p-6 text-sm text-muted-foreground">{text}</CardContent></Card>;}
function errorText(error:unknown){return error instanceof Error?error.message:String(error);}
function formatMoney(minor:number|string,currency:string){const value=Number(minor??0)/100;try{return new Intl.NumberFormat(undefined,{style:"currency",currency:currency||"GBP"}).format(value);}catch{return (currency||"")+" "+value.toFixed(2);}}
