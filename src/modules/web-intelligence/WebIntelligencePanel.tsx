import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { WebIntelMonitoringPanel } from "./WebIntelMonitoringPanel";
import {
  getWebIntelWorkspace,
  proposeWebIntelSource,
  requestWebIntelSnapshot,
  reviewWebIntelSource,
} from "./functions";

/** Existing Connector Hub owns tenant and product selection; no duplicate tenant context. */
export function WebIntelligencePanel({
  tenantId, productKey, tenantRole,
}: { tenantId: string; productKey: string; tenantRole: string | null }) {
  const list = useServerFn(getWebIntelWorkspace);
  const requestSnapshot = useServerFn(requestWebIntelSnapshot);
  const propose = useServerFn(proposeWebIntelSource);
  const review = useServerFn(reviewWebIntelSource);
  const q = useQuery({
    queryKey: ["web-intel", tenantId, productKey],
    queryFn: () => list({ data: { tenantId, productKey } }),
    enabled: !!tenantId && !!productKey,
    retry: false,
  });
  const [sourceId, setSourceId] = useState("");
  const [busy, setBusy] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [purpose, setPurpose] = useState("");
  const [category, setCategory] = useState<"food" | "regulatory" | "education" | "automotive" | "other">("food");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const sources = q.data?.sources ?? [];
  const selectedSource = sources.find((s) => s.id === sourceId) ?? sources[0];
  const canRequest = q.data?.entitled && selectedSource &&
    (q.data?.isPlatformAdmin || ["owner", "admin"].includes(tenantRole || ""));

  async function execute(key: string, task: () => Promise<unknown>, message: string) {
    setBusy(key);
    try {
      await task();
      toast.success(message);
      await q.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Web Intelligence operation failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <Card className="mt-6">
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Omniqora Web Intelligence · Scrapling</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Landlord-approved public website snapshots for this tenant and product.
              Source review, entitlement and worker deployment are separate controls.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Controlled pilot</Badge>
            <Button variant="outline" size="sm" disabled={q.isFetching}
              onClick={() => q.refetch()}>Refresh</Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Not a general web browser. No private URLs, login scraping, browser stealth,
          automatic AI ingestion or public MCP access. External page text is untrusted
          and displayed only as text with source provenance.
        </p>
        {q.isLoading && <p className="text-sm">Loading reviewed sources and tenant evidence…</p>}
        {q.error && (
          <p role="alert" className="text-sm text-destructive">
            Web Intelligence is unavailable. Platform access, the database migration
            and tenant membership must be verified before use.
          </p>
        )}
        {q.data && (
          <>
            <div className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="text-sm">Tenant entitlement</b>
                <Badge variant="outline">
                  {q.data.entitled ? "Granted for tenant" : "Not granted"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Grant <code>omniqora.web-intelligence</code> through Tenant Factory after
                source-policy review. This page cannot grant its own entitlement.
              </p>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <h3 className="font-medium">Request a source snapshot</h3>
              <label className="block text-sm">Approved website
                <select className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                  value={selectedSource?.id ?? ""} onChange={(e) => setSourceId(e.target.value)}>
                  {sources.length === 0 && <option value="">No approved sources</option>}
                  {sources.map((s) => <option key={s.id} value={s.id}>
                    {s.name} · {s.category}
                  </option>)}
                </select>
              </label>
              {selectedSource && (
                <p className="break-all text-xs text-muted-foreground">
                  Source: <a href={selectedSource.url} target="_blank"
                    rel="noopener noreferrer" className="text-primary underline">{selectedSource.url}</a>
                </p>
              )}
              <Button disabled={!canRequest || !!busy}
                onClick={() => selectedSource && execute("queue", () =>
                  requestSnapshot({ data: {
                    tenantId, productKey, sourceId: selectedSource.id,
                    idempotencyKey: crypto.randomUUID(),
                  } }), "Snapshot queued for an external worker; no extraction claimed yet")}>
                {busy === "queue" ? "Submitting…" : "Queue one-page snapshot"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Maximum two open jobs per tenant and one request per source per hour.
                Jobs remain queued until an approved worker is running.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <section className="space-y-2">
                <h3 className="font-medium">Recent jobs</h3>
                {q.data.jobs.length === 0 && <p className="text-sm text-muted-foreground">No crawl requests yet.</p>}
                {q.data.jobs.map((job) => (
                  <div key={job.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium">{sources.find((s) => s.id === job.source_id)?.name ?? job.source_id}</span>
                      <Badge variant="outline">{job.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(job.created_at).toLocaleString()} · attempt status {job.http_status ?? "—"}
                    </p>
                    {job.failure_reason && <p className="text-xs text-destructive">{job.failure_reason}</p>}
                  </div>
                ))}
              </section>
              <section className="space-y-2">
                <h3 className="font-medium">Captured evidence</h3>
                {q.data.documents.length === 0 &&
                  <p className="text-sm text-muted-foreground">No verified worker snapshots yet.</p>}
                {q.data.documents.map((doc) => (
                  <details key={doc.id} className="rounded-lg border p-3">
                    <summary className="cursor-pointer text-sm font-medium">{doc.title}</summary>
                    <p className="mt-2 break-all text-xs text-muted-foreground">
                      <a href={doc.source_url} rel="noopener noreferrer" target="_blank"
                        className="text-primary underline">{doc.source_url}</a>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(doc.captured_at).toLocaleString()} · untrusted source · SHA-256 {doc.content_sha256.slice(0, 16)}…
                    </p>
                    <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs">
                      {doc.preview}
                    </pre>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Plain-text preview only. AI use requires an independently approved downstream pipeline.
                    </p>
                  </details>
                ))}
              </section>
            </div>
            <WebIntelMonitoringPanel
              tenantId={tenantId}
              productKey={productKey}
              tenantRole={tenantRole}
              entitled={q.data.entitled}
              isPlatformAdmin={q.data.isPlatformAdmin}
              sources={q.data.sources}
              monitors={q.data.monitors}
              changes={q.data.changes}
              onChanged={() => q.refetch()}
            />
            {q.data.isPlatformAdmin && (
              <div className="space-y-4 border-t pt-5">
                <h3 className="font-semibold">Landlord · public source governance</h3>
                <div className="grid gap-2 md:grid-cols-2">
                  <Input aria-label="Source name" placeholder="Source name" value={name} onChange={(e) => setName(e.target.value)}/>
                  <select className="h-10 rounded-md border bg-background px-3 text-sm"
                    aria-label="Source category" value={category}
                    onChange={(e) => setCategory(e.target.value as typeof category)}>
                    {(["food", "regulatory", "education", "automotive", "other"] as const)
                      .map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <Input aria-label="Public HTTPS URL" placeholder="https://source.example.org/page"
                  value={url} onChange={(e) => setUrl(e.target.value)}/>
                <Textarea aria-label="Source purpose and permission rationale"
                  value={purpose} onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Document the purpose, lawful use, source terms and collection permission (16+ characters)"/>
                <Button variant="outline" disabled={!!busy || name.trim().length < 3
                  || !url.startsWith("https://") || purpose.trim().length < 16}
                  onClick={() => execute("propose",
                    () => propose({ data: { name, url, category, purpose } }),
                    "Source proposed. Independent platform review is still required.")}>
                  Propose source for independent review
                </Button>

                <h4 className="font-medium">Source review queue</h4>
                {q.data.reviews.length === 0 && <p className="text-sm text-muted-foreground">No pending or approved sources.</p>}
                {q.data.reviews.map((s) => (
                  <div key={s.id} className="space-y-2 rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <b>{s.name} · {s.category}</b><Badge variant="outline">{s.status}</Badge>
                    </div>
                    <p className="break-all text-xs text-muted-foreground">{s.url}</p>
                    <p className="text-xs text-muted-foreground">{s.purpose}</p>
                    <Textarea aria-label={"Review evidence " + s.name}
                      value={reviewNotes[s.id] ?? ""}
                      onChange={(e) => setReviewNotes((all) => ({ ...all, [s.id]: e.target.value }))}
                      placeholder="Independent review note: robots, terms, data protection, source rights…"/>
                    <div className="flex flex-wrap gap-2">
                      {s.status === "pending" && <>
                        <Button size="sm" disabled={!!busy || (reviewNotes[s.id] ?? "").trim().length < 16}
                          onClick={() => execute(s.id, () => review({ data: {
                            sourceId: s.id, decision: "approved", note: reviewNotes[s.id],
                          } }), "Source approved by independent reviewer")}>Approve</Button>
                        <Button size="sm" variant="outline"
                          disabled={!!busy || (reviewNotes[s.id] ?? "").trim().length < 16}
                          onClick={() => execute(s.id, () => review({ data: {
                            sourceId: s.id, decision: "rejected", note: reviewNotes[s.id],
                          } }), "Source rejected")}>Reject</Button>
                      </>}
                      {s.status === "approved" && <Button size="sm" variant="destructive"
                        disabled={!!busy || (reviewNotes[s.id] ?? "").trim().length < 16}
                        onClick={() => execute(s.id, () => review({ data: {
                          sourceId: s.id, decision: "revoked", note: reviewNotes[s.id],
                        } }), "Source revoked; new jobs are disabled")}>Revoke</Button>}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  The source proposer cannot approve their own request. No browser automation,
                  proxy circumvention or general MCP server is enabled by approving a source.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
