import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const tenantInput = z.object({ tenantId: z.string().uuid() });

export const listCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => tenantInput.parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("cases")
      .select(
        "id, title, status, priority, assignee, conversation_id, created_at, updated_at, conversation:conversations(id, status, contact:contacts(id, display_name, wa_id))",
      )
      .eq("tenant_id", data.tenantId)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getCaseDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caseId: string }) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("cases")
      .select(
        "id, tenant_id, title, status, priority, assignee, conversation_id, created_at, updated_at, conversation:conversations(id, status, last_message_at, contact:contacts(id, display_name, wa_id, locale, consent_marketing))",
      )
      .eq("id", data.caseId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;

    let messages: Array<{
      id: string;
      direction: string;
      msg_type: string;
      body: string | null;
      status: string | null;
      created_at: string;
    }> = [];
    if (row.conversation_id) {
      const { data: msgs } = await supabase
        .from("messages")
        .select("id, direction, msg_type, body, status, created_at")
        .eq("conversation_id", row.conversation_id)
        .order("created_at", { ascending: true })
        .limit(200);
      messages = msgs ?? [];
    }

    const { data: audit } = await supabase
      .from("audit_log")
      .select("id, action, entity, entity_id, created_at")
      .eq("tenant_id", row.tenant_id)
      .order("created_at", { ascending: false })
      .limit(10);

    return { case: row, messages, audit: audit ?? [] };
  });

const updateSchema = z.object({
  caseId: z.string().uuid(),
  tenantId: z.string().uuid(),
  status: z.enum(["new", "open", "waiting_customer", "escalated", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assignToMe: z.boolean().optional(),
});

export const updateCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof updateSchema>) => updateSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const patch: {
      updated_at: string;
      status?: string;
      priority?: string;
      assignee?: string;
    } = { updated_at: new Date().toISOString() };
    if (data.status) patch.status = data.status;
    if (data.priority) patch.priority = data.priority;
    if (data.assignToMe) patch.assignee = userId;

    const { error } = await supabase
      .from("cases")
      .update(patch)
      .eq("id", data.caseId)
      .eq("tenant_id", data.tenantId);
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      tenant_id: data.tenantId,
      actor: userId,
      action: "case.update",
      entity: "case",
      entity_id: data.caseId,
      payload: patch as never,
    });
    return { ok: true };
  });

const createCaseSchema = z.object({
  tenantId: z.string().uuid(),
  title: z.string().min(2).max(160),
  conversationId: z.string().uuid().optional().nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});

export const createCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof createCaseSchema>) => createCaseSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("cases")
      .insert({
        tenant_id: data.tenantId,
        title: data.title,
        conversation_id: data.conversationId ?? null,
        priority: data.priority,
        status: "new",
        assignee: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({
      tenant_id: data.tenantId,
      actor: userId,
      action: "case.create",
      entity: "case",
      entity_id: row.id,
    });
    return row;
  });

export const listContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => tenantInput.parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("contacts")
      .select("id, wa_id, display_name, locale, consent_marketing, created_at, updated_at")
      .eq("tenant_id", data.tenantId)
      .order("updated_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Aggregated numbers for the overview + analytics screens.
export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => tenantInput.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const since = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    since.setHours(0, 0, 0, 0);

    const [contactsRes, casesRes, convRes, msgRes] = await Promise.all([
      supabase.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", data.tenantId),
      supabase
        .from("cases")
        .select("id, status, priority, updated_at")
        .eq("tenant_id", data.tenantId)
        .limit(500),
      supabase
        .from("conversations")
        .select("id, status, last_inbound_at")
        .eq("tenant_id", data.tenantId)
        .limit(500),
      supabase
        .from("messages")
        .select("id, direction, created_at, sent_by")
        .eq("tenant_id", data.tenantId)
        .gte("created_at", since.toISOString())
        .limit(5000),
    ]);

    const cases = casesRes.data ?? [];
    const conversations = convRes.data ?? [];
    const messages = msgRes.data ?? [];

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const days: Array<{ day: string; inbound: number; outbound: number }> = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = new Date(d.getTime() + 24 * 60 * 60 * 1000);
      const slice = messages.filter((m) => {
        const t = new Date(m.created_at).getTime();
        return t >= d.getTime() && t < next.getTime();
      });
      days.push({
        day: d.toISOString().slice(0, 10),
        inbound: slice.filter((m) => m.direction === "inbound").length,
        outbound: slice.filter((m) => m.direction === "outbound").length,
      });
    }

    const outbound = messages.filter((m) => m.direction === "outbound");
    const automated = outbound.filter((m) => !m.sent_by).length;

    return {
      contacts: contactsRes.count ?? 0,
      openConversations: conversations.filter((c) => c.status === "open").length,
      awaitingReply: conversations.filter((c) => c.last_inbound_at).length,
      activeCases: cases.filter((c) => c.status !== "closed").length,
      escalated: cases.filter((c) => c.status === "escalated").length,
      urgent: cases.filter((c) => c.priority === "urgent").length,
      closedToday: cases.filter(
        (c) => c.status === "closed" && new Date(c.updated_at).getTime() >= todayStart.getTime(),
      ).length,
      messages7d: messages.length,
      automationRate: outbound.length ? Math.round((automated / outbound.length) * 100) : 0,
      volume: days,
    };
  });
