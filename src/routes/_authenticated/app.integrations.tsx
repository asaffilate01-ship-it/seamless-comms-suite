import {createFileRoute} from '@tanstack/react-router';
import {useServerFn} from '@tanstack/react-start';
import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import {AppShell} from '@/components/app/shell';
import {useTenant} from '@/hooks/useTenant';
import catalogue from '@/modules/ecosystem/catalogue.json';
import {getBridgeStatus} from '@/modules/ecosystem/ecosystem.functions';
import {Input} from '@/components/ui/input';

export const Route=createFileRoute('/_authenticated/app/integrations')({component:Integrations,
  head:()=>({meta:[{title:'Product connections — Omniqora'},{name:'robots',content:'noindex'}]})});
function Integrations(){
 const {tenantId,loading,error}=useTenant(); const [search,setSearch]=useState(''); const request=useServerFn(getBridgeStatus);
 const connections=useQuery({queryKey:['bridges',tenantId],enabled:!!tenantId,queryFn:()=>request({data:{tenantId:tenantId!}}),retry:false});
 const products=catalogue.filter(p=>(p.name+' '+p.product+' '+p.profile).toLowerCase().includes(search.toLowerCase()));
 return <AppShell title="Product connections" subtitle="Connect an authorised business, product and source collection to Omniqora.">
  <section className="mb-8 rounded-xl border p-6"><h2 className="text-lg font-semibold">This workspace</h2>
   <p className="mt-2 text-sm text-muted-foreground">Business360 can run independently or inside Omniqora. Product bridges return private drafts and observations for review in the source app. Access to one product never grants access to another tenant.</p>
   {loading?<p role="status">Loading workspace…</p>:error?<p role="alert">{error}</p>:connections.isPending?<p role="status">Checking connections…</p>:connections.error?<p role="alert" className="mt-4">{connections.error.message}</p>:connections.data?.length?
    <ul className="mt-4 space-y-3">{connections.data.map(c=><li key={c.id} className="rounded-lg bg-muted p-4"><b>{c.product} · {c.id}</b><p className="text-sm">{c.status}</p><p className="text-xs text-muted-foreground">Source workspace: {c.externalTenant} · Contracts: {c.contracts.join(', ')}</p></li>)}</ul>:
    <p className="mt-4 rounded-lg bg-muted p-4">No product connections have been configured for this workspace. Your administrator can arrange a connection using the product, source workspace and permitted records.</p>}
  </section>
  <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">Product and tenant deployment registry</h2><p className="text-sm text-muted-foreground">{catalogue.length} recovered or added deployment records. Source readiness does not confirm an active service.</p></div><Input aria-label="Search products" placeholder="Search product or industry" value={search} onChange={e=>setSearch(e.target.value)} className="max-w-xs"/></div>
  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{products.map(p=><article key={p.id} className="rounded-xl border p-5"><h3 className="font-semibold">{p.name}</h3><p className="my-2 text-xs font-medium text-primary">{p.status.replaceAll('-',' ')}</p><p className="text-sm text-muted-foreground">{p.boundary}</p></article>)}</div>
  {!products.length&&<p>No matching products.</p>}
 </AppShell>;
}
