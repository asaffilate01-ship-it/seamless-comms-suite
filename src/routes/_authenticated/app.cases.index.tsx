import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, StatusBadge } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenant, canWrite } from "@/hooks/useTenant";
import { listCases, createCase } from "@/lib/app.functions";
import { toast } from "sonner";
import { Search, Plus, FolderOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/cases/")({
  head: () => ({
    meta: [
      { title: "Fälle — Konnevia" },
      { name: "description", content: "Jedes WhatsApp-Gespräch als kontrollierter Geschäftsprozess." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Cases,
});

type CaseRow = Awaited<ReturnType<typeof listCases>>[number];

const FILTERS = [
  { key: "all", label: "Alle" },
  { key: "new", label: "Neu" },
  { key: "open", label: "Offen" },
  { key: "waiting_customer", label: "Wartet auf Kunde" },
  { key: "escalated", label: "Eskaliert" },
  { key: "closed", label: "Geschlossen" },
];

function Cases() {
  const { tenantId, role, loading: tenantLoading } = useTenant();
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchCases = useServerFn(listCases);
  const createFn = useServerFn(createCase);

  const load = useMemo(
    () => async (id: string) => {
      try {
        setRows((await fetchCases({ data: { tenantId: id } })) as CaseRow[]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Laden fehlgeschlagen");
      } finally {
        setLoading(false);
      }
    },
    [fetchCases],
  );

  useEffect(() => {
    if (tenantId) void load(tenantId);
  }, [tenantId, load]);

  const filtered = rows.filter((c) => {
    if (filter !== "all" && c.status !== filter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const contact = (c.conversation as { contact?: { display_name?: string | null; wa_id?: string } } | null)
      ?.contact;
    return `${c.title} ${contact?.display_name ?? ""} ${contact?.wa_id ?? ""}`.toLowerCase().includes(q);
  });

  async function handleCreate() {
    if (!tenantId) return;
    setCreating(true);
    try {
      await createFn({ data: { tenantId, title: "Neuer Fall", priority: "normal" } });
      await load(tenantId);
      toast.success("Fall erstellt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fall konnte nicht erstellt werden");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppShell
      title="Fälle"
      subtitle={`${rows.filter((r) => r.status !== "closed").length} aktiv · ${rows.length} insgesamt`}
      actions={
        canWrite(role) ? (
          <Button size="sm" onClick={handleCreate} disabled={creating}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Neuer Fall
          </Button>
        ) : null
      }
    >
      {tenantLoading || loading ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-14 text-center">
            <FolderOpen className="h-8 w-8 text-muted-foreground" />
            <h3 className="font-display text-lg font-semibold">Noch keine Fälle</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              Fälle entstehen aus Gesprächen im Postfach oder werden hier manuell angelegt.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Fälle durchsuchen…"
                className="pl-9"
              />
            </div>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={
                  filter === f.key
                    ? "rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                    : "rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface-2"
                }
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Fall</th>
                  <th className="px-4 py-3">Kontakt</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priorität</th>
                  <th className="px-4 py-3">Aktualisiert</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((c) => {
                  const contact = (
                    c.conversation as { contact?: { display_name?: string | null; wa_id?: string } } | null
                  )?.contact;
                  return (
                    <tr key={c.id} className="hover:bg-surface-2">
                      <td className="px-4 py-3">
                        <Link
                          to="/app/cases/$caseId"
                          params={{ caseId: c.id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {c.title}
                        </Link>
                        <div className="font-mono text-[10px] text-muted-foreground">{c.id.slice(0, 8)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{contact?.display_name ?? "—"}</div>
                        {contact?.wa_id && (
                          <div className="font-mono text-xs text-muted-foreground">+{contact.wa_id}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            c.priority === "urgent"
                              ? "border-destructive/40 bg-destructive/10 text-destructive"
                              : c.priority === "high"
                                ? "border-warning/40 bg-warning/10 text-warning-foreground"
                                : "text-muted-foreground"
                          }
                        >
                          {c.priority}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(c.updated_at).toLocaleString("de-DE")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
