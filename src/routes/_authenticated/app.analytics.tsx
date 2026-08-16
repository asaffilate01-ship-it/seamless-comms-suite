import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useTenant } from "@/hooks/useTenant";
import { getDashboard } from "@/lib/app.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/analytics")({
  head: () => ({
    meta: [
      { title: "Analysen — Konnevia" },
      { name: "description", content: "Operative Kennzahlen, Automatisierungsqualität und Fallverteilung." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Analytics,
});

type Dash = Awaited<ReturnType<typeof getDashboard>>;

function Analytics() {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [dash, setDash] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchDash = useServerFn(getDashboard);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    fetchDash({ data: { tenantId } })
      .then((d) => !cancelled && setDash(d as Dash))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Laden fehlgeschlagen"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tenantId, fetchDash]);

  if (tenantLoading || loading) {
    return (
      <AppShell title="Analysen" subtitle="Wird geladen…">
        <Skeleton className="h-72 w-full rounded-xl" />
      </AppShell>
    );
  }

  const volume = dash?.volume ?? [];
  const max = Math.max(1, ...volume.map((d) => d.inbound + d.outbound));
  const inbound = volume.reduce((a, d) => a + d.inbound, 0);
  const outbound = volume.reduce((a, d) => a + d.outbound, 0);
  const responseRatio = inbound ? Math.min(100, Math.round((outbound / inbound) * 100)) : 0;

  return (
    <AppShell title="Analysen" subtitle="Live-Kennzahlen der letzten 7 Tage aus deinem Workspace">
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Aktive Fälle", dash?.activeCases ?? 0],
          ["Heute geschlossen", dash?.closedToday ?? 0],
          ["Automatisierungsgrad", `${dash?.automationRate ?? 0}%`],
          ["Kontakte", dash?.contacts ?? 0],
        ].map(([k, v]) => (
          <Card key={k as string}>
            <CardContent className="p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div>
              <div className="mt-2 font-display text-2xl font-semibold">{v}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <h3 className="font-display text-lg font-semibold">Volumen · 7 Tage</h3>
            {volume.every((d) => d.inbound + d.outbound === 0) ? (
              <p className="mt-4 text-sm text-muted-foreground">Noch keine Nachrichten in diesem Zeitraum.</p>
            ) : (
              <div className="mt-6 flex h-64 items-end gap-3">
                {volume.map((d) => (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex h-full w-full flex-col justify-end gap-0.5">
                      <div className="w-full rounded-t bg-primary" style={{ height: `${(d.inbound / max) * 100}%` }} />
                      <div className="w-full rounded-b bg-info" style={{ height: `${(d.outbound / max) * 100}%` }} />
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(d.day).toLocaleDateString("de-DE", { weekday: "short" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="font-display text-lg font-semibold">Qualitätsindikatoren</h3>
            <div className="mt-5 space-y-5">
              {[
                { label: "Antwortquote (ausgehend/eingehend)", value: responseRatio },
                { label: "Automatisierungsgrad", value: dash?.automationRate ?? 0 },
                {
                  label: "Abgeschlossene Fälle",
                  value:
                    (dash?.activeCases ?? 0) + (dash?.closedToday ?? 0) > 0
                      ? Math.round(
                          ((dash?.closedToday ?? 0) / ((dash?.activeCases ?? 0) + (dash?.closedToday ?? 0))) * 100,
                        )
                      : 0,
                },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{row.label}</span>
                    <span className="text-muted-foreground">{row.value}%</span>
                  </div>
                  <Progress value={row.value} className="mt-1.5 h-1.5" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {[
          {
            t: "Gesprächsfluss",
            rows: [
              ["Eingehende Nachrichten", String(inbound)],
              ["Ausgehende Nachrichten", String(outbound)],
              ["Offene Gespräche", String(dash?.openConversations ?? 0)],
            ],
          },
          {
            t: "Fallstatus",
            rows: [
              ["Aktiv", String(dash?.activeCases ?? 0)],
              ["Eskaliert", String(dash?.escalated ?? 0)],
              ["Dringend", String(dash?.urgent ?? 0)],
            ],
          },
          {
            t: "Einwilligungen",
            rows: [
              ["Kontakte gesamt", String(dash?.contacts ?? 0)],
              ["Mit Kundenantwort", String(dash?.awaitingReply ?? 0)],
              ["Nachrichten (7 Tage)", String(dash?.messages7d ?? 0)],
            ],
          },
        ].map((s) => (
          <Card key={s.t}>
            <CardContent className="p-6">
              <h3 className="font-display text-base font-semibold">{s.t}</h3>
              <div className="mt-3 divide-y divide-border text-sm">
                {s.rows.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between py-2">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
