import { createFileRoute } from "@tanstack/react-router";
import { useMemo,useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell,StatusBadge } from "@/components/app/shell";
import { Card,CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs,TabsContent,TabsList,TabsTrigger } from "@/components/ui/tabs";
import { useTenant } from "@/hooks/useTenant";
import {
  approveNetworkTerritoryVersion,calculateNetworkTerritory,createAcquisitionCampaign,createGrowthContentItem,getNetworkExpansionWorkspace,
  saveManagementAgreement,saveTerritoryDesign,seedMealDeckNetwork,updateNetworkApplication,updateNetworkTerritory
} from "@/modules/network-expansion/functions";
import { BadgePoundSterling,BarChart3,Building2,MapPinned,Megaphone,Plus,RefreshCw,Users } from "lucide-react";
import { toast } from "sonner";

export const Route=createFileRoute("/_authenticated/app/franchise-sales")({
 component:FranchiseSales,
 head:()=>({meta:[{title:"Franchise Sales — Omniqora"},{name:"robots",content:"noindex"}]})
});

const stages=["new","qualifying","qualified","discovery","due_diligence","agreement","fee_due","paid","onboarding","training","launch_ready","live","declined","withdrawn"] as const;
const territoryStatuses=["available","coming_soon","held","reserved","taken","onboarding","operating","paused","retired"] as const;
const contentTypes=["landing_page","seo_page","blog","video","short_video","social_post","ad","email","whatsapp","sms","directory_listing","pr","event","outdoor","vehicle_wrap","leaflet","creative"] as const;

function FranchiseSales(){
 const tenant=useTenant();const tenantId=tenant.tenantId??"";const qc=useQueryClient();
 const getFn=useServerFn(getNetworkExpansionWorkspace),seedFn=useServerFn(seedMealDeckNetwork),territoryFn=useServerFn(updateNetworkTerritory);
 const applicationFn=useServerFn(updateNetworkApplication),campaignFn=useServerFn(createAcquisitionCampaign),contentFn=useServerFn(createGrowthContentItem);
 const designFn=useServerFn(saveTerritoryDesign),calculateFn=useServerFn(calculateNetworkTerritory),approveFn=useServerFn(approveNetworkTerritoryVersion);
 const agreementFn=useServerFn(saveManagementAgreement);
 const q=useQuery({queryKey:["network-expansion",tenantId],queryFn:()=>getFn({data:{tenantId}}),enabled:!!tenantId&&!tenant.loading,retry:false});
 const programme=(q.data?.programmes??[])[0] as any;
 const terms=programme?.current_terms;
 const territories=(q.data?.territories??[]) as any[],applications=(q.data?.applications??[]) as any[],channels=(q.data?.channels??[]) as any[];
 const campaigns=(q.data?.campaigns??[]) as any[],content=(q.data?.content??[]) as any[];
 const managementAgreements=(q.data?.managementAgreements??[]) as any[],territoryDesigns=(q.data?.territoryDesigns??[]) as any[],territoryVersions=(q.data?.territoryVersions??[]) as any[];
 const demographicCells=Number(q.data?.demographicCells??0);
 const[search,setSearch]=useState(""),[region,setRegion]=useState("all"),[busy,setBusy]=useState("");
 const[campaign,setCampaign]=useState({name:"",channel:"seo",budget:"",territory:""});
 const[item,setItem]=useState({title:"",channel:"seo",type:"seo_page",territory:""});
 const[design,setDesign]=useState({territoryId:"",postcode:"",lat:"",lng:"",core:"25",shared:"30",overflow:"35",popMin:"150000",popMax:"250000",radius:"15"});
 const[managed,setManaged]=useState({territoryId:"",provider:"MealDeck Operations",profitShare:"20",minimum:"0"});
 const regions=useMemo(()=>Array.from(new Set(territories.map(t=>t.region))).sort(),[territories]);
 const filtered=territories.filter(t=>(region==="all"||t.region===region)&&(!search||String(t.name).toLowerCase().includes(search.toLowerCase())||String(t.territory_code).toLowerCase().includes(search.toLowerCase())));
 const available=territories.filter(t=>t.status==="available"&&t.is_sellable).length;
 const taken=territories.filter(t=>["taken","reserved","operating","onboarding"].includes(t.status)).length;
 const coming=territories.filter(t=>t.status==="coming_soon").length;
 const activeApps=applications.filter(a=>!["live","declined","withdrawn"].includes(a.stage)).length;
 const signed=applications.filter(a=>["paid","onboarding","training","launch_ready","live"].includes(a.stage)).length;

 async function run(key:string,fn:()=>Promise<unknown>,message:string){try{setBusy(key);await fn();await qc.invalidateQueries({queryKey:["network-expansion",tenantId]});toast.success(message);}catch(e){toast.error(e instanceof Error?e.message:String(e));}finally{setBusy("");}}
 const money=(minor:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(minor??0)/100);

 if(tenant.loading)return <AppShell title="Franchise Sales"><p className="text-sm text-muted-foreground">Loading workspace…</p></AppShell>;
 if(q.error)return <AppShell title="Franchise Sales"><Card><CardContent className="p-6"><p className="text-sm text-destructive">{q.error instanceof Error?q.error.message:"Franchise Sales unavailable"}</p></CardContent></Card></AppShell>;

 return <AppShell title="Franchise Sales" subtitle="Reusable territory sales, recruitment, growth and launch control for franchise, dealer, agency and operator networks."
  actions={<div className="flex gap-2">{!programme&&<Button onClick={()=>run("seed",()=>seedFn({data:{tenantId}}),"MealDeck network seeded")} disabled={busy==="seed"}>Seed MealDeck 150</Button>}<Button variant="outline" onClick={()=>q.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button></div>}>
  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
   <Metric icon={MapPinned} label="Territories" value={territories.length}/><Metric icon={MapPinned} label="Available" value={available}/>
   <Metric icon={Building2} label="Taken / committed" value={taken}/><Metric icon={Building2} label="Coming soon" value={coming}/>
   <Metric icon={Users} label="Active applicants" value={activeApps}/><Metric icon={BadgePoundSterling} label="Signed / onboarding" value={signed}/>
  </div>

  {programme&&<Card className="mt-6"><CardContent className="p-5">
   <div className="flex flex-wrap items-start justify-between gap-4">
    <div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Active programme</p><h2 className="mt-1 font-display text-xl font-semibold">{programme.name}</h2><p className="mt-1 text-sm text-muted-foreground">{programme.offer?.positioning??"One kitchen. 15+ brands. One technology platform. One protected territory."}</p></div>
    <div className="flex flex-wrap gap-2">
     <Badge variant="outline">Royalty: {terms?.royaltyStatus==="quote_required"||programme.royalty_bps==null?"To be confirmed in written quote":`${Number(programme.royalty_bps)/100}%`}</Badge>
     <Badge variant="outline">{Number(programme.marketing_bps)/100}% marketing</Badge>
     {terms?.franchiseFeeVersion==="2026-10-06-r2"?<>
      <Badge variant="outline">{money(terms.techFeePerMonth*100)} / month tech</Badge>
      <Badge variant="outline">{money(terms.accountancyFeePerMonth*100)} / month accounts</Badge>
      <Badge variant="outline">Bought-in supplies at cost</Badge>
      <Badge variant="outline">Manufactured supplies: full production cost + {terms.manufacturedSupplyMarkupPercent}%</Badge>
     </>:<>
      <Badge variant="outline">{new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(Number(programme.tech_fee_minor_per_order)/100)} / order tech</Badge>
      <Badge variant="outline">{Number(programme.supply_markup_bps)/100}% supply markup</Badge>
     </>}
    </div>
   </div>
   {terms?.franchiseFeeVersion==="2026-10-06-r2"&&<p className="mt-4 text-sm text-muted-foreground">Base franchise fees are reduced by 50% for each location. Allow approximately {money(terms.equipmentOpeningSuppliesEstimate*100)} per location for equipment, opening packaging and supplies, plus the base fee and other quoted startup costs. The royalty and final scope require a written quote. Existing signed fee schedules retain their agreed terms.</p>}
   {!!programme.offer?.featuredMarkets?.length&&<div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{programme.offer.featuredMarkets.map((m:any)=><div key={m.name} className="rounded-lg bg-muted p-3"><b className="text-sm">{m.name}</b><div className="mt-1"><StatusBadge status={m.status}/></div>{m.note&&<p className="mt-1 text-xs text-muted-foreground">{m.note}</p>}</div>)}</div>}
  </CardContent></Card>}

  <Tabs defaultValue="territories" className="mt-6">
   <TabsList className="mb-5 flex h-auto flex-wrap justify-start">
    <TabsTrigger value="territories">Territories</TabsTrigger><TabsTrigger value="applications">Applications</TabsTrigger>
    <TabsTrigger value="territory-engine">Territory engine</TabsTrigger><TabsTrigger value="managed">Managed investors</TabsTrigger>
    <TabsTrigger value="acquisition">Acquisition</TabsTrigger><TabsTrigger value="content">Content & media</TabsTrigger>
   </TabsList>

   <TabsContent value="territories">
    <div className="mb-4 flex flex-wrap gap-2"><Input className="max-w-sm" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search territory…"/><select className="h-10 rounded-md border bg-background px-3 text-sm" value={region} onChange={e=>setRegion(e.target.value)}><option value="all">All regions</option>{regions.map(r=><option key={r} value={r}>{r}</option>)}</select></div>
    <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[880px] text-sm"><thead className="bg-surface-2 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Territory</th><th>Region</th><th>Fee</th><th>Status</th><th>Sellable</th><th>TVI</th><th className="pr-4">Public note</th></tr></thead><tbody className="divide-y">
     {filtered.map(t=><tr key={t.id}><td className="px-4 py-3"><b>{t.name}</b><p className="text-xs text-muted-foreground">{t.territory_code}</p></td><td>{t.region}</td><td>{t.fee_minor==null?"To be confirmed in written quote":money(t.fee_minor)}</td><td><select className="h-8 rounded border bg-background px-2 text-xs" value={t.status} onChange={e=>run("territory:"+t.id,()=>territoryFn({data:{tenantId,territoryId:t.id,status:e.target.value as any}}),"Territory status updated")}>{territoryStatuses.map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select></td><td><input type="checkbox" checked={!!t.is_sellable} onChange={e=>run("sell:"+t.id,()=>territoryFn({data:{tenantId,territoryId:t.id,isSellable:e.target.checked}}),"Territory availability updated")}/></td><td>{t.territory_score??"—"}</td><td className="max-w-sm pr-4 text-xs text-muted-foreground">{t.public_note??t.metadata?.anchor??"—"}</td></tr>)}
     {!filtered.length&&<tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No territories match.</td></tr>}
    </tbody></table></div></CardContent></Card>
   </TabsContent>

   <TabsContent value="applications">
    <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[920px] text-sm"><thead className="bg-surface-2 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Applicant</th><th>Area</th><th>Source</th><th>Kitchen</th><th>Score</th><th>Stage</th><th className="pr-4">Received</th></tr></thead><tbody className="divide-y">
     {applications.map(a=><tr key={a.id}><td className="px-4 py-3"><b>{a.applicant_name}</b><p className="text-xs text-muted-foreground">{a.email}{a.phone_e164?" · "+a.phone_e164:""}</p></td><td>{a.territory?.name??a.preferred_area}</td><td>{a.source??"direct"}</td><td>{a.existing_kitchen?"Existing":"Needs site"}</td><td>{a.score??"—"}</td><td><select className="h-8 rounded border bg-background px-2 text-xs" value={a.stage} onChange={e=>run("app:"+a.id,()=>applicationFn({data:{tenantId,applicationId:a.id,stage:e.target.value as any,score:a.score}}),"Application stage updated")}>{stages.map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select></td><td className="pr-4 text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</td></tr>)}
     {!applications.length&&<tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No franchise applications yet.</td></tr>}
    </tbody></table></div></CardContent></Card>
   </TabsContent>

   <TabsContent value="territory-engine">
    <div className="mb-4 grid gap-4 md:grid-cols-3"><Metric icon={MapPinned} label="Territory designs" value={territoryDesigns.length}/><Metric icon={MapPinned} label="Approved versions" value={territoryVersions.filter(v=>v.status==="approved").length}/><Metric icon={Users} label="ONS demographic cells" value={demographicCells}/></div>
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
     <Card><CardContent className="p-5"><h2 className="font-semibold">Configure territory design</h2><p className="mt-1 text-xs text-muted-foreground">Anchor a kitchen, set drive-time layers and population target, then calculate with Google Routes + imported ONS cells.</p>
      <select className="mt-4 h-10 w-full rounded-md border bg-background px-3 text-sm" value={design.territoryId} onChange={e=>setDesign(v=>({...v,territoryId:e.target.value}))}><option value="">Select territory</option>{territories.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <Input className="mt-3" placeholder="Centre postcode" value={design.postcode} onChange={e=>setDesign(v=>({...v,postcode:e.target.value}))}/>
      <div className="mt-3 grid grid-cols-2 gap-2"><Input placeholder="Latitude" value={design.lat} onChange={e=>setDesign(v=>({...v,lat:e.target.value}))}/><Input placeholder="Longitude" value={design.lng} onChange={e=>setDesign(v=>({...v,lng:e.target.value}))}/></div>
      <div className="mt-3 grid grid-cols-3 gap-2"><Input placeholder="Core min" value={design.core} onChange={e=>setDesign(v=>({...v,core:e.target.value}))}/><Input placeholder="Shared min" value={design.shared} onChange={e=>setDesign(v=>({...v,shared:e.target.value}))}/><Input placeholder="Overflow min" value={design.overflow} onChange={e=>setDesign(v=>({...v,overflow:e.target.value}))}/></div>
      <div className="mt-3 grid grid-cols-2 gap-2"><Input placeholder="Pop min" value={design.popMin} onChange={e=>setDesign(v=>({...v,popMin:e.target.value}))}/><Input placeholder="Pop max" value={design.popMax} onChange={e=>setDesign(v=>({...v,popMax:e.target.value}))}/></div>
      <Button className="mt-3 w-full" disabled={!design.territoryId||(!design.postcode&&(!design.lat||!design.lng))} onClick={()=>run("design",()=>designFn({data:{tenantId,territoryId:design.territoryId,centrePostcode:design.postcode||null,centreLat:design.lat?Number(design.lat):null,centreLng:design.lng?Number(design.lng):null,coreDriveMinutes:Number(design.core),sharedDriveMinutes:Number(design.shared),overflowDriveMinutes:Number(design.overflow),coreMinMinutes:Math.max(5,Number(design.core)-7),coreMaxMinutes:Math.min(60,Number(design.core)+3),targetPopulationMin:Number(design.popMin)||null,targetPopulationMax:Number(design.popMax)||null,maxSampleRadiusKm:Number(design.radius),bearings:30,maxNeighbours:4,rules:{neighbourToleranceSeconds:120}}}),"Territory design saved")}>Save / geocode design</Button>
     </CardContent></Card>
     <Card><CardContent className="p-0"><div className="divide-y">{territoryDesigns.map(d=>{const latest=territoryVersions.find(v=>v.territory_id===d.territory_id);return <div key={d.territory_id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><b>{d.territory?.name??d.territory_id}</b><p className="text-xs text-muted-foreground">{d.centre_postcode??"No postcode"} · {d.core_drive_minutes}/{d.shared_drive_minutes}/{d.overflow_drive_minutes} min · target {d.target_population_min??"—"}–{d.target_population_max??"—"}</p></div><StatusBadge status={d.status}/></div><div className="mt-3 flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" disabled={busy==="calc:"+d.territory_id} onClick={()=>run("calc:"+d.territory_id,()=>calculateFn({data:{tenantId,territoryId:d.territory_id}}),"Territory calculation created")}>Calculate polygon</Button>{latest&&<><Badge variant="outline">v{latest.version} · {latest.core_drive_minutes} min</Badge><Badge variant="outline">{latest.protected_population??"ONS pending"} population</Badge>{latest.status==="review"&&<Button size="sm" onClick={()=>run("approve:"+latest.id,()=>approveFn({data:{tenantId,versionId:latest.id}}),"Territory polygon approved")}>Approve polygon</Button>}</>}</div></div>})}{!territoryDesigns.length&&<p className="p-6 text-sm text-muted-foreground">No territory designs yet.</p>}</div></CardContent></Card>
    </div>
   </TabsContent>

   <TabsContent value="managed">
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
     <Card><CardContent className="p-5"><h2 className="font-semibold">Managed investor agreement</h2><p className="mt-1 text-xs text-muted-foreground">Separate operations-company agreement. Management share is calculated after site OPEX and standard franchise charges.</p>
      <select className="mt-4 h-10 w-full rounded-md border bg-background px-3 text-sm" value={managed.territoryId} onChange={e=>setManaged(v=>({...v,territoryId:e.target.value}))}><option value="">Select territory</option>{territories.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <Input className="mt-3" placeholder="Management provider" value={managed.provider} onChange={e=>setManaged(v=>({...v,provider:e.target.value}))}/>
      <div className="mt-3 grid grid-cols-2 gap-2"><Input placeholder="Profit share %" value={managed.profitShare} onChange={e=>setManaged(v=>({...v,profitShare:e.target.value}))}/><Input placeholder="Minimum monthly £" value={managed.minimum} onChange={e=>setManaged(v=>({...v,minimum:e.target.value}))}/></div>
      <Button className="mt-3 w-full" disabled={!programme?.id||!managed.territoryId} onClick={()=>run("managed",()=>agreementFn({data:{tenantId,programmeId:programme.id,territoryId:managed.territoryId,managementProvider:managed.provider,profitShareBps:Math.round(Number(managed.profitShare)*100),minimumMonthlyFeeMinor:Math.round(Number(managed.minimum)*100),effectiveFrom:null,effectiveUntil:null,terms:{basisDefinition:"Managed Operating Profit after site operating costs and standard franchise charges, before management fee, finance costs, corporation tax, depreciation and investor distributions."}}}),"Managed franchise agreement proposed")}>Create proposal</Button>
     </CardContent></Card>
     <Card><CardContent className="p-0"><div className="divide-y">{managementAgreements.map(a=><div key={a.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><b>{a.territory?.name??a.territory_id}</b><p className="text-xs text-muted-foreground">{a.management_provider} · {Number(a.profit_share_bps)/100}% of managed operating profit{Number(a.minimum_monthly_fee_minor)>0?" · min "+money(a.minimum_monthly_fee_minor)+"/mo":""}</p></div><StatusBadge status={a.status}/></div></div>)}{!managementAgreements.length&&<p className="p-6 text-sm text-muted-foreground">No managed investor agreements yet.</p>}</div></CardContent></Card>
    </div>
   </TabsContent>

   <TabsContent value="acquisition">
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
     <Card><CardContent className="p-5"><h2 className="font-semibold">Plan campaign</h2><p className="mt-1 text-xs text-muted-foreground">External acquisition channels complement Omniqora email, SMS, WhatsApp, push and journeys.</p>
      <Input className="mt-4" placeholder="Campaign name" value={campaign.name} onChange={e=>setCampaign(v=>({...v,name:e.target.value}))}/>
      <select className="mt-3 h-10 w-full rounded-md border bg-background px-3 text-sm" value={campaign.channel} onChange={e=>setCampaign(v=>({...v,channel:e.target.value}))}>{channels.map(c=><option key={c.channel_key} value={c.channel_key}>{c.name}</option>)}</select>
      <select className="mt-3 h-10 w-full rounded-md border bg-background px-3 text-sm" value={campaign.territory} onChange={e=>setCampaign(v=>({...v,territory:e.target.value}))}><option value="">National / all territories</option>{territories.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <Input className="mt-3" inputMode="decimal" placeholder="Budget £" value={campaign.budget} onChange={e=>setCampaign(v=>({...v,budget:e.target.value}))}/>
      <Button className="mt-3 w-full" disabled={!campaign.name||!campaign.channel} onClick={()=>run("campaign",async()=>{await campaignFn({data:{tenantId,programmeId:programme?.id??null,productKey:"mealdeck",territoryId:campaign.territory||null,channelKey:campaign.channel,name:campaign.name,objective:"Franchise recruitment",budgetMinor:Math.round(Number(campaign.budget||0)*100)}});setCampaign(v=>({...v,name:"",budget:""}));},"Campaign planned")}><Plus className="mr-2 h-4 w-4"/>Add campaign</Button>
     </CardContent></Card>
     <Card><CardContent className="p-0"><table className="w-full text-sm"><thead className="bg-surface-2 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Campaign</th><th>Channel</th><th>Status</th><th className="text-right">Spend</th><th className="text-right">Leads</th><th className="pr-4 text-right">Signed</th></tr></thead><tbody className="divide-y">{campaigns.map(c=><tr key={c.id}><td className="px-4 py-3"><b>{c.name}</b><p className="text-xs text-muted-foreground">{c.territory?.name??"National"}</p></td><td>{channels.find(x=>x.channel_key===c.channel_key)?.name??c.channel_key}</td><td><StatusBadge status={c.status}/></td><td className="text-right">{money(c.spend_minor)}</td><td className="text-right">{c.leads}</td><td className="pr-4 text-right">{c.signed}</td></tr>)}{!campaigns.length&&<tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No acquisition campaigns yet.</td></tr>}</tbody></table></CardContent></Card>
    </div>
   </TabsContent>

   <TabsContent value="content">
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
     <Card><CardContent className="p-5"><h2 className="font-semibold">Create marketing item</h2><p className="mt-1 text-xs text-muted-foreground">Plan SEO pages, TikToks, YouTube, social, directories, PR, outdoor, wraps, leaflets and more.</p>
      <Input className="mt-4" placeholder="Title / brief" value={item.title} onChange={e=>setItem(v=>({...v,title:e.target.value}))}/>
      <select className="mt-3 h-10 w-full rounded-md border bg-background px-3 text-sm" value={item.channel} onChange={e=>setItem(v=>({...v,channel:e.target.value}))}>{channels.map(c=><option key={c.channel_key} value={c.channel_key}>{c.name}</option>)}</select>
      <select className="mt-3 h-10 w-full rounded-md border bg-background px-3 text-sm" value={item.type} onChange={e=>setItem(v=>({...v,type:e.target.value}))}>{contentTypes.map(x=><option key={x} value={x}>{x.replaceAll("_"," ")}</option>)}</select>
      <select className="mt-3 h-10 w-full rounded-md border bg-background px-3 text-sm" value={item.territory} onChange={e=>setItem(v=>({...v,territory:e.target.value}))}><option value="">National / reusable</option>{territories.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <Button className="mt-3 w-full" disabled={!item.title} onClick={()=>run("content",async()=>{await contentFn({data:{tenantId,programmeId:programme?.id??null,productKey:"mealdeck",territoryId:item.territory||null,channelKey:item.channel||null,contentType:item.type as any,title:item.title,targetUrl:null,brief:{}}});setItem(v=>({...v,title:""}));},"Marketing item created")}><Plus className="mr-2 h-4 w-4"/>Add to content plan</Button>
     </CardContent></Card>
     <Card><CardContent className="p-0"><div className="divide-y">{content.map(c=><div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><b>{c.title}</b><p className="text-xs text-muted-foreground">{c.content_type.replaceAll("_"," ")} · {channels.find(x=>x.channel_key===c.channel_key)?.name??c.channel_key??"multi"} · {c.territory?.name??"National"}</p></div><StatusBadge status={c.status}/></div>)}{!content.length&&<p className="p-6 text-center text-sm text-muted-foreground">No content or media items yet.</p>}</div></CardContent></Card>
    </div>
   </TabsContent>
  </Tabs>
 </AppShell>;
}

function Metric({icon:Icon,label,value}:{icon:typeof BarChart3;label:string;value:string|number}){
 return <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary"/></div><div className="mt-2 font-display text-2xl font-semibold">{value}</div></CardContent></Card>;
}
