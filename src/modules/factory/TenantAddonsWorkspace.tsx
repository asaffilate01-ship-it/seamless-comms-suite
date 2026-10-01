// @ts-nocheck
import {useEffect,useMemo,useState} from "react";
import {useServerFn} from "@tanstack/react-start";
import {AppShell} from "@/components/app/shell";
import {useTenant} from "@/hooks/useTenant";
import {getTenantAddons,requestTenantChange} from "@/lib/saas-factory.functions";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {Boxes,CheckCircle2,Loader2,Minus,Plus,Puzzle,RefreshCw,Search} from "lucide-react";

export function TenantAddonsWorkspace(){
  const{tenantId,loading:tenantLoading,error:tenantError}=useTenant();
  const load=useServerFn(getTenantAddons);
  const request=useServerFn(requestTenantChange);
  const[state,setState]=useState<any>({services:[],active:[],products:[],role:null});
  const[query,setQuery]=useState("");
  const[busy,setBusy]=useState(false);
  const[message,setMessage]=useState("");

  async function refresh(){
    if(!tenantId)return;
    setBusy(true);setMessage("");
    try{setState(await load({data:{tenantId}}))}
    catch(e){setMessage(e instanceof Error?e.message:"Unable to load products and add-ons")}
    finally{setBusy(false)}
  }
  useEffect(()=>{if(tenantId)void refresh()},[tenantId]);

  const active=new Map((state.active??[]).map((row:any)=>[row.service_key,row]));
  const groups=useMemo(()=>{
    const out=new Map<string,any[]>();
    for(const service of state.services??[]){
      const text=(service.name+" "+service.service_key+" "+(service.description??"")+" "+service.category).toLowerCase();
      if(query&&!text.includes(query.toLowerCase()))continue;
      out.set(service.category,[...(out.get(service.category)??[]),service]);
    }
    return [...out.entries()];
  },[state.services,query]);

  async function change(serviceKey:string,enabled:boolean){
    if(!tenantId)return;
    setBusy(true);setMessage("");
    try{
      const result=await request({data:{
        tenantId,changeType:enabled?"add_addon":"remove_addon",targetKey:serviceKey,
        metadata:{source:"tenant-addons",requestedAt:new Date().toISOString()},
      }});
      setMessage("Request submitted: "+result.requestId+". The service remains unchanged until it is approved and provisioned.");
    }catch(e){setMessage(e instanceof Error?e.message:"Unable to submit request")}
    finally{setBusy(false)}
  }

  if(tenantLoading)return <AppShell title="Products & add-ons" subtitle="Loading workspace…"><Loader2 className="h-6 w-6 animate-spin"/></AppShell>;
  if(tenantError)return <AppShell title="Products & add-ons"><p role="alert">{tenantError}</p></AppShell>;

  return <AppShell title="Products & add-ons" subtitle="Add Omniqora capabilities to this SaaS without changing code or creating another deployment."
    actions={<Button size="sm" variant="outline" onClick={()=>void refresh()} disabled={busy}><RefreshCw className={"mr-1 h-4 w-4 "+(busy?"animate-spin":"")}/>Refresh</Button>}>
    {state.products?.length>0&&<section className="mb-6 rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2"><Boxes className="h-4 w-4"/><h2 className="font-semibold">Active SaaS products</h2></div>
      <div className="mt-4 flex flex-wrap gap-2">{state.products.map((p:any)=><Badge key={p.product_key} className="px-3 py-1.5">{p.product_key} · {p.plan_key}</Badge>)}</div>
    </section>}

    <div className="mb-6 flex items-center rounded-xl border bg-card px-3"><Search className="h-4 w-4 text-muted-foreground"/><Input className="border-0 shadow-none focus-visible:ring-0" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search CRM, WhatsApp, audit, RAG, payroll, compliance…"/></div>

    <div className="space-y-8">{groups.map(([category,services])=><section key={category}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground"><Puzzle className="h-4 w-4"/>{category}</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{services.map((service:any)=>{
        const row=active.get(service.service_key) as any;
        const on=row?.status==="active";
        const price=row?.unit_amount_pence??service.default_unit_amount_pence;
        return <article key={service.service_key} className={"rounded-xl border bg-card p-4 "+(on?"border-success/40":"")}>
          <div className="flex items-start justify-between gap-3"><div><b>{service.name}</b><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{service.service_kind} · {service.billing_basis.replaceAll("_"," ")}</p></div>
            {on&&<Badge variant="outline" className="border-success/40 bg-success/10 text-success"><CheckCircle2 className="mr-1 h-3 w-3"/>Active</Badge>}
          </div>
          <p className="mt-3 min-h-14 text-xs leading-5 text-muted-foreground">{service.description}</p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-muted-foreground">{price?new Intl.NumberFormat("en-GB",{style:"currency",currency:service.currency||"GBP"}).format(price/100):"Included / price on plan"}</span>
            <Button size="sm" variant={on?"outline":"default"} disabled={busy||!["owner","admin"].includes(state.role)}
              onClick={()=>void change(service.service_key,!on)}>
              {on?<><Minus className="mr-1 h-3.5 w-3.5"/>Request removal</>:<><Plus className="mr-1 h-3.5 w-3.5"/>Request add-on</>}
            </Button>
          </div>
        </article>
      })}</div>
    </section>)}</div>
    {!["owner","admin"].includes(state.role)&&<p className="mt-6 rounded-xl bg-muted p-4 text-sm text-muted-foreground">Only tenant owners/admins can request commercial changes. Other members can view the active services.</p>}
    {message&&<p className="mt-6 rounded-xl bg-muted p-4 text-sm">{message}</p>}
  </AppShell>
}
