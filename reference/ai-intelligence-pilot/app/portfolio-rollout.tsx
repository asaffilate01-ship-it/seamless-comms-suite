"use client";
import { useState } from "react";
import { Download, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { portfolioProducts } from "@/lib/portfolio-products";
import { portfolioRollout, rolloutVerifiedAt, type RolloutRecord } from "@/lib/portfolio-rollout";

const labels = { published: "Published", merged: "Source merged · hosted pending", blocked: "Blocked by release checks" };
const tones = { published: "bg-emerald-50 text-emerald-800", merged: "bg-blue-50 text-blue-800", blocked: "bg-amber-50 text-amber-900" };

export function PortfolioRollout() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("all");
  const [kind, setKind] = useState("all");
  const rows = portfolioRollout.filter(row =>
    (state === "all" || row.state === state) &&
    (kind === "all" || row.kind === kind) &&
    [row.name, row.placement, row.note].join(" ").toLowerCase().includes(query.toLowerCase()));
  const covered = new Set(portfolioRollout.map(row => row.source));
  const configured = portfolioProducts.filter(product => product.scope === "confirmed" && !covered.has(product.slug));
  const review = portfolioProducts.filter(product => product.scope !== "confirmed");
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ verifiedAt: rolloutVerifiedAt, meaning: "Verified release snapshot, not a live monitor or conversion report", releases: portfolioRollout, configuredWithoutVerifiedRollout: configured.map(p => ({slug:p.slug,name:p.name})), scopeReview: review.map(p => ({slug:p.slug,name:p.name})) }, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "portfolio-rollout-2026-09-15.json"; a.click(); URL.revokeObjectURL(url);
  }
  return <section className="panel p-6 space-y-5" aria-labelledby="rollout-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 id="rollout-heading" className="text-lg font-semibold">Release coverage</h2>
        <p className="muted text-sm mt-1">Verified {new Date(rolloutVerifiedAt).toLocaleDateString("en-GB", {day:"numeric",month:"long",year:"numeric",timeZone:"UTC"})}. This is a saved release snapshot.</p></div>
      <Button variant="outline" onClick={download}><Download size={16} /> Export release status</Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {(["published", "merged", "blocked"] as const).map(status => <div key={status} className="border rounded-xl p-4">
        <p className="text-2xl font-semibold">{portfolioRollout.filter(row => row.state === status).length}</p>
        <p className="text-sm muted mt-1">{status === "published" ? "Sites published" : status === "merged" ? "App sources merged" : "App releases blocked"}</p>
      </div>)}
    </div>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
      <h3 className="font-semibold">Haccora UK still needs hosted acceptance</h3>
      <p className="text-sm mt-2">The UK source release and all eight checks passed. Production scheduler configuration, migrations, Edge deployment and real role, persistence and payment checks remain outstanding. Connected Lovable and Supabase access is needed to finish the hosted launch.</p>
    </div>
    <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
      <label className="text-sm">Find an app<input className="mt-1 block w-full rounded-lg border bg-background px-3 py-2" type="search" placeholder="Search apps, placements or blockers" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <label className="text-sm">Release state<select className="mt-1 block w-full rounded-lg border bg-background px-3 py-2" value={state} onChange={e => setState(e.target.value)}>
        <option value="all">All release states</option>{Object.entries(labels).map(([value,label])=><option value={value} key={value}>{label}</option>)}
      </select></label>
      <label className="text-sm">Target<select className="mt-1 block w-full rounded-lg border bg-background px-3 py-2" value={kind} onChange={e => setKind(e.target.value)}>
        <option value="all">All targets</option><option value="Site">Published Sites</option><option value="GitHub">App repositories</option>
      </select></label>
    </div>
    <p className="text-xs muted">{rows.length} of {portfolioRollout.length} targets. A published Site can contain pilot services. A source merge does not confirm its hosted app is updated.</p>
    <div className="overflow-x-auto rounded-xl border" tabIndex={0} aria-label="Release status table">
      <table className="w-full min-w-[800px] text-sm text-left">
        <thead className="bg-muted/50"><tr><th className="p-4 font-medium">App and target</th><th className="p-4 font-medium">Release state</th><th className="p-4 font-medium">Placement and next step</th><th className="p-4 font-medium">Evidence</th></tr></thead>
        <tbody>{rows.map((row: RolloutRecord)=><tr key={row.id} className="border-t align-top">
          <td className="p-4"><p className="font-medium">{row.name}</p><p className="muted text-xs mt-1">{row.kind} · {row.audience}</p></td>
          <td className="p-4"><span className={"inline-block rounded-full px-2.5 py-1 text-xs "+tones[row.state]}>{labels[row.state]}</span></td>
          <td className="p-4 max-w-lg"><p>{row.placement}</p><p className="muted text-xs mt-2">{row.note}</p></td>
          <td className="p-4"><a href={row.url} target="_blank" rel="noopener noreferrer" className="inline-flex gap-1 items-center font-medium underline underline-offset-4">{row.kind === "Site" ? "Open Site" : "View change"}<ArrowUpRight size={14}/></a></td>
        </tr>)}</tbody>
      </table>
      {!rows.length && <p className="p-6 text-sm muted">No releases match these filters.</p>}
    </div>
    <details className="rounded-xl border p-4">
      <summary className="cursor-pointer font-medium text-sm">Configured products without a verified rollout ({configured.length})</summary>
      <p className="text-sm muted mt-3">Recommendation rules are available. A current target and suitable customer workflow still need verification for these products.</p>
      <p className="text-sm mt-2">{configured.map(p=>p.name).join(" · ") || "Every confirmed product has a recorded rollout target."}</p>
      <p className="text-sm muted mt-3">Scope review remains open for {review.length} products; their suggestions stay disabled: {review.map(p=>p.name).join(" · ")}.</p>
    </details>
  </section>;
}
