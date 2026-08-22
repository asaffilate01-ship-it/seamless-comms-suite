import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app/shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { getOrCreateMyTenant } from "@/lib/tenant.functions";
import {
  getMyChannel,
  upsertChannel,
  listConversations,
  listMessages,
  sendMessage,
} from "@/lib/whatsapp.functions";
import { toast } from "sonner";
import { CheckCircle2, Copy, Send, ShieldCheck, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp Live — OmniQora" },
      { name: "description", content: "Connect your WhatsApp Business number and handle live conversations." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WhatsAppPage,
});

type Conversation = {
  id: string;
  status: string;
  last_message_at: string;
  contact: { id: string; display_name: string | null; wa_id: string } | null;
};

type Message = {
  id: string;
  direction: "inbound" | "outbound";
  msg_type: string;
  body: string | null;
  status: string | null;
  created_at: string;
};

function WhatsAppPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [channel, setChannel] = useState<Awaited<ReturnType<typeof getMyChannel>> | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const bootstrap = useServerFn(getOrCreateMyTenant);
  const fetchChannel = useServerFn(getMyChannel);
  const fetchConvos = useServerFn(listConversations);
  const fetchMsgs = useServerFn(listMessages);
  const sendFn = useServerFn(sendMessage);

  const webhookUrl = useMemo(
    () => (typeof window !== "undefined" ? `${window.location.origin}/api/public/whatsapp/webhook` : ""),
    [],
  );

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        navigate({ to: "/auth" });
        return;
      }
      try {
        const t = await bootstrap();
        if (cancel) return;
        setTenantId(t.tenantId);
        const ch = await fetchChannel({ data: { tenantId: t.tenantId } });
        if (cancel) return;
        setChannel(ch);
        const convs = (await fetchConvos({ data: { tenantId: t.tenantId } })) as Conversation[];
        if (cancel) return;
        setConversations(convs);
        if (convs.length) setActiveId(convs[0].id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancel) setReady(true);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [bootstrap, fetchChannel, fetchConvos, navigate]);

  useEffect(() => {
    if (!activeId) return;
    fetchMsgs({ data: { conversationId: activeId } }).then((m) => setMessages(m as Message[]));
  }, [activeId, fetchMsgs]);

  // Realtime: new messages + conversation bumps
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`tenant-${tenantId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const m = payload.new as Message & { conversation_id: string };
          if (m.conversation_id === activeId) setMessages((prev) => [...prev, m]);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `tenant_id=eq.${tenantId}` },
        () => {
          if (tenantId) fetchConvos({ data: { tenantId } }).then((c) => setConversations(c as Conversation[]));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, activeId, fetchConvos]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = async () => {
    if (!draft.trim() || !activeId || !tenantId) return;
    setSending(true);
    try {
      await sendFn({ data: { tenantId, conversationId: activeId, text: draft.trim() } });
      setDraft("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  if (!ready) {
    return (
      <AppShell title="WhatsApp Live" subtitle="Connecting to your workspace…">
        <Card className="p-8 text-sm text-muted-foreground">Loading…</Card>
      </AppShell>
    );
  }

  const connected = channel?.status === "configured";

  return (
    <AppShell
      title="WhatsApp Live"
      subtitle={connected ? `Connected: ${channel?.display_phone ?? channel?.phone_number_id}` : "Connect your WhatsApp Business number to go live"}
      actions={
        <Button variant="outline" size="sm" onClick={signOut}>
          Sign out
        </Button>
      }
    >
      {!connected && <ChannelSetup tenantId={tenantId!} webhookUrl={webhookUrl} onSaved={setChannel} />}

      {connected && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card className="flex max-h-[70vh] flex-col overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">
              Conversations
              <Badge variant="outline" className="ml-2">{conversations.length}</Badge>
            </div>
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <MessageCircle className="mx-auto mb-2 h-6 w-6 opacity-40" />
                  Waiting for the first inbound message.
                </div>
              )}
              {conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`flex w-full flex-col items-start gap-0.5 border-b border-border px-4 py-3 text-left text-sm hover:bg-surface-2 ${
                    activeId === c.id ? "bg-surface-2" : ""
                  }`}
                >
                  <div className="font-medium">{c.contact?.display_name ?? c.contact?.wa_id ?? "Unknown"}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.contact?.wa_id} · {new Date(c.last_message_at).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <Card className="flex max-h-[70vh] flex-col overflow-hidden">
            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-surface-2 p-4">
              {messages.length === 0 && (
                <div className="pt-16 text-center text-sm text-muted-foreground">
                  Select a conversation to view its messages.
                </div>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                    m.direction === "outbound"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-card"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{m.body}</div>
                  <div className="mt-1 text-[10px] opacity-70">
                    {new Date(m.created_at).toLocaleTimeString()} · {m.status}
                  </div>
                </div>
              ))}
            </div>
            {activeId && (
              <div className="flex items-end gap-2 border-t border-border p-3">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Type a reply…"
                  className="min-h-[44px] flex-1 resize-none"
                />
                <Button onClick={send} disabled={sending || !draft.trim()}>
                  <Send className="mr-1 h-4 w-4" /> Send
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function ChannelSetup({
  tenantId,
  webhookUrl,
  onSaved,
}: {
  tenantId: string;
  webhookUrl: string;
  onSaved: (ch: Awaited<ReturnType<typeof getMyChannel>>) => void;
}) {
  const save = useServerFn(upsertChannel);
  const refresh = useServerFn(getMyChannel);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [displayPhone, setDisplayPhone] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [verifyToken, setVerifyToken] = useState(() =>
    Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10),
  );
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await save({
        data: {
          tenantId,
          phoneNumberId,
          wabaId: wabaId || null,
          displayPhone: displayPhone || null,
          accessToken,
          appSecret,
          verifyToken,
        },
      });
      toast.success("Channel saved");
      const ch = await refresh({ data: { tenantId } });
      onSaved(ch);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const copy = (v: string) => {
    navigator.clipboard.writeText(v);
    toast.success("Copied");
  };

  return (
    <Card className="p-6">
      <div className="mb-6 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg font-semibold">Connect WhatsApp Business</h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold">1. Configure the Meta webhook</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            In Meta Business → your WhatsApp App → Webhooks, subscribe the <em>messages</em> field with these values.
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <Label className="text-xs">Callback URL</Label>
              <div className="mt-1 flex gap-2">
                <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={() => copy(webhookUrl)} type="button">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Verify token</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  value={verifyToken}
                  onChange={(e) => setVerifyToken(e.target.value)}
                  className="font-mono text-xs"
                />
                <Button size="icon" variant="outline" onClick={() => copy(verifyToken)} type="button">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Meta will echo this back on the verification GET request. Regenerate before saving if you prefer.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <h3 className="text-sm font-semibold">2. Enter your Meta credentials</h3>
          <div>
            <Label>Phone Number ID</Label>
            <Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} required />
          </div>
          <div>
            <Label>WhatsApp Business Account ID (optional)</Label>
            <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} />
          </div>
          <div>
            <Label>Display phone number (optional)</Label>
            <Input value={displayPhone} onChange={(e) => setDisplayPhone(e.target.value)} placeholder="+49 …" />
          </div>
          <div>
            <Label>Permanent access token</Label>
            <Input
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              type="password"
              required
              placeholder="EAAG…"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Stored encrypted at rest. Only owners and admins of your workspace can read it.
            </p>
          </div>
          <div>
            <Label>App secret</Label>
            <Input
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              type="password"
              required
              minLength={20}
              placeholder="Meta App → Settings → Basic → App Secret"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Required: every inbound webhook is verified with an HMAC-SHA256 signature.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            <CheckCircle2 className="mr-1 h-4 w-4" /> {busy ? "Saving…" : "Save & activate channel"}
          </Button>
        </form>
      </div>
    </Card>
  );
}
