import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const graphBase = () => `https://graph.facebook.com/${process.env["WHATSAPP_GRAPH_VERSION"] ?? "v21.0"}`;

const channelSelect =
  "id, label, product_key, external_tenant_id, scope_kind, scope_id, is_primary, ai_enabled, human_handoff_enabled, inbound_enabled, outbound_enabled, display_phone, phone_number_id, waba_id, verify_token, status, updated_at";

export const listChannels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => z.object({ tenantId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("whatsapp_channels")
      .select(channelSelect)
      .eq("tenant_id", data.tenantId)
      .order("product_key")
      .order("is_primary", { ascending: false })
      .order("created_at");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Backwards-compatible primary channel accessor. */
export const getMyChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => z.object({ tenantId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("whatsapp_channels")
      .select(channelSelect)
      .eq("tenant_id", data.tenantId)
      .order("is_primary", { ascending: false })
      .order("created_at")
      .limit(1);
    if (error) throw new Error(error.message);
    return rows?.[0] ?? null;
  });

const upsertSchema = z.object({
  tenantId: z.string().uuid(),
  label: z.string().trim().min(1).max(80).default("WhatsApp"),
  productKey: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*$/),
  externalTenantId: z.string().trim().min(1).max(100).optional().nullable(),
  scopeKind: z.enum(["platform", "tenant", "location", "department"]).default("tenant"),
  scopeId: z.string().trim().min(1).max(100).optional().nullable(),
  phoneNumberId: z.string().min(3),
  wabaId: z.string().optional().nullable(),
  displayPhone: z.string().optional().nullable(),
  accessToken: z.string().min(20),
  verifyToken: z.string().min(6),
  appSecret: z.string().min(20, "App-Secret is required so inbound webhooks can be verified"),
  isPrimary: z.boolean().default(false),
  aiEnabled: z.boolean().default(false),
  humanHandoffEnabled: z.boolean().default(true),
  inboundEnabled: z.boolean().default(true),
  outboundEnabled: z.boolean().default(true),
});

export const upsertChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof upsertSchema>) => upsertSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    if (data.isPrimary) {
      const { error: clearErr } = await supabase
        .from("whatsapp_channels")
        .update({ is_primary: false })
        .eq("tenant_id", data.tenantId)
        .eq("product_key", data.productKey);
      if (clearErr) throw new Error(clearErr.message);
    }

    const { error } = await supabase.from("whatsapp_channels").upsert(
      {
        tenant_id: data.tenantId,
        label: data.label,
        product_key: data.productKey,
        external_tenant_id: data.externalTenantId ?? null,
        scope_kind: data.scopeKind,
        scope_id: data.scopeId ?? null,
        phone_number_id: data.phoneNumberId,
        waba_id: data.wabaId ?? null,
        display_phone: data.displayPhone ?? null,
        access_token: data.accessToken,
        verify_token: data.verifyToken,
        app_secret: data.appSecret,
        is_primary: data.isPrimary,
        ai_enabled: data.aiEnabled,
        human_handoff_enabled: data.humanHandoffEnabled,
        inbound_enabled: data.inboundEnabled,
        outbound_enabled: data.outboundEnabled,
        status: "configured",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "phone_number_id" },
    );
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      tenant_id: data.tenantId,
      actor: userId,
      action: "channel.upsert",
      entity: "whatsapp_channel",
      entity_id: data.phoneNumberId,
      payload: {
        label: data.label,
        product_key: data.productKey,
        external_tenant_id: data.externalTenantId ?? null,
        scope_kind: data.scopeKind,
        scope_id: data.scopeId ?? null,
        is_primary: data.isPrimary,
        ai_enabled: data.aiEnabled,
      },
    });
    return { ok: true };
  });

export const listConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => z.object({ tenantId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("conversations")
      .select("id, status, channel_id, last_message_at, contact:contacts(id, display_name, wa_id)")
      .eq("tenant_id", data.tenantId)
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string }) =>
    z.object({ conversationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("messages")
      .select("id, direction, msg_type, body, media_url, status, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const sendSchema = z.object({
  tenantId: z.string().uuid(),
  conversationId: z.string().uuid(),
  text: z.string().min(1).max(4096),
});

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof sendSchema>) => sendSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Authorise with the caller's RLS-scoped session first. Channel credentials
    // are then loaded only with the server service role and never returned.
    const { data: membership, error: membershipError } = await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", data.tenantId)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError || !membership || !["owner", "admin", "agent"].includes(membership.role)) {
      throw new Error("You do not have permission to send messages");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conv, error: convErr } = await supabaseAdmin
      .from("conversations")
      .select("id, contact:contacts(wa_id), channel_id")
      .eq("id", data.conversationId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (convErr || !conv) throw new Error("Conversation not found");

    let channel:
      | { id: string; phone_number_id: string; access_token: string; outbound_enabled: boolean }
      | null = null;

    if (conv.channel_id) {
      const { data: exact, error } = await supabaseAdmin
        .from("whatsapp_channels")
        .select("id, phone_number_id, access_token, outbound_enabled")
        .eq("id", conv.channel_id)
        .eq("tenant_id", data.tenantId)
        .maybeSingle();
      if (error) throw new Error("WhatsApp channel unavailable");
      channel = exact;
    }

    if (!channel) {
      const { data: fallback, error } = await supabaseAdmin
        .from("whatsapp_channels")
        .select("id, phone_number_id, access_token, outbound_enabled")
        .eq("tenant_id", data.tenantId)
        .eq("is_primary", true)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error("WhatsApp channel unavailable");
      channel = fallback;
    }

    if (!channel) throw new Error("WhatsApp channel not configured");
    if (!channel.outbound_enabled) throw new Error("Outbound messaging is disabled for this number");

    const waId = (conv.contact as unknown as { wa_id: string }).wa_id;
    const res = await fetch(`${graphBase()}/${channel.phone_number_id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${channel.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: waId,
        type: "text",
        text: { body: data.text, preview_url: false },
      }),
    });
    const payload = (await res.json()) as { messages?: Array<{ id: string }>; error?: { message: string } };
    if (!res.ok) throw new Error(payload.error?.message ?? `Meta returned ${res.status}`);
    const waMessageId = payload.messages?.[0]?.id ?? null;

    const nowIso = new Date().toISOString();
    await supabaseAdmin.from("messages").insert({
      tenant_id: data.tenantId,
      conversation_id: data.conversationId,
      direction: "outbound",
      msg_type: "text",
      body: data.text,
      wa_message_id: waMessageId,
      status: "sent",
      sent_by: userId,
    });
    await supabaseAdmin
      .from("conversations")
      .update({ last_message_at: nowIso })
      .eq("id", data.conversationId);

    return { ok: true, waMessageId, channelId: channel.id };
  });
