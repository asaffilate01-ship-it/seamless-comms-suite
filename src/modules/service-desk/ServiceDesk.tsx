import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { ArrowUpRight, Building2, CirclePlus, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { attentionReasons, canSubmit, normaliseTitle, selectQueue } from './model';
import type { Queue } from './model';
import { serviceWorkspaces, serviceQueue, submitServiceRequest } from './service.functions';

type Workspaces = Awaited<ReturnType<typeof serviceWorkspaces>>;
type Snapshot = Awaited<ReturnType<typeof serviceQueue>>;
const queues: { key: Queue; label: string }[] = [
  { key: 'active', label: 'Active requests' }, { key: 'urgent', label: 'Needs attention' },
  { key: 'unassigned', label: 'Unassigned' }, { key: 'waiting', label: 'Awaiting customer' },
  { key: 'closed', label: 'Closed' }, { key: 'all', label: 'All requests' },
];
const selectClass = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700';

export function ServiceDesk() {
  const getWorkspaces = useServerFn(serviceWorkspaces);
  const getQueue = useServerFn(serviceQueue);
  const submit = useServerFn(submitServiceRequest);
  const [workspaces, setWorkspaces] = useState<Workspaces>([]);
  const [tenantId, setTenantId] = useState('');
  const [booting, setBooting] = useState(true);
  const [snapshot, setSnapshot] = useState<{ tenantId: string; value: Snapshot } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [queue, setQueue] = useState<Queue>('active');
  const [search, setSearch] = useState('');
  const [intake, setIntake] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [saving, setSaving] = useState(false);
  const locked = useRef(false);
  const requestId = useRef<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let active = true;
    getWorkspaces().then(rows => {
      if (!active) return;
      setWorkspaces(rows); setTenantId(rows[0]?.tenantId ?? '');
    }).catch(() => { if (active) setError('Could not load workspaces. Reload this page to retry.'); })
      .finally(() => { if (active) setBooting(false); });
    return () => { active = false; };
  }, [getWorkspaces]);

  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    setLoading(true); setSnapshot(null); setError('');
    getQueue({ data: { tenantId } }).then(value => {
      if (active) { setSnapshot({ tenantId, value }); setNow(Date.now()); }
    }).catch(() => { if (active) setError('Requests could not be loaded. Check workspace access and retry.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tenantId, refresh, getQueue]);

  const data = snapshot?.tenantId === tenantId ? snapshot.value : null;
  const rows = data?.rows ?? [];
  const visible = selectQueue(rows, queue, search);
  const writable = !!data && canSubmit(data.role);
  const workspace = workspaces.find(item => item.tenantId === tenantId);

  async function createRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!writable || locked.current) return;
    let summary: string;
    try { summary = normaliseTitle(title); } catch (err) { setNotice((err as Error).message); return; }
    locked.current = true; setSaving(true); setNotice('');
    requestId.current ??= crypto.randomUUID();
    try {
      const result = await submit({ data: { tenantId, requestId: requestId.current, title: summary, priority } });
      setNotice(`Request ${result.id.slice(0, 8)} ${result.replayed ? 'already saved' : 'created'}.${result.auditRecorded ? '' : ' Audit confirmation is unavailable; ask an administrator to review. Do not resubmit.'}`);
      setIntake(false); setTitle(''); setPriority('normal'); requestId.current = null;
      setRefresh(value => value + 1);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not confirm save. Retry this form with the same details.');
    } finally { locked.current = false; setSaving(false); }
  }

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <a href="#service-main" className="sr-only focus:not-sr-only focus:block focus:p-3">Skip to requests</a>
    <header className="border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-teal-900 p-3 text-white"><Building2 aria-hidden="true" className="h-6 w-6" /></span>
          <div><p className="text-xl font-semibold tracking-tight">Service Desk<span className="ml-2 rounded-full bg-teal-50 px-2 py-1 text-xs text-teal-800">Pilot</span></p><p className="text-xs text-slate-500">Powered by Omniqora</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="workspace">Workspace</label>
          <select id="workspace" className={selectClass + ' max-w-64'} value={tenantId} disabled={booting || saving || !workspaces.length}
            onChange={event => { setTenantId(event.target.value); setSnapshot(null); setNotice(''); setIntake(false); setTitle(''); setPriority('normal'); setSearch(''); requestId.current = null; }}>
            {!workspaces.length && <option value="">No workspace available</option>}
            {workspaces.map(item => <option key={item.tenantId} value={item.tenantId}>{item.name}</option>)}
          </select>
          <Link to="/app" className="text-sm font-medium text-teal-800 underline underline-offset-4">Omniqora workspace</Link>
        </div>
      </div>
    </header>
    <main id="service-main" className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <section className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-teal-800">{workspace?.name ?? 'Your service workspace'}</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Good service starts here.</h1><p className="mt-3 max-w-xl text-slate-600">One place to receive requests, organise work and keep every case moving.</p></div>
        <div className="flex gap-2"><Button variant="outline" disabled={!tenantId || loading || saving} onClick={() => setRefresh(value => value + 1)}><RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />Refresh</Button>
          <Button className="bg-teal-800 text-white hover:bg-teal-900" disabled={!writable || loading || saving} onClick={() => setIntake(value => !value)}><CirclePlus aria-hidden="true" className="mr-2 h-4 w-4" />New request</Button></div>
      </section>
      {error && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">{error}</p>}
      {notice && <p role="status" className="mb-5 rounded-xl border border-teal-200 bg-teal-50 p-4 text-teal-900">{notice}</p>}
      {booting ? <p role="status">Loading authorised workspaces…</p> : !tenantId ? <p className="rounded-xl border bg-white p-8">Ask your administrator to invite you to a workspace. Opening this page does not create an organisation or subscription.</p> : <>
        {intake && writable && <form onSubmit={createRequest} className="mb-6 grid gap-4 rounded-2xl border border-teal-200 bg-white p-6 sm:grid-cols-[1fr_180px_auto]">
          <div><label htmlFor="summary" className="mb-2 block text-sm font-medium">Request summary</label><Input id="summary" required minLength={2} maxLength={160} value={title} disabled={saving} onChange={event => setTitle(event.target.value)} placeholder="What does the customer need?" /><p className="mt-2 text-xs text-slate-500">Staff intake. Avoid sensitive personal details in the summary.</p></div>
          <div><label htmlFor="priority" className="mb-2 block text-sm font-medium">Priority</label><select id="priority" value={priority} disabled={saving} onChange={event => setPriority(event.target.value as typeof priority)} className={selectClass + ' w-full'}>{['low', 'normal', 'high', 'urgent'].map(value => <option key={value} value={value}>{value}</option>)}</select></div>
          <Button type="submit" disabled={saving || title.trim().length < 2} className="self-center bg-teal-800 text-white hover:bg-teal-900">{saving ? 'Saving…' : 'Create request'}</Button>
        </form>}
        <div className="mb-6 grid gap-4 sm:grid-cols-3">{[
          ['Active requests', selectQueue(rows, 'active').length], ['Urgent / escalated', selectQueue(rows, 'urgent').length], ['Awaiting customer', selectQueue(rows, 'waiting').length],
        ].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-3xl font-semibold">{data && !loading ? value : '—'}</p></div>)}</div>
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <aside><nav aria-label="Request queues" className="space-y-1">{queues.map(item => <button key={item.key} onClick={() => setQueue(item.key)} aria-pressed={queue === item.key} className={`flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm ${queue === item.key ? 'bg-teal-900 font-semibold text-white' : 'text-slate-600 hover:bg-slate-200'}`}>{item.label}<span>{data ? selectQueue(rows, item.key).length : '—'}</span></button>)}</nav>
            <div className="mt-6 rounded-xl border border-slate-200 p-4 text-xs leading-relaxed text-slate-600"><ShieldCheck aria-hidden="true" className="mb-2 h-5 w-5 text-teal-800" />Staff workspace. Attention prompts use visible case facts and fixed rules; they are not AI recommendations or contractual SLA assessments.</div>
          </aside>
          <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="Requests" aria-busy={loading}>
            <div className="border-b border-slate-200 p-5"><div className="relative"><Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input aria-label="Search loaded requests by summary or reference" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search summary or reference…" className="pl-9" /></div>
              <p className="mt-3 text-xs text-slate-500">{data ? `Showing ${rows.length} of ${data.total} requests. Counts and search cover these most recently updated records.` : 'Waiting for request data.'}</p></div>
            {loading ? <p role="status" className="p-10 text-center text-slate-500">Loading requests…</p> : !data ? <p className="p-10 text-center text-slate-500">No request data available. Use Refresh to retry.</p> : !visible.length ? <div className="p-12 text-center"><h2 className="font-semibold">{rows.length ? 'No matching requests' : 'Your queue is ready'}</h2><p className="mt-2 text-sm text-slate-500">{rows.length ? 'Try another queue or search term.' : 'Create your first request to start tracking service work.'}</p></div> : <ul className="divide-y divide-slate-100">{visible.map(row => <li key={row.id} className="p-5 hover:bg-slate-50"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="mb-1 font-mono text-xs text-slate-500">{row.id.slice(0, 8)}</p><Link to="/app/cases/$caseId" params={{ caseId: row.id }} className="break-words font-semibold text-slate-900 underline-offset-4 hover:underline">{row.title}</Link></div><Link aria-label={`Open request ${row.id.slice(0, 8)}`} to="/app/cases/$caseId" params={{ caseId: row.id }} className="rounded-lg p-3 text-teal-800 hover:bg-teal-50"><ArrowUpRight aria-hidden="true" className="h-5 w-5" /></Link></div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-slate-100 px-2 py-1 capitalize">{row.status.replaceAll('_', ' ')}</span><span className="rounded-full bg-teal-50 px-2 py-1 text-teal-900">{row.priority} priority</span><span className="py-1 text-slate-500">{row.assignee ? 'Assigned' : 'Unassigned'}</span></div>
              {attentionReasons(row, now).map(reason => <p key={reason} className="mt-2 text-xs text-amber-800">{reason}</p>)}</li>)}</ul>}
          </section>
        </div>
      </>}
    </main>
  </div>;
}
