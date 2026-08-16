import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, StatusBadge } from "@/components/app/shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { conversations, contacts } from "@/lib/mockData";
import { Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/cases/")({
  component: Cases,
});

function Cases() {
  return (
    <AppShell
      title="Cases"
      subtitle="Every WhatsApp conversation as a controlled process"
      actions={<>
        <Button variant="outline" size="sm">Export CSV</Button>
        <Button size="sm">New case</Button>
      </>}
    >
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search cases…" className="pl-9" />
          </div>
          {["All", "Open", "Waiting customer", "Waiting partner", "Escalated", "Closed"].map((t, i) => (
            <button key={t} className={
              i === 1 ? "rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                     : "rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface-2"
            }>{t}</button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Case</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Purpose</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Assignee</th>
                <th className="px-4 py-3">SLA</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {conversations.map((c) => {
                const ct = contacts.find((k) => k.id === c.contactId)!;
                return (
                  <tr key={c.id} className="hover:bg-surface-2">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link to="/app/cases/$caseId" params={{ caseId: c.id }} className="text-primary hover:underline">
                        #24{c.id.slice(-2).padStart(2, "0")}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{ct.name}</div>
                      <div className="text-xs text-muted-foreground">{ct.city}</div>
                    </td>
                    <td className="px-4 py-3">{c.purpose}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={
                        c.priority === "urgent" ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : c.priority === "high" ? "border-warning/40 bg-warning/10 text-warning-foreground"
                        : "text-muted-foreground"
                      }>{c.priority}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.assignee ?? "Unassigned"}</td>
                    <td className="px-4 py-3">
                      {c.slaMinutes > 0 ? (
                        <span className={c.slaMinutes < 10 ? "text-warning-foreground" : "text-muted-foreground"}>
                          {c.slaMinutes} min
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.updatedAt}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}
