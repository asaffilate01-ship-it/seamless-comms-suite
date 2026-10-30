import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { prepareReviewStudy, inspectReviewReport, inspectReviewTranscript, exportReviewExperiments } from './functions';
import { studySchema, draftSchema, type Study } from './contract';
import { DiscussionPanel } from './DiscussionPanel';

function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReviewLabPanel({ tenantId }: { tenantId: string }) {
  const prepare = useServerFn(prepareReviewStudy);
  const inspect = useServerFn(inspectReviewReport);
  const inspectTranscript = useServerFn(inspectReviewTranscript);
  const exportBacklog = useServerFn(exportReviewExperiments);
  const [draft, setDraft] = useState<Study>({ version: 1, tenantId, product: 'Kindelo', objective: 'usability',
    brief: '', audience: '', agents: 12, rounds: 3, budgetPence: 0, evidence: [], publicOrSyntheticConfirmed: true });
  const [confirmed, setConfirmed] = useState(false);
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof prepare>> | null>(null);
  const [report, setReport] = useState<Awaited<ReturnType<typeof inspect>> | null>(null);
  const [transcript, setTranscript] = useState<Awaited<ReturnType<typeof inspectTranscript>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = (patch: Partial<Study>) => { setDraft(d => ({ ...d, ...patch })); setPlan(null); setReport(null); setTranscript(null); setError(''); };
  async function prepareNow() {
    setBusy(true); setError('');
    setPlan(null); setReport(null); setTranscript(null);
    try { setPlan(await prepare({ data: studySchema.parse({ ...draft, tenantId, publicOrSyntheticConfirmed: confirmed }) })); }
    catch { setError('Could not prepare study. Check the brief, audience, evidence and your tenant permissions.'); }
    finally { setBusy(false); }
  }
  async function importFile(file: File | undefined, kind: 'draft' | 'report' | 'transcript') {
    if (!file) return;
    setBusy(true); setError('');
    if (kind === 'report') setReport(null);
    if (kind === 'transcript') setTranscript(null);
    try {
      if (file.size > 150000) throw new Error('File must be under 150 KB');
      const data = JSON.parse(await file.text());
      if (kind === 'draft') {
        const next = draftSchema.parse(data);
        if (next.tenantId !== tenantId) throw new Error('Draft belongs to another tenant');
        change(next); setConfirmed(false);
      } else {
        if (!plan) throw new Error('Prepare the matching study first');
        if (kind === 'report') setReport(await inspect({ data: { study: plan.study, report: data } }));
        else setTranscript(await inspectTranscript({ data: { study: plan.study, transcript: data } }));
      }
    } catch { setError('Import rejected. Check file size, format, tenant, study revision and evidence references.'); }
    finally { setBusy(false); }
  }
  async function downloadBacklog() {
    if (!plan || !report) return;
    setBusy(true); setError('');
    try {
      const { version, studyDigest, findings } = report;
      const backlog = await exportBacklog({ data: { study: plan.study, report: { version, studyDigest, findings } } });
      download('review-experiment-backlog.json', backlog);
    } catch { setError('Backlog export failed. Recheck your membership and matching study/report.'); }
    finally { setBusy(false); }
  }
  return <Card className="my-6"><CardContent className="space-y-4 pt-6">
    <div><h2 className="text-xl font-semibold">SaaS Review Lab</h2>
      <p className="text-sm text-muted-foreground">Prepare customer panels and experiments for your products. MiroFish is not connected; no AI runs or charges occur here.</p></div>
    <p className="text-sm">Drafts stay in this tab. Download before leaving or switching tenants. Use public or synthetic material only.</p>
    <fieldset disabled={busy} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">Product<Input list="review-products" value={draft.product} onChange={e => change({ product: e.target.value })} /></label>
        <datalist id="review-products">{['Kindelo', 'UniPathway', 'Haccora', 'Zivvo UK', 'Zivvo Germany', 'Dishbee', 'Courier OS', 'DispatchDeck', 'MoneyBridge', 'Omniqora'].map(p => <option key={p} value={p} />)}</datalist>
        <label className="text-sm">Study focus<select className="block w-full rounded border bg-background p-2" value={draft.objective} onChange={e => change({ objective: e.target.value as Study['objective'] })}>
          <option value="usability">Features and usability</option><option value="pricing">Pricing and revenue</option><option value="marketing">Marketing and positioning</option>
        </select></label>
      </div>
      <label className="block text-sm">Product brief (30–12,000 characters)<textarea className="mt-1 min-h-28 w-full rounded border bg-background p-3" maxLength={12000} value={draft.brief} onChange={e => change({ brief: e.target.value })} placeholder="Describe what works today, the offer, known gaps and the decision to test." /></label>
      <label className="block text-sm">Audience (at least 10 characters)<textarea className="mt-1 w-full rounded border bg-background p-3" maxLength={2000} value={draft.audience} onChange={e => change({ audience: e.target.value })} placeholder="Roles, market, experience, budget constraints and alternatives." /></label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm">Agents (3–20)<Input type="number" min={3} max={20} value={draft.agents} onChange={e => change({ agents: Number(e.target.value) })} /></label>
        <label className="text-sm">Rounds (1–10)<Input type="number" min={1} max={10} value={draft.rounds} onChange={e => change({ rounds: Number(e.target.value) })} /></label>
        <label className="text-sm">Planned ceiling (£, not a reservation)<Input type="number" min={0} max={50} step="0.01" value={draft.budgetPence / 100} onChange={e => change({ budgetPence: Math.round(Number(e.target.value) * 100) })} /></label>
      </div>
      <div className="space-y-3"><h3 className="font-medium">Evidence supplied by you</h3>
        <p className="text-sm text-muted-foreground">Source references are not fetched or independently verified.</p>
        {draft.evidence.map((item, i) => <div key={item.id} className="grid gap-2 rounded border p-3">
          <span className="text-sm">{item.id}</span>
          <label className="text-sm">Type<select className="ml-2 rounded border bg-background p-1" value={item.kind} onChange={e => change({ evidence: draft.evidence.map((x, j) => j === i ? { ...x, kind: e.target.value as typeof item.kind } : x) })}>
            <option value="manual_observation">Manual observation</option><option value="test_receipt">Supplied test receipt</option><option value="customer_feedback">Customer feedback</option>
          </select></label>
          <Input aria-label={`Source for ${item.id}`} placeholder="Source reference" value={item.source} onChange={e => change({ evidence: draft.evidence.map((x, j) => j === i ? { ...x, source: e.target.value } : x) })} />
          <Input aria-label={`Summary for ${item.id}`} placeholder="Observed finding" value={item.summary} onChange={e => change({ evidence: draft.evidence.map((x, j) => j === i ? { ...x, summary: e.target.value } : x) })} />
          <Button variant="outline" onClick={() => change({ evidence: draft.evidence.filter((_, j) => i !== j) })}>Remove evidence</Button>
        </div>)}
        <Button variant="outline" disabled={draft.evidence.length >= 30} onClick={() => change({ evidence: [...draft.evidence, { id: crypto.randomUUID(), kind: 'manual_observation', source: '', summary: '' }] })}>Add evidence</Button>
      </div>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => { setConfirmed(e.target.checked); setPlan(null); setReport(null); setTranscript(null); }} />I confirm this contains only public or synthetic information, without secrets or personal customer records.</label>
      <div className="flex flex-wrap gap-3">
        <Button disabled={!confirmed} onClick={prepareNow}>Prepare study</Button>
        <Button variant="outline" disabled={!draftSchema.safeParse(draft).success} onClick={() => download('review-study.json', draft)}>Download draft</Button>
        <label className="text-sm">Restore draft<input className="block max-w-full" type="file" accept="application/json,.json" onChange={e => { void importFile(e.target.files?.[0], 'draft'); e.target.value = ''; }} /></label>
      </div>
    </fieldset>
    {busy && <p role="status">Checking study…</p>}{error && <p role="alert" className="text-destructive">{error}</p>}
    {plan && <div className="space-y-3 rounded border p-4">
      <h3 className="font-semibold">Prepared — not executed</h3><p>{plan.agents.length} personas · {plan.discussionTurns} planned discussion turns · estimated cost unavailable.</p>
      <p className="text-sm">Provider connection, enforced usage accounting and live simulation are pending. The budget here is planning metadata only.</p>
      <details><summary>Panel roles and instructions</summary><ul className="list-disc pl-5">{plan.agents.map(a => <li key={a.id}>{a.id}: {a.role} — {a.perspective}</li>)}</ul>{plan.instructions.map(s => <p className="mt-2 text-sm" key={s}>{s}</p>)}</details>
      <Button variant="outline" onClick={() => download('review-study-package.json', plan)}>Download study package</Button>
      <Button variant="outline" className="ml-2" onClick={() => download('review-report-template.json', { version: 1, studyDigest: plan.digest, findings: [] })}>Download report template</Button>
      <label className="block text-sm">Import completed report JSON<input disabled={busy} className="block max-w-full" type="file" accept="application/json,.json" onChange={e => { void importFile(e.target.files?.[0], 'report'); e.target.value = ''; }} /></label>
      <Button variant="outline" onClick={() => download('review-transcript-template.json', { version: 1, studyDigest: plan.digest, messages: [] })}>Download transcript template</Button>
      <label className="block text-sm">Import agent discussion JSON<input disabled={busy} className="block max-w-full" type="file" accept="application/json,.json" onChange={e => { void importFile(e.target.files?.[0], 'transcript'); e.target.value = ''; }} /></label>
    </div>}
    {transcript && <DiscussionPanel key={transcript.studyDigest} transcript={transcript} />}
    {report && <div className="space-y-3"><h3 className="font-semibold">Imported feedback — unverified simulation</h3>
      <p className="text-sm">Import does not verify provider identity or that a simulation ran. Recommendations need real customer testing.</p>
      {report.findings.map((f, i) => <article key={i} className="rounded border p-4"><p className="font-medium">{f.category} · {f.priority}</p><p>{f.claim}</p><p className="text-sm">Evidence: {f.evidenceIds.join(', ') || 'None — unsupported hypothesis'}</p><p className="mt-2">Test: {f.experiment}</p><p>Measure: {f.metric}</p></article>)}
      <Button variant="outline" onClick={() => download('review-findings.json', { version: report.version, studyDigest: report.studyDigest, findings: report.findings })}>Download findings</Button>
      <Button disabled={busy} variant="outline" className="ml-2" onClick={downloadBacklog}>Export experiment backlog</Button>
      <p className="text-sm text-muted-foreground">Backlog items are proposals for human review. Export creates no issues, campaigns or development tasks.</p>
    </div>}
  </CardContent></Card>;
}
