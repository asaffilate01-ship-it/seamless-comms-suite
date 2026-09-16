import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app/shell';
import { listComplianceWorkspaces, complianceOperation } from '@/modules/rrci/functions';
import type { HostAccess, Operation } from '@/modules/rrci/contracts';

export const Route = createFileRoute('/_authenticated/app/compliance-intelligence')({
  head: () => ({ meta: [{ title: 'Knowledge & compliance — Omniqora' }, { name: 'robots', content: 'noindex' }] }),
  component: CompliancePage,
});

function CompliancePage() {
  const list = useServerFn(listComplianceWorkspaces);
  const call = useServerFn(complianceOperation);
  const [workspaces,setWorkspaces]=useState<HostAccess[]>([]);
  const [workspace,setWorkspace]=useState('');
  const [question,setQuestion]=useState('');
  const [result,setResult]=useState<Record<string,unknown>|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const epoch=useRef(0);
  useEffect(()=>{let cancelled=false;list().then(rows=>{if(!cancelled){setWorkspaces(rows);setWorkspace(rows[0]?.workspace??'');}}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'Unable to load workspaces');}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;epoch.current++;};},[list]);
  const access=workspaces.find(w=>w.workspace===workspace);
  async function run(operation:Operation,payload:Record<string,unknown>={}) {
    const requestEpoch=++epoch.current;setBusy(true);setError('');setResult(null);
    try {const value=await call({data:{workspace,operation,payload}});if(epoch.current===requestEpoch)setResult(JSON.parse(value.payload));}
    catch(e){if(epoch.current===requestEpoch)setError(e instanceof Error?e.message:'Unable to complete the request');}
    finally{if(epoch.current===requestEpoch)setBusy(false);}
  }
  return <AppShell title="Knowledge & compliance" subtitle="Source-linked answers from information you are authorised to use">
    <div className="mx-auto max-w-5xl space-y-6">
      {error&&<p role="alert" className="rounded-lg border border-destructive p-4 text-destructive">{error}</p>}
      {loading?<p role="status">Loading authorised workspaces…</p>:!workspaces.length?<section className="rounded-xl border p-6"><h2 className="text-xl font-semibold">No enabled knowledge workspace</h2><p className="mt-3 text-muted-foreground">Your administrator must enable this service and assign workspace access before business information can be searched.</p></section>:<>
        <label className="block font-medium">Workspace<select className="ml-4 rounded border bg-background p-2" value={workspace} disabled={busy} onChange={e=>{epoch.current++;setWorkspace(e.target.value);setResult(null);setError('');}}>{workspaces.map(w=><option key={w.workspace} value={w.workspace}>{w.name}</option>)}</select></label>
        <form className="space-y-3 rounded-xl border bg-card p-6" onSubmit={e=>{e.preventDefault();void run('query',{question:question.trim(),mode:'hybrid',top_k:5});}}>
          <label htmlFor="knowledge-question" className="block font-semibold">What do you need to understand?</label>
          <textarea id="knowledge-question" className="min-h-28 w-full rounded border bg-background p-3" required maxLength={2000} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask about an approved policy, risk, control or business process."/>
          <div className="flex flex-wrap gap-3"><button className="rounded bg-primary px-4 py-2 text-primary-foreground" disabled={busy||!question.trim()}>Ask with evidence</button><button type="button" className="rounded border px-4 py-2" disabled={busy} onClick={()=>void run('catalogue')}>View sources</button>{access?.permissions.includes('audit')&&<button type="button" className="rounded border px-4 py-2" disabled={busy} onClick={()=>void run('audit')}>View audit records</button>}</div>
          <p className="text-sm text-muted-foreground">Answers are drafts. Review cited evidence and unresolved conflicts before making a decision.</p>
        </form>
        {busy&&<p role="status">Checking permitted evidence…</p>}
        {result&&<section aria-live="polite" className="space-y-4 rounded-xl border p-6"><h2 className="text-xl font-semibold">Review result</h2>{typeof result.answer==='string'&&<p className="whitespace-pre-wrap leading-7">{result.answer}</p>}<details open={typeof result.answer!=='string'}><summary className="cursor-pointer font-medium">Sources and review details</summary><pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-4 text-xs">{JSON.stringify(result,null,2)}</pre></details></section>}
      </>}
    </div>
  </AppShell>;
}
