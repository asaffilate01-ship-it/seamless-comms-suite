import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/hooks/useTenant";
import { getDashboard } from "@/lib/app.functions";
import { toast } from "sonner";
import { MessageCircle, FolderOpen, Users, ShieldAlert, ArrowRight, Bot } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "Übersicht — OmniQora" },
      { name: "description", content: "Live-Kennzahlen zu Gesprächen, Fällen und Automatisierung." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Overview,
});

type Dash = Awaited<ReturnType<typeof getDashboard>>;

function Overview() {
  const { tenantId, role, name, loading: tenantLoading } = useTenant();
  const [dash, setDash] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchDash = useServerFn(getDashboard);

  useEffect(() => {
    if (!tenantId) return;
    fetchDash({ data: { tenantId } })
      .then((d) => setDash(d as Dash))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Laden fehlgeschlagen"))
      .finally(() => setLoading(false));
  }, [tenantId, fetchDash]);

  const busy = tenantLoading || loading;
  const max = Math.max(1, ...(dash?.volume ?? []).map((d) => d.inbound + d.outbound));

  const kpis = [
    { icon: MessageCircle, label: "Offene Gespräche", value: dash?.openConversations ?? 0 },
    { icon: FolderOpen, label: "Aktive Fälle", value: dash?.activeCases ?? 0 },
    { icon: Users, label: "Kontakte", value: dash?.contacts ?? 0 },
    { icon: ShieldAlert, label: "Eskaliert", value: dash?.escalated ?? 0 },
  ];

  return (
    <AppShell
      title="Übersicht"
      subtitle={name ? `${name} · Rolle: ${role}` : "Live-Daten aus deinem Workspace"}
      actions={
        <Link to="/app/inbox">
          <Button size="sm">
            Postfach öffnen
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </Link>
      }
    >
      {busy ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            {kpis.map((k) => {
              const Icon = k.icon;
              return (
                <Card key={k.label}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</span>
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="mt-2 font-display text-3xl font-semibold">{k.value}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold">Nachrichtenvolumen · 7 Tage</h3>
                  <Badge variant="secondary">{dash?.messages7d ?? 0} Nachrichten</Badge>
                </div>
                <div className="mt-6 flex h-56 items-stretch gap-3">
                  {(dash?.volume ?? []).map((d) => (
                    <div key={d.day} className="flex min-h-0 flex-1 flex-col items-center gap-2">
                      <div className="flex h-full w-full flex-col justify-end gap-0.5">
                        <div
                          className="w-full rounded-t bg-primary"
                          style={{ height: `${(d.inbound / max) * 100}%` }}
                        />
                        <div
                          className="w-full rounded-b bg-info"
                          style={{ height: `${(d.outbound / max) * 100}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(d.day).toLocaleDateString("de-DE", { weekday: "short" })}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    Eingehend
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-info" />
                    Ausgehend
                  </span>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <h3 className="font-display text-base font-semibold">Automatisierungsgrad</h3>
                  </div>
                  <div className="mt-3 font-display text-3xl font-semibold">{dash?.automationRate ?? 0}%</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Anteil ausgehender Nachrichten ohne manuelles Zutun (letzte 7 Tage).
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-2 p-6 text-sm">
                  <h3 className="font-display text-base font-semibold">Heute</h3>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Geschlossene Fälle</span>
                    <span className="font-medium">{dash?.closedToday ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dringende Fälle</span>
                    <span className="font-medium">{dash?.urgent ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gespräche mit Kundenantwort</span>
                    <span className="font-medium">{dash?.awaitingReply ?? 0}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {(dash?.messages7d ?? 0) === 0 && (
            <Card className="mt-6 border-dashed">
              <CardContent className="p-6">
                <h3 className="font-display text-lg font-semibold">Kanal verbinden</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Verbinde deine WhatsApp-Business-Nummer, damit Gespräche, Kontakte und Fälle automatisch
                  entstehen.
                </p>
                <Link to="/app/whatsapp">
                  <Button size="sm" className="mt-4">
                    Zur Kanal-Einrichtung
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </AppShell>
  );
}
