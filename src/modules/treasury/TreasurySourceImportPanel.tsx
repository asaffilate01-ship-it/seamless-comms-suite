import {useMemo, useState, type ChangeEvent} from "react";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Textarea} from "@/components/ui/textarea";
import {AlertTriangle, Download, FileCheck2, Landmark, LockKeyhole, RefreshCcw, Upload} from "lucide-react";
import {
  normalizeTreasuryExport, syntheticTreasuryExport, treasurySourceProfiles,
  type TreasuryAdapterKey, type TreasurySourceKind
} from "./source-adapters";

function localCsvDownload(name:string,body:string){
  const link=URL.createObjectURL(new Blob([body],{type:"text/csv;charset=utf-8"}));
  const anchor=document.createElement("a");
  anchor.href=link;anchor.download=name;document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(link),5000);
}
export function TreasurySourceImportPanel({reportDate,enabled,onApplySource}:{
  reportDate:string;
  enabled:boolean;
  onApplySource:(kind:TreasurySourceKind,canonicalCSV:string)=>void;
}){
  const [profileKey,setProfileKey]=useState<TreasuryAdapterKey>("bank-debit-credit-v1");
  const [raw,setRaw]=useState("");
  const [mode,setMode]=useState<"empty"|"synthetic_sample"|"operator_file">("empty");
  const [fileError,setFileError]=useState("");
  const [success,setSuccess]=useState("");
  const profile=treasurySourceProfiles.find(x=>x.key===profileKey)!;
  const preview=useMemo(()=>{
    if(!raw.trim())return {normalized:null,error:""};
    try{return{normalized:normalizeTreasuryExport({profileKey,csv:raw}),error:""};}
    catch(e){return{normalized:null,error:e instanceof Error?e.message:"Source export could not be validated."};}
  },[raw,profileKey]);
  const normal=preview.normalized;
  function switchProfile(key:TreasuryAdapterKey){
    setProfileKey(key);setRaw("");setMode("empty");setFileError("");setSuccess("");
  }
  function loadSample(){
    try{
      setRaw(syntheticTreasuryExport(profileKey,reportDate));
      setMode("synthetic_sample");setFileError("");setSuccess("");
    }catch(e){setFileError(e instanceof Error?e.message:"Sample failed to load.");}
  }
  async function upload(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value="";
    if(!file)return;
    setFileError("");setSuccess("");
    if(!enabled){setFileError("Active Finvessa entitlement required for real financial source imports.");return;}
    if(file.size>2_000_000||!file.name.toLowerCase().endsWith(".csv")){
      setFileError("Select a CSV export no larger than 2 MB.");return;
    }
    try{setRaw(await file.text());setMode("operator_file");}
    catch{setFileError("The selected export could not be read in the browser.");}
  }
  function apply(){
    if(!normal||!enabled){
      setFileError("Source application requires an active Finvessa tenant.");return;
    }
    onApplySource(normal.kind,normal.canonicalCSV);
    setSuccess(normal.normalizedRows+" normalized rows moved into the analyst inputs. Run the full reconciliation and review the result.");
  }
  return <Card><CardContent className="space-y-4 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Landmark className="h-5 w-5"/>Read-only bank & ERP export adapters</h2>
        <p className="mt-1 text-sm text-muted-foreground">Turn bank and cash-asset GL exports into the strict canonical TreasuryOS schema. No bank login, ERP API or funds movement.</p>
      </div>
      <Badge variant="outline">Manual CSV bridge only</Badge>
    </div>
    <div className="rounded-lg border p-3 text-xs text-muted-foreground">
      <strong>Source authority:</strong> These are operator-supplied export schemas, not certified vendor integrations. GL debit/credit mapping assumes a cash <em>asset</em> ledger only. Uploaded file data and mapping results remain in this browser session.
    </div>
    <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
      <label className="text-sm font-medium">
        Input adapter
        <select className="mt-1 block h-10 w-full rounded-md border bg-background px-3 text-sm"
          aria-label="Treasury source adapter" value={profileKey}
          onChange={e=>switchProfile(e.target.value as TreasuryAdapterKey)}>
          {treasurySourceProfiles.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <Button variant="outline" type="button" onClick={loadSample}><RefreshCcw className="mr-2 h-4 w-4"/>Load synthetic example</Button>
        <Badge variant="secondary">{profile.kind==="bank_transactions"?"Bank entries":"Cash GL entries"}</Badge>
      </div>
    </div>
    <p className="text-xs text-muted-foreground">{profile.explanation}</p>
    <code className="block overflow-x-auto rounded-md bg-muted p-3 text-xs">{profile.inputColumns.join(",")}</code>
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-sm font-medium">
        <span className="flex items-center gap-2"><Upload className="h-4 w-4"/>Import bank/GL export CSV</span>
        <input className="mt-2 block w-full text-xs" aria-label="Import source export" type="file"
          accept=".csv,text/csv,text/plain" onChange={upload} disabled={!enabled}/>
      </label>
      <Badge variant="outline">
        {mode==="synthetic_sample"?"Synthetic sample":mode==="operator_file"?"Locally supplied export":"No source loaded"}
      </Badge>
    </div>
    {!enabled&&<p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      <LockKeyhole className="h-4 w-4"/>Only the synthetic sample is available until this tenant has an active Finvessa product.</p>}
    <Textarea aria-label="Treasury source CSV" className="font-mono text-xs" rows={4}
      value={raw} disabled={!enabled} placeholder="Load the synthetic example or paste an authorised bank/GL CSV export"
      onChange={e=>{setRaw(e.target.value);setMode("operator_file");setSuccess("");}}/>
    {(fileError||preview.error)&&<p role="alert" className="flex gap-2 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>{fileError||preview.error}</p>}
    {normal&&<div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline"><FileCheck2 className="mr-1 inline h-3 w-3"/>Schema and numeric validation passed</Badge>
        <span className="text-xs text-muted-foreground">{normal.sourceRows} input rows → {normal.normalizedRows} canonical rows, no dropped lines</span>
      </div>
      <div className="max-h-72 overflow-auto rounded-lg border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/50"><tr>
            <th className="p-2">Export evidence</th><th className="p-2">Normalized evidence</th>
            <th className="p-2">Account</th><th className="p-2">Date</th><th className="p-2">Currency</th>
            <th className="p-2">Signed movement</th>
          </tr></thead>
          <tbody>{normal.rows.slice(0,10).map(r=><tr key={r.sourceRow} className="border-t">
            <td className="p-2 font-mono">{r.sourceRow}</td>
            <td className="p-2 font-mono">{r.outputRow}</td>
            <td className="p-2">{r.accountId}</td><td className="p-2">{r.date}</td><td className="p-2">{r.currency}</td>
            <td className="p-2 tabular-nums">{r.amount}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {normal.rows.length>10&&<p className="text-xs text-muted-foreground">First 10 records shown; all normalized records are included in the output.</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!enabled} onClick={apply}>Apply to treasury inputs</Button>
        <Button type="button" variant="outline" onClick={()=>localCsvDownload(normal.canonicalFile,normal.canonicalCSV)}>
          <Download className="mr-2 h-4 w-4"/>Download normalized {normal.canonicalFile}
        </Button>
      </div>
      {success&&<p role="status" className="text-sm text-primary">{success}</p>}
      <p className="text-xs text-muted-foreground">
        A successful adapter validation does not prove the export is authentic, complete or bank certified.
        Reconcile the normalized entries against independently supplied opening balances and the other source.
      </p>
    </div>}
  </CardContent></Card>;
}
