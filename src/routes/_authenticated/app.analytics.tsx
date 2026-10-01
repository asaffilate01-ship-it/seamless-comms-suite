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
import { useTx, useI18nSafe } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/app/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — OmniQora" },
      { name: "description", content: "Operational metrics, automation quality and case distribution." },
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
  const tx = useTx();
  const loc = (useI18nSafe()?.lang ?? "en") === "de" ? "de-DE" : "en-GB";

  useEffect(() => {
    if (!tenantId) return;
    fetchDash({ data: { tenantId } })
      .then((d) => setDash(d as Dash))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : tx("Laden fehlgeschlagen", "Failed to load")))
      .finally(() => setLoading(false));
  }, [tenantId, fetchDash]);

  if (tenantLoading || loading) {
    return (
      <AppShell title={tx("Analysen", "Analytics")} subtitle={tx("Wird geladen…", "Loading…")}>
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
    <AppShell title={tx("Analysen", "Analytics")} subtitle={tx("Live-Kennzahlen der letzten 7 Tage aus deinem Workspace", "Live metrics from the last 7 days in your workspace")}>
      <div className="grid gap-4 md:grid-cols-4">
        {[
          [tx("Aktive Fälle", "Active cases"), dash?.activeCases ?? 0],
          [tx("Heute geschlossen", "Closed today"), dash?.closedToday ?? 0],
          [tx("Automatisierungsgrad", "Automation rate"), `${dash?.automationRate ?? 0}%`],
          [tx("Kontakte", "Contacts"), dash?.contacts ?? 0],
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
            <h3 className="font-display text-lg font-semibold">{tx("Volumen · 7 Tage", "Volume · 7 days")}</h3>
            {volume.every((d) => d.inbound + d.outbound === 0) ? (
              <p className="mt-4 text-sm text-muted-foreground">{tx("Noch keine Nachrichten in diesem Zeitraum.", "No messages in this period yet.")}</p>
            ) : (
              <div className="mt-6 flex h-64 items-stretch gap-3">
                {volume.map((d) => (
                  <div key={d.day} className="flex min-h-0 flex-1 flex-col items-center gap-2">
                    <div className="flex h-full w-full flex-col justify-end gap-0.5">
                      <div className="w-full rounded-t bg-primary" style={{ height: `${(d.inbound / max) * 100}%` }} />
                      <div className="w-full rounded-b bg-info" style={{ height: `${(d.outbound / max) * 100}%` }} />
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(d.day).toLocaleDateString(loc, { weekday: "short" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="font-display text-lg font-semibold">{tx("Qualitätsindikatoren", "Quality indicators")}</h3>
            <div className="mt-5 space-y-5">
              {[
                { label: tx("Antwortquote (ausgehend/eingehend)", "Response ratio (outbound/inbound)"), value: responseRatio },
                { label: tx("Automatisierungsgrad", "Automation rate"), value: dash?.automationRate ?? 0 },
                {
                  label: tx("Abgeschlossene Fälle", "Closed cases"),
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
            t: tx("Gesprächsfluss", "Conversation flow"),
            rows: [
              [tx("Eingehende Nachrichten", "Inbound messages"), String(inbound)],
              [tx("Ausgehende Nachrichten", "Outbound messages"), String(outbound)],
              [tx("Offene Gespräche", "Open conversations"), String(dash?.openConversations ?? 0)],
            ],
          },
          {
            t: tx("Fallstatus", "Case status"),
            rows: [
              [tx("Aktiv", "Active"), String(dash?.activeCases ?? 0)],
              [tx("Eskaliert", "Escalated"), String(dash?.escalated ?? 0)],
              [tx("Dringend", "Urgent"), String(dash?.urgent ?? 0)],
            ],
          },
          {
            t: tx("Einwilligungen", "Consent"),
            rows: [
              [tx("Kontakte gesamt", "Total contacts"), String(dash?.contacts ?? 0)],
              [tx("Mit Kundenantwort", "Awaiting reply"), String(dash?.awaitingReply ?? 0)],
              [tx("Nachrichten (7 Tage)", "Messages (7 days)"), String(dash?.messages7d ?? 0)],
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
