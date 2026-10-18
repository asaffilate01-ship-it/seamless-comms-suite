import {useState,type ChangeEvent} from "react";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Textarea} from "@/components/ui/textarea";
import {Input} from "@/components/ui/input";
import {AlertTriangle,BarChart3,ClipboardCheck,Download,LockKeyhole,RotateCcw,Upload} from "lucide-react";
import {formatMinor} from "./engine";
import {
  analyseTreasuryForecastAccuracy,syntheticForecastAccuracyInput,
  forecastAccuracyMarkdown,type TreasuryForecastAccuracyInputs,
  type TreasuryForecastAccuracyReport
} from "./forecast-accuracy";

function saveLocalReport(name:string,data:string,mime:string){
  const url=URL.createObjectURL(new Blob([data],{type:mime}));
  const a=document.createElement("a");
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function displayWape(bps:number|null){
  return bps===null?"Not assessed":(bps/100).toFixed(2)+"%";
}
function SourceEditor({label,filename,header,content,enabled,onChange,onUpload}:{
  label:string;filename:string;header:string;content:string;enabled:boolean;
  onChange:(v:string)=>void;onUpload:(e:ChangeEvent<HTMLInputElement>)=>void;
}){
  return <div className="space-y-2 rounded-lg border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="font-semibold">{label}</h4>
      <Badge variant="outline">{filename}</Badge>
    </div>
    <code className="block overflow-x-auto rounded bg-muted p-2 text-[11px]">{header}</code>
    <label className="flex flex-wrap items-center gap-2 text-xs font-medium">
      <Upload className="h-4 w-4"/>Import CSV
      <input type="file" accept=".csv,text/csv" className="block w-full text-xs"
        aria-label={"Import "+filename} disabled={!enabled} onChange={onUpload}/>
    </label>
    <Textarea className="font-mono text-xs" rows={5} value={content} disabled={!enabled}
      aria-label={filename+" source contents"} placeholder={header}
      onChange={e=>onChange(e.target.value)}/>
  </div>;
}
export function TreasuryAccuracyPanel({enabled}:{enabled:boolean}){
  const initial=syntheticForecastAccuracyInput();
  const [inputs,setInputs]=useState<TreasuryForecastAccuracyInputs>(initial);
  const [report,setReport]=useState<TreasuryForecastAccuracyReport|null>(
    ()=>analyseTreasuryForecastAccuracy(initial));
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const synthetic=inputs.synthetic===true;
  function edit<K extends keyof TreasuryForecastAccuracyInputs>(key:K,value:TreasuryForecastAccuracyInputs[K]){
    setInputs(p=>({...p,[key]:value,synthetic:false}));
    setReport(null);setError("");
  }
  async function upload(key:"forecastHistoryCsv"|"actualHistoryCsv",e:ChangeEvent<HTMLInputElement>){
    const f=e.target.files?.[0];e.target.value="";
    if(!f)return;
    if(!enabled){setError("Active Finvessa entitlement required for operator-supplied files.");return;}
    if(!f.name.toLowerCase().endsWith(".csv")||f.size>2_000_000){
      setError("Only CSV sources up to 2 MB can be compared.");return;
    }
    try{edit(key,await f.text());}
    catch{setError("Unable to read the selected CSV in this browser.");}
  }
  function reloadSample(){
    const sample=syntheticForecastAccuracyInput();
    setInputs(sample);setReport(analyseTreasuryForecastAccuracy(sample));setError("");
  }
  function analyze(){
    if(!enabled&&!synthetic){setError("Active Finvessa entitlement required for real historical financial data.");return;}
    setLoading(true);
    try{setReport(analyseTreasuryForecastAccuracy(inputs));setError("");}
    catch(e){setReport(null);setError(e instanceof Error?e.message:"Historical evidence validation failed.");}
    finally{setLoading(false);}
  }
  return <Card><CardContent className="space-y-5 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <BarChart3 className="h-5 w-5"/>Treasury Analyst Accuracy & Forecast Backtesting
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Compare a frozen historical 13-week cash forecast against dated actual balances; measure errors without mixing currencies or inventing source data.
        </p>
      </div>
      <Badge variant="outline">Phase 8 · local working paper</Badge>
    </div>
    <div className="flex flex-wrap items-start gap-2 rounded-md border p-3 text-xs text-muted-foreground">
      <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0"/>
      Historical snapshot dates and actual bank evidence are supplied by the operator. They are not independently time-attested:
      a favourable backtest is NOT proof of ex-ante accuracy or superiority to professional treasury analysts.
      CSVs and metrics remain in your browser session; no source file is uploaded to an AI model or bank.
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={reloadSample}><RotateCcw className="mr-2 h-4 w-4"/>Load synthetic history</Button>
      <Badge variant="secondary">{synthetic?"Illustrative fixture":"Operator-supplied, unverified history"}</Badge>
      {!enabled&&<span className="text-xs text-muted-foreground">Active Finvessa tenant needed for real data imports.</span>}
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <SourceEditor filename="historical-forecast.csv" label="1. Historical frozen forecast"
        header="snapshot_id,forecast_frozen_on,currency,week_end,baseline_closing,downside_closing"
        content={inputs.forecastHistoryCsv} enabled={enabled}
        onChange={v=>edit("forecastHistoryCsv",v)} onUpload={e=>upload("forecastHistoryCsv",e)}/>
      <SourceEditor filename="actual-cash.csv" label="2. Independently sourced actual balances"
        header="actual_id,currency,week_end,closing_balance,evidence_as_of"
        content={inputs.actualHistoryCsv} enabled={enabled}
        onChange={v=>edit("actualHistoryCsv",v)} onUpload={e=>upload("actualHistoryCsv",e)}/>
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs font-medium">Evaluation date
        <Input type="date" className="mt-1 w-[180px]" value={inputs.evaluationDate}
          disabled={!enabled}
          onChange={e=>edit("evaluationDate",e.target.value)}/>
      </label>
      <label className="text-xs font-medium">Maximum WAPE tolerance (basis points)
        <Input type="number" min={0} max={10000} className="mt-1 w-[200px]"
          value={inputs.maximumWapeBasisPoints} disabled={!enabled}
          onChange={e=>edit("maximumWapeBasisPoints",Number(e.target.value))}/>
      </label>
      <label className="text-xs font-medium">Minimum comparable weeks
        <Input type="number" min={2} max={13} className="mt-1 w-[190px]"
          value={inputs.minimumComparableWeeks} disabled={!enabled}
          onChange={e=>edit("minimumComparableWeeks",Number(e.target.value))}/>
      </label>
      <Button disabled={loading||(!enabled&&!synthetic)} onClick={analyze}>
        <ClipboardCheck className="mr-2 h-4 w-4"/>Evaluate forecast history
      </Button>
    </div>
    {error&&<p role="alert" className="flex items-center gap-2 text-sm text-destructive">
      <AlertTriangle className="h-4 w-4"/>{error}
    </p>}
    {report&&<div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={report.status==="within_operator_tolerance"?"outline":"destructive"}>
          {report.status.replaceAll("_"," ")}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {report.snapshotId} · freeze date {report.freezeDate} (not independently attested)
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {report.currencies.map(x=><div key={x.currency} className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong>{x.currency}</strong>
            <Badge variant="outline">{x.matchedWeeks}/{x.forecastWeeks} weeks</Badge>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Weighted absolute percentage error</p>
          <p className="font-display text-2xl font-semibold">{displayWape(x.weightedAbsolutePercentageErrorBasisPoints)}</p>
          <p className="mt-2 text-xs text-muted-foreground">Mean absolute cash error</p>
          <p className="text-base font-semibold tabular-nums">{x.meanAbsoluteErrorMinor===null?"Unassessed":formatMinor(x.meanAbsoluteErrorMinor,x.currency)}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Average signed error: {x.signedMeanErrorMinor===null?"Unassessed":formatMinor(x.signedMeanErrorMinor,x.currency)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Actuals inside baseline/downside band: {x.scenarioBandHits}/{x.scenarioBandEvaluated} ·
            Threshold: {x.tolerancePassed===null?"unassessed":x.tolerancePassed?"within operator tolerance":"review required"}
          </p>
        </div>)}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/50"><tr>
            <th className="p-3">Currency</th><th className="p-3">Week end</th>
            <th className="p-3">Forecast closing</th><th className="p-3">Actual closing</th>
            <th className="p-3">Signed cash error</th><th className="p-3">Source rows</th>
          </tr></thead>
          <tbody>{report.observations.map(x=><tr key={x.currency+x.weekEnd} className="border-t">
            <td className="p-3">{x.currency}</td><td className="p-3">{x.weekEnd}</td>
            <td className="p-3 whitespace-nowrap">{formatMinor(x.baselineMinor,x.currency)}</td>
            <td className="p-3 whitespace-nowrap">{formatMinor(x.actualMinor,x.currency)}</td>
            <td className="p-3 whitespace-nowrap">{formatMinor(x.signedErrorMinor,x.currency)}</td>
            <td className="p-3 font-mono text-muted-foreground">{x.forecastEvidence} / {x.actualEvidence}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">{report.findings.length} data-quality findings and limitations</summary>
        <div className="mt-3 space-y-2">
          {report.findings.map((f,i)=><div className="rounded-md bg-muted/50 p-3 text-xs" key={f.code+f.evidence+i}>
            <strong>{f.currency} · {f.code}</strong>
            <p className="mt-1">{f.explanation}</p>
            <p className="mt-1 font-mono text-muted-foreground">{f.evidence}</p>
          </div>)}
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={()=>saveLocalReport("finvessa-forecast-accuracy-"+report.evaluationDate+".md",
          forecastAccuracyMarkdown(report),"text/markdown;charset=utf-8")}>
          <Download className="mr-2 h-4 w-4"/>Download analyst accuracy working paper
        </Button>
        <Button variant="outline" onClick={()=>saveLocalReport("finvessa-forecast-accuracy-"+report.evaluationDate+".json",
          JSON.stringify(report,null,2),"application/json")}>
          <Download className="mr-2 h-4 w-4"/>Download source-linked JSON
        </Button>
      </div>
    </div>}
  </CardContent></Card>;
}
