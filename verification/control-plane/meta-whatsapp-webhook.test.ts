import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  MAX_META_WEBHOOK_BYTES, MetaWebhookInputError, readBoundedMetaWebhookBody,
  parseMetaWhatsAppPayload, verifyMetaWhatsAppSignature,
} from "../../src/modules/connect/meta-whatsapp-security";

const secret = "example-only-meta-app-secret-123456";
const phoneA = "1234567890123", phoneB = "9876543210123";
const event = (phone: string, messageId: string) => ({
  value: {
    metadata: { phone_number_id: phone },
    contacts: [{ wa_id: "447000000001" }],
    messages: [{ id: messageId, from: "447000000001", timestamp: "1793520000", type: "text", text: { body: "Hello" } }],
  },
});
const payload = (changes: unknown[]) => JSON.stringify({ entry: [{ changes }] });

async function sign(body: string, appSecret = secret): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const hmac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return "sha256=" + [...new Uint8Array(hmac)].map(x => x.toString(16).padStart(2,"0")).join("");
}

test("bounded streaming reads reject an oversized body before parsing", async () => {
  const small = new Request("https://example.com/webhook", { method: "POST", body: "{}" });
  assert.equal(await readBoundedMetaWebhookBody(small), "{}");
  const tooLarge = new Request("https://example.com/webhook", {
    method: "POST", body: " ".repeat(MAX_META_WEBHOOK_BYTES + 1),
  });
  await assert.rejects(() => readBoundedMetaWebhookBody(tooLarge), { status: 413 });
});

test("a valid multi-channel batch enumerates all channels before processing", () => {
  const batch = parseMetaWhatsAppPayload(payload([event(phoneA, "wamid.1"), event(phoneB, "wamid.2"), event(phoneA, "wamid.3")]));
  assert.deepEqual(batch.phoneNumberIds, [phoneA, phoneB]);
  assert.equal(batch.body.entry[0].changes.length, 3);
});

test("all Cloud API events require a valid app-secret signature over the original bytes", async () => {
  const body = payload([event(phoneA, "wamid.1")]);
  const signed = await sign(body);
  assert.equal(await verifyMetaWhatsAppSignature(body, signed, secret), true);
  assert.equal(await verifyMetaWhatsAppSignature(body + " ", signed, secret), false);
  assert.equal(await verifyMetaWhatsAppSignature(body, signed, "wrong-secret"), false);
  assert.equal(await verifyMetaWhatsAppSignature(body, "sha256=xyz", secret), false);
  assert.equal(await verifyMetaWhatsAppSignature(body, null, secret), false);
});

test("malformed and oversized payloads are rejected before database access", () => {
  assert.throws(() => parseMetaWhatsAppPayload("{"), { status: 400 });
  assert.throws(() => parseMetaWhatsAppPayload('{"entry":{}}'), { status: 400 });
  assert.throws(() => parseMetaWhatsAppPayload(payload([{ value: { metadata: { phone_number_id: "../bad" } } }])), { status: 400 });
  assert.throws(() => parseMetaWhatsAppPayload(payload([event(phoneA, "")])), MetaWebhookInputError);
  assert.throws(() => parseMetaWhatsAppPayload(" ".repeat(MAX_META_WEBHOOK_BYTES + 1)), { status: 413 });
  assert.throws(() => parseMetaWhatsAppPayload(payload(Array.from({length: 129}, (_,i) => event(phoneA, "wamid."+i)))), { status: 400 });
});

test("route verifies all channel bindings before any message write and scopes receipts to tenant", async () => {
  const route = await readFile(new URL("../../src/routes/api/public/whatsapp/webhook.ts", import.meta.url), "utf8");
  const verify = route.indexOf("for (const phoneNumberId of parsed.phoneNumberIds)");
  const write = route.indexOf('for (const entry of body.entry ?? [])');
  assert.ok(verify > 0 && write > verify, "preflight must precede every message mutation");
  assert.match(route, /verifyMetaWhatsAppSignature\(raw, signatureHeader, channel\.app_secret\)/);
  assert.match(route, /\.eq\("tenant_id", tenantId\)\s*\.eq\("direction", "outbound"\)/);
  assert.match(route, /\.eq\("wa_message_id", msg\.id\)/);
  assert.match(route, /if \(existing\) continue/);
  // Same contact may reach several tenant-bound WhatsApp numbers; those must
  // remain distinct conversations and cannot route through the wrong sender.
  assert.match(route, /\.eq\("contact_id", contact\.id\)\s*\.eq\("channel_id", channel\.id\)/);
});

test("a deleted channel does not silently reroute an existing conversation through the primary number", async () => {
  const source = await readFile(new URL("../../src/lib/whatsapp.functions.ts", import.meta.url), "utf8");
  assert.match(source, /if \(!exact\) throw new Error\("Conversation's original WhatsApp number is no longer available"\)/);
});
