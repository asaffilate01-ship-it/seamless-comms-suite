import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, StatusBadge } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useTenant, canWrite } from "@/hooks/useTenant";
import { listConversations, listMessages, sendMessage } from "@/lib/whatsapp.functions";
import { createCase } from "@/lib/app.functions";
import { toast } from "sonner";
import { Send, Lock, MessageCircle, Loader2, FolderPlus } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox — OmniQora" },
      { name: "description", content: "Alle WhatsApp-Gespräche in einem geteilten Team-Postfach." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Inbox,
});

type Conversation = {
  id: string;
  status: string;
  last_message_at: string;
  contact: { id: string; display_name: string | null; wa_id: string } | null;
};

type Message = {
  id: string;
  direction: string;
  msg_type: string;
  body: string | null;
  status: string | null;
  created_at: string;
};

const initials = (name: string) =>
  name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function Inbox() {
  const { tenantId, role, loading: tenantLoading } = useTenant();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchConvos = useServerFn(listConversations);
  const fetchMsgs = useServerFn(listMessages);
  const sendFn = useServerFn(sendMessage);
  const createCaseFn = useServerFn(createCase);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    fetchConvos({ data: { tenantId } })
      .then((rows) => {
        if (cancelled) return;
        const list = rows as Conversation[];
        setConversations(list);
        setActiveId((cur) => cur ?? list[0]?.id ?? null);
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Laden fehlgeschlagen"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tenantId, fetchConvos]);

  useEffect(() => {
    if (!activeId) return;
    fetchMsgs({ data: { conversationId: activeId } }).then((m) => setMessages(m as Message[]));
  }, [activeId, fetchMsgs]);

  // Realtime inbound/outbound updates
  useEffect(() => {
    if (!tenantId) return;
    const ch = supabase
      .channel(`inbox-${tenantId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const m = payload.new as Message & { conversation_id: string };
          if (m.conversation_id === activeId) setMessages((prev) => [...prev, m]);
          setConversations((prev) =>
            [...prev]
              .map((c) => (c.id === m.conversation_id ? { ...c, last_message_at: m.created_at } : c))
              .sort((a, b) => +new Date(b.last_message_at) - +new Date(a.last_message_at)),
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [tenantId, activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) =>
      `${c.contact?.display_name ?? ""} ${c.contact?.wa_id ?? ""}`.toLowerCase().includes(q),
    );
  }, [conversations, query]);

  const selected = conversations.find((c) => c.id === activeId) ?? null;
  const writable = canWrite(role);

  async function handleSend() {
    if (!tenantId || !activeId || !draft.trim()) return;
    setSending(true);
    try {
      await sendFn({ data: { tenantId, conversationId: activeId, text: draft.trim() } });
      setDraft("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Senden fehlgeschlagen");
    } finally {
      setSending(false);
    }
  }

  async function handleCreateCase() {
    if (!tenantId || !selected) return;
    try {
      await createCaseFn({
        data: {
          tenantId,
          conversationId: selected.id,
          title: `WhatsApp · ${selected.contact?.display_name ?? selected.contact?.wa_id ?? "Kontakt"}`,
          priority: "normal",
        },
      });
      toast.success("Fall erstellt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fall konnte nicht erstellt werden");
    }
  }

  const busy = tenantLoading || loading;

  return (
    <AppShell
      title="Inbox"
      subtitle={`${conversations.filter((c) => c.status === "open").length} offen · ${conversations.length} Gespräche insgesamt`}
      actions={
        selected && writable ? (
          <Button size="sm" variant="outline" onClick={handleCreateCase}>
            <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
            Fall anlegen
          </Button>
        ) : null
      }
    >
      {busy ? (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr_320px]">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[60vh] w-full rounded-xl" />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-14 text-center">
            <MessageCircle className="h-8 w-8 text-muted-foreground" />
            <h3 className="font-display text-lg font-semibold">Noch keine Gespräche</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              Verbinde deine WhatsApp-Business-Nummer unter WhatsApp → Kanal. Eingehende Nachrichten
              erscheinen hier automatisch in Echtzeit.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid h-[calc(100vh-16rem)] gap-4 lg:grid-cols-[340px_1fr_320px]">
          <Card className="flex flex-col overflow-hidden">
            <div className="border-b border-border p-3">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Suchen…"
                className="h-9"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtered.map((c) => {
                const name = c.contact?.display_name ?? c.contact?.wa_id ?? "Unbekannt";
                const active = c.id === activeId;
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveId(c.id)}
                    className={cn(
                      "flex w-full gap-3 border-b border-border px-3 py-3 text-left transition-colors",
                      active ? "bg-primary-soft/50" : "hover:bg-surface-2",
                    )}
                  >
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-xs text-primary">
                        {initials(name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{name}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {time(c.last_message_at)}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                        +{c.contact?.wa_id}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <div className="text-sm font-semibold">
                  {selected?.contact?.display_name ?? selected?.contact?.wa_id ?? "—"}
                </div>
                <div className="font-mono text-xs text-muted-foreground">+{selected?.contact?.wa_id}</div>
              </div>
              {selected && <StatusBadge status={selected.status} />}
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-surface-2/40 p-4">
              {messages.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">Keine Nachrichten.</p>
              )}
              {messages.map((m) => (
                <div key={m.id} className={cn("flex", m.direction === "inbound" ? "justify-start" : "justify-end")}>
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                      m.direction === "inbound"
                        ? "rounded-tl-sm border border-border bg-card"
                        : "rounded-tr-sm bg-primary text-primary-foreground",
                    )}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.body ?? `[${m.msg_type}]`}</div>
                    <div
                      className={cn(
                        "mt-1 text-[10px]",
                        m.direction === "inbound" ? "text-muted-foreground" : "text-primary-foreground/70",
                      )}
                    >
                      {time(m.created_at)}
                      {m.status ? ` · ${m.status}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border p-3">
              <div className="rounded-lg border border-border">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void handleSend();
                  }}
                  disabled={!writable}
                  placeholder={writable ? "Antwort schreiben… (Cmd+↵ senden)" : "Nur Leserechte"}
                  className="w-full resize-none rounded-t-lg bg-transparent px-3 py-2 text-sm outline-none disabled:opacity-60"
                  rows={2}
                />
                <div className="flex items-center justify-end border-t border-border px-2 py-1.5">
                  <Button size="sm" onClick={handleSend} disabled={!writable || sending || !draft.trim()}>
                    {sending ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Senden
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                <Lock className="mr-1 inline h-3 w-3" />
                Sensible Dokumente werden über kurzlebige Portal-Links erfasst, nicht als Chat-Anhang.
              </p>
            </div>
          </Card>

          <Card className="overflow-y-auto">
            <CardContent className="space-y-5 p-5">
              <div>
                <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Kontakt</h4>
                <div className="mt-2 rounded-lg border border-border p-3 text-sm">
                  <div className="font-semibold">
                    {selected?.contact?.display_name ?? "Unbekannt"}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">+{selected?.contact?.wa_id}</div>
                  <div className="mt-2">
                    <Badge variant="secondary" className="text-[10px]">WhatsApp</Badge>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Gespräch</h4>
                <div className="mt-2 space-y-1.5 rounded-lg border border-border p-3 text-xs text-muted-foreground">
                  <div>
                    Status: <span className="capitalize text-foreground">{selected?.status}</span>
                  </div>
                  <div>
                    Letzte Nachricht:{" "}
                    <span className="text-foreground">
                      {selected ? new Date(selected.last_message_at).toLocaleString("de-DE") : "—"}
                    </span>
                  </div>
                  <div>
                    Nachrichten: <span className="text-foreground">{messages.length}</span>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Rolle</h4>
                <p className="mt-2 text-xs text-muted-foreground">
                  Angemeldet als <span className="font-medium capitalize text-foreground">{role ?? "—"}</span>.{" "}
                  {writable ? "Antworten erlaubt." : "Nur Lesezugriff."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
