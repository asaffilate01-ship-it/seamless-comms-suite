import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GRAPH = "https://graph.facebook.com/v21.0";

export const getMyChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => z.object({ tenantId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: ch } = await supabase
      .from("whatsapp_channels")
      .select("id, display_phone, phone_number_id, waba_id, verify_token, status, updated_at")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    return ch ?? null;
  });

const upsertSchema = z.object({
  tenantId: z.string().uuid(),
  phoneNumberId: z.string().min(3),
  wabaId: z.string().optional().nullable(),
  displayPhone: z.string().optional().nullable(),
  accessToken: z.string().min(20),
  verifyToken: z.string().min(6),
  appSecret: z.string().optional().nullable(),
});

export const upsertChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof upsertSchema>) => upsertSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("whatsapp_channels").upsert(
      {
        tenant_id: data.tenantId,
        phone_number_id: data.phoneNumberId,
        waba_id: data.wabaId ?? null,
        display_phone: data.displayPhone ?? null,
        access_token: data.accessToken,
        verify_token: data.verifyToken,
        app_secret: data.appSecret ?? null,
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
      .select("id, status, last_message_at, contact:contacts(id, display_name, wa_id)")
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

    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .select("id, contact:contacts(wa_id), channel_id")
      .eq("id", data.conversationId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (convErr || !conv) throw new Error("Conversation not found");

    const { data: channel, error: chErr } = await supabase
      .from("whatsapp_channels")
      .select("phone_number_id, access_token")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (chErr || !channel) throw new Error("WhatsApp channel not configured");

    const wa_id = (conv.contact as unknown as { wa_id: string }).wa_id;

    const res = await fetch(`${GRAPH}/${channel.phone_number_id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${channel.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: wa_id,
        type: "text",
        text: { body: data.text, preview_url: false },
      }),
    });
    const payload = (await res.json()) as { messages?: Array<{ id: string }>; error?: { message: string } };
    if (!res.ok) {
      throw new Error(payload.error?.message ?? `Meta returned ${res.status}`);
    }
    const waMessageId = payload.messages?.[0]?.id ?? null;

    const nowIso = new Date().toISOString();
    await supabase.from("messages").insert({
      tenant_id: data.tenantId,
      conversation_id: data.conversationId,
      direction: "outbound",
      msg_type: "text",
      body: data.text,
      wa_message_id: waMessageId,
      status: "sent",
      sent_by: userId,
    });
    await supabase
      .from("conversations")
      .update({ last_message_at: nowIso })
      .eq("id", data.conversationId);

    return { ok: true, waMessageId };
  });
