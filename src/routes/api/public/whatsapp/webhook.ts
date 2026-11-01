import { createFileRoute } from "@tanstack/react-router";
import { MetaWebhookInputError, MAX_META_WEBHOOK_BYTES, readBoundedMetaWebhookBody, parseMetaWhatsAppPayload, verifyMetaWhatsAppSignature } from "@/modules/connect/meta-whatsapp-security";

// WhatsApp Cloud API webhook receiver.
// GET  = Meta verification handshake (hub.mode=subscribe with verify_token).
// POST = inbound messages + status callbacks.

type WhatsAppChangeValue = {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
  messages?: Array<{
    id: string;
    from: string;
    timestamp: string;
    type: string;
    text?: { body: string };
    image?: { id: string; caption?: string };
    document?: { id: string; filename?: string };
  }>;
  statuses?: Array<{ id: string; status: string; timestamp: string }>;
};

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode !== "subscribe" || !token || !challenge) {
          return new Response("Bad Request", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("whatsapp_channels")
          .select("id")
          .eq("verify_token", token)
          .maybeSingle();
        if (!data) return new Response("Forbidden", { status: 403 });
        return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
      },

      POST: async ({ request }) => {
        if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
          return new Response("Unsupported webhook content", { status: 415 });
        }
        const declaredSize = Number(request.headers.get("content-length") ?? 0);
        if (!Number.isFinite(declaredSize) || declaredSize > MAX_META_WEBHOOK_BYTES) {
          return new Response("Webhook payload too large", { status: 413 });
        }
        let raw: string;
        let parsed: ReturnType<typeof parseMetaWhatsAppPayload>;
        try {
          raw = await readBoundedMetaWebhookBody(request);
          parsed = parseMetaWhatsAppPayload(raw);
        } catch (error) {
          if (error instanceof MetaWebhookInputError) {
            return new Response(error.message, { status: error.status });
          }
          return new Response("Invalid webhook payload", { status: 400 });
        }
        const signatureHeader = request.headers.get("x-hub-signature-256");
        const body = parsed.body;
        if (!parsed.phoneNumberIds.length) return new Response("ok", { status: 200 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // Generated database types intentionally lag the migration-owned Connect columns.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const connectDb = supabaseAdmin as any;

        // Preflight *every* referenced number before any row is inserted or updated.
        // A mixed valid/invalid callback can therefore never partially cross tenant boundaries.
        const channelsByPhone = new Map<string, any>();
        for (const phoneNumberId of parsed.phoneNumberIds) {
          const { data: channel, error } = await connectDb
            .from("whatsapp_channels")
            .select(
              "id, tenant_id, app_secret, product_key, external_tenant_id, scope_id, ai_enabled, inbound_enabled",
            )
            .eq("phone_number_id", phoneNumberId)
            .maybeSingle();
          if (error) return new Response("Channel lookup unavailable", { status: 503 });
          if (!channel || !channel.app_secret) return new Response("Forbidden", { status: 403 });
          if (!(await verifyMetaWhatsAppSignature(raw, signatureHeader, channel.app_secret))) {
            return new Response("Invalid signature", { status: 401 });
          }
          channelsByPhone.set(phoneNumberId, channel);
        }

        for (const entry of body.entry ?? []) {
          for (const change of entry.changes ?? []) {
            const v = change.value;
            const phoneNumberId = v.metadata?.phone_number_id;
            if (!phoneNumberId) continue;
            const channel = channelsByPhone.get(phoneNumberId);
            if (!channel) return new Response("Forbidden", { status: 403 });

            const tenantId = channel.tenant_id as string;
            const inboundEnabled = channel.inbound_enabled !== false;
            const isNafsi = channel.product_key === "nafsi";

            for (const msg of v.messages ?? []) {
              if (!inboundEnabled) continue;
              // Sequential webhook retry replay guard. A database uniqueness/atomic
              // insert is still required for concurrency-safe exactly-once ingest.
              const { data: existing, error: replayLookupError } = await connectDb
                .from("messages")
                .select("id")
                .eq("tenant_id", tenantId)
                .eq("direction", "inbound")
                .eq("wa_message_id", msg.id)
                .limit(1)
                .maybeSingle();
              if (replayLookupError) return new Response("Replay lookup unavailable", { status: 503 });
              if (existing) continue;
              const waId = msg.from;
              const contactName = isNafsi
                ? null
                : (v.contacts?.find((c) => c.wa_id === waId)?.profile?.name ?? null);
              const command =
                msg.type === "text" ? (msg.text?.body ?? "").trim().toUpperCase() : "";
              const normalizedCommand = ["START", "STOP", "HELP"].includes(command)
                ? (command as "START" | "STOP" | "HELP")
                : null;

              // upsert contact
              const { data: contact } = await connectDb
                .from("contacts")
                .upsert(
                  { tenant_id: tenantId, wa_id: waId, display_name: contactName },
                  { onConflict: "tenant_id,wa_id" },
                )
                .select("id")
                .single();
              if (!contact) continue;

              // find or create open conversation
              let convId: string | null = null;
              const { data: openConv } = await connectDb
                .from("conversations")
                .select("id")
                .eq("tenant_id", tenantId)
                .eq("contact_id", contact.id)
                .eq("channel_id", channel.id)
                .eq("status", "open")
                .maybeSingle();
              if (openConv) {
                convId = openConv.id;
              } else {
                const { data: created } = await connectDb
                  .from("conversations")
                  .insert({
                    tenant_id: tenantId,
                    contact_id: contact.id,
                    channel_id: channel.id,
                    status: "open",
                  })
                  .select("id")
                  .single();
                convId = created?.id ?? null;
              }
              if (!convId) continue;

              const nowIso = new Date().toISOString();
              const body = isNafsi
                ? normalizedCommand
                  ? `[normalized-command:${normalizedCommand}]`
                  : "[redacted-unsupported-message]"
                : msg.type === "text"
                  ? (msg.text?.body ?? "")
                  : msg.type === "image"
                    ? (msg.image?.caption ?? "[image]")
                    : msg.type === "document"
                      ? (msg.document?.filename ?? "[document]")
                      : `[${msg.type}]`;

              await connectDb.from("messages").insert({
                tenant_id: tenantId,
                conversation_id: convId,
                direction: "inbound",
                msg_type: msg.type,
                body,
                wa_message_id: msg.id,
                status: "received",
              });
              await connectDb
                .from("conversations")
                .update({ last_message_at: nowIso, last_inbound_at: nowIso })
                .eq("id", convId);

              if (isNafsi && normalizedCommand && normalizedCommand !== "HELP") {
                await connectDb
                  .from("contacts")
                  .update({
                    consent_marketing: normalizedCommand === "START",
                    updated_at: nowIso,
                  })
                  .eq("id", contact.id);
              }

              // AI-enabled channels also emit an isolated Connect event. The source
              // SaaS remains authoritative; this queue is only a communications/tool trigger.
              if (
                channel.ai_enabled &&
                channel.external_tenant_id &&
                (!isNafsi || normalizedCommand)
              ) {
                await connectDb.from("communication_events").upsert(
                  {
                    tenant_id: tenantId,
                    product_key: channel.product_key || "omniqora",
                    external_tenant_id: channel.external_tenant_id,
                    scope_id: channel.scope_id || channel.external_tenant_id,
                    source_event_id: msg.id,
                    event_type: isNafsi ? "command.received" : "whatsapp.inbound",
                    direction: "connect_to_source",
                    recipient: isNafsi
                      ? { contactRef: `wa-contact:${contact.id}` }
                      : { phone: waId, name: contactName },
                    message: isNafsi
                      ? { kind: "command", command: normalizedCommand }
                      : { kind: "inbound", type: msg.type, body },
                    metadata: isNafsi
                      ? { channelId: channel.id, waMessageId: msg.id }
                      : { conversationId: convId, channelId: channel.id, waMessageId: msg.id },
                    status: "queued",
                  },
                  { onConflict: "tenant_id,product_key,source_event_id", ignoreDuplicates: true },
                );
              }
            }

            for (const st of v.statuses ?? []) {
              // Service-role writes must scope to the resolved tenant and outbound
              // direction; a provider message ID alone is not an authorization boundary.
              const { error: statusError } = await connectDb
                .from("messages")
                .update({ status: st.status })
                .eq("tenant_id", tenantId)
                .eq("direction", "outbound")
                .eq("wa_message_id", st.id);
              if (statusError) return new Response("Status update unavailable", { status: 503 });
              if (isNafsi && channel.external_tenant_id) {
                const { data: source } = await connectDb
                  .from("communication_events")
                  .select("id,metadata")
                  .eq("tenant_id", tenantId)
                  .eq("product_key", "nafsi")
                  .eq("direction", "source_to_connect")
                  .contains("metadata", { waMessageId: st.id })
                  .maybeSingle();
                const contactRef = source?.metadata?.contactRef;
                if (source?.id && typeof contactRef === "string") {
                  const status = ["sent", "delivered", "read", "failed"].includes(st.status)
                    ? st.status
                    : "failed";
                  await connectDb.from("communication_events").upsert(
                    {
                      tenant_id: tenantId,
                      product_key: "nafsi",
                      external_tenant_id: channel.external_tenant_id,
                      scope_id: channel.scope_id || channel.external_tenant_id,
                      source_event_id: `status:${st.id}:${status}`,
                      event_type: "delivery.updated",
                      direction: "connect_to_source",
                      recipient: { contactRef },
                      message: { kind: "delivery", receiptId: source.id, status },
                      metadata: { channelId: channel.id, waMessageId: st.id },
                      status: "queued",
                    },
                    { onConflict: "tenant_id,product_key,source_event_id", ignoreDuplicates: true },
                  );
                }
              }
            }
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
