import { createFileRoute } from "@tanstack/react-router";
import { AppShell, StatusBadge } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { workflows } from "@/lib/mockData";
import { Plus, Bot, User, Users, Building, UserCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/workflows")({
  component: Workflows,
});

const iconFor: Record<string, React.ElementType> = {
  AI: Bot, Staff: User, Manager: Users, "Third-party": Building, Customer: UserCheck,
};

function Workflows() {
  return (
    <AppShell
      title="Workflows"
      subtitle="Reusable steps with AI, staff, customer, manager and partner owners"
      actions={<Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" />New workflow</Button>}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {workflows.map((w) => (
          <Card key={w.id} className="overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-lg font-semibold">{w.name}</h3>
                    <StatusBadge status={w.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">Vertical: <span className="text-foreground">{w.vertical}</span></p>
                </div>
                <div className="text-right">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <Stat v={w.runs30d.toString()} l="runs / 30d" />
                    <Stat v={`${w.conversion}%`} l="conv." />
                    <Stat v={`${w.avgHandleMinutes}m`} l="handle" />
                  </div>
                </div>
              </div>

              <div className="mt-5 overflow-x-auto">
                <ol className="flex min-w-max items-stretch gap-3">
                  {w.steps.map((s, i) => {
                    const Icon = iconFor[s.owner] ?? Bot;
                    return (
                      <li key={s.id} className="relative flex items-center gap-3">
                        <div className="w-40 rounded-lg border border-border bg-surface p-3">
                          <div className="flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 text-primary" />
                            <Badge variant="secondary" className="text-[10px]">{s.owner}</Badge>
                          </div>
                          <div className="mt-1.5 text-sm font-medium">{s.name}</div>
                        </div>
                        {i < w.steps.length - 1 && <span className="text-muted-foreground">→</span>}
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                <div className="flex gap-1.5">
                  {["Approvals", "SLA", "Consent", "Templates"].map((t) => (
                    <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">Simulate</Button>
                  <Button variant="outline" size="sm">Edit</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  return (
    <div>
      <div className="font-display text-sm font-semibold">{v}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{l}</div>
    </div>
  );
}
