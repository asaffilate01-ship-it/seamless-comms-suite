import {useMemo, useState, type ChangeEvent} from "react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {Card, CardContent} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {AlertCircle, ClipboardCheck, Download, FileCheck2, LockKeyhole, ShieldCheck} from "lucide-react";
import {toast} from "sonner";
import {assessLiquidityRisk, syntheticLiquidityPolicy} from "./liquidity-risk";
import {formatMinor, type TreasuryInputs, type TreasuryReport} from "./engine";
import {getTreasuryReviewCases, reviewTreasuryCase, submitTreasuryReview} from "./review.functions";

async function hashContents(content:string):Promise<string>{
  if(!globalThis.crypto?.subtle)throw new Error("Cryptographic hashing requires a secure browser context.");
  const hashed=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(content));
  return [...new Uint8Array(hashed)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}
function exportJson(name:string,obj:unknown){
  const url=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:"application/json"}));
  const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function Money({minor,currency}:{minor:number|null;currency:string}){
  return <span className="tabular-nums">{minor===null?"Not assessed":formatMinor(minor,currency)}</span>;
}
export function TreasuryRiskAndReviewPanel({report,inputs,tenantId,entitled,role}:{
  report:TreasuryReport|null;inputs:TreasuryInputs;tenantId:string;entitled:boolean;role:string|null;
}){
  const [policyCSV,setPolicyCSV]=useState("");
  const [policyError,setPolicyError]=useState("");
  const [submitting,setSubmitting]=useState(false);
  const [reviewing,setReviewing]=useState(false);
  const [reviewCase,setReviewCase]=useState("");
  const [note,setNote]=useState("");
  const policies=policyCSV.trim() || (report?.mode==="synthetic_demo"?syntheticLiquidityPolicy():"");
  const {result:risk,error:riskError}=useMemo(()=>{
    if(!report)return {result:null,error:""};
    try{return {result:assessLiquidityRisk(report,policies),error:""};}
    catch(e){return {result:null,error:e instanceof Error?e.message:"Policy validation failed."};}
  },[report,policies]);
  const getFn=useServerFn(getTreasuryReviewCases);
  const submitFn=useServerFn(submitTreasuryReview);
  const reviewFn=useServerFn(reviewTreasuryCase);
  const cases=useQuery({
    queryKey:["treasury-review-metadata",tenantId],
    queryFn:()=>getFn({data:{tenantId}}),
    enabled:!!tenantId&&entitled,
    retry:false
  });
  const canReview=role==="owner"||role==="admin"||role==="platform_admin";
  const selectedCurrency=risk?.weeks[0]?.currency ?? "";
  const [currency,setCurrency]=useState("");
  const activeCurrency=risk?.weeks.some(w=>w.currency===currency)?currency:selectedCurrency;
  const displayWeeks=risk?.weeks.filter(x=>x.currency===activeCurrency)??[];
  const haveDemoLimits=report?.mode==="synthetic_demo"&&!policyCSV.trim();
  async function loadCSV(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];e.target.value="";
    if(!file)return;
    if(!entitled&&report?.mode!=="synthetic_demo"){setPolicyError("Finvessa entitlement required for real financial policies.");return;}
    if(file.size>2_000_000||!file.name.toLowerCase().endsWith(".csv")){setPolicyError("Choose a CSV no larger than 2 MB.");return;}
    try{setPolicyCSV(await file.text());setPolicyError("");}
    catch{setPolicyError("Unable to read the policy file in this browser.");}
  }
  async function submit(){
    if(!report||!risk||!entitled||!tenantId)return;
    setSubmitting(true);
    try{
      // Fingerprints bind the user's exported source inputs and scenario outputs.
      // They are *client-asserted*, not proof of independent data or math verification.
      const reportDigest=await hashContents(JSON.stringify({
        reportDate:report.reportDate,inputs:{
          accountsCSV:inputs.accountsCSV,transactionsCSV:inputs.transactionsCSV,
          ledgerCSV:inputs.ledgerCSV??"",forecastCSV:inputs.forecastCSV
        },sourceReport:report
      }));
      const policyDigest=await hashContents(JSON.stringify({policies,risk}));
      const result=await submitFn({data:{
        tenantId,reportDate:report.reportDate,reportMode:report.mode,
        sourceStatus:report.status,riskStatus:risk.status,
        reportDigest,policyDigest,
        accountCount:report.counts.accounts,reconciledCount:report.counts.reconciled,
        blockingCount:report.issues.filter(x=>x.severity==="blocking").length,
        warningCount:report.issues.filter(x=>x.severity==="warning").length,
        breachCount:risk.issues.filter(x=>x.code==="STRESS_BUFFER_BREACH").length
      }});
      toast.success(result.alreadyExists?"Existing review case located":"Review metadata submitted; independent reviewer required");
      await cases.refetch();
    }catch(e){toast.error(e instanceof Error?e.message:"Review submission failed");}
    finally{setSubmitting(false);}
  }
  async function review(decision:"acknowledged"|"correction_requested"){
    if(!reviewCase||!tenantId||!canReview||note.trim().length<12)return;
    setReviewing(true);
    try{
      await reviewFn({data:{tenantId,caseId:reviewCase,decision,note:note.trim()}});
      toast.success("Independent review decision recorded");
      setReviewCase("");setNote("");
      await cases.refetch();
    }catch(e){toast.error(e instanceof Error?e.message:"Review not permitted");}
    finally{setReviewing(false);}
  }
  return <div className="space-y-6">
    <Card><CardContent className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-lg font-semibold">5. Liquidity limits & stress analysis</h2>
          <p className="mt-1 text-sm text-muted-foreground">Apply explicit treasury-policy floors, outflow shocks and expected-inflow haircuts to every forecast cash flow.</p></div>
        <Badge variant="outline">Read-only financial scenarios</Badge>
      </div>
      <p className="rounded-md border p-3 text-xs text-muted-foreground">
        {haveDemoLimits?"Using deliberately synthetic policy limits for this demonstration. ":
          "Policy values are customer-supplied and not independently approved. "}
        Undrawn facilities are recorded separately and never treated as cash. These are treasury scenario tests, not bank regulatory liquidity ratios.
      </p>
      <code className="block overflow-x-auto rounded-md bg-muted p-3 text-xs">currency,minimum_cash,undrawn_facility,outflow_stress_pct,expected_inflow_haircut_pct</code>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">Import liquidity-policy.csv
          <input type="file" accept=".csv,text/csv" aria-label="Import liquidity policy CSV"
            className="mt-2 block w-full text-xs" onChange={loadCSV} disabled={!entitled&&report?.mode!=="synthetic_demo"}/>
        </label>
        <Button type="button" size="sm" variant="outline" onClick={()=>{setPolicyCSV("");setPolicyError("");}}
          disabled={report?.mode!=="synthetic_demo"&&!policyCSV.trim()}>Reset {report?.mode==="synthetic_demo"?"to synthetic limits":"policy"}</Button>
      </div>
      <Textarea aria-label="Liquidity risk policy CSV" className="font-mono text-xs" rows={4}
        value={policies} placeholder="Upload explicitly approved limits for this company and date"
        onChange={e=>{setPolicyCSV(e.target.value);setPolicyError("");}}
        disabled={!entitled&&report?.mode!=="synthetic_demo"}/>
      {(policyError||riskError)&&<p className="flex items-center gap-2 text-sm text-destructive" role="alert">
        <AlertCircle className="h-4 w-4"/>{policyError||riskError}</p>}
      {risk&&<>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={risk.status==="blocked"||risk.status==="unassessed"?"destructive":"outline"}>
            {risk.status.replaceAll("_"," ")}
          </Badge>
          <span className="text-xs text-muted-foreground">Source cash report: {risk.sourceReportStatus.replaceAll("_"," ")}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {risk.metrics.map(x=><div key={x.currency} className="rounded-lg border p-4">
            <p className="font-semibold">{x.currency} · {x.assessed?"Scenario calculated":"Unassessed"}</p>
            <p className="mt-2 text-xs text-muted-foreground">Stressed minimum</p>
            <p className="font-semibold"><Money minor={x.worstStressedCashMinor} currency={x.currency}/></p>
            <p className="mt-2 text-xs text-muted-foreground">Largest gap vs policy cash floor</p>
            <p className="font-medium"><Money minor={x.maximumBufferGapMinor} currency={x.currency}/></p>
            <p className="mt-1 text-xs">First buffer breach: {x.firstBreachWeek===null?"None evidenced":x.firstBreachWeek===0?"Current":"Week "+x.firstBreachWeek}</p>
          </div>)}
        </div>
        {risk.weeks.length>0&&<div className="space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Risk currency">
            {[...new Set(risk.weeks.map(w=>w.currency))].map(c=><Button key={c} size="sm"
              variant={activeCurrency===c?"default":"outline"} onClick={()=>setCurrency(c)}>{c}</Button>)}
          </div>
          <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>
              <th className="p-3">Week end</th><th className="p-3">Baseline</th><th className="p-3">Stressed cash</th>
              <th className="p-3">Policy cash floor</th><th className="p-3">Gap to floor</th><th className="p-3">Uncovered gap</th>
            </tr></thead><tbody>{displayWeeks.map(x=><tr className="border-t" key={x.weekEnd+x.currency}>
              <td className="p-3">{x.weekEnd}</td><td className="p-3 whitespace-nowrap"><Money minor={x.baselineClosingMinor} currency={x.currency}/></td>
              <td className="p-3 whitespace-nowrap"><Money minor={x.stressedClosingMinor} currency={x.currency}/></td>
              <td className="p-3 whitespace-nowrap"><Money minor={x.bufferMinor} currency={x.currency}/></td>
              <td className="p-3 whitespace-nowrap"><Money minor={x.bufferGapMinor} currency={x.currency}/></td>
              <td className="p-3 whitespace-nowrap"><Money minor={x.uncoveredGapMinor} currency={x.currency}/></td>
            </tr>)}</tbody>
          </table></div>
        </div>}
        {risk.issues.length>0&&<details className="rounded-lg border p-3">
          <summary className="cursor-pointer font-medium">{risk.issues.length} risk findings and source references</summary>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {risk.issues.map((x,i)=><div key={x.code+x.currency+x.week+i} className="rounded-md bg-muted p-3 text-sm">
              <p className="font-semibold">{x.currency} · {x.code} {x.week!==null?"(week "+x.week+")":""}</p>
              <p>{x.description}</p><p className="mt-1 break-all text-xs text-muted-foreground">{x.evidence}</p>
            </div>)}
          </div>
        </details>}
        <Button variant="outline" onClick={()=>exportJson("finvessa-liquidity-risk-"+risk.reportDate+".json",risk)}>
          <Download className="mr-2 h-4 w-4"/>Export risk evidence & methodology
        </Button>
      </>}
    </CardContent></Card>

    <Card><CardContent className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">6. Independent treasury review register</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create a tenant-scoped review request with cryptographic fingerprints and summary counts only.</p></div>
        <Badge variant="outline">No bank records uploaded</Badge>
      </div>
      <div className="flex gap-2 rounded-lg border p-3 text-xs text-muted-foreground">
        <LockKeyhole className="h-4 w-4 shrink-0"/>
        Report fingerprints and counts are asserted by the browser; this is not independent certification of calculations.
        The same person cannot submit and independently review a case. Acknowledgement does not approve a payment, trade or regulatory report.
      </div>
      {!entitled&&<p role="status" className="text-sm text-muted-foreground">
        An active Finvessa tenant entitlement and applied database migration are required to store review metadata.
      </p>}
      {entitled&&<div className="space-y-3">
        <Button onClick={submit} disabled={!report||!risk||submitting}>
          <FileCheck2 className="mr-2 h-4 w-4"/>Submit report fingerprint for independent review
        </Button>
        {cases.isError&&<p className="text-sm text-destructive" role="alert">
          Review register is unavailable. Verify that the Finvessa tenant and Phase 3 migration are deployed.
        </p>}
        <div className="space-y-3">
          {(cases.data?.cases??[]).map(c=><div key={c.id} className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><strong>{c.report_date} · {c.report_mode==="synthetic_demo"?"Synthetic review":"Local report metadata"}</strong>
                <p className="mt-1 text-xs text-muted-foreground">Cash: {c.source_status} · Stress: {c.risk_status} · Reconciled: {c.reconciled_count}/{c.account_count}</p>
              </div>
              <Badge variant="outline">{c.status.replaceAll("_"," ")}</Badge>
            </div>
            <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">Evidence fingerprint: {c.report_digest}</p>
            {c.reviewer_note&&<p className="mt-2 text-xs">Reviewer note: {c.reviewer_note}</p>}
            {c.status==="submitted"&&canReview&&<Button size="sm" variant="outline" className="mt-3"
              onClick={()=>{setReviewCase(c.id);setNote("");}}>Open reviewer decision</Button>}
          </div>)}
        </div>
        {reviewCase&&canReview&&<div className="rounded-lg border p-4 space-y-3">
          <p className="flex gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4"/>Independent reviewer decision</p>
          <Textarea value={note} onChange={e=>setNote(e.target.value)} rows={3}
            placeholder="Explain your review (12–1200 characters). Avoid bank identifiers, customer names and transaction details."
            aria-label="Independent treasury reviewer note"/>
          <div className="flex flex-wrap gap-2">
            <Button disabled={reviewing||note.trim().length<12} onClick={()=>review("acknowledged")}>
              <ClipboardCheck className="mr-2 h-4 w-4"/>Acknowledge review
            </Button>
            <Button variant="outline" disabled={reviewing||note.trim().length<12} onClick={()=>review("correction_requested")}>Request correction</Button>
            <Button variant="ghost" onClick={()=>setReviewCase("")}>Cancel</Button>
          </div>
        </div>}
      </div>}
    </CardContent></Card>
  </div>;
}
