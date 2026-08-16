import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, StatusBadge } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { kpis, inboxVolume, conversations, contacts, workflows } from "@/lib/mockData";
import { ArrowRight, TrendingUp, Clock, Bot, Users, Zap, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/")({
  component: Overview,
});

function Overview() {
  const max = Math.max(...inboxVolume.map((d) => d.ai + d.staff));
  return (
    <AppShell
      title="Guten Morgen, Lea 👋"
      subtitle="Studio Beauty München · Tuesday, 23 July"
      actions={<>
        <Button variant="outline" size="sm">Export</Button>
        <Button size="sm">New workflow</Button>
      </>}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<Zap />} label="Active cases" value={kpis.activeCases.toString()} trend="+12" trendPositive />
        <Kpi icon={<Clock />} label="Avg. first response" value={`${kpis.avgFirstResponseMin} min`} trend="−0.3 min" trendPositive />
        <Kpi icon={<Bot />} label="Automation rate" value={`${kpis.automationRate}%`} trend="+4%" trendPositive />
        <Kpi icon={<AlertTriangle />} label="SLA breaches · 7d" value={kpis.slaBreaches7d.toString()} trend="−2" trendPositive />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-semibold">Inbox volume · this week</h3>
                <p className="text-xs text-muted-foreground">AI-handled vs staff-handled conversations</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <Legend color="bg-primary" label="AI" />
                <Legend color="bg-info" label="Staff" />
              </div>
            </div>
            <div className="mt-6 flex h-56 items-end gap-4">
              {inboxVolume.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-full w-full flex-col justify-end gap-0.5">
                    <div
                      className="w-full rounded-t bg-primary transition-all"
                      style={{ height: `${(d.ai / max) * 100}%` }}
                      title={`AI: ${d.ai}`}
                    />
                    <div
                      className="w-full rounded-b bg-info"
                      style={{ height: `${(d.staff / max) * 100}%` }}
                      title={`Staff: ${d.staff}`}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground">{d.day}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Automation quality</h3>
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-6 space-y-4">
              {[
                ["Deflection", 62, "AI closed without human"],
                ["Handoff accuracy", 91, "Correct routing to staff"],
                ["Consent capture", 87, "Purpose-scoped captures"],
                ["Template compliance", 98, "Meta-approved sends"],
              ].map(([k, v, d]) => (
                <div key={k as string}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{k}</span>
                    <span className="text-muted-foreground">{v}%</span>
                  </div>
                  <Progress value={v as number} className="mt-1.5 h-1.5" />
                  <div className="mt-1 text-[11px] text-muted-foreground">{d}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Cases needing attention</h3>
              <Link to="/app/cases"><Button variant="ghost" size="sm">All cases <ArrowRight className="ml-1 h-3 w-3" /></Button></Link>
            </div>
            <div className="mt-4 divide-y divide-border">
              {conversations.slice(0, 5).map((c) => {
                const contact = contacts.find((k) => k.id === c.contactId)!;
                return (
                  <Link
                    key={c.id}
                    to="/app/cases/$caseId"
                    params={{ caseId: c.id }}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-3 transition-colors hover:bg-surface-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{contact.name}</span>
                        <StatusBadge status={c.status} />
                      </div>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">{c.purpose} · {c.preview}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{c.assignee ?? "Unassigned"}</span>
                    <span className="w-14 text-right text-xs text-muted-foreground">{c.updatedAt}</span>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Live workflows</h3>
              <Link to="/app/workflows"><Button variant="ghost" size="sm">Manage <ArrowRight className="ml-1 h-3 w-3" /></Button></Link>
            </div>
            <div className="mt-4 space-y-3">
              {workflows.filter((w) => w.status === "live").map((w) => (
                <div key={w.id} className="rounded-lg border border-border bg-surface p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{w.name}</span>
                    <StatusBadge status={w.status} />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                    <div><Users className="mr-1 inline h-3 w-3" />{w.runs30d} runs</div>
                    <div>{w.conversion}% conv.</div>
                    <div>{w.avgHandleMinutes} min avg.</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Kpi({ icon, label, value, trend, trendPositive }: { icon: React.ReactNode; label: string; value: string; trend: string; trendPositive: boolean }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">{icon}</span>
          <span className={`text-xs font-medium ${trendPositive ? "text-success" : "text-destructive"}`}>{trend}</span>
        </div>
        <div className="mt-4 font-display text-2xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-sm ${color}`} />{label}</span>;
}
