import { useState, type FormEvent } from "react";
import type { KnowledgeResult, RetrievalMode } from "./shared-knowledge-client";

/** Connect to your OWN authenticated SaaS endpoint. No service token enters this component. */
export function KnowledgePanel({endpoint, title = "Ask your knowledge base", requestHeaders = {}}: {
  endpoint: string; title?: string; requestHeaders?: Record<string, string>;
}) {
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<RetrievalMode>("rag");
  const [result, setResult] = useState<KnowledgeResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function ask(event: FormEvent) {
    event.preventDefault();
    if (pending || !question.trim()) return;
    setPending(true); setError(""); setResult(null);
    try {
      const response = await fetch(endpoint, {method: "POST", credentials: "same-origin",
        headers: {"Content-Type": "application/json", ...requestHeaders},
        signal: AbortSignal.timeout(60000), body: JSON.stringify({question, mode})});
      if (!response.ok) throw new Error("Your question could not be completed. Please try again.");
      setResult(await response.json());
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setPending(false); }
  }
  return <section style={{maxWidth: 820, padding: 24, border: "1px solid #dbe3ea", borderRadius: 16, background: "#fff", color: "#182a36", fontFamily: "inherit"}}>
    <h2 style={{marginTop: 0}}>{title}</h2>
    <p>Find answers and supporting sources in information you have access to.</p>
    <form onSubmit={ask}>
      <label htmlFor="knowledge-question">Your question</label>
      <textarea id="knowledge-question" value={question} onChange={e => setQuestion(e.target.value)} required maxLength={2000} rows={3}
        style={{display: "block", boxSizing: "border-box", width: "100%", margin: "8px 0 14px", padding: 12, borderRadius: 8, border: "1px solid #a5b5c5", font: "inherit"}} />
      <label>Search method <select value={mode} onChange={e => setMode(e.target.value as RetrievalMode)}>
        <option value="rag">Documents</option><option value="graph">Relationships</option><option value="hybrid">Both</option>
      </select></label>
      <button disabled={pending} type="submit" style={{marginLeft: 16, padding: "10px 18px", background: "#145c52", color: "white", border: 0, borderRadius: 8}}>{pending ? "Searching…" : "Ask"}</button>
    </form>
    <div aria-live="polite">
      {error && <p role="alert">{error}</p>}
      {result && <>
        <p style={{whiteSpace: "pre-wrap"}}>{result.answer}</p>
        {result.status === "draft" && <p><strong>Draft for review.</strong> Check the supporting sources before acting.</p>}
        {result.evidence.length > 0 && <h3>Supporting sources</h3>}
        {result.evidence.map(source => <details key={source.citation_id} style={{margin: "10px 0", padding: 12, background: "#f4f7fa", borderRadius: 8}}>
          <summary>[{source.citation_id}] {source.title} · version {source.revision}</summary>
          <p style={{whiteSpace: "pre-wrap"}}>{source.quote}</p>
          {source.source_uri.startsWith("https://") && <a href={source.source_uri} target="_blank" rel="noopener noreferrer">Open source</a>}
        </details>)}
        {result.graph_paths.length > 0 && <details><summary>Connections used ({result.graph_paths.length})</summary>
          <ul>{result.graph_paths.map((path, i) => <li key={i}>{path.nodes.join(" → ")}</li>)}</ul>
        </details>}
      </>}
    </div>
  </section>;
}
