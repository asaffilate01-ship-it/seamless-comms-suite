import { createFileRoute, Link } from "@tanstack/react-router";
import { FormEvent, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OMNIQORA_MODULES, OMNIQORA_PRODUCTS } from "@/modules/platform/registry";
import { createManagedTenant, createTenantInvitation } from "@/modules/platform/operator.functions";
import { getEffectiveSaasBlueprint } from "@/modules/platform/saas-factory.functions";
import { executeProvisioningRun, saveProvisioningRun } from "@/modules/platform/provisioning.functions";
import { saveTenantBranding } from "@/modules/branding/functions";
import { ArrowRight, CheckCircle2, Factory, Globe2, Layers3, Palette, UserPlus } from "lucide-react";

export const Route=createFileRoute("/_authenticated/app/tenant-launch")({
  head:()=>({meta:[
    {title:"Tenant Launch — Omniqora"},
    {name:"description",content:"Provision a tenant from an Omniqora SaaS Factory blueprint."},
    {name:"robots",content:"noindex"},
  ]}),
  component:TenantLaunch,
});

type CreatedTenant={id:string;name:string;slug:string};
type Provisioned={runId:string;tenantProductId:string};

function TenantLaunch(){
  const [productKey,setProductKey]=useState("kindelo-gb");
  const product=OMNIQORA_PRODUCTS.find((item)=>item.key===productKey)??OMNIQORA_PRODUCTS[0];
  const [regionKey,setRegionKey]=useState(product.supportedRegions[0]??"GB");
  const [locale,setLocale]=useState(product.supportedLocales[0]??"en-GB");
  const [tenantName,setTenantName]=useState("");
  const [tenantSlug,setTenantSlug]=useState("");
  const [planKey,setPlanKey]=useState("");
  const [locationKey,setLocationKey]=useState("main");
  const [locationName,setLocationName]=useState("");
  const [domain,setDomain]=useState("");
  const [domainPurpose,setDomainPurpose]=useState<"marketing"|"app"|"api"|"tracking"|"assets"|"auth"|"other">("app");
  const [selectedModules,setSelectedModules]=useState<string[]>([]);
  const [created,setCreated]=useState<CreatedTenant|null>(null);
  const [plannedRun,setPlannedRun]=useState<{id:string;plan:any}|null>(null);
  const [provisioned,setProvisioned]=useState<Provisioned|null>(null);
  const [brandName,setBrandName]=useState("");
  const [brandKey,setBrandKey]=useState("default");
  const [logoUrl,setLogoUrl]=useState("");
  const [primaryColour,setPrimaryColour]=useState("");
  const [supportEmail,setSupportEmail]=useState("");
  const [websiteUrl,setWebsiteUrl]=useState("");
  const [facebookUrl,setFacebookUrl]=useState("");
  const [instagramUrl,setInstagramUrl]=useState("");
  const [linkedinUrl,setLinkedinUrl]=useState("");
  const [ownerEmail,setOwnerEmail]=useState("");
  const [inviteToken,setInviteToken]=useState("");
  const [busy,setBusy]=useState<string|null>(null);

  const createTenant=useServerFn(createManagedTenant);
  const getBlueprint=useServerFn(getEffectiveSaasBlueprint);
  const planProvisioning=useServerFn(saveProvisioningRun);
  const executeProvisioning=useServerFn(executeProvisioningRun);
  const saveBrand=useServerFn(saveTenantBranding);
  const inviteOwner=useServerFn(createTenantInvitation);

  const blueprint=useQuery({
    queryKey:["saas-effective-blueprint",productKey],
    queryFn:()=>getBlueprint({data:{productKey}}),
    retry:false,
  });
  const effective=blueprint.data?.effective;
  const optionalKeys=(effective?.optionalModules??[]) as string[];
  const defaultKeys=(effective?.modules??product.defaultModules??[]) as string[];
  const availableOptional=useMemo(()=>optionalKeys.map((key)=>OMNIQORA_MODULES.find((m)=>m.key===key)).filter(Boolean),[optionalKeys]);

  function changeProduct(next:string){
    setProductKey(next);
    const p=OMNIQORA_PRODUCTS.find((item)=>item.key===next);
    if(p){
      setRegionKey(p.supportedRegions[0]??"GB");
      setLocale(p.supportedLocales[0]??"en-GB");
    }
    setSelectedModules([]);
    setCreated(null);setPlannedRun(null);setProvisioned(null);setInviteToken("");
  }

  async function onCreate(event:FormEvent){
    event.preventDefault();
    try{
      setBusy("create");
      const tenant=await createTenant({data:{productKey,regionKey,name:tenantName,slug:tenantSlug}});
      setCreated(tenant as CreatedTenant);
      if(!locationName)setLocationName(tenantName);
      if(!brandName)setBrandName(tenantName);
      toast.success("Tenant created");
    }catch(e){toast.error(e instanceof Error?e.message:"Tenant could not be created");}
    finally{setBusy(null);}
  }

  async function onPlan(){
    if(!created)return;
    try{
      setBusy("plan");
      const result=await planProvisioning({data:{
        tenantId:created.id,productKey,regionPackKey:regionKey,locale,
        planKey:planKey||null,requestedModules:selectedModules,
        locations:locationName?[{key:locationKey||"main",name:locationName,countryCode:regionKey,locale}]:[],
        domains:domain?[{hostname:domain.trim().toLowerCase(),purpose:domainPurpose,primary:true}]:[],
      }});
      setPlannedRun({id:(result as any).run.id,plan:(result as any).plan});
      toast.success("Provisioning plan created");
    }catch(e){toast.error(e instanceof Error?e.message:"Provisioning plan could not be created");}
    finally{setBusy(null);}
  }

  async function onExecute(){
    if(!created||!plannedRun)return;
    try{
      setBusy("execute");
      const result=await executeProvisioning({data:{runId:plannedRun.id,tenantId:created.id}});
      setProvisioned(result as Provisioned);
      toast.success("Tenant product provisioned");
    }catch(e){toast.error(e instanceof Error?e.message:"Provisioning failed");}
    finally{setBusy(null);}
  }

  async function onBrand(event:FormEvent){
    event.preventDefault();
    if(!created||!provisioned)return;
    try{
      setBusy("brand");
      const whiteLabel=Array.isArray(plannedRun?.plan?.modules)&&plannedRun!.plan.modules.includes("branding.white_label");
      await saveBrand({data:{
        tenantId:created.id,tenantProductId:provisioned.tenantProductId,brandKey:brandKey||"default",
        brandingMode:whiteLabel?"white_label":"co_branded",
        name:brandName||created.name,appName:brandName||created.name,legalName:brandName||created.name,
        logoUrl:logoUrl||null,websiteUrl:websiteUrl||null,primaryColour:primaryColour||null,
        supportEmail:supportEmail||null,locale,poweredByLabel:whiteLabel?null:"Powered by Omniqora",
        terminology:{},theme:{},socialLinks:{
          facebook:facebookUrl||null,instagram:instagramUrl||null,linkedin:linkedinUrl||null
        },legalDetails:{registeredAddress:{}},seo:{},brandVoice:{},contactDetails:{
          publicEmail:supportEmail||null,address:{}
        }
      }});
      toast.success("Brand profile saved");
    }catch(e){toast.error(e instanceof Error?e.message:"Brand profile could not be saved");}
    finally{setBusy(null);}
  }

  async function onInvite(event:FormEvent){
    event.preventDefault();
    if(!created||!provisioned)return;
    try{
      setBusy("invite");
      const result=await inviteOwner({data:{
        tenantId:created.id,productKey,regionKey,email:ownerEmail,role:"owner",expiresInHours:168
      }});
      setInviteToken(String((result as any).token??""));
      toast.success("Owner invitation created");
    }catch(e){toast.error(e instanceof Error?e.message:"Invitation could not be created");}
    finally{setBusy(null);}
  }

  return <AppShell
    title="SaaS Factory · Tenant Launch"
    subtitle="Create → configure → provision → brand → invite. Existing product source systems stay authoritative until separately migrated."
    actions={<Link to="/app/platform-control"><Button variant="outline" size="sm">Platform Control</Button></Link>}
  >
    <div className="mb-6 grid gap-3 md:grid-cols-5">
      <Step n="1" label="Tenant" done={!!created}/>
      <Step n="2" label="Blueprint" done={!!plannedRun}/>
      <Step n="3" label="Provision" done={!!provisioned}/>
      <Step n="4" label="Brand" done={false}/>
      <Step n="5" label="Owner" done={!!inviteToken}/>
    </div>

    <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <div className="space-y-6">
        <Card><CardContent className="p-6">
          <div className="flex items-center gap-2"><Factory className="h-5 w-5 text-primary"/><h2 className="font-display text-xl font-semibold">1. Tenant & product</h2></div>
          <form onSubmit={onCreate} className="mt-5 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Tenant / organisation name"><Input required value={tenantName} onChange={(e)=>setTenantName(e.target.value)} disabled={!!created}/></Field>
              <Field label="Tenant slug"><Input required pattern="[a-z0-9][a-z0-9-]{1,62}[a-z0-9]" value={tenantSlug} onChange={(e)=>setTenantSlug(e.target.value.toLowerCase())} placeholder="example-agency" disabled={!!created}/></Field>
              <Field label="SaaS product"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={productKey} onChange={(e)=>changeProduct(e.target.value)} disabled={!!created}>{OMNIQORA_PRODUCTS.filter((p)=>["vertical_landlord","product_variant","standalone"].includes(p.kind)&&p.status!=="retired").map((p)=><option key={p.key} value={p.key}>{p.name} · {p.key}</option>)}</select></Field>
              <Field label="Country / region"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={regionKey} onChange={(e)=>setRegionKey(e.target.value)} disabled={!!created}>{product.supportedRegions.map((r)=><option key={r} value={r}>{r}</option>)}</select></Field>
              <Field label="Locale"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={locale} onChange={(e)=>setLocale(e.target.value)} disabled={!!created}>{product.supportedLocales.map((l)=><option key={l} value={l}>{l}</option>)}</select></Field>
              <Field label="Plan key (optional)"><Input value={planKey} onChange={(e)=>setPlanKey(e.target.value)} placeholder="growth" disabled={!!created}/></Field>
            </div>
            {!created?<Button disabled={busy==="create"} type="submit">Create tenant <ArrowRight className="ml-2 h-4 w-4"/></Button>:
            <div className="rounded-lg border bg-surface-2 p-4 text-sm"><span className="font-medium">{created.name}</span> created · <code>{created.id}</code></div>}
          </form>
        </CardContent></Card>

        <Card className={!created?"opacity-60":""}><CardContent className="p-6">
          <div className="flex items-center gap-2"><Layers3 className="h-5 w-5 text-primary"/><h2 className="font-display text-xl font-semibold">2. Modules, location & domain</h2></div>
          <p className="mt-2 text-sm text-muted-foreground">Default modules come from the effective landlord/country blueprint. Select only optional add-ons here.</p>
          <div className="mt-5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Default modules</div>
            <div className="mt-2 flex flex-wrap gap-1.5">{defaultKeys.map((key:string)=><Badge key={key} variant="secondary">{key}</Badge>)}</div>
          </div>
          <div className="mt-5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Optional add-ons</div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">{availableOptional.map((module:any)=><label key={module!.key} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" className="mt-1" checked={selectedModules.includes(module!.key)} onChange={(e)=>setSelectedModules((old)=>e.target.checked?[...old,module!.key]:old.filter((k)=>k!==module!.key))} disabled={!created||!!plannedRun}/><span><span className="font-medium">{module!.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{module!.description}</span></span></label>)}</div>
            {!availableOptional.length&&<p className="mt-2 text-sm text-muted-foreground">No optional add-ons are declared by this blueprint.</p>}
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Location key"><Input value={locationKey} onChange={(e)=>setLocationKey(e.target.value)} disabled={!created||!!plannedRun}/></Field>
            <Field label="Location name"><Input value={locationName} onChange={(e)=>setLocationName(e.target.value)} disabled={!created||!!plannedRun}/></Field>
            <Field label="Primary custom domain (optional)"><Input value={domain} onChange={(e)=>setDomain(e.target.value)} placeholder="app.customer.co.uk" disabled={!created||!!plannedRun}/></Field>
            <Field label="Domain purpose"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={domainPurpose} onChange={(e)=>setDomainPurpose(e.target.value as any)} disabled={!created||!!plannedRun}>{["app","marketing","api","tracking","assets","auth","other"].map((p)=><option key={p}>{p}</option>)}</select></Field>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" onClick={onPlan} disabled={!created||!!plannedRun||busy==="plan"}>Build provisioning plan</Button>
            {plannedRun&&!provisioned&&<Button type="button" onClick={onExecute} disabled={busy==="execute"}>Approve & provision <ArrowRight className="ml-2 h-4 w-4"/></Button>}
            {provisioned&&<Badge className="h-9 px-3"><CheckCircle2 className="mr-1.5 h-4 w-4"/> Provisioned</Badge>}
          </div>
          {plannedRun&&<div className="mt-5 rounded-lg border bg-surface-2 p-4"><div className="text-sm font-medium">Plan · {plannedRun.plan.modules?.length??0} modules · {plannedRun.plan.steps?.length??0} steps</div>{(plannedRun.plan.warnings??[]).map((warning:string)=><p key={warning} className="mt-1 text-xs text-muted-foreground">{warning}</p>)}</div>}
        </CardContent></Card>

        <Card className={!provisioned?"opacity-60":""}><CardContent className="p-6">
          <div className="flex items-center gap-2"><Palette className="h-5 w-5 text-primary"/><h2 className="font-display text-xl font-semibold">3. White-label brand</h2></div>
          <form onSubmit={onBrand} className="mt-5 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Brand key"><Input value={brandKey} onChange={(e)=>setBrandKey(e.target.value)} disabled={!provisioned}/></Field>
              <Field label="Brand / app name"><Input value={brandName} onChange={(e)=>setBrandName(e.target.value)} disabled={!provisioned}/></Field>
              <Field label="Logo URL"><Input type="url" value={logoUrl} onChange={(e)=>setLogoUrl(e.target.value)} disabled={!provisioned}/></Field>
              <Field label="Primary colour"><Input value={primaryColour} onChange={(e)=>setPrimaryColour(e.target.value)} placeholder="#123456" disabled={!provisioned}/></Field>
              <Field label="Support email"><Input type="email" value={supportEmail} onChange={(e)=>setSupportEmail(e.target.value)} disabled={!provisioned}/></Field>
              <Field label="Website URL"><Input type="url" value={websiteUrl} onChange={(e)=>setWebsiteUrl(e.target.value)} placeholder="https://example.com" disabled={!provisioned}/></Field>
              <Field label="Facebook URL"><Input type="url" value={facebookUrl} onChange={(e)=>setFacebookUrl(e.target.value)} disabled={!provisioned}/></Field>
              <Field label="Instagram URL"><Input type="url" value={instagramUrl} onChange={(e)=>setInstagramUrl(e.target.value)} disabled={!provisioned}/></Field>
              <Field label="LinkedIn URL"><Input type="url" value={linkedinUrl} onChange={(e)=>setLinkedinUrl(e.target.value)} disabled={!provisioned}/></Field>
            </div>
            <p className="text-xs text-muted-foreground">Verified sender email/WhatsApp/SMS/voice identities are configured after the relevant domain/provider binding is verified.</p>
            <Button type="submit" disabled={!provisioned||busy==="brand"}>Save full brand profile</Button>
          </form>
        </CardContent></Card>

        <Card className={!provisioned?"opacity-60":""}><CardContent className="p-6">
          <div className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary"/><h2 className="font-display text-xl font-semibold">4. Invite tenant owner</h2></div>
          <form onSubmit={onInvite} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Owner email" className="flex-1"><Input required type="email" value={ownerEmail} onChange={(e)=>setOwnerEmail(e.target.value)} disabled={!provisioned}/></Field>
            <Button type="submit" disabled={!provisioned||busy==="invite"}>Create owner invite</Button>
          </form>
          {inviteToken&&<div className="mt-4 rounded-lg border border-dashed p-4 text-sm"><div className="font-medium">Invitation token created</div><p className="mt-1 text-xs text-muted-foreground">The token is only shown at creation. Deliver it through the approved invitation channel; it expires after 7 days.</p></div>}
        </CardContent></Card>
      </div>

      <aside className="space-y-4">
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-primary"/><h3 className="font-semibold">Effective product</h3></div>
          <div className="mt-4 space-y-3 text-sm">
            <Row label="Product" value={product.name}/>
            <Row label="Key" value={product.key}/>
            <Row label="Kind" value={product.kind.replaceAll("_"," ")}/>
            <Row label="Family root" value={String(effective?.metadata?.familyRoot??product.parentProductKey??product.key)}/>
            <Row label="Region" value={regionKey}/>
            <Row label="Locale" value={locale}/>
            <Row label="Blueprint version" value={String(effective?.blueprintVersion??"compiled")}/>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <h3 className="font-semibold">Launch boundary</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>• Creates the Omniqora tenant and product binding.</li>
            <li>• Enables the blueprint/module entitlements.</li>
            <li>• Creates configured location/domain records.</li>
            <li>• Applies tenant branding after provisioning.</li>
            <li>• Does not migrate an existing SaaS database automatically.</li>
            <li>• Does not switch live DNS, auth, payments or provider credentials.</li>
          </ul>
        </CardContent></Card>
        {productKey.startsWith("kindelo")&&<Card><CardContent className="p-5">
          <h3 className="font-semibold">Kindelo hierarchy</h3>
          <p className="mt-2 text-sm text-muted-foreground">Kindelo is the landlord family. Kindelo UK/Germany are country variants; agencies are tenants; childminders/providers are marketplace vendors; parents are customer identities.</p>
        </CardContent></Card>}
      </aside>
    </div>
  </AppShell>;
}

function Field({label,children,className=""}:{label:string;children:React.ReactNode;className?:string}){return <div className={className}><Label className="text-xs text-muted-foreground">{label}</Label><div className="mt-1">{children}</div></div>;}
function Step({n,label,done}:{n:string;label:string;done:boolean}){return <div className={`rounded-xl border p-4 ${done?"bg-primary/5 border-primary/30":"bg-card"}`}><div className="flex items-center justify-between"><span className="text-xs font-semibold text-primary">STEP {n}</span>{done&&<CheckCircle2 className="h-4 w-4 text-primary"/>}</div><div className="mt-2 text-sm font-medium">{label}</div></div>;}
function Row({label,value}:{label:string;value:string}){return <div className="flex items-start justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>;}
