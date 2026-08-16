import { createFileRoute } from "@tanstack/react-router";

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

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

// Meta sends sha256=<hex hmac of the raw body> in X-Hub-Signature-256.
async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const provided = signatureHeader.slice("sha256=".length).toLowerCase();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqualHex(provided, expected);
}


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
        const raw = await request.text();
        const signatureHeader = request.headers.get("x-hub-signature-256");
        let body: { entry?: Array<{ changes?: Array<{ value: WhatsAppChangeValue }> }> };
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        for (const entry of body.entry ?? []) {
          for (const change of entry.changes ?? []) {
            const v = change.value;
            const phoneNumberId = v.metadata?.phone_number_id;
            if (!phoneNumberId) continue;

            const { data: channel } = await supabaseAdmin
              .from("whatsapp_channels")
              .select("id, tenant_id, app_secret")
              .eq("phone_number_id", phoneNumberId)
              .maybeSingle();
            if (!channel) continue;

            // Meta signs every payload with the app secret. Reject anything unverified.
            const appSecret = channel.app_secret as string | null;
            if (!appSecret) {
              console.error("[whatsapp] channel has no app_secret configured; payload rejected");
              return new Response("Forbidden", { status: 403 });
            }
            if (!(await verifyMetaSignature(raw, signatureHeader, appSecret))) {
              return new Response("Invalid signature", { status: 401 });
            }

            const tenantId = channel.tenant_id as string;

            for (const msg of v.messages ?? []) {
              const waId = msg.from;
              const contactName = v.contacts?.find((c) => c.wa_id === waId)?.profile?.name ?? null;

              // upsert contact
              const { data: contact } = await supabaseAdmin
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
              const { data: openConv } = await supabaseAdmin
                .from("conversations")
                .select("id")
                .eq("tenant_id", tenantId)
                .eq("contact_id", contact.id)
                .eq("status", "open")
                .maybeSingle();
              if (openConv) {
                convId = openConv.id;
              } else {
                const { data: created } = await supabaseAdmin
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
              const body =
                msg.type === "text"
                  ? msg.text?.body ?? ""
                  : msg.type === "image"
                    ? msg.image?.caption ?? "[image]"
                    : msg.type === "document"
                      ? msg.document?.filename ?? "[document]"
                      : `[${msg.type}]`;

              await supabaseAdmin.from("messages").insert({
                tenant_id: tenantId,
                conversation_id: convId,
                direction: "inbound",
                msg_type: msg.type,
                body,
                wa_message_id: msg.id,
                status: "received",
              });
              await supabaseAdmin
                .from("conversations")
                .update({ last_message_at: nowIso, last_inbound_at: nowIso })
                .eq("id", convId);
            }

            for (const st of v.statuses ?? []) {
              await supabaseAdmin
                .from("messages")
                .update({ status: st.status })
                .eq("wa_message_id", st.id);
            }
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
