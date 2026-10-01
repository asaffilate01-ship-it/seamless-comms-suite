import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app/shell";
import { ProductWorkspacePicker, useProductWorkspace } from "@/hooks/useProductWorkspace";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getMarketplaceGovernance,
  listMarketplaceListings,
  listMarketplaceOrders,
  listMarketplaceVendors,
} from "@/modules/marketplace/functions";
import { Banknote, Gavel, PackageSearch, ShoppingCart, Star, Store } from "lucide-react";

export const Route=createFileRoute("/_authenticated/app/marketplace")({
  head:()=>({meta:[
    {title:"Marketplace Ops — Omniqora"},
    {name:"description",content:"Reusable Syndriva marketplace operations for vendors, listings, orders, commissions, reviews and disputes."},
    {name:"robots",content:"noindex"},
  ]}),
  component:MarketplaceWorkspace,
});

function MarketplaceWorkspace(){
  const workspace=useProductWorkspace();
  const selected=workspace.selected;
  const scope=selected?{tenantId:selected.tenant_id,tenantProductId:selected.id}:null;
  const enabled=!!scope&&selected!.moduleKeys.includes("marketplace.core");

  const vendorsFn=useServerFn(listMarketplaceVendors);
  const listingsFn=useServerFn(listMarketplaceListings);
  const ordersFn=useServerFn(listMarketplaceOrders);
  const governanceFn=useServerFn(getMarketplaceGovernance);

  const vendors=useQuery({queryKey:["marketplace-vendors",selected?.id],enabled,queryFn:()=>vendorsFn({data:scope!}),retry:false});
  const listings=useQuery({queryKey:["marketplace-listings",selected?.id],enabled,queryFn:()=>listingsFn({data:scope!}),retry:false});
  const orders=useQuery({queryKey:["marketplace-orders",selected?.id],enabled,queryFn:()=>ordersFn({data:scope!}),retry:false});
  const governance=useQuery({queryKey:["marketplace-governance",selected?.id],enabled,queryFn:()=>governanceFn({data:scope!}),retry:false});

  const vendorRows=(vendors.data??[]) as any[];
  const listingRows=(listings.data??[]) as any[];
  const orderRows=(orders.data??[]) as any[];
  const commissions=(governance.data?.commissions??[]) as any[];
  const reviews=(governance.data?.reviews??[]) as any[];
  const disputes=(governance.data?.disputes??[]) as any[];
  const completed=orderRows.filter((row)=>row.status==="completed").length;
  const gross=orderRows.reduce((sum,row)=>sum+Number(row.total_minor??0),0);
  const commissionTotal=commissions.reduce((sum,row)=>sum+Number(row.commission_minor??0),0);
  const avgRating=reviews.length?reviews.reduce((sum,row)=>sum+Number(row.rating??0),0)/reviews.length:null;

  return <AppShell
    title="Syndriva Marketplace Ops"
    subtitle="One marketplace core for products, services, bookings, rentals, consultations, delivery and B2B sourcing."
    actions={<ProductWorkspacePicker products={workspace.products} selectedId={workspace.selectedId} onChange={workspace.setSelectedId}/>}
  >
    {workspace.loading?<State text="Loading marketplace workspace…"/>:workspace.error?<State text={workspace.error} destructive/>:!selected?
      <State text="This tenant has no active Omniqora product binding. Provision one from the SaaS Factory first."/>:
      !enabled?<ModuleOff/>:
      <>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Metric icon={Store} label="Vendors" value={vendorRows.length}/>
          <Metric icon={PackageSearch} label="Listings" value={listingRows.length}/>
          <Metric icon={ShoppingCart} label="Orders" value={orderRows.length}/>
          <Metric icon={ShoppingCart} label="Completed" value={completed}/>
          <Metric icon={Banknote} label="Gross value" value={formatMoney(gross,orderRows[0]?.currency??"GBP")}/>
          <Metric icon={Star} label="Avg rating" value={avgRating===null?"—":avgRating.toFixed(1)}/>
        </div>

        <Tabs defaultValue="vendors" className="mt-6">
          <TabsList className="mb-6 flex h-auto flex-wrap justify-start">
            <TabsTrigger value="vendors">Vendors</TabsTrigger>
            <TabsTrigger value="listings">Listings</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="commercials">Commissions</TabsTrigger>
            <TabsTrigger value="trust">Reviews & disputes</TabsTrigger>
          </TabsList>

          <TabsContent value="vendors">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {vendorRows.map((row)=><Card key={row.id}><CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div><h3 className="font-semibold">{row.name}</h3><p className="text-xs text-muted-foreground">{row.country_code} · {row.currency}</p></div>
                  <Badge variant="outline">{row.status}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <Info label="Commission" value={row.commission_profile??"Default"}/>
                  <Info label="Payout" value={row.payout_profile??"Default"}/>
                </div>
              </CardContent></Card>)}
              {!vendorRows.length&&<EmptyCard text="No marketplace vendors yet."/>}
            </div>
          </TabsContent>

          <TabsContent value="listings">
            <Card className="overflow-hidden"><CardContent className="p-0">
              <Header title="Catalogue" subtitle="Tenant-scoped products, services, rentals, consultations and auctions."/>
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Listing</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Price</th><th className="px-5 py-3">Inventory</th><th className="px-5 py-3">Status</th></tr></thead>
                <tbody className="divide-y">{listingRows.map((row)=><tr key={row.id}><td className="px-5 py-3 font-medium">{row.title}</td><td className="px-5 py-3">{row.listing_type}</td><td className="px-5 py-3">{row.price_minor==null?"—":formatMoney(row.price_minor,row.currency)}</td><td className="px-5 py-3">{row.inventory_tracked?"Tracked":"—"}</td><td className="px-5 py-3"><Badge variant="outline">{row.status}</Badge></td></tr>)}{!listingRows.length&&<tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No listings yet.</td></tr>}</tbody>
              </table></div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="orders">
            <Card className="overflow-hidden"><CardContent className="p-0">
              <Header title="Orders" subtitle="Shared commercial lifecycle from payment through fulfilment, completion and refund."/>
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Order</th><th className="px-5 py-3">Buyer</th><th className="px-5 py-3">Items</th><th className="px-5 py-3">Total</th><th className="px-5 py-3">Status</th></tr></thead>
                <tbody className="divide-y">{orderRows.map((row)=><tr key={row.id}><td className="px-5 py-3 font-mono text-xs">{String(row.id).slice(0,8)}…</td><td className="px-5 py-3">{row.buyer_ref}</td><td className="px-5 py-3">{(row.items??[]).length}</td><td className="px-5 py-3">{formatMoney(row.total_minor,row.currency)}</td><td className="px-5 py-3"><Badge variant="outline">{row.status}</Badge></td></tr>)}{!orderRows.length&&<tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No orders yet.</td></tr>}</tbody>
              </table></div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="commercials">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card><CardContent className="p-5"><div className="text-xs uppercase tracking-wide text-muted-foreground">Calculated commission</div><div className="mt-2 font-display text-3xl font-semibold">{formatMoney(commissionTotal,orderRows[0]?.currency??"GBP")}</div></CardContent></Card>
              <Card className="lg:col-span-2"><CardContent className="p-0"><Header title="Commission ledger" subtitle="Order-level marketplace fee calculation and settlement state."/>
                <div className="divide-y">{commissions.slice(0,50).map((row)=><div key={row.id} className="grid gap-2 p-4 sm:grid-cols-4"><span className="font-mono text-xs">{String(row.order_id).slice(0,8)}…</span><span>{formatMoney(row.basis_minor,orderRows[0]?.currency??"GBP")}</span><span>{formatMoney(row.commission_minor,orderRows[0]?.currency??"GBP")}</span><Badge variant="outline" className="w-fit">{row.status}</Badge></div>)}{!commissions.length&&<p className="p-5 text-sm text-muted-foreground">No commission records yet.</p>}</div>
              </CardContent></Card>
            </div>
          </TabsContent>

          <TabsContent value="trust">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardContent className="p-0"><Header title="Reviews" subtitle="Marketplace reputation and moderation queue."/><div className="divide-y">{reviews.slice(0,50).map((row)=><div key={row.id} className="p-4"><div className="flex items-center justify-between"><span className="font-medium">{row.rating}/5</span><Badge variant="outline">{row.status}</Badge></div>{row.comment&&<p className="mt-2 text-sm text-muted-foreground">{row.comment}</p>}</div>)}{!reviews.length&&<p className="p-5 text-sm text-muted-foreground">No reviews yet.</p>}</div></CardContent></Card>
              <Card><CardContent className="p-0"><Header title="Disputes" subtitle="Open, investigate, resolve and close marketplace disputes."/><div className="divide-y">{disputes.slice(0,50).map((row)=><div key={row.id} className="p-4"><div className="flex items-center justify-between"><span className="font-medium">{row.reason}</span><Badge variant="outline">{row.status}</Badge></div>{row.resolution&&<p className="mt-2 text-sm text-muted-foreground">{row.resolution}</p>}</div>)}{!disputes.length&&<p className="p-5 text-sm text-muted-foreground">No disputes.</p>}</div></CardContent></Card>
            </div>
          </TabsContent>
        </Tabs>
      </>}
  </AppShell>;
}

function Metric({icon:Icon,label,value}:{icon:typeof Store;label:string;value:number|string}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary"/></div><div className="mt-2 font-display text-2xl font-semibold">{value}</div></CardContent></Card>;}
function Header({title,subtitle}:{title:string;subtitle:string}){return <div className="border-b px-5 py-4"><h3 className="font-semibold">{title}</h3><p className="text-xs text-muted-foreground">{subtitle}</p></div>;}
function Info({label,value}:{label:string;value:string}){return <div className="rounded-lg bg-surface-2 p-3"><div className="text-muted-foreground">{label}</div><div className="mt-1 font-medium">{value}</div></div>;}
function State({text,destructive=false}:{text:string;destructive?:boolean}){return <Card><CardContent className={`p-6 text-sm ${destructive?"text-destructive":"text-muted-foreground"}`}>{text}</CardContent></Card>;}
function ModuleOff(){return <Card className="border-dashed"><CardContent className="p-6"><h3 className="font-semibold">Marketplace Core is not enabled</h3><p className="mt-2 text-sm text-muted-foreground">Enable <code>marketplace.core</code> on this tenant product. Vendors remain restricted marketplace identities rather than full tenants by default.</p></CardContent></Card>;}
function EmptyCard({text}:{text:string}){return <Card className="md:col-span-2 xl:col-span-3"><CardContent className="p-6 text-sm text-muted-foreground">{text}</CardContent></Card>;}
function formatMoney(minor:number|string,currency:string){const value=Number(minor??0)/100;try{return new Intl.NumberFormat(undefined,{style:"currency",currency:currency||"GBP"}).format(value);}catch{return `${currency??""} ${value.toFixed(2)}`;}}
