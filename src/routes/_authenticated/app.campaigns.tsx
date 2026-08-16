import { createFileRoute } from "@tanstack/react-router";
import { AppShell, StatusBadge } from "@/components/app/shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { campaigns } from "@/lib/mockData";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/campaigns")({
  component: Campaigns,
});

function Campaigns() {
  return (
    <AppShell
      title="Campaigns"
      subtitle="Meta-approved templates only · frequency caps enforced · consent scoped"
      actions={<Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" />New campaign</Button>}
    >
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Template</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Sent</th>
                <th className="px-4 py-3 text-right">Delivered</th>
                <th className="px-4 py-3 text-right">Read</th>
                <th className="px-4 py-3 text-right">Replies</th>
                <th className="px-4 py-3 text-right">Meta cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.template}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-right">{c.sent.toLocaleString("de-DE")}</td>
                  <td className="px-4 py-3 text-right">{c.delivered.toLocaleString("de-DE")}</td>
                  <td className="px-4 py-3 text-right">{c.read.toLocaleString("de-DE")}</td>
                  <td className="px-4 py-3 text-right">{c.replies.toLocaleString("de-DE")}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{c.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface-2 p-6">
        <h3 className="font-display text-lg font-semibold">Compose with guardrails</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Audience preview shows inclusions, exclusions, duplicates, estimated Meta charge and time-zone distribution before scheduling.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {[
            ["Purpose scope", "transactional"],
            ["Frequency cap", "max 2 / 7d"],
            ["Consent gate", "purpose-scoped"],
            ["Send window", "09:00–18:00 CET"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border bg-card p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
              <div className="mt-1 text-sm font-medium">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
