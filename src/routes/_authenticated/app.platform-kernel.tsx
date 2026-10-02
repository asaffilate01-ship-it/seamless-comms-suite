import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AppShell, StatusBadge } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/hooks/useTenant";
import {
  getControlPlaneCatalogue,
  getTenantControlPlane,
  listPlatformTenants,
} from "@/lib/control-plane.functions";
import {
  createServiceCredential,
  getPlatformKernelCatalogue,
  getTenantProductKernel,
  setTenantDataRoute,
  setTenantProductRuntime,
  upsertProviderBinding,
} from "@/modules/platform/kernel.functions";
import { Cpu, Globe2, KeyRound, Network, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/platform-kernel")({
  component: PlatformKernel,
  head: () => ({
    meta: [
      { title: "Platform Kernel — Omniqora" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function PlatformKernel() {
  const current = useTenant();
  const catalogueFn = useServerFn(getControlPlaneCatalogue);
  const tenantsFn = useServerFn(listPlatformTenants);
  const tenantFn = useServerFn(getTenantControlPlane);
  const kernelCatalogueFn = useServerFn(getPlatformKernelCatalogue);
  const kernelFn = useServerFn(getTenantProductKernel);
  const setRuntimeFn = useServerFn(setTenantProductRuntime);
  const setRouteFn = useServerFn(setTenantDataRoute);
  const saveBindingFn = useServerFn(upsertProviderBinding);
  const credentialFn = useServerFn(createServiceCredential);

  const catalogue = useQuery({ queryKey:["cp-catalogue-kernel"], queryFn:()=>catalogueFn(), retry:false });
  const isPlatformAdmin = !!catalogue.data?.isPlatformAdmin;
  const tenants = useQuery({
    queryKey:["kernel-tenants",isPlatformAdmin],
    queryFn:()=>tenantsFn(),
    enabled:isPlatformAdmin,
    retry:false,
  });
  const kernelCatalogue = useQuery({
    queryKey:["platform-kernel-catalogue"],
    queryFn:()=>kernelCatalogueFn(),
    retry:false,
  });

  const [tenantId,setTenantId]=useState("");
  useEffect(()=>{
    if(tenantId)return;
    if(current.tenantId)setTenantId(current.tenantId);
    else if(tenants.data?.[0]?.id)setTenantId(tenants.data[0].id);
  },[tenantId,current.tenantId,tenants.data]);

  const tenant = useQuery({
    queryKey:["kernel-tenant",tenantId],
    queryFn:()=>tenantFn({data:{tenantId}}),
    enabled:!!tenantId,
    retry:false,
  });
  const productKeys=useMemo(()=>tenant.data?.products?.map((p)=>p.product_key)??[],[tenant.data?.products]);
  const [selectedProduct,setSelectedProduct]=useState("");
  useEffect(()=>{
    if(productKeys.includes(selectedProduct))return;
    setSelectedProduct(productKeys[0]??"");
  },[productKeys,selectedProduct]);

  const kernel=useQuery({
    queryKey:["tenant-product-kernel",tenantId,selectedProduct],
    queryFn:()=>kernelFn({data:{tenantId,productKey:selectedProduct}}),
    enabled:!!tenantId&&!!selectedProduct,
    retry:false,
  });

  const [regionKey,setRegionKey]=useState("gb");
  const [locale,setLocale]=useState("en-GB");
  const [routingMode,setRoutingMode]=useState<"shared"|"regional"|"dedicated"|"external">("external");
  const [dataRegion,setDataRegion]=useState("eu");
  const [connectionRef,setConnectionRef]=useState("");
  const [providerKey,setProviderKey]=useState("communications.meta-whatsapp");
  const [secretRefs,setSecretRefs]=useState("{}");
  const [providerConfig,setProviderConfig]=useState("{}");
  const [serviceToken,setServiceToken]=useState("");

  useEffect(()=>{
    const p=kernel.data?.product;
    if(p?.region_key)setRegionKey(p.region_key);
    if(p?.locale)setLocale(p.locale);
    const route=kernel.data?.dataRoute;
    if(route?.routing_mode)setRoutingMode(route.routing_mode);
    if(route?.data_region)setDataRegion(route.data_region);
    if(route?.connection_ref)setConnectionRef(route.connection_ref);
  },[kernel.data]);

  const regions=kernelCatalogue.data?.regions??[];
  const region=regions.find((r:any)=>r.region_key===regionKey);
  const allowedLocales=(kernelCatalogue.data?.locales??[]).filter((l:any)=>
    !region?.supported_locales?.length || region.supported_locales.includes(l.locale)
  );
  const readiness=(kernel.data?.readiness??{}) as {ready?:boolean;blockers?:string[];warnings?:string[]};
  const serviceCapabilities=selectedProduct==="dishbee"
    ?["orders.consume","orders.ack","events.write","usage.write","crm.write"]
    :["events.write","usage.write"];

  async function refresh(){await Promise.all([tenant.refetch(),kernel.refetch(),kernelCatalogue.refetch()]);}

  return <AppShell
    title="Platform Kernel"
    subtitle="Region, provider, service identity, data-plane and launch-readiness controls for each tenant product."
    actions={<Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>}
  >
    <div className="space-y-6">
      <Card><CardContent className="grid gap-3 p-5 md:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Tenant</label>
          {isPlatformAdmin?<select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={tenantId} onChange={e=>setTenantId(e.target.value)}>
            {(tenants.data??[]).map(t=><option key={t.id} value={t.id}>{t.organisationName} · {t.name}</option>)}
          </select>:<div className="mt-1 rounded-md border p-2 text-sm">{current.name??"Workspace"}</div>}
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Product</label>
          <select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedProduct} onChange={e=>setSelectedProduct(e.target.value)}>
            {productKeys.map(key=><option key={key} value={key}>{key}</option>)}
          </select>
        </div>
      </CardContent></Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric icon={ShieldCheck} label="Readiness" value={readiness.ready?"Ready":"Blocked"} />
        <Metric icon={Globe2} label="Region" value={kernel.data?.product?.region_key??"—"} />
        <Metric icon={Network} label="Data route" value={kernel.data?.dataRoute?.routing_mode??"Not set"} />
        <Metric icon={Cpu} label="Providers" value={String(kernel.data?.bindings?.length??0)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardContent className="p-5">
          <h2 className="font-semibold">Runtime region & locale</h2>
          <p className="mt-1 text-xs text-muted-foreground">Country variants are configuration, not cloned SaaS repositories.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={regionKey} onChange={e=>setRegionKey(e.target.value)}>
              {regions.map((r:any)=><option key={r.region_key} value={r.region_key}>{r.name}</option>)}
            </select>
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={locale} onChange={e=>setLocale(e.target.value)}>
              {allowedLocales.map((l:any)=><option key={l.locale} value={l.locale}>{l.locale}</option>)}
            </select>
          </div>
          <Button className="mt-3" disabled={!tenantId||!selectedProduct} onClick={async()=>{
            try{
              await setRuntimeFn({data:{tenantId,productKey:selectedProduct,regionKey,locale,runtimeConfig:{}}});
              toast.success("Runtime region updated");await refresh();
            }catch(e){toast.error(e instanceof Error?e.message:"Runtime update failed");}
          }}>Save runtime</Button>
        </CardContent></Card>

        <Card><CardContent className="p-5">
          <h2 className="font-semibold">Data-plane route</h2>
          <p className="mt-1 text-xs text-muted-foreground">Vertical data can remain in its existing database while Omniqora is the control plane.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={routingMode} onChange={e=>setRoutingMode(e.target.value as typeof routingMode)}>
              {["shared","regional","dedicated","external"].map(x=><option key={x}>{x}</option>)}
            </select>
            <Input value={dataRegion} onChange={e=>setDataRegion(e.target.value)} placeholder="eu"/>
          </div>
          <Input className="mt-3" value={connectionRef} onChange={e=>setConnectionRef(e.target.value)} placeholder="Secret/vault connection reference — never a password"/>
          <Button className="mt-3" onClick={async()=>{
            try{
              await setRouteFn({data:{tenantId,productKey:selectedProduct,routingMode,dataRegion,connectionRef:connectionRef||null,config:{}}});
              toast.success("Data route saved");await kernel.refetch();
            }catch(e){toast.error(e instanceof Error?e.message:"Data route failed");}
          }}>Save data route</Button>
        </CardContent></Card>
      </div>

      <Card><CardContent className="p-5">
        <h2 className="font-semibold">Launch readiness</h2>
        <p className="mt-1 text-sm">{readiness.ready?"All current blocking checks pass.":"The product cannot be treated as launch-ready yet."}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(readiness.blockers??[]).map(x=><Badge key={x} variant="destructive">{x}</Badge>)}
          {(readiness.warnings??[]).map(x=><Badge key={x} variant="outline">{x}</Badge>)}
          {readiness.ready&&!(readiness.warnings??[]).length&&<Badge variant="outline">No blockers or warnings</Badge>}
        </div>
      </CardContent></Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardContent className="p-5">
          <h2 className="font-semibold">Provider bindings</h2>
          <p className="mt-1 text-xs text-muted-foreground">Store secret references only, such as vault:// or deployment secret names. Do not paste provider secrets here.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={providerKey} onChange={e=>setProviderKey(e.target.value)}>
              {(kernelCatalogue.data?.providers??[]).map((p:any)=><option key={p.provider_key} value={p.provider_key}>{p.name} · {p.implementation_status}</option>)}
            </select>
            <Input value={selectedProduct} disabled/>
          </div>
          <Textarea className="mt-3" value={secretRefs} onChange={e=>setSecretRefs(e.target.value)} placeholder='{"api_key":"vault://path"}'/>
          <Textarea className="mt-3" value={providerConfig} onChange={e=>setProviderConfig(e.target.value)} placeholder='{"merchant_account":"..."}'/>
          <Button className="mt-3" onClick={async()=>{
            try{
              const refs=JSON.parse(secretRefs);const config=JSON.parse(providerConfig);
              await saveBindingFn({data:{tenantId,productKey:selectedProduct,providerKey,brandId:null,locationId:null,environment:"production",secretRefs:refs,config}});
              toast.success("Provider binding saved as configured");await kernel.refetch();
            }catch(e){toast.error(e instanceof Error?e.message:"Provider binding failed");}
          }}>Save provider binding</Button>
          <div className="mt-4 space-y-2">
            {(kernel.data?.bindings??[]).map((b:any)=><div key={b.id} className="flex items-center justify-between rounded-lg bg-muted p-3 text-sm">
              <div><b>{b.provider_key}</b><p className="text-xs text-muted-foreground">{b.environment} · last verified {b.last_verified_at?new Date(b.last_verified_at).toLocaleString():"never"}</p></div>
              <StatusBadge status={b.status}/>
            </div>)}
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-5">
          <h2 className="font-semibold">Product service credential</h2>
          <p className="mt-1 text-xs text-muted-foreground">Generate a scoped machine credential. Dishbee receives paid-order consume/ack plus event and usage scopes; other products default to event and usage reporting. The complete token is shown once.</p>
          <div className="mt-3 flex flex-wrap gap-2">{serviceCapabilities.map(capability=><Badge key={capability} variant="outline">{capability}</Badge>)}</div>
          <Button className="mt-4" disabled={!isPlatformAdmin||!tenantId||!selectedProduct} onClick={async()=>{
            try{
              const result=await credentialFn({data:{scopes:[{tenantId,productKey:selectedProduct,capabilities:serviceCapabilities}],validDays:365}});
              setServiceToken(result.token);toast.success("Service credential generated");
            }catch(e){toast.error(e instanceof Error?e.message:"Credential generation failed");}
          }}><KeyRound className="mr-2 h-4 w-4"/>Generate credential</Button>
          {serviceToken&&<div className="mt-4 rounded-lg border p-3">
            <p className="text-xs font-medium">Copy now into the product's server-side secret store.</p>
            <code className="mt-2 block break-all rounded bg-muted p-2 text-xs">{serviceToken}</code>
            <Button className="mt-2" size="sm" variant="outline" onClick={()=>navigator.clipboard?.writeText(serviceToken)}>Copy token</Button>
          </div>}
        </CardContent></Card>
      </div>
    </div>
  </AppShell>;
}

function Metric({icon:Icon,label,value}:{icon:typeof Cpu;label:string;value:string}){
  return <Card><CardContent className="p-5"><div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4"/></div><div className="mt-2 truncate font-display text-xl font-semibold">{value}</div></CardContent></Card>;
}
