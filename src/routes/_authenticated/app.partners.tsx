import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { partners } from "@/lib/mockData";
import { Plus, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/app/partners")({
  component: Partners,
});

function Partners() {
  return (
    <AppShell
      title="Partners & third parties"
      subtitle="Invite legal entities, scope data, track SLAs, pay commissions"
      actions={<Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" />Invite partner</Button>}
    >
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Partner</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Tenants</th>
                <th className="px-4 py-3 text-right">Active</th>
                <th className="px-4 py-3 text-right">SLA</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {partners.map((p) => (
                <tr key={p.id} className="hover:bg-surface-2">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.type}</td>
                  <td className="px-4 py-3 text-right">{p.tenants}</td>
                  <td className="px-4 py-3 text-right">{p.activeAssignments}</td>
                  <td className={`px-4 py-3 text-right ${p.sla >= 95 ? "text-success" : p.sla >= 90 ? "" : "text-warning-foreground"}`}>{p.sla}%</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                      <ShieldCheck className="mr-1 h-3 w-3" />Verified
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          { t: "Data scoping", d: "Assign minimum necessary contact, address and access data per third party." },
          { t: "SLA & escalation", d: "Track accept, decline and clarification requests. Automatic re-assign on breach." },
          { t: "Commission ledger", d: "Auto-calculated on collected net platform revenue after refunds and taxes." },
        ].map((s) => (
          <div key={s.t} className="rounded-2xl border border-border bg-card p-6">
            <h4 className="font-semibold">{s.t}</h4>
            <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
