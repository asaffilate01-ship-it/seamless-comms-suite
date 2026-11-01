/**
 * Fail-closed input and signature preflight for the WhatsApp Cloud API webhook.
 * This module performs no database writes and makes no claims about Meta account activation.
 */
export class MetaWebhookInputError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "MetaWebhookInputError";
  }
}

export const MAX_META_WEBHOOK_BYTES = 256 * 1024;

type MetaMessage = {
  id: string; from: string; timestamp: string; type: string;
  text?: { body: string };
  image?: { id: string; caption?: string };
  document?: { id: string; filename?: string };
};
type MetaValue = {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
  messages?: MetaMessage[];
  statuses?: Array<{ id: string; status: string; timestamp: string }>;
};
export type MetaWhatsAppPayload = {
  entry: Array<{ changes: Array<{ value: MetaValue; field?: string }> }>;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isValidId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 255;
}

/** Reject malformed or unbounded batches before attempting *any* message/status writes. */
export function parseMetaWhatsAppPayload(raw: string): {
  body: MetaWhatsAppPayload; phoneNumberIds: string[];
} {
  if (new TextEncoder().encode(raw).byteLength > MAX_META_WEBHOOK_BYTES) {
    throw new MetaWebhookInputError(413, "Webhook payload too large");
  }
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new MetaWebhookInputError(400, "Bad JSON"); }
  if (!isObject(value) || !Array.isArray(value.entry) || value.entry.length > 32) {
    throw new MetaWebhookInputError(400, "Invalid webhook envelope");
  }

  const phoneNumbers = new Set<string>();
  let changeCount = 0;
  let eventCount = 0;
  for (const entry of value.entry) {
    if (!isObject(entry) || !Array.isArray(entry.changes) || entry.changes.length > 32) {
      throw new MetaWebhookInputError(400, "Invalid webhook changes");
    }
    for (const change of entry.changes) {
      changeCount += 1;
      if (changeCount > 128 || !isObject(change) || !isObject(change.value)) {
        throw new MetaWebhookInputError(400, "Invalid webhook change");
      }
      const item = change.value;
      // Other Meta subscription fields may be delivered on the same endpoint;
      // they cannot mutate Omniqora without a known phone-number binding.
      const metadata = item.metadata;
      if (!isObject(metadata) || metadata.phone_number_id === undefined) continue;
      if (typeof metadata.phone_number_id !== "string" ||
          !/^\d{3,32}$/.test(metadata.phone_number_id)) {
        throw new MetaWebhookInputError(400, "Invalid phone number ID");
      }
      phoneNumbers.add(metadata.phone_number_id);
      if (phoneNumbers.size > 32) throw new MetaWebhookInputError(413, "Too many channels");
      for (const field of ["messages", "statuses", "contacts"] as const) {
        if (item[field] !== undefined && (!Array.isArray(item[field]) || item[field].length > 256)) {
          throw new MetaWebhookInputError(400, "Invalid webhook collection");
        }
      }
      const messages = (item.messages ?? []) as unknown[];
      const statuses = (item.statuses ?? []) as unknown[];
      eventCount += messages.length + statuses.length;
      if (eventCount > 512) throw new MetaWebhookInputError(413, "Too many webhook events");
      for (const message of messages) {
        if (!isObject(message) || !isValidId(message.id) ||
            !isValidId(message.from) || !isValidId(message.type)) {
          throw new MetaWebhookInputError(400, "Invalid inbound message");
        }
      }
      for (const status of statuses) {
        if (!isObject(status) || !isValidId(status.id) ||
            !isValidId(status.status)) {
          throw new MetaWebhookInputError(400, "Invalid delivery status");
        }
      }
      for (const contact of (item.contacts ?? []) as unknown[]) {
        if (!isObject(contact) || !isValidId(contact.wa_id)) {
          throw new MetaWebhookInputError(400, "Invalid contact");
        }
      }
    }
  }
  return {
    body: value as MetaWhatsAppPayload,
    phoneNumberIds: [...phoneNumbers],
  };
}

function equalHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/** Verify the original body bytes against the configured app secret, not a parsed JSON rendering. */
export async function verifyMetaWhatsAppSignature(
  raw: string, header: string | null, appSecret: string,
): Promise<boolean> {
  if (!/^sha256=[a-fA-F0-9]{64}$/.test(header ?? "") || !appSecret) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const expected = [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return equalHex(header!.slice(7).toLowerCase(), expected);
}
