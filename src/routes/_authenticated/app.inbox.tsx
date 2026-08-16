import { createFileRoute } from "@tanstack/react-router";
import { AppShell, StatusBadge } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { conversations, contacts } from "@/lib/mockData";
import { useState } from "react";
import { Bot, Send, Paperclip, Lock, User, Filter, ShieldAlert, ArrowUp, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/inbox")({
  component: Inbox,
});

function Inbox() {
  const [selectedId, setSelectedId] = useState(conversations[0].id);
  const selected = conversations.find((c) => c.id === selectedId)!;
  const contact = contacts.find((c) => c.id === selected.contactId)!;

  return (
    <AppShell
      title="Inbox"
      subtitle="12 active · 3 awaiting reply · 2 SLA warnings"
      actions={<>
        <Button size="sm" variant="outline"><Filter className="mr-1.5 h-3.5 w-3.5" />Filter</Button>
        <Button size="sm">New conversation</Button>
      </>}
    >
      <div className="grid h-[calc(100vh-16rem)] gap-4 lg:grid-cols-[340px_1fr_320px]">
        {/* List */}
        <Card className="flex flex-col overflow-hidden">
          <div className="border-b border-border p-3">
            <Input placeholder="Search…" className="h-9" />
            <div className="mt-2 flex flex-wrap gap-1">
              {["All", "Unread", "Mine", "AI-owned", "SLA risk"].map((t, i) => (
                <button key={t} className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium",
                  i === 0 ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-2"
                )}>{t}</button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map((c) => {
              const ct = contacts.find((k) => k.id === c.contactId)!;
              const active = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    "flex w-full gap-3 border-b border-border px-3 py-3 text-left transition-colors",
                    active ? "bg-primary-soft/50" : "hover:bg-surface-2"
                  )}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {ct.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{ct.name}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{c.updatedAt}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {c.aiOwned && <Bot className="h-3 w-3 text-primary" />}
                      <span className="truncate">{c.purpose}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.preview}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <StatusBadge status={c.status} />
                      {c.priority === "urgent" && (
                        <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-[10px] text-destructive">Urgent</Badge>
                      )}
                      {c.unread > 0 && (
                        <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">
                          {c.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Conversation */}
        <Card className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold">{contact.name}</span>
                <StatusBadge status={selected.status} />
                {selected.aiOwned && (
                  <Badge variant="outline" className="border-primary/30 bg-primary/5 text-[10px] text-primary">
                    <Bot className="mr-1 h-3 w-3" /> AI-owned
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">{contact.phone} · {selected.purpose}</div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm"><ShieldAlert className="mr-1.5 h-3.5 w-3.5" />Escalate</Button>
              <Button variant="outline" size="sm"><User className="mr-1.5 h-3.5 w-3.5" />Assign</Button>
              <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-surface-2 p-6">
            {selected.messages.map((m) => (
              <MessageBubble key={m.id} m={m} />
            ))}
          </div>

          <div className="border-t border-border bg-background p-3">
            <div className="rounded-lg border border-border">
              <textarea
                placeholder="Type a reply… (Cmd+↵ to send, / for template)"
                className="w-full resize-none rounded-t-lg bg-transparent px-3 py-2 text-sm outline-none"
                rows={2}
              />
              <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm"><Paperclip className="mr-1 h-3.5 w-3.5" />Portal link</Button>
                  <Button variant="ghost" size="sm"><Bot className="mr-1 h-3.5 w-3.5" />AI suggest</Button>
                  <Button variant="ghost" size="sm">Template</Button>
                </div>
                <Button size="sm"><Send className="mr-1.5 h-3.5 w-3.5" />Send</Button>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              <Lock className="mr-1 inline h-3 w-3" />
              Sensitive documents are collected through short-lived secure portal links, not chat attachments.
            </p>
          </div>
        </Card>

        {/* Right panel */}
        <Card className="overflow-y-auto">
          <CardContent className="space-y-5 p-5">
            <div>
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Case</h4>
              <div className="mt-2 rounded-lg border border-border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Case #24{selected.id.slice(-2).padStart(2, "0")}</span>
                  <StatusBadge status={selected.status} />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>Priority: <span className="text-foreground capitalize">{selected.priority}</span></div>
                  <div>SLA left: <span className="text-foreground">{selected.slaMinutes} min</span></div>
                  <div>Assignee: <span className="text-foreground">{selected.assignee ?? "—"}</span></div>
                  <div>Channel: <span className="text-foreground">WhatsApp</span></div>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Contact</h4>
              <div className="mt-2 rounded-lg border border-border p-3 text-sm">
                <div className="font-semibold">{contact.name}</div>
                <div className="text-xs text-muted-foreground">{contact.phone}</div>
                {contact.email && <div className="text-xs text-muted-foreground">{contact.email}</div>}
                <div className="text-xs text-muted-foreground">{contact.city}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {contact.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
                <div className="mt-3 text-[11px]">
                  Consent: <span className="font-medium capitalize text-foreground">{contact.consent}</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Next-best-action</h4>
              <div className="mt-2 space-y-1.5">
                {["Send booking template", "Request ID via portal", "Assign to manager"].map((s, i) => (
                  <button key={s} className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-surface-2">
                    <span>{s}</span>
                    <ArrowUp className={cn("h-3.5 w-3.5 rotate-45", i === 0 ? "text-primary" : "text-muted-foreground")} />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Audit trail</h4>
              <ul className="mt-2 space-y-2 text-xs">
                <li className="text-muted-foreground">10:22 · Customer message received</li>
                <li className="text-muted-foreground">10:15 · Lea M. sent template <span className="text-foreground">appt_confirm_de</span></li>
                <li className="text-muted-foreground">10:12 · AI (Aida) qualified intent</li>
                <li className="text-muted-foreground">10:12 · Case created from webhook</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function MessageBubble({ m }: { m: import("@/lib/mockData").Message }) {
  const isIn = m.from === "customer";
  const isAI = m.from === "ai";
  const isSystem = m.from === "system";
  if (isSystem) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-center text-xs text-primary">
        {m.text}
      </div>
    );
  }
  return (
    <div className={cn("flex", isIn ? "justify-start" : "justify-end")}>
      <div className={cn(
        "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
        isIn ? "rounded-tl-sm bg-card border border-border" : isAI ? "rounded-tr-sm bg-primary-soft text-foreground" : "rounded-tr-sm bg-primary text-primary-foreground"
      )}>
        {isAI && <div className="mb-0.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-primary"><Bot className="h-3 w-3" /> AI · Aida</div>}
        <div>{m.text}</div>
        {m.attachment && (
          <div className={cn(
            "mt-2 rounded-md border px-2.5 py-1.5 text-xs",
            isIn ? "border-border bg-surface-2" : "border-primary-foreground/20 bg-primary-foreground/10"
          )}>
            <Lock className="mr-1 inline h-3 w-3" />
            {m.attachment.label}
          </div>
        )}
        <div className={cn("mt-1 text-[10px]", isIn ? "text-muted-foreground" : isAI ? "text-muted-foreground" : "text-primary-foreground/70")}>{m.time}</div>
      </div>
    </div>
  );
}
