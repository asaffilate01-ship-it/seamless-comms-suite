import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, StatusBadge } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { conversations, contacts } from "@/lib/mockData";
import { ArrowLeft, Bot, ShieldAlert, User, MessageCircle, Clock, CheckCircle2, FileText, CreditCard } from "lucide-react";

export const Route = createFileRoute("/app/cases/$caseId")({
  component: CaseDetail,
});

function CaseDetail() {
  const { caseId } = Route.useParams();
  const c = conversations.find((x) => x.id === caseId) ?? conversations[0];
  const ct = contacts.find((k) => k.id === c.contactId)!;

  const timeline = [
    { icon: MessageCircle, when: "Now", who: "Customer", what: c.preview, kind: "message" as const },
    { icon: Bot, when: "10:12", who: "AI · Aida", what: "Intent qualified · scheduled_appointment", kind: "ai" as const },
    { icon: User, when: "10:15", who: "Lea M.", what: "Sent template appt_confirm_de", kind: "action" as const },
    { icon: FileText, when: "10:18", who: "System", what: "Portal link issued · valid 30 min · scope: booking_confirm", kind: "system" as const },
    { icon: CreditCard, when: "—", who: "Finance", what: "Quote not applicable for this workflow", kind: "system" as const },
  ];

  return (
    <AppShell
      title={`Case #24${c.id.slice(-2).padStart(2, "0")} · ${ct.name}`}
      subtitle={`${c.purpose} · WhatsApp`}
      actions={<>
        <Link to="/app/cases"><Button variant="outline" size="sm"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Back</Button></Link>
        <Button variant="outline" size="sm"><ShieldAlert className="mr-1.5 h-3.5 w-3.5" />Escalate</Button>
        <Button size="sm">Reply in inbox</Button>
      </>}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={c.status} />
                  <Badge variant="outline" className="text-[10px] capitalize">Priority: {c.priority}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Owner: <span className="text-foreground">{c.assignee ?? "Unassigned"}</span> · SLA left {c.slaMinutes}m
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Workflow</div>
                <div className="mt-0.5 font-semibold">Terminbuchung · Beauty</div>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="font-display text-lg font-semibold">Timeline</h3>
              <ol className="mt-4 space-y-4">
                {timeline.map((t, i) => {
                  const Icon = t.icon;
                  return (
                    <li key={i} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        {i < timeline.length - 1 && <div className="mt-1 h-full w-px bg-border" />}
                      </div>
                      <div className="flex-1 pb-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />{t.when} · {t.who}
                        </div>
                        <div className="mt-0.5 text-sm">{t.what}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {[
                { icon: CheckCircle2, label: "Approve quote", tone: "primary" },
                { icon: ShieldAlert, label: "Request compliance review", tone: "warning" },
                { icon: User, label: "Reassign", tone: "muted" },
              ].map((a) => {
                const Icon = a.icon;
                return (
                  <button key={a.label} className="rounded-xl border border-border p-4 text-left transition hover:bg-surface-2">
                    <Icon className={
                      a.tone === "primary" ? "h-4 w-4 text-primary"
                      : a.tone === "warning" ? "h-4 w-4 text-warning-foreground"
                      : "h-4 w-4 text-muted-foreground"
                    } />
                    <div className="mt-2 text-sm font-medium">{a.label}</div>
                    <div className="text-xs text-muted-foreground">Dual-control if amount &gt; €500</div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-5">
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Contact</h4>
              <div className="mt-3 text-sm">
                <div className="font-semibold">{ct.name}</div>
                <div className="text-muted-foreground">{ct.phone}</div>
                {ct.email && <div className="text-muted-foreground">{ct.email}</div>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {ct.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Consent</h4>
              <div className="mt-3 space-y-2 text-sm">
                <Row k="Transactional" v="granted" ok />
                <Row k="Marketing" v={c.contactId === "c4" ? "pending" : "granted"} ok={c.contactId !== "c4"} />
                <Row k="Third-party share" v="not requested" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Retention</h4>
              <div className="mt-3 text-sm">
                <div>Class: <span className="font-medium">Business</span></div>
                <div>Erase after: <span className="font-medium">36 months</span></div>
                <div className="mt-2 text-xs text-muted-foreground">DSGVO export available on request.</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ k, v, ok }: { k: string; v: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className={ok ? "text-success capitalize" : "capitalize"}>{v}</span>
    </div>
  );
}
