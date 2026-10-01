import { createFileRoute } from "@tanstack/react-router";
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
import {
  getPortfolioMigrationSummary,
  listPortfolioMigrationAssets,
  listPortfolioProductFamilies,
  savePortfolioFamilyDecision,
  syncPortfolioIntake,
  updatePortfolioMigrationAsset,
} from "@/modules/platform/portfolio.functions";
import {
  Boxes, CheckCircle2, Code2, Database, Factory, GitBranch, Globe2,
  Layers3, Merge, RefreshCw, ServerCog, Store, Workflow,
} from "lucide-react";

export const Route=createFileRoute("/_authenticated/app/portfolio-migration")({
  head:()=>({meta:[
    {title:"Portfolio Migration — Omniqora"},
    {name:"description",content:"Canonical migration inventory for the Omniqora SaaS Factory portfolio."},
    {name:"robots",content:"noindex"},
  ]}),
  component:PortfolioMigration,
});

type Asset=Record<string,any>;
const ROLES=["platform","shared_engine","shared_addon","landlord","product_variant","tenant","brand_tenant","marketplace_tenant","tenant_review","merge_source","external_connector","review"] as const;
const STATUSES=["intake","repo_audit","classified","ready","in_progress","shadow_sync","parity","cutover","complete","retired","blocked"] as const;
const CONFIDENCE=["provisional","medium","high","verified"] as const;

function PortfolioMigration(){
  const queryClient=useQueryClient();
  const syncFn=useServerFn(syncPortfolioIntake);
  const listFn=useServerFn(listPortfolioMigrationAssets);
  const summaryFn=useServerFn(getPortfolioMigrationSummary);
  const familiesFn=useServerFn(listPortfolioProductFamilies);
  const updateFn=useServerFn(updatePortfolioMigrationAsset);
  const familyFn=useServerFn(savePortfolioFamilyDecision);

  const[q,setQ]=useState("");
  const[family,setFamily]=useState("");
  const[role,setRole]=useState("");
  const[wave,setWave]=useState("");
  const[status,setStatus]=useState("");
  const[selectedId,setSelectedId]=useState("");
  const[busy,setBusy]=useState("");

  const assets=useQuery({
    queryKey:["portfolio-assets",q,family,role,wave,status],
    queryFn:()=>listFn({data:{
      q:q||null,family:family||null,role:role||null,
      wave:wave===""?null:Number(wave),status:status||null
    }}),
    retry:false,
  });
  const summary=useQuery({queryKey:["portfolio-summary"],queryFn:()=>summaryFn(),retry:false});
  const families=useQuery({queryKey:["portfolio-families"],queryFn:()=>familiesFn(),retry:false});

  const rows=(assets.data??[]) as Asset[];
  useEffect(()=>{
    if(rows.length&&!rows.some((row)=>row.id===selectedId))setSelectedId(rows[0].id);
    if(!rows.length&&selectedId)setSelectedId("");
  },[rows,selectedId]);
  const selected=rows.find((row)=>row.id===selectedId)??rows[0]??null;

  async function refreshAll(){
    await Promise.all([
      queryClient.invalidateQueries({queryKey:["portfolio-assets"]}),
      queryClient.invalidateQueries({queryKey:["portfolio-summary"]}),
      queryClient.invalidateQueries({queryKey:["portfolio-families"]}),
    ]);
  }
  async function sync(){
    try{
      setBusy("sync");
      const result=await syncFn();
      await refreshAll();
      toast.success("Synced "+result.synced+" portfolio intake rows");
    }catch(error){toast.error(errorText(error));}
    finally{setBusy("");}
  }
  async function patch(assetId:string,patch:Record<string,unknown>){
    try{
      setBusy("asset:"+assetId);
      await updateFn({data:{assetId,...patch} as any});
      await refreshAll();
      toast.success("Migration asset updated");
    }catch(error){toast.error(errorText(error));}
    finally{setBusy("");}
  }

  return <AppShell
    title="Omniqora Portfolio Migration"
    subtitle="120-source intake → family audit → canonical repo → target architecture → shadow migration → parity → cutover."
    actions={<Button size="sm" onClick={sync} disabled={busy==="sync"}><RefreshCw className="mr-2 h-4 w-4"/>Sync source manifest</Button>}
  >
    {summary.error||assets.error||families.error
      ?<State text={errorText(summary.error||assets.error||families.error)} destructive/>
      :<>
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Metric icon={Boxes} label="Intake assets" value={summary.data?.total??0}/>
          <Metric icon={Globe2} label="Site only" value={summary.data?.siteOnly??0}/>
          <Metric icon={GitBranch} label="Canonical repos" value={summary.data?.withCanonicalRepo??0}/>
          <Metric icon={Code2} label="Needs repo" value={summary.data?.needsRepo??0}/>
          <Metric icon={ServerCog} label="Build in Omniqora" value={summary.data?.buildInOmniqora??0}/>
          <Metric icon={Layers3} label="Families" value={(families.data??[]).length}/>
        </div>

        <Tabs defaultValue="inventory" className="mt-6">
          <TabsList className="mb-6 flex h-auto flex-wrap justify-start">
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="families">Product families</TabsTrigger>
            <TabsTrigger value="waves">Migration waves</TabsTrigger>
          </TabsList>

          <TabsContent value="inventory">
            <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
              <div className="space-y-4">
                <Card><CardContent className="p-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <Input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search name, repo, site…"/>
                    <Select value={family} onChange={setFamily} blank="All families" options={[...new Set((families.data??[]).map((item:any)=>item.family_key))]}/>
                    <Select value={role} onChange={setRole} blank="All roles" options={[...ROLES]}/>
                    <Select value={wave} onChange={setWave} blank="All waves" options={["0","1","2","3","4"]}/>
                    <Select value={status} onChange={setStatus} blank="All statuses" options={[...STATUSES]}/>
                  </div>
                </CardContent></Card>

                <Card className="overflow-hidden"><CardContent className="p-0">
                  <div className="overflow-x-auto"><table className="w-full text-sm">
                    <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr><th className="px-4 py-3">Source</th><th className="px-4 py-3">Family</th><th className="px-4 py-3">Target role</th><th className="px-4 py-3">Wave</th><th className="px-4 py-3">Migration</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((row)=><tr key={row.id} onClick={()=>setSelectedId(row.id)} className={"cursor-pointer hover:bg-surface-2 "+(selectedId===row.id?"bg-primary/5":"")}>
                        <td className="px-4 py-3"><div className="font-medium">{row.intake_name}</div><div className="mt-0.5 max-w-80 truncate text-xs text-muted-foreground">{row.source_repo_url||row.source_site_url||"No source URL"}</div></td>
                        <td className="px-4 py-3">{row.target_family_key||"—"}</td>
                        <td className="px-4 py-3"><Badge variant="outline">{row.target_role}</Badge></td>
                        <td className="px-4 py-3">{row.migration_wave}</td>
                        <td className="px-4 py-3"><Badge variant="secondary">{row.migration_status}</Badge></td>
                      </tr>)}
                      {!rows.length&&<tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">{summary.data?.total?"No assets match these filters.":"Sync the source manifest to load the 120-row portfolio."}</td></tr>}
                    </tbody>
                  </table></div>
                </CardContent></Card>
              </div>

              {selected?<AssetEditor asset={selected} busy={busy==="asset:"+selected.id} patchAsset={patch}/>:<State text="Select a portfolio asset to classify it."/>}
            </div>
          </TabsContent>

          <TabsContent value="families">
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {((families.data??[]) as any[]).map((item)=><FamilyCard key={item.family_key} family={item} save={familyFn} refresh={refreshAll}/>)}
              {!((families.data??[]) as any[]).length&&<State text="Sync the source manifest to create product-family records."/>}
            </div>
          </TabsContent>

          <TabsContent value="waves">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {[0,1,2,3,4].map((n)=>{
                const waveRows=((summary.data?.byWave??{}) as Record<string,number>)[String(n)]??0;
                const title=["Core extraction","Priority migrations","Family consolidation","Site-only / secondary","Deep audit queue"][n]!;
                return <Card key={n}><CardContent className="p-5"><div className="text-xs font-semibold text-primary">WAVE {n}</div><div className="mt-2 font-display text-3xl font-semibold">{waveRows}</div><div className="mt-2 text-sm font-medium">{title}</div><p className="mt-2 text-xs text-muted-foreground">{waveDescription(n)}</p></CardContent></Card>;
              })}
            </div>
          </TabsContent>
        </Tabs>
      </>}
  </AppShell>;
}

function AssetEditor({asset,busy,patchAsset}:{asset:Asset;busy:boolean;patchAsset:(id:string,p:Record<string,unknown>)=>Promise<void>}){
  const[family,setFamily]=useState(asset.target_family_key??"");
  const[product,setProduct]=useState(asset.target_product_key??"");
  const[parent,setParent]=useState(asset.target_parent_key??"");
  const[action,setAction]=useState(asset.migration_action??"repo_audit");
  const[notes,setNotes]=useState(asset.notes??"");
  useEffect(()=>{setFamily(asset.target_family_key??"");setProduct(asset.target_product_key??"");setParent(asset.target_parent_key??"");setAction(asset.migration_action??"repo_audit");setNotes(asset.notes??"");},[asset.id]);

  return <div className="space-y-4">
    <Card><CardContent className="p-5">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-xl font-semibold">{asset.intake_name}</h2><p className="mt-1 text-xs text-muted-foreground">Spreadsheet row {asset.source_row_number} · {asset.source_kind}</p></div><Badge variant="outline">{asset.confidence}</Badge></div>
      {asset.source_hint&&<div className="mt-4 rounded-lg bg-surface-2 p-3 text-sm">{asset.source_hint}</div>}
      {asset.source_kind==="site_only"&&<div className="mt-4 rounded-lg border border-dashed p-3"><div className="font-medium">Site-only source</div><p className="mt-1 text-xs text-muted-foreground">Do not create a repository automatically. First decide whether this belongs directly in Omniqora, under a landlord/marketplace, or deserves its own vertical repository.</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant={asset.build_in_omniqora?"default":"outline"} onClick={()=>patchAsset(asset.id,{buildInOmniqora:!asset.build_in_omniqora,needsRepo:false})}>Build in Omniqora</Button><Button size="sm" variant={asset.needs_repo?"default":"outline"} onClick={()=>patchAsset(asset.id,{needsRepo:!asset.needs_repo,buildInOmniqora:false})}>Needs repo</Button></div></div>}
    </CardContent></Card>

    <Card><CardContent className="p-5 space-y-4">
      <h3 className="font-semibold">Target architecture</h3>
      <Field label="Family"><Input value={family} onChange={(e)=>setFamily(e.target.value)}/></Field>
      <Field label="Role"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={asset.target_role} onChange={(e)=>patchAsset(asset.id,{targetRole:e.target.value})}>{ROLES.map((r)=><option key={r}>{r}</option>)}</select></Field>
      <Field label="Target product key"><Input value={product} onChange={(e)=>setProduct(e.target.value)}/></Field>
      <Field label="Parent landlord / product"><Input value={parent} onChange={(e)=>setParent(e.target.value)} placeholder="none"/></Field>
      <Field label="Migration action"><Input value={action} onChange={(e)=>setAction(e.target.value)}/></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Wave"><Input type="number" min={0} max={20} value={asset.migration_wave} onChange={(e)=>patchAsset(asset.id,{migrationWave:Number(e.target.value)})}/></Field>
        <Field label="Confidence"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={asset.confidence} onChange={(e)=>patchAsset(asset.id,{confidence:e.target.value})}>{CONFIDENCE.map((v)=><option key={v}>{v}</option>)}</select></Field>
      </div>
      <Field label="Migration status"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={asset.migration_status} onChange={(e)=>patchAsset(asset.id,{migrationStatus:e.target.value})}>{STATUSES.map((v)=><option key={v}>{v}</option>)}</select></Field>
      <Field label="Notes"><textarea className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" value={notes} onChange={(e)=>setNotes(e.target.value)}/></Field>
      <Button disabled={busy} onClick={()=>patchAsset(asset.id,{targetFamilyKey:family||null,targetProductKey:product||null,targetParentKey:parent||null,migrationAction:action,notes:notes||null})}>Save classification</Button>
    </CardContent></Card>

    <Card><CardContent className="p-0">
      <Header title="Repository candidates" subtitle="Canonical selection uses completeness + recency, not commit date alone."/>
      <div className="divide-y">{(asset.repoCandidates??[]).map((repo:any)=><div key={repo.id} className="p-4">
        <div className="flex items-start justify-between gap-3"><div><div className="font-medium">{repo.repository_full_name}</div><div className="text-xs text-muted-foreground">{repo.latest_commit_at?new Date(repo.latest_commit_at).toLocaleString():"Not audited yet"}</div></div><Badge variant={repo.is_canonical?"default":"outline"}>{repo.is_canonical?"canonical":repo.candidate_kind}</Badge></div>
        {repo.file_count!=null&&<div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground"><span>{repo.file_count} files</span><span>{repo.route_count??0} routes</span><span>{repo.migration_count??0} migrations</span><span>{repo.function_count??0} functions</span><span>{repo.test_count??0} tests</span><span>score {repo.completeness_score??"—"}</span></div>}
        {repo.audit_notes&&<p className="mt-2 text-xs text-muted-foreground">{repo.audit_notes}</p>}
      </div>)}{!(asset.repoCandidates??[]).length&&<p className="p-5 text-sm text-muted-foreground">No repository candidate has been audited yet.</p>}</div>
    </CardContent></Card>
  </div>;
}

function FamilyCard({family,save,refresh}:{family:any;save:any;refresh:()=>Promise<void>}){
  const[busy,setBusy]=useState(false);
  async function setStatus(decisionStatus:string){
    try{setBusy(true);await save({data:{familyKey:family.family_key,decisionStatus}});await refresh();toast.success("Family decision updated");}
    catch(error){toast.error(errorText(error));}finally{setBusy(false);}
  }
  return <Card><CardContent className="p-5">
    <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{family.name}</h3><p className="text-xs text-muted-foreground">{family.family_key} · {(family.assets??[]).length} source asset(s)</p></div><Badge variant="outline">{family.decision_status}</Badge></div>
    {family.canonical_repo_url&&<div className="mt-4 rounded-lg bg-surface-2 p-3 text-xs"><div className="font-medium">Canonical repo</div><div className="mt-1 break-all text-muted-foreground">{family.canonical_repo_url}</div></div>}
    {family.rationale&&<p className="mt-3 text-sm text-muted-foreground">{family.rationale}</p>}
    <div className="mt-4 flex flex-wrap gap-2">{family.decision_status!=="decided"&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>setStatus("auditing")}>Audit family</Button>}{family.canonical_repo_url&&family.decision_status==="decided"&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>setStatus("migration_ready")}>Mark migration ready</Button>}</div>
  </CardContent></Card>;
}

function Metric({icon:Icon,label,value}:{icon:typeof Factory;label:string;value:number|string}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary"/></div><div className="mt-2 font-display text-2xl font-semibold">{value}</div></CardContent></Card>;}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div><Label className="text-xs text-muted-foreground">{label}</Label><div className="mt-1">{children}</div></div>;}
function Select({value,onChange,blank,options}:{value:string;onChange:(v:string)=>void;blank:string;options:string[]}){return <select className="h-10 rounded-md border bg-background px-3 text-sm" value={value} onChange={(e)=>onChange(e.target.value)}><option value="">{blank}</option>{options.filter(Boolean).sort().map((v)=><option key={v} value={v}>{v}</option>)}</select>;}
function Header({title,subtitle}:{title:string;subtitle:string}){return <div className="border-b px-5 py-4"><h3 className="font-semibold">{title}</h3><p className="text-xs text-muted-foreground">{subtitle}</p></div>;}
function State({text,destructive=false}:{text:string;destructive?:boolean}){return <Card><CardContent className={"p-6 text-sm "+(destructive?"text-destructive":"text-muted-foreground")}>{text}</CardContent></Card>;}
function errorText(error:unknown){return error instanceof Error?error.message:String(error);}
function waveDescription(n:number){return["Shared Omniqora engines and duplicate add-ons first.","Products already being actively consolidated: Dishbee/Kindelo/accounting/dispatch/remittance/SparesGrid.","Major product-family consolidation after core engines are stable.","Site-only products and secondary variants after architecture decisions.","Long-tail or unclear products stay here until repo/site audit is complete."][n]??"";}
