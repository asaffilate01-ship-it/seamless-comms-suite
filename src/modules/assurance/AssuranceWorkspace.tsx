// @ts-nocheck
import {useEffect,useState} from "react";
import {useServerFn} from "@tanstack/react-start";
import {AppShell} from "@/components/app/shell";
import {useTenant} from "@/hooks/useTenant";
import {
  addAssuranceEvidence,addAssuranceFinding,addTransactionItem,createAssuranceWorkspace,
  getAssuranceWorkspace,listAssuranceWorkspaces,updateWorkstream,
} from "@/lib/assurance.functions";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {Badge} from "@/components/ui/badge";
import {Tabs,TabsContent,TabsList,TabsTrigger} from "@/components/ui/tabs";
import {
  BarChart3,CheckCircle2,ClipboardCheck,FileSearch,GitBranch,Loader2,
  Plus,RefreshCw,ShieldCheck,TriangleAlert,
} from "lucide-react";

const templates=[
  {key:"full-audit",name:"Full Audit",service:"Full Audit Suite",type:"audit",copy:"Planning, materiality, finance cycles, ITGC, controls, sampling, evidence, findings and reporting."},
  {key:"compliance-as-a-service",name:"Compliance as a Service",service:"Compliance as a Service",type:"compliance",copy:"Obligations, policies, controls, evidence, monitoring, regulatory change, remediation and reporting."},
  {key:"ma-carveout",name:"M&A / Carve-out",service:"M&A & Carve-out Suite",type:"transaction",copy:"QoE, people, ERP/apps, cloud, cyber, data, vendors, carve-out financials, TSA, stranded costs and Day 1–100."},
  {key:"accounting-tax",name:"Accounting & Tax",service:"Accounting & Tax Automation",type:"accounting",copy:"Document intake, AI bookkeeping, uncertainty queue, reconciliations, TB, assets, accounts, tax, payroll and review."},
] as const;

export function AssuranceWorkspace(){
  const{tenantId,loading:tenantLoading,error:tenantError}=useTenant();
  const list=useServerFn(listAssuranceWorkspaces);
  const create=useServerFn(createAssuranceWorkspace);
  const get=useServerFn(getAssuranceWorkspace);
  const update=useServerFn(updateWorkstream);
  const addFinding=useServerFn(addAssuranceFinding);
  const addEvidence=useServerFn(addAssuranceEvidence);
  const addItem=useServerFn(addTransactionItem);

  const[rows,setRows]=useState<any[]>([]);
  const[selected,setSelected]=useState("");
  const[summary,setSummary]=useState<any|null>(null);
  const[busy,setBusy]=useState(false);
  const[message,setMessage]=useState("");
  const[templateKey,setTemplateKey]=useState("full-audit");
  const[name,setName]=useState("");
  const[jurisdiction,setJurisdiction]=useState("GB");
  const[periodStart,setPeriodStart]=useState("");
  const[periodEnd,setPeriodEnd]=useState("");

  const[findingTitle,setFindingTitle]=useState("");
  const[findingSeverity,setFindingSeverity]=useState("medium");
  const[findingImpact,setFindingImpact]=useState("");
  const[findingRecommendation,setFindingRecommendation]=useState("");

  const[evidenceTitle,setEvidenceTitle]=useState("");
  const[evidenceSource,setEvidenceSource]=useState("");
  const[evidenceUrl,setEvidenceUrl]=useState("");

  const[itemType,setItemType]=useState("application");
  const[itemName,setItemName]=useState("");
  const[itemDisposition,setItemDisposition]=useState("unknown");
  const[itemCriticality,setItemCriticality]=useState("");
  const[itemOwner,setItemOwner]=useState("");
  const[day1,setDay1]=useState(false);
  const[tsa,setTsa]=useState(false);

  async function refresh(){
    if(!tenantId)return;
    setBusy(true);setMessage("");
    try{setRows(await list({data:{tenantId}}))}
    catch(e){setMessage(e instanceof Error?e.message:"Unable to load assurance workspaces")}
    finally{setBusy(false)}
  }
  useEffect(()=>{if(tenantId)void refresh()},[tenantId]);

  async function loadWorkspace(id:string){
    setSelected(id);setBusy(true);setMessage("");
    try{setSummary(await get({data:{workspaceId:id}}))}
    catch(e){setMessage(e instanceof Error?e.message:"Unable to load workspace")}
    finally{setBusy(false)}
  }

  async function createWorkspace(){
    if(!tenantId)return;
    setBusy(true);setMessage("");
    try{
      const result=await create({data:{
        tenantId,templateKey:templateKey as any,name:name||templates.find(t=>t.key===templateKey)?.name||"Workspace",
        jurisdiction:jurisdiction||null,periodStart:periodStart||null,periodEnd:periodEnd||null,
      }});
      setName("");await refresh();await loadWorkspace(result.workspaceId);
      setMessage("Workspace created with its standard workstreams.");
    }catch(e){setMessage(e instanceof Error?e.message:"Unable to create workspace")}
    finally{setBusy(false)}
  }

  async function changeWorkstream(ws:any,status:string,progress:number){
    try{await update({data:{workspaceId:selected,workstreamId:ws.id,status:status as any,progress}});await loadWorkspace(selected)}
    catch(e){setMessage(e instanceof Error?e.message:"Unable to update workstream")}
  }

  async function createFinding(){
    if(!selected||!findingTitle)return;
    try{
      await addFinding({data:{workspaceId:selected,title:findingTitle,severity:findingSeverity as any,
        impact:findingImpact||undefined,recommendation:findingRecommendation||undefined}});
      setFindingTitle("");setFindingImpact("");setFindingRecommendation("");await loadWorkspace(selected);
    }catch(e){setMessage(e instanceof Error?e.message:"Unable to add finding")}
  }
  async function createEvidence(){
    if(!selected||!evidenceTitle)return;
    try{
      await addEvidence({data:{workspaceId:selected,title:evidenceTitle,evidenceType:"document",
        sourceType:evidenceSource||null,sourceRef:evidenceSource||null,documentUrl:evidenceUrl||null,
        provenance:{capturedVia:"omniqora-assurance"}}});
      setEvidenceTitle("");setEvidenceSource("");setEvidenceUrl("");await loadWorkspace(selected);
    }catch(e){setMessage(e instanceof Error?e.message:"Unable to add evidence")}
  }
  async function createItem(){
    if(!selected||!itemName)return;
    try{
      await addItem({data:{workspaceId:selected,itemType,name:itemName,disposition:itemDisposition as any,
        criticality:itemCriticality||null,owner:itemOwner||null,day1Required:day1,tsaRequired:tsa,data:{}}});
      setItemName("");setItemCriticality("");setItemOwner("");setDay1(false);setTsa(false);await loadWorkspace(selected);
    }catch(e){setMessage(e instanceof Error?e.message:"Unable to add transaction item")}
  }

  if(tenantLoading)return <AppShell title="Assurance & Transactions"><Loader2 className="h-6 w-6 animate-spin"/></AppShell>;
  if(tenantError)return <AppShell title="Assurance & Transactions"><p role="alert">{tenantError}</p></AppShell>;

  const counts=summary?.counts??{};
  return <AppShell title="Assurance & Transactions" subtitle="Reusable Full Audit, Compliance as a Service, M&A/Carve-out and Accounting/Tax workspaces."
    actions={<Button size="sm" variant="outline" onClick={()=>void refresh()} disabled={busy}><RefreshCw className={"mr-1 h-4 w-4 "+(busy?"animate-spin":"")}/>Refresh</Button>}>

    <section className="rounded-xl border bg-card p-5">
      <h2 className="font-semibold">Start a workspace</h2>
      <p className="mt-1 text-sm text-muted-foreground">The corresponding Omniqora bundle must be active in Products & add-ons.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{templates.map(t=><button key={t.key} onClick={()=>setTemplateKey(t.key)}
        className={"rounded-xl border p-4 text-left "+(templateKey===t.key?"border-primary bg-primary/5":"hover:border-primary/40")}>
        <div className="flex items-start justify-between gap-2"><b>{t.name}</b>{templateKey===t.key&&<CheckCircle2 className="h-4 w-4 text-primary"/>}</div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{t.copy}</p><Badge className="mt-3" variant="outline">{t.service}</Badge>
      </button>)}</div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Field label="Workspace name" value={name} set={setName}/>
        <Field label="Jurisdiction" value={jurisdiction} set={setJurisdiction}/>
        <Field label="Period start" value={periodStart} set={setPeriodStart} type="date"/>
        <Field label="Period end" value={periodEnd} set={setPeriodEnd} type="date"/>
        <div className="flex items-end"><Button className="w-full" onClick={()=>void createWorkspace()} disabled={busy}><Plus className="mr-1 h-4 w-4"/>Create</Button></div>
      </div>
    </section>

    <div className="mt-6 grid gap-5 lg:grid-cols-[300px_1fr]">
      <aside className="h-fit rounded-xl border bg-card p-4"><h2 className="font-semibold">Workspaces</h2>
        <div className="mt-3 space-y-2">{rows.map(row=><button key={row.id} onClick={()=>void loadWorkspace(row.id)}
          className={"w-full rounded-lg border p-3 text-left "+(selected===row.id?"border-primary bg-primary/5":"")}>
          <b className="text-sm">{row.name}</b><p className="mt-1 text-xs text-muted-foreground">{row.template_key?.replaceAll("-"," ")} · {row.status}</p>
        </button>)}{!rows.length&&<p className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">No workspaces yet.</p>}</div>
      </aside>

      <section>
        {summary?<>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={<FileSearch/>} label="Evidence" value={counts.evidence??0}/>
            <Metric icon={<ShieldCheck/>} label="Controls" value={counts.controls??0}/>
            <Metric icon={<TriangleAlert/>} label="Findings" value={counts.findings??0}/>
            <Metric icon={<GitBranch/>} label="Graph nodes" value={counts.knowledgeNodes??0}/>
            <Metric icon={<ClipboardCheck/>} label="Records" value={counts.records??0}/>
            <Metric icon={<BarChart3/>} label="BI metrics" value={counts.metrics??0}/>
          </div>

          <Tabs defaultValue="workstreams" className="mt-5">
            <TabsList className="flex h-auto flex-wrap"><TabsTrigger value="workstreams">Workstreams</TabsTrigger><TabsTrigger value="findings">Findings</TabsTrigger><TabsTrigger value="evidence">Evidence</TabsTrigger><TabsTrigger value="transaction">Transaction inventory</TabsTrigger></TabsList>
            <TabsContent value="workstreams"><div className="space-y-2">{(summary.workstreams??[]).map((ws:any)=><article key={ws.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><b>{ws.name}</b><p className="text-xs text-muted-foreground">{ws.category} · {ws.progress}%</p></div>
                <div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>void changeWorkstream(ws,"in_progress",Math.max(ws.progress,10))}>In progress</Button><Button size="sm" onClick={()=>void changeWorkstream(ws,"complete",100)}>Complete</Button></div>
              </div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{width:(ws.progress??0)+"%"}}/></div>
            </article>)}</div></TabsContent>

            <TabsContent value="findings"><div className="grid gap-5 xl:grid-cols-[1fr_.8fr]"><div className="space-y-2">{(summary.openFindings??[]).map((f:any)=><article key={f.id} className="rounded-xl border bg-card p-4"><div className="flex justify-between gap-3"><b>{f.title}</b><Badge variant="outline">{f.severity}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{f.status}{f.impact?" · "+f.impact:""}</p></article>)}{!(summary.openFindings??[]).length&&<p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No open findings.</p>}</div>
              <div className="rounded-xl border bg-card p-4"><h3 className="font-semibold">Add finding</h3><div className="mt-3 space-y-3"><Field label="Title" value={findingTitle} set={setFindingTitle}/><label><Label>Severity</Label><Select value={findingSeverity} onValueChange={setFindingSeverity}><SelectTrigger className="mt-1"><SelectValue/></SelectTrigger><SelectContent>{["info","low","medium","high","critical"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></label><label><Label>Impact</Label><Textarea className="mt-1" value={findingImpact} onChange={e=>setFindingImpact(e.target.value)}/></label><label><Label>Recommendation</Label><Textarea className="mt-1" value={findingRecommendation} onChange={e=>setFindingRecommendation(e.target.value)}/></label><Button onClick={()=>void createFinding()}>Add finding</Button></div></div>
            </div></TabsContent>

            <TabsContent value="evidence"><div className="max-w-2xl rounded-xl border bg-card p-4"><h3 className="font-semibold">Register evidence</h3><p className="mt-1 text-xs text-muted-foreground">Evidence carries source/provenance and can later be extracted by Document AI / RAG and reviewed by a human.</p><div className="mt-3 grid gap-3 md:grid-cols-2"><Field label="Title" value={evidenceTitle} set={setEvidenceTitle}/><Field label="Source / reference" value={evidenceSource} set={setEvidenceSource}/><div className="md:col-span-2"><Field label="Document URL" value={evidenceUrl} set={setEvidenceUrl}/></div></div><Button className="mt-3" onClick={()=>void createEvidence()}>Register evidence</Button></div></TabsContent>

            <TabsContent value="transaction"><div className="max-w-3xl rounded-xl border bg-card p-4"><h3 className="font-semibold">Add carve-out / transaction item</h3><div className="mt-3 grid gap-3 md:grid-cols-2"><Field label="Name" value={itemName} set={setItemName}/><Field label="Type" value={itemType} set={setItemType}/><label><Label>Disposition</Label><Select value={itemDisposition} onValueChange={setItemDisposition}><SelectTrigger className="mt-1"><SelectValue/></SelectTrigger><SelectContent>{["unknown","retained","separated","shared","newco","buyer","seller","target"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></label><Field label="Criticality" value={itemCriticality} set={setItemCriticality}/><Field label="Owner" value={itemOwner} set={setItemOwner}/><div className="flex items-end gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={day1} onChange={e=>setDay1(e.target.checked)}/>Day 1</label><label className="flex items-center gap-2"><input type="checkbox" checked={tsa} onChange={e=>setTsa(e.target.checked)}/>TSA</label></div></div><Button className="mt-3" onClick={()=>void createItem()}>Add inventory item</Button></div></TabsContent>
          </Tabs>
        </>:<div className="grid min-h-72 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">Select or create a workspace.</div>}
      </section>
    </div>
    {message&&<p className="mt-6 rounded-xl bg-muted p-4 text-sm">{message}</p>}
  </AppShell>
}

function Field({label,value,set,type="text"}:{label:string;value:string;set:(v:string)=>void;type?:string}){
 return <label><Label>{label}</Label><Input className="mt-1" type={type} value={value} onChange={e=>set(e.target.value)}/></label>
}
function Metric({icon,label,value}:{icon:React.ReactNode;label:string;value:number|string}){
 return <div className="rounded-xl border bg-card p-4"><div className="text-muted-foreground">{icon}</div><p className="mt-2 text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>
}
