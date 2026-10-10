import {useEffect, useRef, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {Card, CardContent} from '@/components/ui/card';
import {Badge} from '@/components/ui/badge';
import {beginPowerBiConnection, completePowerBiConnection, disconnectPowerBi, discoverPowerBi, getPowerBiWorkspace, investigatePowerBi} from './powerbi.functions';
import type {BiInvestigation} from './powerbi.types';

const messages: Record<string, string> = {
  BI_PILOT_DISABLED: 'This pilot is disabled. Deployment configuration is required before connecting a real account.',
  BI_TENANT_NOT_CONFIGURED: 'Your tenant has no approved Power BI models yet. An administrator must configure the integration.',
  BI_RECONNECT_REQUIRED: 'Your Microsoft session has expired or is unavailable. Connect your Microsoft account again.',
  BI_PROVIDER_ACCESS_DENIED: 'Microsoft denied access. Check your Power BI model permissions and the Execute Queries tenant setting.',
  BI_MODEL_ACCESS_DENIED: 'This approved model is not accessible with your connected Microsoft account.',
  BI_RATE_LIMITED: 'The request limit has been reached. Do not repeatedly retry; try again after the current rate-limit window.',
  BI_INCOMPLETE_RESULT: 'The provider result is incomplete or exceeds the pilot limit. No analysis has been released.',
  BI_INVALID_PERIODS: 'Use equal-length, non-overlapping periods of at most 366 days, with the earlier period first.',
  BI_MISSING_OR_NONNUMERIC_VALUE: 'A metric contains blank or non-numeric values. Review the approved metric’s blank-value policy.',
  BI_OAUTH_STATE_INVALID: 'The sign-in attempt expired, was already used, or belongs to another user. Start a new connection.',
  BI_STORAGE_UNAVAILABLE: 'The Power BI storage migration is missing or unavailable.',
};
const message = (error: unknown) => {
  const code = error instanceof Error ? error.message : String(error);
  return messages[code] ?? `The operation could not complete (${code.slice(0, 180)}). No successful result is assumed.`;
};
const number = (value: number | null) => value === null ? 'Not calculated' : new Intl.NumberFormat(undefined, {maximumFractionDigits: 4}).format(value);

export function PowerBiWorkbench({tenantId}: {tenantId: string}) {
  // The parent keys this component by tenant. Results are memory-only, not in a shared query cache.
  const getFn = useServerFn(getPowerBiWorkspace), beginFn = useServerFn(beginPowerBiConnection), completeFn = useServerFn(completePowerBiConnection);
  const disconnectFn = useServerFn(disconnectPowerBi), discoverFn = useServerFn(discoverPowerBi), investigateFn = useServerFn(investigatePowerBi);
  const q = useQuery({queryKey: ['powerbi-workspace', tenantId], queryFn: () => getFn({data: {tenantId}}), enabled: !!tenantId, retry: false, gcTime: 0, staleTime: 0});
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [modelKey, setModelKey] = useState(''), [metricKey, setMetricKey] = useState(''), [dimensionKey, setDimensionKey] = useState('');
  const [dates, setDates] = useState({previousStart: '', previousEnd: '', currentStart: '', currentEnd: ''});
  const [result, setResult] = useState<(BiInvestigation & {runId: string}) | null>(null);
  const [availability, setAvailability] = useState<{key: string; label: string; available: boolean}[]>([]);
  const callbackStarted = useRef(false), active = useRef(true);
  const model = q.data?.models.find(item => item.key === modelKey);
  useEffect(() => { active.current = true; return () => {active.current = false;}; }, []);
  useEffect(() => {
    setResult(null); setAvailability([]);
  }, [q.data?.principal, q.data?.connected]);
  useEffect(() => {
    if (!q.data?.expiresAt) return;
    const timer = window.setTimeout(() => {setResult(null); setAvailability([]); void q.refetch();}, Math.max(0, Date.parse(q.data.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [q.data?.expiresAt]);
  useEffect(() => {
    if (!tenantId || callbackStarted.current) return;
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (!params.has('code') && !params.has('error')) return;
    callbackStarted.current = true;
    // Codes arrive in the fragment so they are not sent in HTTP URLs or referrer headers.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (params.has('error')) {setError('Microsoft sign-in was cancelled or denied. Start a new connection.'); return;}
    setBusy(true);
    void completeFn({data: {state: params.get('state') ?? '', code: params.get('code') ?? ''}})
      .then(value => {if (active.current) {setNotice(value.tenantId === tenantId ? 'Microsoft account connected for this session.' : 'Account connected. Select the tenant where you started the connection.'); void q.refetch();}})
      .catch(value => {if (active.current) setError(message(value));})
      .finally(() => {if (active.current) setBusy(false);});
  }, [tenantId, completeFn]);
  async function run(operation: () => Promise<void>) {
    setBusy(true); setError(''); setNotice(''); setResult(null);
    try {await operation();} catch (value) {if (active.current) setError(message(value));}
    finally {if (active.current) setBusy(false);}
  }
  const ready = !!q.data?.ready, connected = !!q.data?.connected;
  return <Card className="mt-6"><CardContent className="space-y-5 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Power BI investigation workspace</h2>
        <p className="mt-1 text-sm text-muted-foreground">Approved semantic measures, verified period comparisons and evidence-linked segment analysis.</p></div>
      <div className="flex gap-2"><Badge variant="outline">Read-only pilot</Badge><Badge variant="outline">No autonomous writes</Badge></div>
    </div>
    <p className="text-sm text-muted-foreground">Connect your own Microsoft account. Queries use that account’s existing Power BI permissions. Administrator, Member and Contributor accounts can have broader access than Viewer accounts; this panel does not narrow those permissions.</p>
    {q.isPending && tenantId && <p role="status">Checking tenant configuration…</p>}
    {q.error && <p role="alert">{message(q.error)}</p>}
    {q.data?.problem && <p role="status">{message(new Error(q.data.problem))}</p>}
    <div className="flex flex-wrap gap-2">
      <Button disabled={!ready || busy} onClick={() => void run(async () => {
        const value = await beginFn({data: {tenantId}}); if (active.current) window.location.assign(value.authorizationUrl);
      })}>{connected ? 'Reconnect Microsoft account' : 'Connect Microsoft account'}</Button>
      <Button variant="outline" disabled={!connected || busy} onClick={() => void run(async () => {
        const value = await discoverFn({data: {tenantId}}); if (active.current) setAvailability(value.models);
      })}>Check approved model access</Button>
      <Button variant="outline" disabled={!ready || busy} onClick={() => void run(async () => {
        await disconnectFn({data: {tenantId}}); if (active.current) {setAvailability([]); setNotice('Stored session removed. This does not revoke consent in Microsoft.'); await q.refetch();}
      })}>Disconnect</Button>
    </div>
    {connected && <p className="text-sm">Connected session expires: {q.data?.expiresAt ? new Date(q.data.expiresAt).toLocaleString() : 'Unknown'}. Unattended monitoring is not enabled.</p>}
    {availability.length > 0 && <div className="flex flex-wrap gap-2">{availability.map(item => <Badge variant="outline" key={item.key}>{item.label}: {item.available ? 'Accessible' : 'Not accessible'}</Badge>)}</div>}
    <form className="space-y-4" onSubmit={event => {event.preventDefault(); void run(async () => {
      const value = await investigateFn({data: {tenantId, modelKey, metricKey, dimensionKey: dimensionKey || null, ...dates, maxSegments: 100}});
      if (active.current) setResult(value);
    });}}>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm"><span>Approved model</span><select className="w-full rounded border bg-background p-2" value={modelKey} required disabled={busy} onChange={event => {setModelKey(event.target.value); setMetricKey(''); setDimensionKey(''); setResult(null);}}>
          <option value="">Select model</option>{q.data?.models.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select></label>
        <label className="space-y-1 text-sm"><span>Governed metric</span><select className="w-full rounded border bg-background p-2" value={metricKey} required disabled={!model || busy} onChange={event => {setMetricKey(event.target.value); setResult(null);}}>
          <option value="">Select metric</option>{model?.measures.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select></label>
        <label className="space-y-1 text-sm"><span>Break down by</span><select className="w-full rounded border bg-background p-2" value={dimensionKey} disabled={!model || busy} onChange={event => {setDimensionKey(event.target.value); setResult(null);}}>
          <option value="">Total only</option>{model?.dimensions.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{(['previousStart', 'previousEnd', 'currentStart', 'currentEnd'] as const).map((key, index) =>
        <label className="space-y-1 text-sm" key={key}><span>{['Earlier period start', 'Earlier period end', 'Current period start', 'Current period end'][index]}</span>
          <input className="w-full rounded border bg-background p-2" type="date" required disabled={busy} value={dates[key]} onChange={event => {setDates({...dates, [key]: event.target.value}); setResult(null);}} />
        </label>)}</div>
      <p className="text-xs text-muted-foreground">Use equal-length, non-overlapping periods. Results exceeding 100 segments are withheld, not silently truncated. This pilot does not accept free-form DAX or send your results to an LLM.</p>
      <Button type="submit" disabled={!connected || !modelKey || !metricKey || busy}>{busy ? 'Working…' : 'Investigate metric change'}</Button>
    </form>
    {error && <p role="alert" className="text-sm">{error}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}
    {result && <section className="space-y-4" aria-label="Investigation result">
      <h3 className="font-semibold">{result.metric} — {result.periodDays}-day comparison</h3>
      <div className="grid gap-3 sm:grid-cols-3">{[['Earlier', result.total.previous], ['Current', result.total.current], ['Change', result.total.change]].map(([label, value]) =>
        <div className="rounded border p-3" key={String(label)}><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-semibold">{number(Number(value))}</div></div>)}</div>
      <p className="text-sm">Unit: {result.unit === 'ratio' ? 'ratio (0–1 convention)' : result.unit === 'currency' ? 'model currency units' : 'number'}. Percentage change: {number(result.total.percentChange)}{result.total.percentChange !== null ? '%' : ''}.
        {result.percentagePointChange !== null && ` Change in percentage points: ${number(result.percentagePointChange)}.`}</p>
      <p className="text-sm">{result.narrative}</p>
      <p className="text-sm">Reconciliation: <strong>{result.reconciliation.status.replace('_', ' ')}</strong>. Contribution attribution: {result.contributionEligible ? 'eligible on reconciled arithmetic only' : 'disabled'}.</p>
      {result.segments.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Segment changes, largest absolute movement first</caption>
        <thead><tr><th className="p-2">Segment</th><th className="p-2 text-right">Earlier</th><th className="p-2 text-right">Current</th><th className="p-2 text-right">Change</th></tr></thead>
        <tbody>{result.segments.map((item, index) => <tr className="border-t" key={`${index}:${item.segment}`}><td className="p-2">{item.segment}</td><td className="p-2 text-right">{number(item.previous)}</td><td className="p-2 text-right">{number(item.current)}</td><td className="p-2 text-right">{number(item.change)}</td></tr>)}</tbody>
      </table></div>}
      <div className="space-y-1">{result.warnings.map(warning => <p className="text-xs text-muted-foreground" key={warning}>{warning}</p>)}</div>
      <details className="rounded border p-3"><summary className="cursor-pointer text-sm">Source evidence and audit reference</summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({runId: result.runId, ...result.evidence, reconciliation: result.reconciliation}, null, 2)}</pre>
      </details>
    </section>}
  </CardContent></Card>;
}
