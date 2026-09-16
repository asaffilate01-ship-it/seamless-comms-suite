import { useState } from "react";

type Data = Record<string, unknown>;
type Row = { id: string; kind: string; revision: number; data: Data };
export type PlanSummary = { id: string; scope_id: string; version: number; created: string; creator: string; status: string; reviewer: string | null; stale: boolean };
type Plan = PlanSummary & { payload: {
  scope: { name: string; start_date: string; day_one_date: string; constraints: string };
  company_comparison: { id: string; name: string; company_role: string; sector: string; assets: string[]; incoming_assets: string[]; recorded_headcount: number; proposed_target_headcount: number }[];
  phases: { id: string; name: string; start: string; end: string }[];
  actions: { id: string; title: string; phase: string; workstream: string; owner: string; target_date: string; acceptance_criteria: string; depends_on: string[]; source_ids: string[] }[];
  gaps: { id: string; detail: string; owner: string; source_ids: string[]; blocking: boolean }[];
  day_one_gates: { id: string; name: string; status: string; owner: string; acceptance_criteria: string }[];
  blocking_gap_count: number;
  financial: { currency: string; annual_recurring: Record<string, string | null>; transition_one_off: string | null; transition_total: string | null; annual_run_rate_difference: string | null; basis: string };
  assumptions: string[];
} };
const steps = [
  ["company", "1. Companies", "Record the buyer, seller, merged company or NewCo."],
  ["business_service", "2. Business services", "Define what must continue on Day 1 and how it will be tested."],
  ["asset", "3. Assets", "Technology, equipment, property, data, contracts and intellectual property."],
  ["workforce", "4. Workforce", "Teams, skills, capacity, dependencies and proposed operating coverage."],
  ["cost_item", "5. Costs", "Current and target recurring costs, one-off costs and transition durations."],
  ["objective", "6. Objectives", "Measurable baselines, targets, dates and accountable owners."],
  ["asset_dependency", "7. Dependencies", "Review connections between assets and companies."],
  ["delivery_mandate", "8. Delivery model", "Lead adviser and embedded partner, or direct advisory responsibilities."],
  ["tdd_finding", "9. Due diligence", "Technical debt, business exposure, recommendations and linked cost estimates."],
  ["tsa_obligation", "10. TSA obligations", "Service levels, rights, charging basis and exit roadmap; link a TSA register entry."],
  ["decision", "11. Decisions", "Record rationale, alternatives and supporting evidence."],
  ["planning_scope", "12. Planning scope", "Select the company perimeter, start date, Day 1, budget and completeness attestations."],
];

export function PlanningPanel({ objects, plans, dataVersion, role, busy, run, openRegister }: {
  objects: Row[]; plans: PlanSummary[]; dataVersion: number; role: string; busy: boolean;
  run: (command: string, data?: Data, refresh?: boolean) => Promise<unknown>;
  openRegister: (kind: string) => void;
}) {
  const scopes = objects.filter(o => o.kind === "planning_scope");
  const [scopeId, setScopeId] = useState("");
  const selectedScope = scopes.find(o => o.id === scopeId)?.id ?? scopes[0]?.id ?? "";
  const [plan, setPlan] = useState<Plan | null>(null);
  const [reviewRef, setReviewRef] = useState("");
  const [phase, setPhase] = useState("prepare");
  const canGenerate = ["owner", "analyst", "reviewer"].includes(role);
  const stale = !!plan && plan.version !== dataVersion;
  const money = (v: string | null) => v === null ? "Not entered" : `${plan?.payload.financial.currency} ${Number(v).toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
  async function load(command: string, data: Data, refresh: boolean) {
    const result = await run(command, data, refresh);
    if (result) setPlan(result as Plan);
  }
  function download() {
    if (!plan) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...plan, stale }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `company-plan-${plan.id}.json`; link.click(); URL.revokeObjectURL(url);
  }
  return <>
    <section className="oqt-card"><h2>Company discovery to Day 1</h2><p>Build a plan for the companies in this transaction. Planning start is when work begins; Day 1 is when the new operating arrangement must work.</p>
      <div className="oqt-intake">{steps.map(([kind, title, detail]) => <button key={kind} className="oqt-record" onClick={() => openRegister(kind)}><b>{title}</b><span>{detail}</span><small>{objects.filter(o => o.kind === kind).length} records</small></button>)}</div>
    </section>
    <section className="oqt-card"><h2>Generate a company plan</h2><p className="oqt-muted">Missing inputs become visible gaps. The plan proposes owners, dates and acceptance criteria for specialist review.</p>
      <div className="oqt-inline"><label>Planning scope<select aria-label="Planning scope" value={selectedScope} onChange={e => setScopeId(e.target.value)} disabled={busy}><option value="">Add a scope first</option>{scopes.map(s => <option key={s.id} value={s.id}>{String(s.data.name)}</option>)}</select></label>
        <button disabled={busy || !selectedScope || !canGenerate} onClick={() => void load("planning.generate", { scope_id: selectedScope, as_of: new Date().toISOString().slice(0, 10) }, true)}>Generate phased plan</button></div>
      {plans.length > 0 && <details><summary>Plan history ({plans.length})</summary>{plans.map(p => <button key={p.id} disabled={busy} className="oqt-record" onClick={() => void load("planning.get", { id: p.id }, false)}><b>{p.scope_id} · input version {p.version}</b><span>{p.status} · {p.created.slice(0, 10)}{p.stale ? " · inputs changed" : ""}</span></button>)}</details>}
    </section>
    {plan && <>
      <section className="oqt-card"><div className="oqt-inline"><h2>{plan.payload.scope.name}</h2><span className="oqt-pill">{plan.status}</span><button className="oqt-secondary" onClick={download}>Download plan</button></div>
        <p>Planning start: {plan.payload.scope.start_date} · Day 1: {plan.payload.scope.day_one_date}</p><p>{plan.payload.scope.constraints}</p>
        {stale && <p role="status" className="oqt-alert">Inputs changed. Generate a fresh plan before review.</p>}
        <div className="oqt-kpis"><div><span>Companies</span><strong>{plan.payload.company_comparison.length}</strong></div><div><span>Proposed actions</span><strong>{plan.payload.actions.length}</strong></div><div><span>Blocking input gaps</span><strong>{plan.payload.blocking_gap_count}</strong></div><div><span>Day 1 gates</span><strong>{plan.payload.day_one_gates.length}</strong></div></div>
        <div className="oqt-table"><table><thead><tr><th>Company</th><th>Role</th><th>Recorded assets</th><th>Incoming assets</th><th>Recorded headcount</th><th>Proposed target headcount</th></tr></thead><tbody>{plan.payload.company_comparison.map(c => <tr key={c.id}><td>{c.name}</td><td>{c.company_role}</td><td>{c.assets.length}</td><td>{c.incoming_assets.length}</td><td>{c.recorded_headcount}</td><td>{c.proposed_target_headcount}</td></tr>)}</tbody></table></div>
      </section>
      <section className="oqt-card"><h2>Cost comparison</h2><div className="oqt-kpis"><div><span>Current annual recurring</span><strong>{money(plan.payload.financial.annual_recurring.current)}</strong></div><div><span>Target annual recurring</span><strong>{money(plan.payload.financial.annual_recurring.target)}</strong></div><div><span>Transition one-off</span><strong>{money(plan.payload.financial.transition_one_off)}</strong></div><div><span>Entered transition total</span><strong>{money(plan.payload.financial.transition_total)}</strong></div></div><p>Annual run-rate difference: {money(plan.payload.financial.annual_run_rate_difference)}. Verify comparable scope before treating this as a saving.</p><p className="oqt-muted">{plan.payload.financial.basis}</p></section>
      <section className="oqt-card"><h2>Resolve the planning gaps</h2>{plan.payload.gaps.length ? plan.payload.gaps.map(g => <div className="oqt-checkrow" key={g.id}><span className="oqt-dot" /><div><b>{g.detail}</b><p>{g.blocking ? "Blocks plan review" : "Review assumption"} · {g.owner} · {g.source_ids.join(", ")}</p></div></div>) : <p>No rule-detected input gaps. The scope still requires specialist validation.</p>}</section>
      <section className="oqt-card"><h2>Phased delivery roadmap</h2><nav className="oqt-tabs" aria-label="Plan phases">{plan.payload.phases.map(p => <button key={p.id} className={p.id === phase ? "active" : ""} onClick={() => setPhase(p.id)}>{p.name}</button>)}</nav>
        {plan.payload.phases.filter(p => p.id === phase).map(p => <p key={p.id} className="oqt-muted">{p.start} → {p.end} · Calendar targets; effort and capacity need validation.</p>)}
        {plan.payload.actions.filter(a => a.phase === phase).map(a => <details className="oqt-plan-action" key={a.id}><summary>{a.title} · {a.owner} · {a.target_date}</summary><p>{a.acceptance_criteria}</p><p>Prerequisites: {a.depends_on.join(", ") || "None entered"}</p><p>Sources: {a.source_ids.join(", ")}</p></details>)}
      </section>
      <section className="oqt-card"><h2>Day 1 acceptance gates</h2>{plan.payload.day_one_gates.map(g => <details className="oqt-plan-action" key={g.id}><summary>{g.name} · {g.status.replaceAll("_", " ")}</summary><p>{g.acceptance_criteria}</p><p>Owner: {g.owner}</p></details>)}</section>
      <section className="oqt-card"><h2>Independent plan review</h2><p>Review records acceptance of the planning baseline. Cutover, employee changes, spending and regulatory sign-off require their own authority.</p>
        <label>Plan review evidence<input value={reviewRef} onChange={e => setReviewRef(e.target.value)} /></label><div className="oqt-inline"><button disabled={busy || stale || plan.status !== "draft" || !!plan.payload.blocking_gap_count || !reviewRef || !["owner", "reviewer"].includes(role)} onClick={() => void load("planning.review", { id: plan.id, decision: "reviewed", evidence_ref: reviewRef }, true)}>Record independent review</button><button className="oqt-secondary" disabled={busy || plan.status !== "draft" || !reviewRef || !["owner", "reviewer"].includes(role)} onClick={() => void load("planning.review", { id: plan.id, decision: "rejected", evidence_ref: reviewRef }, true)}>Reject plan</button></div>
        <details><summary>Planning assumptions and boundaries</summary>{plan.payload.assumptions.map(a => <p key={a}>{a}</p>)}</details>
      </section>
    </>}
  </>;
}
