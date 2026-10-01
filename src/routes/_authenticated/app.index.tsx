import { PortfolioServices } from "@/components/PortfolioServices";
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
import { useTx, useI18nSafe } from "@/lib/i18n";
import { MessageCircle, FolderOpen, Users, ShieldAlert, ArrowRight, Bot } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "Overview — OmniQora" },
      { name: "description", content: "Live metrics for conversations, cases and automation." },
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
  const tx = useTx();
  const lang = useI18nSafe()?.lang ?? "en";

  useEffect(() => {
    if (!tenantId) return;
    fetchDash({ data: { tenantId } })
      .then((d) => setDash(d as Dash))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : tx("Laden fehlgeschlagen", "Failed to load")))
      .finally(() => setLoading(false));
  }, [tenantId, fetchDash]);

  const busy = tenantLoading || loading;
  const max = Math.max(1, ...(dash?.volume ?? []).map((d) => d.inbound + d.outbound));

  const kpis = [
    { icon: MessageCircle, label: tx("Offene Gespräche", "Open conversations"), value: dash?.openConversations ?? 0 },
    { icon: FolderOpen, label: tx("Aktive Fälle", "Active cases"), value: dash?.activeCases ?? 0 },
    { icon: Users, label: tx("Kontakte", "Contacts"), value: dash?.contacts ?? 0 },
    { icon: ShieldAlert, label: tx("Eskaliert", "Escalated"), value: dash?.escalated ?? 0 },
  ];

  return (
    <AppShell
      title={tx("Übersicht", "Overview")}
      subtitle={name ? `${name} · ${tx("Rolle", "Role")}: ${role}` : tx("Live-Daten aus deinem Workspace", "Live data from your workspace")}
      actions={
        <Link to="/app/inbox">
          <Button size="sm">
            {tx("Postfach öffnen", "Open inbox")}
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
                  <h3 className="font-display text-lg font-semibold">{tx("Nachrichtenvolumen · 7 Tage", "Message volume · 7 days")}</h3>
                  <Badge variant="secondary">{dash?.messages7d ?? 0} {tx("Nachrichten", "messages")}</Badge>
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
                        {new Date(d.day).toLocaleDateString(lang === "de" ? "de-DE" : "en-GB", { weekday: "short" })}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    {tx("Eingehend", "Inbound")}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-info" />
                    {tx("Ausgehend", "Outbound")}
                  </span>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <h3 className="font-display text-base font-semibold">{tx("Automatisierungsgrad", "Automation rate")}</h3>
                  </div>
                  <div className="mt-3 font-display text-3xl font-semibold">{dash?.automationRate ?? 0}%</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tx("Anteil ausgehender Nachrichten ohne manuelles Zutun (letzte 7 Tage).", "Share of outbound messages sent without manual input (last 7 days).")}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-2 p-6 text-sm">
                  <h3 className="font-display text-base font-semibold">{tx("Heute", "Today")}</h3>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{tx("Geschlossene Fälle", "Closed cases")}</span>
                    <span className="font-medium">{dash?.closedToday ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{tx("Dringende Fälle", "Urgent cases")}</span>
                    <span className="font-medium">{dash?.urgent ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{tx("Gespräche mit Kundenantwort", "Awaiting reply")}</span>
                    <span className="font-medium">{dash?.awaitingReply ?? 0}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {(dash?.messages7d ?? 0) === 0 && (
            <Card className="mt-6 border-dashed">
              <CardContent className="p-6">
                <h3 className="font-display text-lg font-semibold">{tx("Kanal verbinden", "Connect a channel")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {tx("Verbinde einen Kanal, damit Gespräche, Kontakte und Fälle automatisch entstehen.", "Connect a channel so conversations, contacts and cases are created automatically.")}
                </p>
                <Link to="/app/whatsapp">
                  <Button size="sm" className="mt-4">
                    {tx("Zur Kanal-Einrichtung", "Set up channels")}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </>
      )}
      {!busy && (role === "owner" || role === "admin") && <PortfolioServices source="omniqora" placement="dashboard" country={lang === "de" ? "DE" : "GB"} locale={lang} />}
    </AppShell>
  );
}

