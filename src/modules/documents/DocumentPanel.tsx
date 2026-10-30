import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { documentWorkspace } from './functions';

export function DocumentPanel({ tenantId, productKey }: { tenantId: string; productKey: string }) {
  const call = useServerFn(documentWorkspace);
  const mounted = useRef(true), pending = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [title, setTitle] = useState(''), [body, setBody] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [before, setBefore] = useState<number | undefined>();
  const q = useQuery({ queryKey: ['documents', tenantId, productKey, before],
    queryFn: () => call({ data: { action: 'list', tenantId, productKey, before } }),
    enabled: !!tenantId && !!productKey, retry: false });
  const page = !q.isError && q.data?.kind === 'list' ? q.data : null;
  const paragraphs = body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const valid = title.trim().length > 0 && paragraphs.length > 0 && paragraphs.length <= 20 && paragraphs.every(p => p.length <= 4000);
  async function act(id?: string) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setMessage('');
    try {
      if (id) {
        const result = await call({ data: { action: 'download', tenantId, productKey, id } });
        if (!mounted.current || result.kind !== 'download') return;
        const bytes = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.oasis.opendocument.text' }));
        const link = document.createElement('a'); link.href = url; link.download = result.filename;
        document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const key = requestId ?? crypto.randomUUID(); setRequestId(key);
        const result = await call({ data: { action: 'submit', tenantId, productKey, requestId: key, document: { title, paragraphs } } });
        if (!mounted.current) return;
        if (result.kind === 'submitted') setMessage(`Draft request ${result.id} saved. Refresh to check progress.`);
        setBefore(undefined); await q.refetch();
      }
    } catch (e) { if (mounted.current) setMessage(e instanceof Error ? e.message : 'Document request failed'); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  return <Card><CardContent className="space-y-4 p-5">
    <div><h2 className="font-semibold">Document drafts</h2><p className="text-sm text-muted-foreground">Create an editable ODT document from your text. Review every draft before sharing it.</p></div>
    {q.isError ? <p role="alert">Document access or service unavailable.</p> : q.isPending ? <p role="status">Loading documents…</p> : !page?.configured ? <p role="status">Not configured for this product. An operator must connect the document service.</p> : !page.canWrite ? <p>Read-only access.</p> : null}
    <label className="block text-sm">Document title<Input value={title} maxLength={160} disabled={busy || !!requestId} onChange={e => setTitle(e.target.value)}/></label>
    <label className="block text-sm">Text (separate paragraphs with a blank line)<Textarea value={body} maxLength={30000} disabled={busy || !!requestId} onChange={e => setBody(e.target.value)}/></label>
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy || !page?.configured || !page.canWrite || !valid} onClick={() => act()}>{requestId ? 'Retry same request' : 'Create draft'}</Button>
      <Button variant="outline" disabled={busy || q.isFetching} onClick={() => { setBefore(undefined); void q.refetch(); }}>Refresh status</Button>
      {requestId && <Button variant="ghost" disabled={busy} onClick={() => { setRequestId(null); setMessage('The next submission creates a separate request.'); }}>Start new request</Button>}
    </div>
    {requestId && <p className="text-xs">Retries keep the same request ID and text to prevent duplicate drafts. Check status before starting a new request.</p>}
    {message && <p role="status" className="text-sm break-all">{message}</p>}
    {page?.configured && <div className="space-y-2"><p className="text-xs">Your requests in this product. Up to 20 per page.</p>{page.jobs.length === 0 && <p>No document requests on this page.</p>}{page.jobs.map(job => <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3"><div className="text-sm"><p>{job.day} · {job.status} · Review required</p><p className="text-xs break-all">{job.id}</p></div><Button variant="outline" disabled={busy || job.status !== 'completed'} onClick={() => act(job.id)}>Download draft</Button></div>)}
      {page.next !== null && <Button variant="outline" disabled={busy || q.isFetching} onClick={() => setBefore(page.next!)}>Older requests</Button>}
    </div>}
  </CardContent></Card>;
}
