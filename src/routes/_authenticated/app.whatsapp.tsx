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
  listChannels,
  upsertChannel,
  listConversations,
  listMessages,
  sendMessage,
} from "@/lib/whatsapp.functions";
import { toast } from "sonner";
import { Bot, CheckCircle2, Copy, MessageCircle, Plus, Send, ShieldCheck, Smartphone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp Connect — OmniQora" },
      { name: "description", content: "Manage SaaS and tenant WhatsApp numbers, AI routing and live conversations." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WhatsAppPage,
});

type Channel = Awaited<ReturnType<typeof listChannels>>[number];

type Conversation = {
  id: string;
  status: string;
  channel_id: string | null;
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
  const [channels, setChannels] = useState<Channel[]>([]);
  const [showSetup, setShowSetup] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const bootstrap = useServerFn(getOrCreateMyTenant);
  const fetchChannels = useServerFn(listChannels);
  const fetchConvos = useServerFn(listConversations);
  const fetchMsgs = useServerFn(listMessages);
  const sendFn = useServerFn(sendMessage);

  const webhookUrl = useMemo(
    () => (typeof window !== "undefined" ? `${window.location.origin}/api/public/whatsapp/webhook` : ""),
    [],
  );

  const refreshChannels = async (id: string) => {
    const rows = await fetchChannels({ data: { tenantId: id } });
    setChannels(rows as Channel[]);
    return rows;
  };

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
        const [chs, convs] = await Promise.all([
          fetchChannels({ data: { tenantId: t.tenantId } }),
          fetchConvos({ data: { tenantId: t.tenantId } }),
        ]);
        if (cancel) return;
        setChannels(chs as Channel[]);
        setConversations(convs as Conversation[]);
        setShowSetup(chs.length === 0);
        if (convs.length) setActiveId((convs as Conversation[])[0].id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancel) setReady(true);
      }
    })();
    return () => { cancel = true; };
  }, [bootstrap, fetchChannels, fetchConvos, navigate]);

  useEffect(() => {
    if (!activeId) return;
    fetchMsgs({ data: { conversationId: activeId } }).then((m) => setMessages(m as Message[]));
  }, [activeId, fetchMsgs]);

  useEffect(() => {
    if (!tenantId) return;
    const realtime = supabase
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
          fetchConvos({ data: { tenantId } }).then((c) => setConversations(c as Conversation[]));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(realtime); };
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
      <AppShell title="WhatsApp Connect" subtitle="Connecting to your workspace…">
        <Card className="p-8 text-sm text-muted-foreground">Loading…</Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="WhatsApp Connect"
      subtitle={channels.length ? `${channels.length} number${channels.length === 1 ? "" : "s"} connected across SaaS tenants and scopes` : "Connect your first WhatsApp Business number"}
      actions={
        <div className="flex gap-2">
          {channels.length > 0 && (
            <Button size="sm" onClick={() => setShowSetup((v) => !v)}>
              <Plus className="mr-1 h-4 w-4" /> Add number
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={signOut}>Sign out</Button>
        </div>
      }
    >
      {channels.length > 0 && (
        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {channels.map((ch) => (
            <Card key={ch.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{ch.label ?? ch.display_phone ?? "WhatsApp"}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">{ch.display_phone ?? ch.phone_number_id}</div>
                  </div>
                </div>
                {ch.is_primary && <Badge>Primary</Badge>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge variant="outline">{ch.product_key}</Badge>
                <Badge variant="outline">{ch.scope_kind}{ch.scope_id ? ` · ${ch.scope_id}` : ""}</Badge>
                {ch.ai_enabled && <Badge variant="secondary"><Bot className="mr-1 h-3 w-3" />AI</Badge>}
                {ch.human_handoff_enabled && <Badge variant="secondary">Human handoff</Badge>}
              </div>
              {ch.external_tenant_id && (
                <div className="mt-2 truncate text-xs text-muted-foreground">Source tenant: {ch.external_tenant_id}</div>
              )}
            </Card>
          ))}
        </div>
      )}

      {showSetup && tenantId && (
        <div className="mb-4">
          <ChannelSetup
            tenantId={tenantId}
            webhookUrl={webhookUrl}
            onSaved={async () => {
              await refreshChannels(tenantId);
              setShowSetup(false);
            }}
          />
        </div>
      )}

      {channels.length > 0 && (
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
              {conversations.map((c) => {
                const channel = channels.find((x) => x.id === c.channel_id);
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveId(c.id)}
                    className={`flex w-full flex-col items-start gap-0.5 border-b border-border px-4 py-3 text-left text-sm hover:bg-surface-2 ${activeId === c.id ? "bg-surface-2" : ""}`}
                  >
                    <div className="font-medium">{c.contact?.display_name ?? c.contact?.wa_id ?? "Unknown"}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.contact?.wa_id} · {channel?.label ?? channel?.display_phone ?? "WhatsApp"} · {new Date(c.last_message_at).toLocaleString()}
                    </div>
                  </button>
                );
              })}
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
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.direction === "outbound" ? "ml-auto bg-primary text-primary-foreground" : "bg-card"}`}
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
                      void send();
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
  onSaved: () => void | Promise<void>;
}) {
  const save = useServerFn(upsertChannel);
  const [label, setLabel] = useState("Main WhatsApp");
  const [productKey, setProductKey] = useState("omniqora");
  const [externalTenantId, setExternalTenantId] = useState("");
  const [scopeKind, setScopeKind] = useState<"platform" | "tenant" | "location" | "department">("tenant");
  const [scopeId, setScopeId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [displayPhone, setDisplayPhone] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [humanHandoffEnabled, setHumanHandoffEnabled] = useState(true);
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
          label,
          productKey,
          externalTenantId: externalTenantId || null,
          scopeKind,
          scopeId: scopeId || null,
          phoneNumberId,
          wabaId: wabaId || null,
          displayPhone: displayPhone || null,
          accessToken,
          appSecret,
          verifyToken,
          isPrimary,
          aiEnabled,
          humanHandoffEnabled,
          inboundEnabled: true,
          outboundEnabled: true,
        },
      });
      toast.success("WhatsApp number saved");
      await onSaved();
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
        <div>
          <h2 className="font-display text-lg font-semibold">Add WhatsApp Business number</h2>
          <p className="text-sm text-muted-foreground">Map each number to a SaaS, source tenant and optional branch/department.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold">1. Meta webhook</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Subscribe the WhatsApp <em>messages</em> webhook using these values.
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <Label className="text-xs">Callback URL</Label>
              <div className="mt-1 flex gap-2">
                <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={() => copy(webhookUrl)} type="button"><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Verify token</Label>
              <div className="mt-1 flex gap-2">
                <Input value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={() => copy(verifyToken)} type="button"><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <h3 className="text-sm font-semibold">2. Number and SaaS mapping</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Label</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} required /></div>
            <div><Label>SaaS product key</Label><Input value={productKey} onChange={(e) => setProductKey(e.target.value.toLowerCase())} placeholder="courier-broker" required /></div>
            <div><Label>Source tenant ID</Label><Input value={externalTenantId} onChange={(e) => setExternalTenantId(e.target.value)} placeholder="tenant-a" /></div>
            <div>
              <Label>Scope</Label>
              <select value={scopeKind} onChange={(e) => setScopeKind(e.target.value as typeof scopeKind)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="platform">Platform</option>
                <option value="tenant">Tenant</option>
                <option value="location">Location / branch</option>
                <option value="department">Department</option>
              </select>
            </div>
            <div className="sm:col-span-2"><Label>Scope ID (optional)</Label><Input value={scopeId} onChange={(e) => setScopeId(e.target.value)} placeholder="luton / sales / branch-123" /></div>
          </div>

          <div><Label>Phone Number ID</Label><Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} required /></div>
          <div><Label>WhatsApp Business Account ID</Label><Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} /></div>
          <div><Label>Display phone number</Label><Input value={displayPhone} onChange={(e) => setDisplayPhone(e.target.value)} placeholder="+44 …" /></div>
          <div><Label>Permanent access token</Label><Input value={accessToken} onChange={(e) => setAccessToken(e.target.value)} type="password" required /></div>
          <div><Label>App secret</Label><Input value={appSecret} onChange={(e) => setAppSecret(e.target.value)} type="password" required minLength={20} /></div>

          <div className="grid gap-2 rounded-lg border border-border p-3 text-sm sm:grid-cols-3">
            <label className="flex items-center gap-2"><input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />Primary for SaaS</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} />AI enabled</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={humanHandoffEnabled} onChange={(e) => setHumanHandoffEnabled(e.target.checked)} />Human handoff</label>
          </div>

          <p className="text-xs text-muted-foreground">Credentials are kept server-side and are not included in browser configuration or SaaS add-on clients.</p>
          <Button type="submit" className="w-full" disabled={busy}>
            <CheckCircle2 className="mr-1 h-4 w-4" /> {busy ? "Saving…" : "Save & activate number"}
          </Button>
        </form>
      </div>
    </Card>
  );
}
