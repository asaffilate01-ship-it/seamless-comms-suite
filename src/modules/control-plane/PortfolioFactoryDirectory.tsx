import {useMemo,useState} from "react";
import {Building2,Boxes,Search,ShieldAlert,Store} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Card,CardContent} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";

type Product={
 productKey:string;displayName:string;sourceRows:number[];repositories:string[];
 editions:string[];lifecycle:string;tenantProvisioning:string;
};
type Tenant={
 sourceRow:number;tenantKey:string;displayName:string;productKey:string;
 blueprintKey:string;parentLandlord:string;blueprintState:string;country:string;
 aliases:string[];provisioning:string;
};
type Registry={
 sourceRowCount:number;products:Product[];tenants:Tenant[];
 brandGroups:{parentTenantKey:string;landlordProductKey:string;label:string;brands:string[];note:string}[];
 exclusions:string[];
};
type Props={registry?:Registry};
export default function PortfolioFactoryDirectory({registry}:Props){
 const [section,setSection]=useState<"tenants"|"products"|"brands">("tenants");
 const [search,setSearch]=useState("");
 const [onlyUnmapped,setOnlyUnmapped]=useState(false);
 const items=useMemo(()=>{
  if(!registry)return[];
  const list=section==="tenants"?
   registry.tenants.map(x=>({key:x.tenantKey,title:x.displayName,parent:x.parentLandlord,
    subtitle:x.blueprintKey+" · "+x.productKey,notice:x.blueprintState==="existing_blueprint"?"Template exists":"Draft template",source:x.sourceRow})):
  section==="brands"?
   registry.brandGroups.flatMap(g=>g.brands.map((brand,i)=>({key:g.parentTenantKey+"."+i,title:brand,parent:g.parentTenantKey,
    subtitle:g.label+" · food/retail brand, not a SaaS tenant",notice:"Brand",source:0}))):
   registry.products.map(x=>({key:x.productKey,title:x.displayName,parent:x.productKey,
    subtitle:x.repositories[0]??"Source audit required",notice:x.repositories.length===0?"Repository mapping missing":x.lifecycle==="established"?"Established source":"Catalogue candidate",source:x.sourceRows[0]}));
  const q=search.trim().toLowerCase();
  const scoped=section==="products"&&onlyUnmapped?list.filter(x=>x.notice==="Repository mapping missing"):list;
  return q?scoped.filter(x=>[x.key,x.title,x.parent,x.subtitle].some(s=>s.toLowerCase().includes(q))):scoped;
 },[registry,section,search,onlyUnmapped]);
 if(!registry)return null;
 const unmappedCount=registry.products.filter(x=>x.repositories.length===0).length;
 const inactivePresets=registry.tenants.filter(x=>x.provisioning!=="activated").length;
 return <Card>
  <CardContent className="space-y-4 p-5">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div><h2 className="flex items-center gap-2 text-lg font-semibold"><Boxes className="h-5 w-5"/> Omniqora SaaS Factory registry</h2>
     <p className="mt-1 text-sm text-muted-foreground">All historically inventoried products, canonical SaaS identities and tenant templates. Template registration never provisions a real customer.</p>
    </div>
    <Badge variant="outline">Source inventory · not live status</Badge>
   </div>
   <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
    <div className="rounded-lg border p-3"><div className="flex gap-2 text-xs text-muted-foreground"><Boxes className="h-4 w-4"/> Source records</div><strong className="text-2xl">{registry.sourceRowCount}</strong></div>
    <div className="rounded-lg border p-3"><div className="flex gap-2 text-xs text-muted-foreground"><Store className="h-4 w-4"/> Canonical product identities</div><strong className="text-2xl">{registry.products.length}</strong></div>
    <div className="rounded-lg border p-3"><div className="flex gap-2 text-xs text-muted-foreground"><Building2 className="h-4 w-4"/> Brand/operator tenant presets</div><strong className="text-2xl">{registry.tenants.length}</strong></div>
    <div className="rounded-lg border p-3"><div className="flex gap-2 text-xs text-muted-foreground"><ShieldAlert className="h-4 w-4"/> Missing repository mappings</div><strong className="text-2xl">{unmappedCount}</strong></div>
    <div className="rounded-lg border p-3"><div className="flex gap-2 text-xs text-muted-foreground"><Store className="h-4 w-4"/> Unactivated tenant presets</div><strong className="text-2xl">{inactivePresets}</strong></div>
   </div>
   <div className="flex flex-wrap gap-2">
    {([["tenants","Tenants"],["products","SaaS products"],["brands","Sub-brands"]] as const).map(([id,label])=>
     <Button key={id} size="sm" variant={section===id?"default":"outline"} onClick={()=>setSection(id)}>{label}</Button>)}
     {section==="products"&&<Button size="sm" aria-pressed={onlyUnmapped} variant={onlyUnmapped?"default":"outline"} onClick={()=>setOnlyUnmapped(value=>!value)}>Only unmapped ({unmappedCount})</Button>}
   </div>
   <div className="flex items-center gap-2"><Search className="h-4 w-4 text-muted-foreground"/><Input aria-label="Search the SaaS Factory directory" placeholder="Search MoneyBridge, courier, Kalëthon, Café 1, XpertJobs…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
   <div className="max-h-[520px] divide-y overflow-y-auto rounded-lg border">
    {items.map(x=><div key={x.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm">
     <div className="min-w-0"><div className="font-semibold">{x.title}</div>
      <div className="mt-1 break-words text-xs text-muted-foreground">{x.parent} · {x.subtitle}</div>
     </div>
     <div className="flex gap-2 items-center"><Badge variant="outline">{x.notice}</Badge>{x.source>0&&<span className="text-xs text-muted-foreground">#{x.source}</span>}</div>
    </div>)}
    {!items.length&&<p className="p-4 text-sm text-muted-foreground">No matching products, tenants or brands.</p>}
   </div>
   <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground"><ShieldAlert className="h-4 w-4 shrink-0"/>
    <span>Source inventory and repository mappings are not runtime checks. Catalogued ≠ built, integrated, authorised or live. MoneyBridge and FastRemit share one system identity. Sofevella / historical Sofellea remains a spelling-review item. Tenant templates require separate operator-approved provisioning, source linking and compliance checks.</span>
   </div>
  </CardContent>
 </Card>;
}
