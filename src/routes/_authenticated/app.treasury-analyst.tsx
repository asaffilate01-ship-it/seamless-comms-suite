import {createFileRoute} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useState, type ChangeEvent} from "react";
import {AppShell} from "@/components/app/shell";
import {Card, CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {useTenant} from "@/hooks/useTenant";
import {getTenantControlPlane} from "@/lib/control-plane.functions";
import {
  analyseTreasury, formatMinor, treasuryDemoInput, treasuryEvidenceCSV,
  type TreasuryInputs, type TreasuryReport, type TreasuryIssue
} from "@/modules/treasury/engine";
import {TreasuryRiskAndReviewPanel} from "@/modules/treasury/TreasuryRiskAndReviewPanel";
import {TreasurySourceImportPanel} from "@/modules/treasury/TreasurySourceImportPanel";
import {AlertTriangle, CheckCircle2, ClipboardCheck, Download, FileSpreadsheet, Landmark, LockKeyhole,
  RotateCcw, ShieldCheck, TrendingUp, Upload, Wallet} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/treasury-analyst")({
  component: TreasuryAnalystWorkbench,
  head: () => ({meta: [
    {title: "Finvessa Treasury Analyst Workbench — Omniqora"},
    {name: "robots", content: "noindex"}
  ]})
});

const inputSpecs = [
  {key: "accountsCSV", title: "Accounts & opening balances", file: "accounts.csv",
    schema: "account_id,currency,as_of,opening_balance", description: "Account-level opening balances as at a specified date."},
  {key: "transactionsCSV", title: "Posted bank transactions", file: "transactions.csv",
    schema: "transaction_id,account_id,currency,date,reference,amount,closing_balance",
    description: "Signed movements and independently supplied running balances."},
  {key: "ledgerCSV", title: "General-ledger cross-check", file: "ledger.csv",
    schema: "ledger_id,account_id,currency,date,reference,amount",
    description: "A separate book-of-record export for bank-to-ledger reconciliation."},
  {key: "forecastCSV", title: "Future cash flows", file: "forecast.csv",
    schema: "account_id,date,reference,amount,certainty",
    description: "Dated movements with certainty: committed or expected."}
] as const;
type InputKey = typeof inputSpecs[number]["key"];
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

function saveBrowserFile(name: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], {type}));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
function Indicator({label, value, icon: Icon}: {
  label: string; value: string | number; icon: typeof Wallet
}) {
  return <Card><CardContent className="flex items-start justify-between p-5">
    <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-2 font-display text-2xl font-semibold">{value}</div></div>
    <Icon className="h-5 w-5 text-primary" aria-hidden="true"/>
  </CardContent></Card>;
}
function SeverityBadge({issue}: {issue: TreasuryIssue}) {
  return <Badge variant={issue.severity === "blocking" ? "destructive" : "outline"}>{issue.severity}</Badge>;
}
function DataInput({spec, value, enabled, onText, onFile}: {
  spec: typeof inputSpecs[number]; value: string; enabled: boolean;
  onText: (s: string) => void; onFile: (e: ChangeEvent<HTMLInputElement>) => void
}) {
  return <div className="rounded-xl border border-border p-4 space-y-3">
    <div className="flex flex-wrap justify-between gap-2">
      <div><h3 className="font-semibold">{spec.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{spec.description}</p></div>
      <Badge variant="outline">{spec.file}</Badge>
    </div>
    <code className="block overflow-x-auto rounded-md bg-muted px-3 py-2 text-[11px]">{spec.schema}</code>
    <label className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium">
      <Upload className="h-4 w-4" aria-hidden="true"/>Import CSV (max 2 MB)
      <input aria-label={"Import " + spec.file} className="block w-full text-xs file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-2"
        type="file" accept=".csv,text/csv,text/plain" disabled={!enabled} onChange={onFile}/>
    </label>
    <label className="block text-xs text-muted-foreground">Or paste CSV contents for this source</label>
    <Textarea aria-label={spec.file + " CSV contents"} rows={3} value={value}
      onChange={e => onText(e.target.value)} disabled={!enabled}
      className="font-mono text-xs" placeholder={spec.schema}/>
  </div>;
}

function TreasuryAnalystWorkbench() {
  const t = useTenant();
  const tenantFn = useServerFn(getTenantControlPlane);
  const q = useQuery({
    queryKey: ["treasury-analyst-entitlement", t.tenantId],
    queryFn: () => tenantFn({data: {tenantId: t.tenantId!}}),
    enabled: !!t.tenantId,
    retry: false
  });
  const enabled = (q.data?.products ?? []).some(p => p.product_key === "finvessa" &&
    ["active", "enabled", "live"].includes(p.status));
  const [inputs, setInputs] = useState<TreasuryInputs>(() => treasuryDemoInput(today()));
  const [report, setReport] = useState<TreasuryReport | null>(() => analyseTreasury(treasuryDemoInput(today())));
  const [error, setError] = useState("");
  const [activeCurrency, setActiveCurrency] = useState("GBP");
  const [working, setWorking] = useState(false);
  const isDemo = inputs.demo === true;
  const canEdit = isDemo || enabled;

  function changeData(key: InputKey, value: string) {
    setInputs(p => ({...p, [key]: value, demo: false}));
    setReport(null);
    setError("");
  }
  async function importFile(key: InputKey, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!enabled) {
      setError("Live data import requires an active Finvessa tenant entitlement.");
      event.target.value = "";
      return;
    }
    if (file.size > 2_000_000 || !file.name.toLowerCase().endsWith(".csv")) {
      setError("Use a CSV file no larger than 2 MB.");
      event.target.value = "";
      return;
    }
    try {
      const contents = await file.text();
      changeData(key, contents);
    } catch {
      setError("The selected CSV could not be read locally.");
    }
    event.target.value = "";
  }
  function loadDemo() {
    const demo = treasuryDemoInput(today());
    setInputs(demo);
    setReport(analyseTreasury(demo));
    setActiveCurrency("GBP");
    setError("");
  }
  function clearAll() {
    setInputs({reportDate: today(), accountsCSV: "", transactionsCSV: "", ledgerCSV: "", forecastCSV: "", demo: false});
    setReport(null);
    setError("");
  }
  function runAnalysis() {
    if (!canEdit || (inputs.demo !== true && !enabled)) {
      setError("Live data import requires an active Finvessa tenant entitlement.");
      return;
    }
    setWorking(true);
    try {
      const output = analyseTreasury(inputs);
      setReport(output);
      setActiveCurrency(output.weeks[0]?.currency ?? output.currencyPositions[0]?.currency ?? "GBP");
      setError("");
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : "Source validation failed.");
    } finally {
      setWorking(false);
    }
  }
  const filteredWeeks = (report?.weeks ?? []).filter(x => x.currency === activeCurrency);
  const forecastCurrencies = [...new Set((report?.weeks ?? []).map(x => x.currency))];
  const blocked = report?.issues.filter(x => x.severity === "blocking").length ?? 0;
  const warnings = report?.issues.filter(x => x.severity === "warning").length ?? 0;
  const basename = "finvessa-treasury-" + (report?.reportDate ?? today());

  return <AppShell title="Finvessa Treasury Analyst Workbench"
    subtitle="Cash positions, bank reconciliation, 13-week liquidity forecasts, exception investigations and exportable evidence. Controlled pilot — no payment or trade execution.">
    <div className="space-y-6">
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true"/>
          <strong className="text-sm">Analyst workflow, not an AI chatbot</strong>
          <Badge variant="outline">Browser-local calculations</Badge>
          <Badge variant="outline">No external financial connections</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Every total uses integer minor units and remains in its original currency. Source rows, validation issues
          and forecast assumptions remain visible. Financial decisions require authorised human review.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Indicator icon={Landmark} label="Bank accounts" value={report?.counts.accounts ?? "—"}/>
        <Indicator icon={CheckCircle2} label="Reconciled accounts" value={report ? report.counts.reconciled + "/" + report.counts.accounts : "—"}/>
        <Indicator icon={AlertTriangle} label="Blocking / warnings" value={report ? blocked + " / " + warnings : "—"}/>
        <Indicator icon={TrendingUp} label="Forecast periods" value={report ? (report.weeks.length ? "13 weeks" : "Not evidenced") : "—"}/>
      </div>

      <TreasurySourceImportPanel reportDate={inputs.reportDate} enabled={enabled}
        onApplySource={(kind,canonicalCSV)=>changeData(kind==="bank_transactions"?"transactionsCSV":"ledgerCSV",canonicalCSV)}/>
      <Card><CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold">1. Prepare treasury sources</h2>
            <p className="mt-1 text-sm text-muted-foreground">Synthetic example includes bank transactions, an independent ledger and forecast obligations. Real data imports require an authorised Finvessa tenant.</p></div>
          <Badge variant={isDemo ? "secondary" : "outline"}>{isDemo ? "Synthetic demonstration" : "Locally imported data"}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium" htmlFor="treasury-report-date">Report as-of date</label>
          <Input id="treasury-report-date" className="max-w-[185px]" type="date" value={inputs.reportDate}
            onChange={e => { setInputs(p => ({...p, reportDate: e.target.value})); setReport(null); }}
            disabled={!canEdit}/>
          <Button variant="outline" onClick={loadDemo}><RotateCcw className="mr-2 h-4 w-4"/>Load synthetic demo</Button>
          <Button variant="outline" disabled={!enabled} onClick={clearAll}>Start new import</Button>
        </div>
        {!enabled && <div role="status" className="flex items-start gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0"/>
          <span>Finvessa product entitlement is not verified for this tenant. The synthetic demonstration works; external statement imports are disabled.
            Connect and activate Finvessa through the SaaS Factory before testing real financial records.</span>
        </div>}
        {q.isError && <p role="alert" className="text-sm text-destructive">
          Product entitlement could not be verified. Only the synthetic demonstration is permitted.
        </p>}
        <div className="grid gap-4 xl:grid-cols-2">
          {inputSpecs.map(spec => <DataInput key={spec.key} spec={spec}
            enabled={enabled} value={inputs[spec.key] ?? ""}
            onText={value => changeData(spec.key, value)}
            onFile={event => importFile(spec.key, event)}/>)}
        </div>
        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={runAnalysis} disabled={!canEdit || working}>
            <ClipboardCheck className="mr-2 h-4 w-4"/>Run validated analysis
          </Button>
          <span className="text-xs text-muted-foreground">No bank login, model invocation, network upload, posting or payment is performed.</span>
        </div>
      </CardContent></Card>

      {report && <>
        <Card><CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-lg font-semibold">2. Analyst findings</h2>
              <p className="text-xs text-muted-foreground">As of {report.reportDate} · Created {new Date(report.generatedAt).toLocaleString()} · {report.mode}</p></div>
            <Badge variant={report.status === "blocked" ? "destructive" : "outline"}>
              {report.status === "blocked" ? "Blocked — do not sign off" : report.status === "review_required" ? "Requires analyst review" : "Passed built-in checks"}
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {report.currencyPositions.map(x => <div key={x.currency} className="rounded-lg border bg-muted/30 p-4">
              <span className="text-xs text-muted-foreground">{x.currency} · {x.accounts} account(s)</span>
              <div className="mt-1 text-lg font-semibold tabular-nums">{formatMinor(x.balanceMinor, x.currency)}</div>
            </div>)}
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr><th className="p-3">Account</th><th className="p-3">Currency</th><th className="p-3">Calculated cash position</th><th className="p-3">Last evidence</th><th className="p-3">Closing balance checks</th><th className="p-3">Bank ↔ GL matches</th><th className="p-3">Status</th></tr>
              </thead>
              <tbody>{report.positions.map(x => <tr key={x.accountId} className="border-t">
                <td className="p-3 font-medium">{x.accountId}</td><td className="p-3">{x.currency}</td>
                <td className="p-3 tabular-nums">{formatMinor(x.balanceMinor, x.currency)}</td>
                <td className="p-3">{x.lastEvidenceDate}</td><td className="p-3">{x.checkedBalances}/{x.transactions}</td>
                <td className="p-3">{x.matchedLedger}/{x.transactions}</td>
                <td className="p-3"><Badge variant={x.reconciled ? "outline" : "destructive"}>
                  {x.reconciled ? "Bank ↔ GL matched" : "Investigate"}</Badge></td>
              </tr>)}</tbody>
            </table>
          </div>
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-semibold">Inspect {report.matchedPairs.length} exact bank-to-ledger matches and source rows</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50"><tr><th className="p-2">Account</th><th className="p-2">Date</th><th className="p-2">Amount</th><th className="p-2">Bank source</th><th className="p-2">Ledger source</th></tr></thead>
                <tbody>{report.matchedPairs.map(x => <tr key={x.bankEvidence + x.ledgerEvidence} className="border-t">
                  <td className="p-2">{x.accountId}</td><td className="p-2">{x.date}</td>
                  <td className="p-2 tabular-nums">{formatMinor(x.amountMinor, x.currency)}</td>
                  <td className="p-2 font-mono">{x.bankEvidence}</td><td className="p-2 font-mono">{x.ledgerEvidence}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </details>
        </CardContent></Card>
        <Card><CardContent className="p-5 space-y-4">
          <div><h2 className="text-lg font-semibold">3. Thirteen-week cash outlook</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Baseline includes committed and expected movements. Downside excludes unconfirmed inflows while retaining possible outflows.
              No currency conversion or invented market rates.
            </p></div>
          {report.weeks.length ? <>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Forecast currency">
              {forecastCurrencies.map(currency => <Button key={currency} size="sm"
                variant={currency === activeCurrency ? "default" : "outline"}
                onClick={() => setActiveCurrency(currency)}>{currency}</Button>)}
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>
                  <th className="p-3">Week ending</th><th className="p-3">Committed change</th>
                  <th className="p-3">Expected change</th><th className="p-3">Baseline closing</th>
                  <th className="p-3">Downside closing</th><th className="p-3">Evidence rows</th>
                </tr></thead>
                <tbody>{filteredWeeks.map(x => <tr key={x.currency + x.week} className="border-t">
                  <td className="p-3 whitespace-nowrap">{x.weekEnd}</td>
                  <td className="p-3 whitespace-nowrap tabular-nums">{formatMinor(x.committedMinor, x.currency)}</td>
                  <td className="p-3 whitespace-nowrap tabular-nums">{formatMinor(x.expectedMinor, x.currency)}</td>
                  <td className="p-3 whitespace-nowrap tabular-nums">{formatMinor(x.closingBaseMinor, x.currency)}</td>
                  <td className="p-3 whitespace-nowrap tabular-nums">{formatMinor(x.closingDownsideMinor, x.currency)}</td>
                  <td className="p-3 text-xs text-muted-foreground">{x.sourceRows.join(", ") || "No movement"}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </> : <p className="rounded-lg border p-4 text-sm text-muted-foreground">
            No evidence-backed forecast is available. Upload future-dated cash-flow records to calculate a 13-week outlook.
          </p>}
        </CardContent></Card>
        <Card><CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap justify-between gap-3">
            <div><h2 className="text-lg font-semibold">4. Exceptions, review and evidence</h2>
              <p className="mt-1 text-sm text-muted-foreground">{report.issues.length} exception(s), each linked to input evidence.</p></div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => saveBrowserFile(basename + ".csv",
                treasuryEvidenceCSV(report), "text/csv;charset=utf-8")}>
                <FileSpreadsheet className="mr-2 h-4 w-4"/>Export evidence CSV
              </Button>
              <Button variant="outline" onClick={() => saveBrowserFile(basename + ".json",
                JSON.stringify(report, null, 2), "application/json")}>
                <Download className="mr-2 h-4 w-4"/>Export full audit JSON
              </Button>
            </div>
          </div>
          {report.issues.length ? <div className="space-y-2">
            {report.issues.map((x, i) => <div key={x.evidence + x.code + i} className="flex flex-wrap items-start gap-3 rounded-lg border p-3">
              <SeverityBadge issue={x}/>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{x.code}</p>
                <p className="mt-1 text-sm">{x.message}</p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{x.evidence}</p>
              </div></div>)}
          </div> : <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-primary"/>No issues detected by the implemented deterministic checks.
          </p>}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4"/>Methodology & limits</p>
            {report.methodology.map(x => <p key={x} className="text-xs text-muted-foreground">{x}</p>)}
          </div>
        </CardContent></Card>
        <TreasuryRiskAndReviewPanel report={report} inputs={inputs} tenantId={t.tenantId ?? ""} entitled={enabled} role={t.role}/>
      </>}
      <div className="flex items-center gap-2 rounded-lg border p-3 text-xs text-muted-foreground">
        <LockKeyhole className="h-4 w-4 shrink-0"/>This pilot performs browser-local, deterministic financial analysis.
        Live treasury data persistence, independent bank verification, regulated workflows, SWIFT connectivity and enterprise AI integrations require separate deployment and security approval.
      </div>
    </div>
  </AppShell>;
}
