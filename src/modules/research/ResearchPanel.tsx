import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { exportResearch, getResearch, runResearch } from './functions';
import { ResearchRecord } from './ResearchRecord';

export function ResearchPanel({ tenantId, productKey }: { tenantId: string; productKey: string }) {
  // Parent keys this component by scope so queries and unsaved inputs never cross tenants.
  const read = useServerFn(getResearch), run = useServerFn(runResearch), download = useServerFn(exportResearch);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [query, setQuery] = useState(''), [preset, setPreset] = useState<'general'|'uk-childcare'|'uk-food'>('general');
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<'all'|'completed'|'failed'|'reserved'>('all');
  const [requestId, setRequestId] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['research', tenantId, productKey, page, status], queryFn: () => read({ data: { tenantId, productKey, page, status } }), enabled: !!tenantId && !!productKey, retry: false });
  const a = q.data?.allowance;
  const today = new Date().toISOString().slice(0, 10);
  const enabled = !q.isError && q.data?.canSearch && q.data?.configured && a?.enabled && a.requests_used < a.request_limit && today >= a.period_start && today < a.period_end;
  async function saveRecord(id: string) {
    setBusy(true); setMessage('');
    try {
      const record = await download({ data: { tenantId, productKey, requestId: id } });
      if (!mounted.current) return;
      const url = URL.createObjectURL(new Blob([record.text], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = record.filename;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { if (mounted.current) setMessage(e instanceof Error ? e.message : 'Export failed'); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function search() {
    if (requestId) { await q.refetch(); return; }
    setBusy(true); setMessage('');
    const id = requestId ?? crypto.randomUUID(); setRequestId(id);
    try {
      const result = await run({ data: { tenantId, productKey, requestId: id, query, preset, publicQueryConfirmed: true } });
      setMessage(result.replay ? 'This request was already submitted. Check its status below.' : 'Research saved. Review the original sources before using it.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Research failed'); }
    finally { if (mounted.current) { setPage(0); setStatus('all'); await q.refetch(); setBusy(false); } }
  }
  return <Card><CardContent className="space-y-4 p-5">
    <div><h2 className="font-semibold">Web research</h2><p className="text-sm text-muted-foreground">Find public sources with Perplexity. Source excerpts require review and do not automatically change policies or trigger actions.</p></div>
    {q.isError ? <p role="alert">Research setup is not available yet.</p> : q.isPending ? <p role="status">Loading research…</p> : <p className="text-sm">{enabled ? `${a.request_limit - a.requests_used} searches remaining until ${a.period_end}` : !q.data?.canSearch ? 'Read-only access. A tenant owner, admin or agent can run searches.' : 'Research is inactive or its allowance is unavailable. Your operator must configure access.'}</p>}
    <label className="block text-sm">Sources<select className="ml-3 rounded border bg-background p-2" disabled={busy} value={preset} onChange={e => { setPreset(e.target.value as typeof preset); setRequestId(null); }}><option value="general">Public web</option><option value="uk-childcare">UK childcare — official sources</option><option value="uk-food">UK food safety — official sources</option></select></label>
    <label className="block text-sm">Research question<Textarea className="mt-2" value={query} maxLength={1500} disabled={busy} placeholder="For example: Find official guidance on food allergen information for cafés" onChange={e => { setQuery(e.target.value); setConfirmed(false); setRequestId(null); }}/></label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)}/>This question is suitable for external web search and contains no confidential or personal records.</label>
    <div className="flex flex-wrap gap-2"><Button onClick={search} disabled={busy || (!requestId && (!enabled || !confirmed || query.trim().length < 4))}>{busy ? 'Researching…' : requestId ? 'Check submitted request' : 'Research'}</Button><Button variant="outline" disabled={busy} onClick={() => q.refetch()}>Refresh history</Button>{requestId && <Button variant="ghost" disabled={busy} onClick={() => { setRequestId(null); setMessage('A new search will use another request from your allowance.'); }}>Start another search</Button>}</div>
    {message && <p role="status" className="text-sm">{message}</p>}
    <div className="flex flex-wrap items-center gap-3"><label className="text-sm">History status <select className="rounded border bg-background p-2" disabled={busy} value={status} onChange={e => { setStatus(e.target.value as typeof status); setPage(0); }}><option value="all">All searches</option><option value="completed">Completed</option><option value="failed">Failed</option><option value="reserved">Pending / unconfirmed</option></select></label>
      <Button variant="outline" disabled={busy || q.isFetching || page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button><span className="text-sm">Page {page + 1}</span><Button variant="outline" disabled={busy || q.isFetching || q.isError || !q.data?.hasMore || page >= 500} onClick={() => setPage(p => p + 1)}>Next</Button>
    </div>
    <p className="text-xs text-muted-foreground">Up to 20 searches per page. Results are accessible for 30 days. Failed or interrupted attempts count towards the request allowance. New searches or expired records can shift page contents.</p>
    {!q.isError && !q.isPending && !q.data?.history.length && <p className="text-sm">No searches on this page. Try another status or return to the previous page.</p>}
    {!q.isError && (q.data?.history ?? []).map((item: any) => <ResearchRecord key={`${page}:${status}:${item.id}`} tenantId={tenantId} productKey={productKey} item={item} busy={busy} onDownload={() => saveRecord(item.id)}/>)}
  </CardContent></Card>;
}
