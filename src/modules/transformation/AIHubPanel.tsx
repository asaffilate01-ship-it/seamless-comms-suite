import { useEffect, useRef, useState } from "react";

type Data = Record<string, unknown>;
type Api = (command: string, projectId?: string, data?: Data) => Promise<unknown>;
type Policy = { enabled: boolean; data_sharing_approved: boolean; routes: Record<string, string>; connectors: string[]; max_steps: number; max_output_tokens: number; daily_model_calls: number; daily_connector_calls: number };
type Hub = { revision: number; policy: Policy; models: { id: string; label: string; provider: string; model: string }[]; connectors: { id: string; label: string; kind: string; operations: string[] }[]; profiles: { id: string; name: string; focus: string }[]; usage_today: { model_calls: number; connector_calls: number; input_tokens: number; output_tokens: number }; usage_basis: string };
type AgentRun = { id: string; profile: string; goal: string; status: string; step: number; version: number; stale: boolean; creator: string; payload: { model_id: string; claims: { text: string; sources: string[] }[]; uncertainties: string[]; observations: { id: string; tool: string; arguments: Data; result: unknown }[]; events: unknown[]; error?: string } };

export function AIHubPanel({ api, projectId, role, dataVersion, busy, run }: {
  api: Api; projectId: string; role: string; dataVersion: number; busy: boolean;
  run: (command: string, data?: Data, refresh?: boolean) => Promise<unknown>;
}) {
  const [hub, setHub] = useState<Hub | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [history, setHistory] = useState<AgentRun[]>([]);
  const [active, setActive] = useState<AgentRun | null>(null);
  const [profile, setProfile] = useState(role === "finance" ? "finance" : "transaction");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState("");
  const [advancing, setAdvancing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [connectionId, setConnectionId] = useState("");
  const [operation, setOperation] = useState("");
  const [preview, setPreview] = useState<Data | null>(null);
  const [documentId, setDocumentId] = useState("");
  const [revision, setRevision] = useState(0);
  const stop = useRef(false);
  const owner = role === "owner";
  const writable = ["owner", "analyst", "reviewer", "finance"].includes(role);
  const stale = !!active && (active.stale || active.version !== dataVersion);
  async function reload(updatePolicy = false) {
    const [status, runs] = await Promise.all([api("ai.status", projectId), api("ai.runs.list", projectId)]);
    setHub(status as Hub); setHistory(runs as AgentRun[]);
    if (updatePolicy) setPolicy((status as Hub).policy);
  }
  useEffect(() => {
    let live = true;
    stop.current = false;
    void Promise.all([api("ai.status", projectId), api("ai.runs.list", projectId)]).then(([status, runs]) => {
      if (live) { setHub(status as Hub); setPolicy((status as Hub).policy); setHistory(runs as AgentRun[]); }
    }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; stop.current = true; };
  }, [api, projectId]);
  async function loadRun(id: string) {
    const result = await run("ai.runs.get", { id }, false);
    if (result) setActive(result as AgentRun);
  }
  async function advance(all: boolean) {
    if (!active) return;
    setAdvancing(true); stop.current = false;
    let current = active;
    try {
      for (let i = 0; i < 8 && !stop.current && current.status === "ready"; i++) {
        const result = await run("ai.runs.step", { id: current.id });
        if (!result) break;
        current = result as AgentRun; setActive(current);
        if (!all) break;
      }
      const latest = await api("ai.runs.get", projectId, { id: active.id });
      setActive(latest as AgentRun);
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not refresh the run"); }
    finally { setAdvancing(false); }
  }
  async function cancel() {
    if (!active) return;
    stop.current = true; setCancelling(true);
    try {
      setActive(await api("ai.runs.cancel", projectId, { id: active.id }) as AgentRun);
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Cancellation failed"); }
    finally { setCancelling(false); }
  }
  const chosenConnection = hub?.connectors.find(c => c.id === connectionId);
  const chosenOperation = chosenConnection?.operations.includes(operation) ? operation : chosenConnection?.operations[0] ?? "";
  return <>
    {error && <p role="alert" className="oqt-alert">{error}</p>}
    {!hub || !policy ? <p role="status">Loading AI settings…</p> : <>
      <section className="oqt-card"><h2>Models, tools and specialist agents</h2><p>Choose a specialist and an approved model. The agent reads scoped records and evidence, chooses permitted tools, and returns a draft with source references. Proposed tasks go to the existing decision queue.</p>
        <div className="oqt-kpis"><div><span>Configured models</span><strong>{hub.models.length}</strong></div><div><span>Scoped connectors</span><strong>{hub.connectors.length}</strong></div><div><span>Model calls today</span><strong>{hub.usage_today.model_calls}</strong></div><div><span>Connector reads today</span><strong>{hub.usage_today.connector_calls}</strong></div></div>
        <p className="oqt-muted">{hub.usage_basis}</p>
        {!hub.models.length && <p className="oqt-notice">No model is configured for this project. An operator must add the provider, model, credential reference and project binding on the server.</p>}
        {hub.models.map(m => <div className="oqt-wave" key={m.id}><b>{m.label}</b><span>{m.provider} · {m.model} · configured, live validation required</span></div>)}
      </section>
      <section className="oqt-card"><h2>Project AI controls</h2><p>Credentials are managed on the server. Enabling data sharing permits this project's authorised records and retrieved source content to be sent to the selected models. The project pause control also stops AI runs.</p>
        {owner ? <>
          <div className="oqt-fields"><label className="oqt-check"><input type="checkbox" checked={policy.enabled} onChange={e => setPolicy({ ...policy, enabled: e.target.checked })} />Enable AI for this project</label><label className="oqt-check"><input type="checkbox" checked={policy.data_sharing_approved} onChange={e => setPolicy({ ...policy, data_sharing_approved: e.target.checked })} />Approve project data sharing with selected services</label>
            {hub.profiles.map(p => <label key={p.id}>{p.name} model<select aria-label={`${p.name} model`} value={policy.routes[p.id] ?? ""} onChange={e => { const routes = { ...policy.routes }; if (e.target.value) routes[p.id] = e.target.value; else delete routes[p.id]; setPolicy({ ...policy, routes }); }}><option value="">Disabled</option>{hub.models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>)}
            {([['max_steps', 'Steps per run', 1, 8], ['max_output_tokens', 'Output token cap per call', 256, 4096], ['daily_model_calls', 'Daily model call limit', 1, 500], ['daily_connector_calls', 'Daily connector read limit', 1, 500]] as const).map(([key, title, min, max]) => <label key={key}>{title}<input type="number" min={min} max={max} value={policy[key]} onChange={e => setPolicy({ ...policy, [key]: Number(e.target.value) })} /></label>)}
          </div><h3>Allowed connectors</h3>{hub.connectors.length ? hub.connectors.map(c => <label className="oqt-check" key={c.id}><input type="checkbox" checked={policy.connectors.includes(c.id)} onChange={e => setPolicy({ ...policy, connectors: e.target.checked ? [...policy.connectors, c.id] : policy.connectors.filter(id => id !== c.id) })} />{c.label} · {c.operations.join(", ")}</label>) : <p className="oqt-muted">No connectors are bound to this project.</p>}
          <button disabled={busy || advancing} onClick={async () => { const result = await run("ai.policy.save", { policy, expected_revision: hub.revision }); if (result) { setHub(result as Hub); setPolicy((result as Hub).policy); } }}>Save AI controls</button>
        </> : <p>Owner-managed policy: {hub.policy.enabled ? "Enabled" : "Disabled"}. Up to {hub.policy.max_steps} steps and {hub.policy.daily_model_calls} model calls per day.</p>}
      </section>
      <div className="oqt-columns"><section className="oqt-card"><h2>Start a specialist run</h2><label>Specialist<select value={profile} onChange={e => setProfile(e.target.value)}>{hub.profiles.filter(p => role !== "finance" || p.id === "finance").map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><p className="oqt-muted">{hub.profiles.find(p => p.id === profile)?.focus}</p>
        <label>Agent goal<textarea value={goal} maxLength={2000} onChange={e => setGoal(e.target.value)} placeholder="Review our standalone costs and identify the evidence we still need." /></label>
        <button disabled={busy || advancing || !writable || !goal.trim() || !hub.policy.enabled || !hub.policy.data_sharing_approved || !hub.policy.routes[profile]} onClick={async () => { const result = await run("ai.runs.start", { id: crypto.randomUUID(), profile, goal }); if (result) { setActive(result as AgentRun); await reload(); } }}>Create agent run</button>
        <p className="oqt-muted">Creating a run makes no model call. Advance one step or run to the configured limit.</p>
      </section><section className="oqt-card"><h2>Recent runs</h2>{history.length ? history.map(r => <button key={r.id} disabled={busy || advancing} className="oqt-record" onClick={() => void loadRun(r.id)}><b>{r.goal}</b><span>{r.profile} · {r.status.replaceAll("_", " ")} · {r.step} steps</span></button>) : <p className="oqt-empty">No specialist runs yet.</p>}</section></div>
      {active && <section className="oqt-card"><h2>Agent run: {active.profile}</h2><p>{active.goal}</p><div className="oqt-inline"><span className="oqt-pill">{active.status.replaceAll("_", " ")}</span><span>{active.step} steps · {active.payload.model_id}</span>
        <button disabled={busy || advancing || stale || active.status !== "ready" || !writable} onClick={() => void advance(false)}>Run next step</button><button disabled={busy || advancing || stale || active.status !== "ready" || !writable} onClick={() => void advance(true)}>Run to result</button>
        <button className="oqt-danger" disabled={cancelling || !writable || !["ready", "running"].includes(active.status)} onClick={() => void cancel()}>Cancel run</button></div>
        {advancing && <p role="status">Advancing within the configured limits…</p>}{stale && <p className="oqt-alert">Project inputs or configuration changed. Start a fresh run.</p>}{active.payload.error && <p className="oqt-alert">{active.payload.error}</p>}
        {active.payload.claims.map((c, i) => <p key={i}>{c.text} <small>{c.sources.join(", ")}</small></p>)}
        {active.payload.uncertainties.length > 0 && <><h3>Uncertainties and follow-up</h3>{active.payload.uncertainties.map((u, i) => <p key={i}>{u}</p>)}</>}
        <h3>Observations and tool results</h3>{active.payload.observations.map(o => <details key={o.id}><summary>{o.id} · {o.tool}</summary><pre className="oqt-result">{JSON.stringify({ arguments: o.arguments, result: o.result }, null, 2)}</pre></details>)}
        <details><summary>Step and usage history</summary><pre className="oqt-result">{JSON.stringify(active.payload.events, null, 2)}</pre></details>
        <p className="oqt-muted">Source references are checked. Factual correctness and professional acceptance still require review. Inspect task proposals under Agents.</p>
      </section>}
      <section className="oqt-card"><h2>Read and review a connector snapshot</h2><p>Fetch a bounded preview from a selected source. Review it before adding it as project evidence. A preview is not a complete system inventory.</p>
        <div className="oqt-fields"><label>Connector<select value={connectionId} onChange={e => { setConnectionId(e.target.value); setPreview(null); }}><option value="">Choose a connector</option>{hub.connectors.filter(c => hub.policy.connectors.includes(c.id)).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label><label>Read operation<select value={chosenOperation} onChange={e => setOperation(e.target.value)}>{chosenConnection?.operations.map(op => <option key={op}>{op}</option>)}</select></label></div>
        <button disabled={busy || advancing || !writable || !chosenOperation || !hub.policy.enabled || !hub.policy.data_sharing_approved} onClick={async () => { const result = await run("connectors.read", { connection_id: connectionId, operation: chosenOperation }, false); if (result) { setPreview(result as Data); await reload(); } }}>Read connector</button>
        {preview && <><pre className="oqt-result">{JSON.stringify(preview, null, 2)}</pre><div className="oqt-fields"><label>Evidence document ID<input value={documentId} onChange={e => setDocumentId(e.target.value)} /></label><label>Expected document revision<input type="number" min={0} value={revision} onChange={e => setRevision(Number(e.target.value))} /></label></div><button disabled={busy || advancing || !documentId || !["owner", "analyst", "reviewer"].includes(role)} onClick={async () => { const result = await run("connectors.ingest", { snapshot_id: preview.snapshot_id, document_id: documentId, expected_revision: revision }); if (result) setPreview(null); }}>Add reviewed snapshot to evidence</button></>}
      </section>
    </>}
  </>;
}
