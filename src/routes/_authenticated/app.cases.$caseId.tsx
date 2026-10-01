import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, StatusBadge } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenant, canWrite } from "@/hooks/useTenant";
import { getCaseDetail, updateCase } from "@/lib/app.functions";
import { toast } from "sonner";
import { useTx, useI18nSafe } from "@/lib/i18n";
import { ArrowLeft, ShieldAlert, User, MessageCircle, Clock, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/cases/$caseId")({
  head: () => ({
    meta: [
      { title: "Case details — OmniQora" },
      { name: "description", content: "Full case history, approvals and audit trail." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CaseDetail,
});

type Detail = Awaited<ReturnType<typeof getCaseDetail>>;

function CaseDetail() {
  const { caseId } = Route.useParams();
  const { tenantId, role } = useTenant();
  const [detail, setDetail] = useState<Detail>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchDetail = useServerFn(getCaseDetail);
  const updateFn = useServerFn(updateCase);
  const tx = useTx();
  const loc = (useI18nSafe()?.lang ?? "en") === "de" ? "de-DE" : "en-GB";

  const load = useCallback(async () => {
    try {
      setDetail((await fetchDetail({ data: { caseId } })) as Detail);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx("Laden fehlgeschlagen", "Failed to load"));
    } finally {
      setLoading(false);
    }
  }, [caseId, fetchDetail]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(input: { status?: "escalated" | "closed" | "open"; assignToMe?: boolean }) {
    if (!tenantId) return;
    setSaving(true);
    try {
      await updateFn({ data: { caseId, tenantId, ...input } });
      await load();
      toast.success(tx("Fall aktualisiert", "Case updated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx("Update fehlgeschlagen", "Update failed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell title={tx("Fall", "Case")} subtitle={tx("Wird geladen…", "Loading…")}>
        <Skeleton className="h-96 w-full rounded-xl" />
      </AppShell>
    );
  }

  if (!detail) {
    return (
      <AppShell title={tx("Fall nicht gefunden", "Case not found")} subtitle={tx("Dieser Fall existiert nicht oder ist nicht sichtbar", "This case does not exist or is not visible")}>
        <Link to="/app/cases">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            {tx("Zurück zu Fällen", "Back to cases")}
          </Button>
        </Link>
      </AppShell>
    );
  }

  const c = detail.case;
  const contact = (c.conversation as { contact?: { display_name?: string | null; wa_id?: string; locale?: string | null; consent_marketing?: boolean | null } } | null)?.contact;
  const writable = canWrite(role);

  return (
    <AppShell
      title={c.title}
      subtitle={`Fall ${c.id.slice(0, 8)} · WhatsApp`}
      actions={
        <>
          <Link to="/app/cases">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              {tx("Zurück", "Back")}
            </Button>
          </Link>
          {writable && (
            <>
              <Button variant="outline" size="sm" disabled={saving} onClick={() => patch({ status: "escalated" })}>
                <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
                {tx("Eskalieren", "Escalate")}
              </Button>
              <Button size="sm" disabled={saving} onClick={() => patch({ status: "closed" })}>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                {tx("Schließen", "Close")}
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={c.status} />
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {tx("Priorität", "Priority")}: {c.priority}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {tx("Erstellt", "Created")} {new Date(c.created_at).toLocaleString(loc)} · {tx("zuletzt aktualisiert", "last updated")}{" "}
                  {new Date(c.updated_at).toLocaleString(loc)}
                </p>
              </div>
              {writable && !c.assignee && (
                <Button variant="outline" size="sm" disabled={saving} onClick={() => patch({ assignToMe: true })}>
                  <User className="mr-1.5 h-3.5 w-3.5" />
                  {tx("Mir zuweisen", "Assign to me")}
                </Button>
              )}
            </div>

            <div className="mt-6">
              <h3 className="font-display text-lg font-semibold">{tx("Gesprächsverlauf", "Conversation history")}</h3>
              {detail.messages.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  {tx("Noch keine Nachrichten mit diesem Fall verknüpft.", "No messages linked to this case yet.")}
                </p>
              ) : (
                <ol className="mt-4 space-y-4">
                  {detail.messages.map((m) => (
                    <li key={m.id} className="flex gap-4">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                        <MessageCircle className="h-3.5 w-3.5" />
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(m.created_at).toLocaleString(loc)} ·{" "}
                          {m.direction === "inbound" ? tx("Kunde", "Customer") : "Team"}
                        </div>
                        <div className="mt-0.5 whitespace-pre-wrap text-sm">{m.body ?? `[${m.msg_type}]`}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-5">
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground">{tx("Kontakt", "Contact")}</h4>
              <div className="mt-3 text-sm">
                <div className="font-semibold">{contact?.display_name ?? tx("Unbekannt", "Unknown")}</div>
                {contact?.wa_id && <div className="font-mono text-xs text-muted-foreground">+{contact.wa_id}</div>}
                <div className="mt-2 text-xs text-muted-foreground">
                  {tx("Sprache", "Language")}: <span className="text-foreground">{contact?.locale ?? "—"}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {tx("Marketing-Einwilligung", "Marketing consent")}:{" "}
                  <span className="text-foreground">{contact?.consent_marketing ? tx("erteilt", "granted") : tx("keine", "none")}</span>
                </div>
              </div>
              {c.conversation_id && (
                <Link to="/app/inbox">
                  <Button variant="outline" size="sm" className="mt-4 w-full">
                    {tx("Im Postfach antworten", "Reply in inbox")}
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Audit-Trail</h4>
              {detail.audit.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">{tx("Keine Einträge.", "No entries.")}</p>
              ) : (
                <ul className="mt-3 space-y-2 text-xs">
                  {detail.audit.map((a) => (
                    <li key={a.id} className="text-muted-foreground">
                      {new Date(a.created_at).toLocaleString(loc)} ·{" "}
                      <span className="text-foreground">{a.action}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
