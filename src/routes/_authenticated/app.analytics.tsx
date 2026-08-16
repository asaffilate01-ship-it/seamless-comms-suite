import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { inboxVolume, workflows, kpis } from "@/lib/mockData";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/app/analytics")({
  component: Analytics,
});

function Analytics() {
  const max = Math.max(...inboxVolume.map((d) => d.ai + d.staff));

  return (
    <AppShell
      title="Analytics"
      subtitle="Operational KPIs, automation quality and workflow ROI"
    >
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Active cases", kpis.activeCases],
          ["Resolved today", kpis.todayResolved],
          ["Automation rate", `${kpis.automationRate}%`],
          ["CSAT", kpis.csat],
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
            <h3 className="font-display text-lg font-semibold">Volume · this week</h3>
            <div className="mt-6 flex h-64 items-end gap-3">
              {inboxVolume.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-full w-full flex-col justify-end gap-0.5">
                    <div className="w-full rounded-t bg-primary" style={{ height: `${(d.ai / max) * 100}%` }} />
                    <div className="w-full rounded-b bg-info" style={{ height: `${(d.staff / max) * 100}%` }} />
                  </div>
                  <span className="text-[11px] text-muted-foreground">{d.day}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="font-display text-lg font-semibold">Workflow performance</h3>
            <div className="mt-5 space-y-4">
              {workflows.filter((w) => w.status === "live").map((w) => (
                <div key={w.id}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{w.name}</span>
                    <span className="text-muted-foreground">{w.conversion}% · {w.runs30d} runs</span>
                  </div>
                  <Progress value={w.conversion} className="mt-1.5 h-1.5" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {[
          { t: "Revenue attribution", rows: [["Beauty appointments", "€ 24.480"], ["Handwerk quotes", "€ 41.200"], ["Estate viewings", "€ 12.800"]] },
          { t: "SLA compliance", rows: [["First response", "97%"], ["Full resolution", "89%"], ["Escalations", "3 open"]] },
          { t: "Consent health", rows: [["Granted", "84%"], ["Pending", "9%"], ["Withdrawn", "7%"]] },
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
