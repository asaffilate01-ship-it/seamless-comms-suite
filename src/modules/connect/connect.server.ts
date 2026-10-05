import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { BridgeError, bearerBinding, checkScope, permit, freshness, readBody, requestId } from "@/modules/ecosystem/bridge-core";
import { connectEventAllowed, connectManifest } from "./product-manifests";

const id = z.string().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/);
const phone = z.string().min(7).max(20).regex(/^\+?[0-9]+$/);
const message = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("template"),
    templateName: z.string().min(1).max(512).regex(/^[a-z0-9_]+$/),
    language: z.string().min(2).max(20).default("en_GB"),
    components: z.array(z.record(z.unknown())).max(10).default([]),
    fallbackText: z.string().max(4096).optional(),
  }).strict(),
  z.object({
    kind: z.literal("text"),
    text: z.string().min(1).max(4096),
  }).strict(),
]);

const eventSchema = z.object({
  tenantId: id,
  scopeId: id,
  eventType: id,
  recipient: z.object({ phone, name: z.string().max(120).optional() }).strict().optional(),
  message: message.optional(),
  metadata: z.record(z.unknown()).default({}),
}).strict();

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

const graphBase = () => `https://graph.facebook.com/${process.env["WHATSAPP_GRAPH_VERSION"] ?? "v21.0"}`;

async function selectChannel(
  db: Awaited<ReturnType<typeof admin>>,
  tenantId: string,
  product: string,
  externalTenant: string,
  scopeId: string,
) {
  const base = () => db
    .from("whatsapp_channels")
    .select("id, tenant_id, phone_number_id, access_token, product_key, external_tenant_id, scope_id, is_primary, outbound_enabled, status")
    .eq("tenant_id", tenantId)
    .eq("product_key", product)
    .eq("external_tenant_id", externalTenant)
    .eq("outbound_enabled", true)
    .eq("status", "configured");

  const { data: exact } = await base().eq("scope_id", scopeId).limit(1);
  if (exact?.[0]) return exact[0];

  const { data: primary } = await base().eq("is_primary", true).limit(1);
  return primary?.[0] ?? null;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function ensureConversation(
  db: Awaited<ReturnType<typeof admin>>,
  tenantId: string,
  channelId: string,
  waId: string,
  name?: string,
) {
  const { data: contact, error: contactError } = await db
    .from("contacts")
    .upsert(
      { tenant_id: tenantId, wa_id: waId, display_name: name ?? null },
      { onConflict: "tenant_id,wa_id" },
    )
    .select("id")
    .single();
  if (contactError || !contact) throw new BridgeError(503, "Contact record could not be prepared");

  const { data: open } = await db
    .from("conversations")
    .select("id, last_inbound_at")
    .eq("tenant_id", tenantId)
    .eq("contact_id", contact.id)
    .eq("channel_id", channelId)
    .eq("status", "open")
    .maybeSingle();

  if (open) return open;

  const { data: created, error } = await db
    .from("conversations")
    .insert({ tenant_id: tenantId, contact_id: contact.id, channel_id: channelId, status: "open" })
    .select("id, last_inbound_at")
    .single();
  if (error || !created) throw new BridgeError(503, "Conversation could not be prepared");
  return created;
}

export async function serveConnectEvent(request: Request) {
  let eventRowId: string | null = null;
  try {
    const binding = bearerBinding(request);
    permit(binding, "communication_event");
    freshness(request);
    const raw = await readBody(request, 131072);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new BridgeError(400, "Invalid JSON"); }
    const input = eventSchema.parse(parsed);
    checkScope(binding, input.tenantId, input.scopeId);

    const manifest = connectManifest(binding.product);
    if (!manifest) {
      throw new BridgeError(422, "Product is not registered in the Omniqora SaaS Factory");
    }
    if (!connectEventAllowed(manifest,input.eventType)) {
      throw new BridgeError(422, "Event is not enabled by this product's Connect manifest");
    }

    const sourceEventId = requestId(request, true)!;
    const db = await admin();

    const { data: prior } = await db
      .from("communication_events")
      .select("id, status, last_error")
      .eq("tenant_id", binding.tenant)
      .eq("product_key", binding.product)
      .eq("source_event_id", sourceEventId)
      .maybeSingle();
    if (prior) return response({ id: prior.id, status: prior.status, idempotent: true }, 200);

    const { data: inserted, error: insertError } = await db
      .from("communication_events")
      .insert({
        tenant_id: binding.tenant,
        product_key: binding.product,
        external_tenant_id: binding.externalTenant,
        scope_id: input.scopeId,
        source_event_id: sourceEventId,
        event_type: input.eventType,
        direction: "source_to_connect",
        recipient: (input.recipient ?? null) as Json,
        message: (input.message ?? null) as Json,
        metadata: input.metadata as Json,
        status: "queued",
      })
      .select("id")
      .single();
    if (insertError || !inserted) throw new BridgeError(503, "Connect event could not be queued");
    eventRowId = inserted.id;

    if (!input.recipient || !input.message) {
      return response({ id: eventRowId, status: "queued" }, 202);
    }

    const channel = await selectChannel(db, binding.tenant, binding.product, binding.externalTenant, input.scopeId);
    if (!channel) {
      await db.from("communication_events").update({ status: "blocked", last_error: "No configured WhatsApp channel for scope", updated_at: new Date().toISOString() }).eq("id", eventRowId);
      return response({ id: eventRowId, status: "blocked", reason: "No WhatsApp number is configured for this SaaS tenant/scope" }, 409);
    }

    const waId = input.recipient.phone.replace(/^\+/, "");
    const conv = await ensureConversation(db, binding.tenant, channel.id, waId, input.recipient.name);

    if (input.message.kind === "text") {
      const lastInbound = conv.last_inbound_at ? Date.parse(conv.last_inbound_at) : 0;
      if (!lastInbound || Date.now() - lastInbound > 24 * 60 * 60 * 1000) {
        await db.from("communication_events").update({ status: "blocked", last_error: "Template required outside active customer-service window", updated_at: new Date().toISOString() }).eq("id", eventRowId);
        return response({ id: eventRowId, status: "blocked", reason: "Use an approved WhatsApp template for proactive messaging" }, 409);
      }
    }

    const body = input.message.kind === "template"
      ? {
          messaging_product: "whatsapp",
          to: waId,
          type: "template",
          template: {
            name: input.message.templateName,
            language: { code: input.message.language },
            components: input.message.components,
          },
        }
      : {
          messaging_product: "whatsapp",
          to: waId,
          type: "text",
          text: { body: input.message.text, preview_url: false },
        };

    const meta = await fetch(`${graphBase()}/${channel.phone_number_id}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${channel.access_token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const metaBody = await meta.json() as { messages?: Array<{ id: string }>; error?: { message?: string } };
    if (!meta.ok) {
      const safeError = `Meta send failed (${meta.status})`;
      await db.from("communication_events").update({ status: "failed", attempts: 1, last_error: safeError, updated_at: new Date().toISOString() }).eq("id", eventRowId);
      return response({ id: eventRowId, status: "failed" }, 502);
    }

    const waMessageId = metaBody.messages?.[0]?.id ?? null;
    const displayBody = input.message.kind === "template"
      ? input.message.fallbackText ?? `[template: ${input.message.templateName}]`
      : input.message.text;

    await db.from("messages").insert({
      tenant_id: binding.tenant,
      conversation_id: conv.id,
      direction: "outbound",
      msg_type: input.message.kind === "template" ? "template" : "text",
      body: displayBody,
      wa_message_id: waMessageId,
      status: "sent",
    });
    await db.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);
    await db.from("communication_events").update({ status: "delivered", attempts: 1, updated_at: new Date().toISOString() }).eq("id", eventRowId);

    return response({ id: eventRowId, status: "delivered", waMessageId }, 202);
  } catch (error) {
    if (error instanceof BridgeError) return response({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return response({ error: "Invalid Connect event contract" }, 422);
    return response({ error: "Omniqora Connect service unavailable" }, 503);
  }
}
