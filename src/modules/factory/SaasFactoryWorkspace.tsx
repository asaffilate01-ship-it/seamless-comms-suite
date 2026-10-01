// @ts-nocheck
import {useEffect,useMemo,useState} from "react";
import {useServerFn} from "@tanstack/react-start";
import {
  attachTenantProduct,
  decideChangeRequest,
  getFactoryCatalogue,
  getTenantControl,
  listOpenChangeRequests,
  provisionSaasTenant,
  setTenantBranding,
  setTenantService,
} from "@/lib/saas-factory.functions";
import {
  applyBlueprint,
  factorySteps,
  groupedServices,
  productDefaultServices,
  resolveDependencies,
  slugify,
  type FactoryCatalogue,
  type TenantControl,
} from "@/lib/saas-factory";
import {AppShell} from "@/components/app/shell";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {Tabs,TabsContent,TabsList,TabsTrigger} from "@/components/ui/tabs";
import {Badge} from "@/components/ui/badge";
import {
  Boxes,Building2,Check,ChevronRight,Globe2,Layers3,Loader2,
  PackagePlus,Palette,PlugZap,RefreshCw,ShieldCheck,Sparkles,Users,
} from "lucide-react";

const blankCatalogue:FactoryCatalogue={products:[],services:[],blueprints:[]};

export function SaasFactoryWorkspace(){
  const loadCatalogue=useServerFn(getFactoryCatalogue);
  const provision=useServerFn(provisionSaasTenant);
  const getControl=useServerFn(getTenantControl);
  const attach=useServerFn(attachTenantProduct);
  const setService=useServerFn(setTenantService);
  const saveBranding=useServerFn(setTenantBranding);
  const listRequests=useServerFn(listOpenChangeRequests);
  const decide=useServerFn(decideChangeRequest);

  const[catalogue,setCatalogue]=useState<FactoryCatalogue>(blankCatalogue);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState("");
  const[message,setMessage]=useState("");

  const[step,setStep]=useState(0);
  const[organisationName,setOrganisationName]=useState("");
  const[organisationSlug,setOrganisationSlug]=useState("");
  const[tenantName,setTenantName]=useState("");
  const[tenantSlug,setTenantSlug]=useState("");
  const[countryCode,setCountryCode]=useState("GB");
  const[currency,setCurrency]=useState("GBP");
  const[timezone,setTimezone]=useState("Europe/London");
  const[productKeys,setProductKeys]=useState<string[]>([]);
  const[serviceKeys,setServiceKeys]=useState<string[]>([]);
  const[blueprintKey,setBlueprintKey]=useState("");
  const[displayName,setDisplayName]=useState("");
  const[logoUrl,setLogoUrl]=useState("");
  const[primaryColor,setPrimaryColor]=useState("#111827");
  const[accentColor,setAccentColor]=useState("#f59e0b");
  const[supportEmail,setSupportEmail]=useState("");
  const[supportPhone,setSupportPhone]=useState("");
  const[domain,setDomain]=useState("");
  const[adminName,setAdminName]=useState("");
  const[adminEmail,setAdminEmail]=useState("");
  const[locationName,setLocationName]=useState("Main Location");
  const[locationPostcode,setLocationPostcode]=useState("");
  const[creating,setCreating]=useState(false);
  const[createdTenant,setCreatedTenant]=useState("");

  const[manageTenant,setManageTenant]=useState("");
  const[control,setControl]=useState<TenantControl|null>(null);
  const[selectedProduct,setSelectedProduct]=useState("");
  const[manageBrandName,setManageBrandName]=useState("");
  const[manageLogo,setManageLogo]=useState("");
  const[managePrimary,setManagePrimary]=useState("#111827");
  const[manageAccent,setManageAccent]=useState("#f59e0b");
  const[manageDomain,setManageDomain]=useState("");

  const[requests,setRequests]=useState<any[]>([]);
  const[requestTenants,setRequestTenants]=useState<Record<string,string>>({});
  const[selectedRequest,setSelectedRequest]=useState<any|null>(null);
  const[quote,setQuote]=useState("");
  const[notes,setNotes]=useState("");

  async function refreshCatalogue(){
    setLoading(true);setError("");
    try{setCatalogue(await loadCatalogue())}
    catch(e){setError(e instanceof Error?e.message:"Unable to load SaaS Factory")}
    finally{setLoading(false)}
  }
  useEffect(()=>{void refreshCatalogue()},[]);

  const groups=useMemo(()=>groupedServices(catalogue.services),[catalogue.services]);
  const blueprint=catalogue.blueprints.find(x=>x.key===blueprintKey);

  function toggleProduct(key:string){
    setProductKeys(current=>{
      const next=current.includes(key)?current.filter(x=>x!==key):[...current,key];
      const defaults=productDefaultServices(next,catalogue);
      setServiceKeys(existing=>resolveDependencies([...new Set([...existing,...defaults])],catalogue.services));
      return next;
    });
  }

  function chooseBlueprint(key:string){
    setBlueprintKey(key);
    const chosen=catalogue.blueprints.find(x=>x.key===key);
    const next=applyBlueprint(chosen,productKeys,serviceKeys,catalogue);
    setProductKeys(next.products);setServiceKeys(next.services);
    if(chosen?.countryCode)setCountryCode(chosen.countryCode);
    const defaults=chosen?.defaults??{};
    if(defaults["currency"])setCurrency(String(defaults["currency"]));
    if(defaults["timezone"])setTimezone(String(defaults["timezone"]));
  }

  function toggleService(key:string){
    setServiceKeys(current=>{
      if(current.includes(key)){
        const blocker=current.find(active=>catalogue.services.find(s=>s.key===active)?.requires?.includes(key));
        if(blocker){
          setMessage((catalogue.services.find(s=>s.key===key)?.name??key)+" is required by "+blocker);
          return current;
        }
        return current.filter(x=>x!==key);
      }
      return resolveDependencies([...current,key],catalogue.services);
    });
  }

  async function createTenant(){
    setCreating(true);setMessage("");
    try{
      const result=await provision({data:{
        organisationName,organisationSlug,tenantName,tenantSlug,countryCode,currency,timezone,
        productKeys,blueprintKey:blueprintKey||null,serviceKeys,
        branding:{displayName:displayName||tenantName,logoUrl:logoUrl||undefined,primaryColor,accentColor,
          supportEmail:supportEmail||undefined,supportPhone:supportPhone||undefined},
        primaryDomain:domain||null,
        settings:{primaryLocation:{name:locationName||"Main Location",postcode:locationPostcode||null}},
        adminName:adminName||null,adminEmail:adminEmail||null,
      }});
      setCreatedTenant(result.tenantId);
      setMessage(result.invited?"Tenant created and owner invitation sent.":"Tenant created and owner access linked.");
    }catch(e){setMessage(e instanceof Error?e.message:"Tenant creation failed")}
    finally{setCreating(false)}
  }

  async function loadTenant(){
    if(!manageTenant)return;
    setMessage("");
    try{
      const next=await getControl({data:{tenantId:manageTenant}});
      setControl(next);
      const product=next.products?.[0]?.key??"";
      setSelectedProduct(product);hydrateBranding(next,product);
    }catch(e){setMessage(e instanceof Error?e.message:"Unable to load tenant")}
  }

  function hydrateBranding(next:TenantControl,product:string){
    const b=(next.branding??[]).find((row:any)=>row.product_key===product)??{};
    setManageBrandName(String(b.display_name??next.tenant?.["name"]??""));
    setManageLogo(String(b.logo_url??""));
    setManagePrimary(String(b.primary_color??"#111827"));
    setManageAccent(String(b.accent_color??"#f59e0b"));
    const d=(next.domains??[]).find((row:any)=>row.product_key===product&&row.primary_domain);
    setManageDomain(String(d?.hostname??""));
  }

  async function attachProduct(key:string){
    try{await attach({data:{tenantId:manageTenant,productKey:key,config:{source:"saas-factory"}}});await loadTenant()}
    catch(e){setMessage(e instanceof Error?e.message:"Unable to attach product")}
  }
  async function changeService(key:string,enabled:boolean){
    try{await setService({data:{tenantId:manageTenant,serviceKey:key,enabled,config:{source:"saas-factory"}}});await loadTenant()}
    catch(e){setMessage(e instanceof Error?e.message:"Unable to change service")}
  }
  async function updateBranding(){
    try{
      await saveBranding({data:{tenantId:manageTenant,productKey:selectedProduct,
        branding:{displayName:manageBrandName,logoUrl:manageLogo||undefined,primaryColor:managePrimary,accentColor:manageAccent},
        domain:manageDomain||null}});
      await loadTenant();setMessage("Branding and domain updated.");
    }catch(e){setMessage(e instanceof Error?e.message:"Unable to save branding")}
  }

  async function refreshRequests(){
    try{const result=await listRequests();setRequests(result.requests);setRequestTenants(result.tenants)}
    catch(e){setMessage(e instanceof Error?e.message:"Unable to load requests")}
  }
  async function decideRequest(decision:"approved"|"rejected"|"awaiting_payment"|"completed"){
    if(!selectedRequest)return;
    try{
      await decide({data:{requestId:selectedRequest.id,decision,quotePence:quote?Math.round(Number(quote)*100):null,notes:notes||null}});
      setSelectedRequest(null);setQuote("");setNotes("");await refreshRequests();
    }catch(e){setMessage(e instanceof Error?e.message:"Unable to decide request")}
  }

  if(loading)return <AppShell title="SaaS Factory" subtitle="Loading Omniqora control plane…"><div className="grid min-h-72 place-items-center"><Loader2 className="h-7 w-7 animate-spin"/></div></AppShell>;
  if(error)return <AppShell title="SaaS Factory" subtitle="Omniqora platform administration"><div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6"><b>Access unavailable</b><p className="mt-2 text-sm text-muted-foreground">{error}</p><p className="mt-3 text-xs text-muted-foreground">Platform admins are controlled through OMNIQORA_PLATFORM_ADMIN_EMAILS and the platform-admin table.</p></div></AppShell>;

  return <AppShell title="SaaS Factory" subtitle="Launch, brand, entitle, connect and commercialise every SaaS from one Omniqora control plane.">
    <Tabs defaultValue="launch" onValueChange={value=>{if(value==="requests")void refreshRequests()}}>
      <TabsList className="mb-6 flex h-auto flex-wrap">
        <TabsTrigger value="launch">Launch tenant</TabsTrigger>
        <TabsTrigger value="manage">Manage tenant</TabsTrigger>
        <TabsTrigger value="requests">Change requests</TabsTrigger>
        <TabsTrigger value="catalogue">A–Z catalogue</TabsTrigger>
      </TabsList>

      <TabsContent value="launch">
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <aside className="h-fit rounded-xl border bg-card p-2">
            {factorySteps.map((label,index)=><button key={label} onClick={()=>setStep(index)}
              className={"mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm "+(step===index?"bg-primary text-primary-foreground":"hover:bg-muted")}>
              <span className="grid h-6 w-6 place-items-center rounded-full border text-[11px]">{index+1}</span>{label}
            </button>)}
          </aside>
          <section className="rounded-xl border bg-card p-6">
            <div className="mb-6"><p className="text-xs font-bold uppercase tracking-widest text-primary">New SaaS tenant</p><h2 className="mt-1 text-2xl font-semibold">{factorySteps[step]}</h2></div>

            {step===0&&<div className="grid gap-4 md:grid-cols-2">
              <Field label="Organisation / customer" value={organisationName} set={v=>{setOrganisationName(v);if(!organisationSlug)setOrganisationSlug(slugify(v))}}/>
              <Field label="Organisation slug" value={organisationSlug} set={v=>setOrganisationSlug(slugify(v))}/>
              <Field label="Tenant / workspace name" value={tenantName} set={v=>{setTenantName(v);if(!tenantSlug)setTenantSlug(slugify(v));if(!displayName)setDisplayName(v)}}/>
              <Field label="Tenant slug" value={tenantSlug} set={v=>setTenantSlug(slugify(v))}/>
              <Field label="Country" value={countryCode} set={v=>setCountryCode(v.toUpperCase())}/>
              <Field label="Currency" value={currency} set={v=>setCurrency(v.toUpperCase())}/>
              <Field label="Timezone" value={timezone} set={setTimezone}/>
              <Field label="Primary location" value={locationName} set={setLocationName}/>
              <Field label="Primary postcode" value={locationPostcode} set={v=>setLocationPostcode(v.toUpperCase())}/>
            </div>}

            {step===1&&<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{catalogue.products.map(p=>{
              const on=productKeys.includes(p.key);
              return <button key={p.key} onClick={()=>toggleProduct(p.key)} className={"rounded-xl border p-4 text-left "+(on?"border-primary bg-primary text-primary-foreground":"hover:border-primary/50")}>
                <div className="flex justify-between gap-2"><div><b>{p.name}</b><p className="mt-1 text-[10px] uppercase opacity-70">{p.category}</p></div>{on?<Check className="h-4 w-4"/>:<PackagePlus className="h-4 w-4 opacity-50"/>}</div>
              </button>})}</div>}

            {step===2&&<div className="grid gap-3 md:grid-cols-2">{catalogue.blueprints.map(b=><button key={b.key} onClick={()=>chooseBlueprint(b.key)}
              className={"rounded-xl border p-4 text-left "+(blueprintKey===b.key?"border-primary bg-primary/5":"hover:border-primary/50")}>
              <div className="flex justify-between gap-2"><b>{b.name}</b>{blueprintKey===b.key&&<Check className="h-4 w-4 text-primary"/>}</div>
              <p className="mt-2 text-sm text-muted-foreground">{b.description}</p><p className="mt-2 text-[10px] font-bold uppercase text-primary">{b.category}{b.countryCode?" · "+b.countryCode:""}</p>
            </button>)}</div>}

            {step===3&&<div className="space-y-7">{groups.map(([category,services])=><section key={category}>
              <h3 className="mb-3 text-sm font-bold">{category}</h3><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{services.map(s=>{
                const on=serviceKeys.includes(s.key);return <button key={s.key} onClick={()=>toggleService(s.key)}
                  className={"rounded-xl border p-4 text-left "+(on?"border-primary bg-primary text-primary-foreground":"hover:border-primary/50")}>
                  <div className="flex justify-between gap-2"><b>{s.name}</b>{on&&<Check className="h-4 w-4"/>}</div>
                  <p className={"mt-2 text-xs leading-5 "+(on?"opacity-75":"text-muted-foreground")}>{s.description}</p>
                  {s.requires?.length>0&&<p className="mt-2 text-[10px] opacity-70">Requires {s.requires.join(" · ")}</p>}
                </button>})}</div>
            </section>)}</div>}

            {step===4&&<div className="grid gap-4 md:grid-cols-2">
              <Field label="Customer-facing name" value={displayName} set={setDisplayName}/>
              <Field label="Primary domain" value={domain} set={setDomain} placeholder="app.customer.com"/>
              <Field label="Logo URL" value={logoUrl} set={setLogoUrl}/>
              <Field label="Support email" value={supportEmail} set={setSupportEmail}/>
              <Field label="Support phone" value={supportPhone} set={setSupportPhone}/>
              <Colour label="Primary colour" value={primaryColor} set={setPrimaryColor}/>
              <Colour label="Accent colour" value={accentColor} set={setAccentColor}/>
            </div>}

            {step===5&&<div className="grid gap-4 md:grid-cols-2">
              <Field label="Tenant owner name" value={adminName} set={setAdminName}/>
              <Field label="Tenant owner email" value={adminEmail} set={setAdminEmail} type="email"/>
              <div className="md:col-span-2 rounded-xl bg-muted p-4 text-sm text-muted-foreground"><Users className="mr-2 inline h-4 w-4"/>Existing users are linked; new users receive an invitation. Omniqora never creates a password for the customer.</div>
            </div>}

            {step===6&&<div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Summary icon={<Building2/>} label="Organisation" value={organisationName||"Not set"}/>
                <Summary icon={<Layers3/>} label="Tenant" value={tenantName||"Not set"}/>
                <Summary icon={<Boxes/>} label="Products" value={String(productKeys.length)}/>
                <Summary icon={<PlugZap/>} label="Services" value={String(serviceKeys.length)}/>
                <Summary icon={<Globe2/>} label="Domain" value={domain||"Later"}/>
                <Summary icon={<ShieldCheck/>} label="Blueprint" value={blueprint?.name??"Custom"}/>
              </div>
              <div className="rounded-xl border p-4 text-sm text-muted-foreground">Create organisation → tenant → attach SaaS products → resolve required add-ons/bundles → create billing ledger → branding/domain → owner membership → emit product lifecycle events.</div>
            </div>}

            {message&&<p className="mt-5 rounded-lg bg-muted p-3 text-sm">{message}{createdTenant&&<code className="mt-1 block break-all text-xs">{createdTenant}</code>}</p>}
            <div className="mt-7 flex justify-between border-t pt-4">
              <Button variant="ghost" disabled={step===0||creating} onClick={()=>setStep(Math.max(0,step-1))}>Back</Button>
              {step<factorySteps.length-1?<Button onClick={()=>setStep(step+1)}>Continue<ChevronRight className="ml-1 h-4 w-4"/></Button>:
                <Button disabled={creating||!!createdTenant} onClick={()=>void createTenant()}>{creating?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Sparkles className="mr-2 h-4 w-4"/>}{createdTenant?"Created":"Create tenant"}</Button>}
            </div>
          </section>
        </div>
      </TabsContent>

      <TabsContent value="manage">
        <section className="rounded-xl border bg-card p-6">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <Field label="Tenant ID" value={manageTenant} set={setManageTenant} placeholder="UUID"/>
            <Button onClick={()=>void loadTenant()} disabled={!manageTenant}><RefreshCw className="mr-2 h-4 w-4"/>Load</Button>
          </div>
        </section>
        {control&&<>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <Summary icon={<Layers3/>} label="Tenant" value={String(control.tenant?.["name"]??"—")}/>
            <Summary icon={<Building2/>} label="Organisation" value={String(control.organisation?.["name"]??"—")}/>
            <Summary icon={<Boxes/>} label="Products" value={String(control.products.length)}/>
            <Summary icon={<PlugZap/>} label="Active services" value={String(control.services.filter(s=>s.status==="active").length)}/>
          </div>
          <section className="mt-5 rounded-xl border bg-card p-6"><h2 className="font-semibold">Products</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{catalogue.products.map(p=>{
              const on=control.products.some(x=>x.key===p.key&&x.status!=="cancelled");
              return <article key={p.key} className={"rounded-xl border p-4 "+(on?"border-success/40 bg-success/5":"")}>
                <b>{p.name}</b><p className="text-xs text-muted-foreground">{p.category}</p>
                {on?<Button className="mt-3" size="sm" variant="outline" onClick={()=>{setSelectedProduct(p.key);hydrateBranding(control,p.key)}}>Branding</Button>:
                  <Button className="mt-3" size="sm" onClick={()=>void attachProduct(p.key)}><PackagePlus className="mr-1 h-3.5 w-3.5"/>Attach</Button>}
              </article>})}</div>
          </section>
          <section className="mt-5 rounded-xl border bg-card p-6"><h2 className="font-semibold">Services & bundles</h2>
            <div className="mt-5 space-y-6">{groups.map(([category,services])=><div key={category}><h3 className="mb-3 text-xs font-bold uppercase text-muted-foreground">{category}</h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{services.map(s=>{
                const on=control.services.some(x=>x.key===s.key&&x.status==="active");
                return <article key={s.key} className={"rounded-xl border p-4 "+(on?"border-primary bg-primary text-primary-foreground":"")}>
                  <b>{s.name}</b><p className={"mt-1 text-xs "+(on?"opacity-75":"text-muted-foreground")}>{s.description}</p>
                  <Button className="mt-3" size="sm" variant={on?"secondary":"default"} onClick={()=>void changeService(s.key,!on)}>{on?"Disable":"Enable"}</Button>
                </article>})}</div></div>)}</div>
          </section>
          {selectedProduct&&<section className="mt-5 rounded-xl border bg-card p-6"><div className="flex items-center gap-2"><Palette className="h-4 w-4"/><h2 className="font-semibold">Branding · {selectedProduct}</h2></div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Display name" value={manageBrandName} set={setManageBrandName}/><Field label="Logo URL" value={manageLogo} set={setManageLogo}/>
              <Field label="Domain" value={manageDomain} set={setManageDomain}/><Colour label="Primary" value={managePrimary} set={setManagePrimary}/><Colour label="Accent" value={manageAccent} set={setManageAccent}/>
            </div><Button className="mt-4" onClick={()=>void updateBranding()}>Save branding</Button>
          </section>}
        </>}
      </TabsContent>

      <TabsContent value="requests">
        <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
          <section className="rounded-xl border bg-card p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Open tenant requests</h2><Button size="sm" variant="outline" onClick={()=>void refreshRequests()}><RefreshCw className="mr-1 h-3.5 w-3.5"/>Refresh</Button></div>
            <div className="mt-4 space-y-2">{requests.map(r=><button key={r.id} onClick={()=>{setSelectedRequest(r);setQuote(r.quoted_amount_pence==null?"":String(r.quoted_amount_pence/100));setNotes(r.landlord_notes??"")}}
              className={"w-full rounded-xl border p-4 text-left "+(selectedRequest?.id===r.id?"border-primary bg-primary/5":"")}>
              <div className="flex justify-between gap-2"><div><b>{r.target_key}</b><p className="text-xs text-muted-foreground">{requestTenants[r.tenant_id]??r.tenant_id} · {r.change_type.replaceAll("_"," ")}</p></div><Badge variant="outline">{r.status.replaceAll("_"," ")}</Badge></div>
            </button>)}{!requests.length&&<p className="rounded-xl border border-dashed p-7 text-center text-sm text-muted-foreground">No open requests.</p>}</div>
          </section>
          <section className="h-fit rounded-xl border bg-card p-5"><h2 className="font-semibold">Commercial decision</h2>
            {selectedRequest?<><p className="mt-2 text-sm">{selectedRequest.target_key}</p><div className="mt-4 space-y-4"><Field label="Quote (£)" value={quote} set={setQuote}/><label><Label>Notes</Label><Textarea className="mt-1" value={notes} onChange={e=>setNotes(e.target.value)}/></label></div>
              <div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" onClick={()=>void decideRequest("awaiting_payment")}>Await payment</Button><Button variant="outline" onClick={()=>void decideRequest("approved")}>Approve</Button><Button onClick={()=>void decideRequest("completed")}>Provision</Button><Button variant="destructive" onClick={()=>void decideRequest("rejected")}>Reject</Button></div></>:<p className="mt-2 text-sm text-muted-foreground">Select a request.</p>}
          </section>
        </div>
      </TabsContent>

      <TabsContent value="catalogue">
        <section className="rounded-xl border bg-card p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Shared capability catalogue</h2><p className="text-sm text-muted-foreground">{catalogue.products.length} products · {catalogue.services.length} services · {catalogue.blueprints.length} blueprints</p></div><Button variant="outline" onClick={()=>void refreshCatalogue()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button></div>
          <div className="mt-6 space-y-7">{groups.map(([category,services])=><div key={category}><h3 className="mb-3 font-semibold">{category}</h3><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{services.map(s=><article key={s.key} className="rounded-xl border p-4"><div className="flex justify-between gap-2"><b>{s.name}</b>{s.kind==="bundle"&&<Badge>Bundle</Badge>}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">{s.description}</p><code className="mt-3 block text-[10px] text-muted-foreground">{s.key}</code></article>)}</div></div>)}</div>
        </section>
      </TabsContent>
    </Tabs>
  </AppShell>;
}

function Field({label,value,set,placeholder,type="text"}:{label:string;value:string;set:(value:string)=>void;placeholder?:string;type?:string}){
 return <label><Label>{label}</Label><Input className="mt-1" type={type} value={value} placeholder={placeholder} onChange={e=>set(e.target.value)}/></label>
}
function Colour({label,value,set}:{label:string;value:string;set:(value:string)=>void}){
 return <label><Label>{label}</Label><div className="mt-1 flex gap-2"><Input className="w-14 p-1" type="color" value={value} onChange={e=>set(e.target.value)}/><Input value={value} onChange={e=>set(e.target.value)}/></div></label>
}
function Summary({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){
 return <div className="rounded-xl border bg-card p-4"><div className="text-muted-foreground">{icon}</div><p className="mt-2 text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate font-semibold">{value}</p></div>
}
