import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { completeCrmFollowUp, moveCrmOpportunity, saveCrmOpportunity, saveCrmTask } from "./functions";
import { forecastByCurrency, formatDealMoney, nextFollowUp, type Deal, type Pipeline, type FollowUp } from "./sales-model";
import { toast } from "sonner";

const selectClass = "h-10 rounded-md border bg-background px-3 text-sm";
export function SalesBoard({ tenantId, pipelines, deals, tasks, people, canWrite }: {
  tenantId: string; pipelines: Pipeline[]; deals: Deal[]; tasks: FollowUp[];
  people: { id: string; display_name: string }[]; canWrite: boolean;
}) {
  const [pipelineId, setPipelineId] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("open");
  const [busy, setBusy] = useState(false);
  const [dragged, setDragged] = useState<Deal | null>(null);
  const [followDeal, setFollowDeal] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [personId, setPersonId] = useState("");
  const [closeAt, setCloseAt] = useState("");
  const [followTitle, setFollowTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const mutationLock = useRef(false);
  const complete = useServerFn(completeCrmFollowUp);
  const move = useServerFn(moveCrmOpportunity);
  const create = useServerFn(saveCrmOpportunity);
  const saveTask = useServerFn(saveCrmTask);
  const qc = useQueryClient();
  const pipeline = pipelines.find(p => p.id === pipelineId) ?? pipelines.find(p => p.is_default) ?? pipelines[0];
  const stages = [...(pipeline?.stages ?? [])].sort((a, b) => a.position - b.position);
  const pipelineDeals = deals.filter(d => d.pipeline_id === pipeline?.id);
  const visible = pipelineDeals.filter(d => (status === 'all' || d.status === status) && d.title.toLowerCase().includes(search.toLowerCase()));
  const firstStage = stages.find(s => !s.is_closed_won && !s.is_closed_lost);
  async function refresh() {
    await Promise.all(['crm-opportunities', 'crm-tasks', 'crm-360'].map(key => qc.invalidateQueries({ queryKey: [key, tenantId] })));
  }
  async function run(action: () => Promise<unknown>) {
    if (mutationLock.current || !canWrite) return;
    mutationLock.current = true;
    setBusy(true);
    try { await action(); await refresh(); toast.success('CRM updated'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'CRM update failed'); await refresh(); }
    finally { mutationLock.current = false; setBusy(false); setDragged(null); }
  }
  function moveDeal(deal: Deal, stageId: string) {
    if (deal.stage_id === stageId || !stages.some(s => s.id === stageId)) return;
    void run(() => move({ data: { tenantId, opportunityId: deal.id, stageId, expectedUpdatedAt: deal.updated_at } }));
  }
  if (!pipeline) return <p className="p-5 text-muted-foreground">No active sales pipeline is available.</p>;
  return <div className="space-y-5" aria-busy={busy}>
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">Pipeline<select className={selectClass} value={pipeline.id} onChange={e => { setPipelineId(e.target.value); setFollowDeal(''); }}>
        {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      <label className="grid gap-1 text-sm">Find a deal<Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by deal title" /></label>
      <label className="grid gap-1 text-sm">Status<select className={selectClass} value={status} onChange={e => setStatus(e.target.value)}>
        {['open', 'won', 'lost', 'cancelled', 'all'].map(s => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}
      </select></label>
      {!canWrite && <p className="text-sm text-muted-foreground">Read-only access</p>}
    </div>
    <div className="grid gap-3 md:grid-cols-3">
      {forecastByCurrency(pipelineDeals).map(total => <Card key={total.currency}><CardContent className="p-4">
        <p className="text-xs uppercase text-muted-foreground">{total.currency} · {total.count} open deals</p>
        <p className="mt-2 text-xl font-semibold">{formatDealMoney(total.amount, total.currency)}</p>
        <p className="text-sm text-muted-foreground">Weighted: {formatDealMoney(total.weighted, total.currency)}</p>
      </CardContent></Card>)}
    </div>
    <p className="text-xs text-muted-foreground">Forecasts use all loaded open deals in this pipeline, before search filters. Weighted value uses each deal’s recorded probability; it is not guaranteed revenue. Up to 500 recent deals and tasks are loaded.</p>
    {canWrite && <Card><CardContent className="p-4"><form className="flex flex-wrap items-end gap-3" onSubmit={e => {
      e.preventDefault(); if (!firstStage) return;
      void run(async () => {
        await create({ data: { tenantId, pipelineId: pipeline.id, stageId: firstStage.id, title,
          personId: personId || null, amount: amount === '' ? null : Number(amount), currency,
          expectedCloseAt: closeAt ? new Date(closeAt).toISOString() : null, status: 'open', metadata: {} } });
        setTitle(''); setAmount(''); setCloseAt(''); setPersonId('');
      });
    }}>
      <label className="grid gap-1 text-sm">New deal<Input required maxLength={240} value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label className="grid gap-1 text-sm">Person<select className={selectClass} value={personId} onChange={e => setPersonId(e.target.value)}><option value="">No person</option>{people.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Value<Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label>
      <label className="grid gap-1 text-sm">Currency<select className={selectClass} value={currency} onChange={e => setCurrency(e.target.value)}>{['GBP', 'EUR', 'USD', 'PKR', 'AED', 'CAD', 'AUD'].map(c => <option key={c}>{c}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Expected close (local time)<Input type="datetime-local" value={closeAt} onChange={e => setCloseAt(e.target.value)} /></label>
      <Button disabled={busy || !firstStage} type="submit">Add deal</Button>
    </form></CardContent></Card>}
    <div className="flex gap-4 overflow-x-auto pb-4" aria-label="Sales pipeline board">
      {stages.map(stage => <section key={stage.id} className="min-w-[280px] flex-1 rounded-xl border bg-muted/30 p-3"
        onDragOver={e => { if (canWrite && !busy && dragged) e.preventDefault(); }}
        onDrop={e => { e.preventDefault(); if (dragged && canWrite && !busy) moveDeal(dragged, stage.id); }}>
        <h3 className="mb-3 flex justify-between font-semibold"><span>{stage.name}</span><span>{visible.filter(d => d.stage_id === stage.id).length}</span></h3>
        <div className="space-y-3">{visible.filter(d => d.stage_id === stage.id).map(deal => {
          const follow = nextFollowUp(tasks, deal.id);
          const overdue = follow?.due_at && Date.parse(follow.due_at) < Date.now();
          return <Card key={deal.id} draggable={canWrite && !busy} onDragStart={e => { e.dataTransfer.setData('text/plain', deal.id); setDragged(deal); }} onDragEnd={() => setDragged(null)}>
            <CardContent className="space-y-3 p-4">
              <h4 className="break-words font-semibold">{deal.title}</h4>
              <p>{deal.amount === null ? 'Value not set' : formatDealMoney(deal.amount, deal.currency)}</p>
              <p className="text-xs text-muted-foreground">{deal.status} · {deal.probability_percent ?? 0}% probability</p>
              {deal.expected_close_at && <p className="text-xs">Expected close: {new Date(deal.expected_close_at).toLocaleString()}</p>}
              <p className={"text-xs " + (overdue ? 'text-destructive' : 'text-muted-foreground')}>{follow ? `${overdue ? 'Overdue: ' : 'Next: '}${follow.title} · ${new Date(follow.due_at!).toLocaleString()}` : 'No dated follow-up'}</p>
              {canWrite && <>{follow && <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(() => complete({ data: { tenantId, taskId: follow.id, expectedUpdatedAt: follow.updated_at } }))}>Complete follow-up</Button>}<label className="grid gap-1 text-xs">Move {deal.title}<select className={selectClass + ' w-full'} disabled={busy} value={deal.stage_id} onChange={e => moveDeal(deal, e.target.value)}>{stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => { setFollowDeal(deal.id); setFollowTitle(`Follow up: ${deal.title}`.slice(0,240)); setDueAt(''); }}>Schedule follow-up</Button></>}
            </CardContent>
          </Card>;
        })}{!visible.some(d => d.stage_id === stage.id) && <p className="p-3 text-sm text-muted-foreground">No matching deals</p>}</div>
      </section>)}
    </div>
    {followDeal && canWrite && <Card><CardContent className="p-4"><form className="flex flex-wrap items-end gap-3" onSubmit={e => {
      e.preventDefault(); void run(async () => {
        await saveTask({ data: { tenantId, title: followTitle, status: 'open', priority: 'normal',
          dueAt: new Date(dueAt).toISOString(), relatedType: 'opportunity', relatedId: followDeal, sourceProductKey: 'omniqora', metadata: {} } });
        setFollowDeal('');
      });
    }}>
      <label className="grid gap-1 text-sm">Follow-up for {deals.find(d => d.id === followDeal)?.title}<Input required maxLength={240} value={followTitle} onChange={e => setFollowTitle(e.target.value)} /></label>
      <label className="grid gap-1 text-sm">Due (local time)<Input required type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} /></label>
      <Button disabled={busy} type="submit">Save follow-up</Button><Button disabled={busy} type="button" variant="outline" onClick={() => setFollowDeal('')}>Cancel</Button>
    </form></CardContent></Card>}
  </div>;
}
