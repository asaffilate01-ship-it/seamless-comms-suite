import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenant } from "@/hooks/useTenant";
import { listContacts } from "@/lib/app.functions";
import { toast } from "sonner";
import { Search, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/contacts")({
  head: () => ({
    meta: [
      { title: "Kontakte — OmniQora" },
      { name: "description", content: "Alle WhatsApp-Kontakte mit Einwilligungsstatus und Sprache." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Contacts,
});

type Contact = Awaited<ReturnType<typeof listContacts>>[number];

function Contacts() {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [rows, setRows] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const fetchContacts = useServerFn(listContacts);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    fetchContacts({ data: { tenantId } })
      .then((r) => !cancelled && setRows(r as Contact[]))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Laden fehlgeschlagen"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tenantId, fetchContacts]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((c) => `${c.display_name ?? ""} ${c.wa_id}`.toLowerCase().includes(q))
    : rows;

  return (
    <AppShell
      title="Kontakte"
      subtitle={`${rows.length} Kontakte · ${rows.filter((c) => c.consent_marketing).length} mit Marketing-Einwilligung`}
    >
      {tenantLoading || loading ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-14 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <h3 className="font-display text-lg font-semibold">Noch keine Kontakte</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              Kontakte werden automatisch angelegt, sobald eine Person über WhatsApp schreibt.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-border p-4">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name oder Nummer suchen…"
                className="pl-9"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Kontakt</th>
                  <th className="px-4 py-3">Nummer</th>
                  <th className="px-4 py-3">Sprache</th>
                  <th className="px-4 py-3">Einwilligung</th>
                  <th className="px-4 py-3">Zuletzt aktiv</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((c) => {
                  const name = c.display_name ?? `+${c.wa_id}`;
                  return (
                    <tr key={c.id} className="hover:bg-surface-2">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary/10 text-xs text-primary">
                              {name.replace("+", "").slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">+{c.wa_id}</td>
                      <td className="px-4 py-3 uppercase text-muted-foreground">{c.locale ?? "de"}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            c.consent_marketing
                              ? "border-success/40 bg-success/10 text-success"
                              : "border-muted-foreground/30 text-muted-foreground"
                          }
                        >
                          {c.consent_marketing ? "erteilt" : "keine"}
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
