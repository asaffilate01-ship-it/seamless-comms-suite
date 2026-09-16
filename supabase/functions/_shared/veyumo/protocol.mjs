/** Veyumo bridge protocol v1. No provider keys or customer tokens belong in the browser. */
export class BridgeError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.status = status;
  }
}
export const actions = [
  "workspace",
  "createAccount",
  "createLink",
  "claimLink",
  "checkout",
  "manage",
  "refresh",
];
export function parseAction(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !actions.includes(value.action)
  )
    throw new BridgeError("invalid_action");
  const allowed = ["action", "offerId", "subscriptionId", "token", "email", "invitationId"];
  if (Object.keys(value).some((k) => !allowed.includes(k)))
    throw new BridgeError("unexpected_field");
  for (const k of allowed.slice(1))
    if (value[k] !== undefined && (typeof value[k] !== "string" || value[k].length > 320))
      throw new BridgeError("invalid_field");
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))
    throw new BridgeError("invalid_email");
  return value;
}
export function httpsUrl(value) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.hash)
    throw new BridgeError("invalid_endpoint", 503);
  return u;
}
export async function digest(value) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
export async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const b = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
export function same(a, b) {
  if (typeof a !== "string" || a.length !== b.length) return false;
  let n = 0;
  for (let i = 0; i < a.length; i++) n |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return n === 0;
}
export async function signedHeaders(source, secret, raw, now = Date.now()) {
  if (!secret || secret.length < 32) throw new BridgeError("bridge_not_configured", 503);
  const timestamp = String(Math.floor(now / 1000));
  const id = crypto.randomUUID();
  return {
    "content-type": "application/json",
    "x-veyumo-source": source,
    "x-veyumo-id": id,
    "x-veyumo-timestamp": timestamp,
    "x-veyumo-signature": await hmac(secret, `${source}.${id}.${timestamp}.${raw}`),
  };
}
export async function verify(headers, secret, raw, now = Date.now()) {
  const source = headers.get("x-veyumo-source") || "";
  const id = headers.get("x-veyumo-id") || "";
  const timestamp = headers.get("x-veyumo-timestamp") || "";
  if (!secret || secret.length < 32) throw new BridgeError("bridge_not_configured", 503);
  if (
    !/^[a-z_]+$/.test(source) ||
    !/^[a-f0-9-]{36}$/.test(id) ||
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    throw new BridgeError("invalid_signature", 401);
  if (
    !same(
      headers.get("x-veyumo-signature") || "",
      await hmac(secret, `${source}.${id}.${timestamp}.${raw}`),
    )
  )
    throw new BridgeError("invalid_signature", 401);
  return { source, id };
}
export async function verifySvix(headers, secret, raw, now = Date.now()) {
  if (!secret) throw new BridgeError("gigs_webhook_not_configured", 503);
  const id = headers.get("webhook-id") || "";
  const t = headers.get("webhook-timestamp") || "";
  if (!id || !/^[0-9]{10}$/.test(t) || Math.abs(now / 1000 - Number(t)) > 300)
    throw new BridgeError("invalid_signature", 401);
  let key;
  try {
    key = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  } catch {
    throw new BridgeError("invalid_webhook_secret", 503);
  }
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${id}.${t}.${raw}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  if (
    !(headers.get("webhook-signature") || "")
      .split(" ")
      .some((s) => s.startsWith("v1,") && same(s.slice(3), expected))
  )
    throw new BridgeError("invalid_signature", 401);
  return id;
}
export function eligible(entitlement, now = Date.now()) {
  return (
    !!entitlement &&
    entitlement.active === true &&
    typeof entitlement.expiresAt === "string" &&
    Date.parse(entitlement.expiresAt) > now
  );
}
export function canOffer(offer, entitlement, market) {
  return (
    offer.enabled === true &&
    offer.market === market &&
    (!offer.requires_subscription || eligible(entitlement))
  );
}
export function safeSessionUrl(url, allowedOrigins) {
  const u = httpsUrl(url);
  if (!allowedOrigins.includes(u.origin)) throw new BridgeError("unapproved_checkout_origin", 502);
  return u.href;
}
export function publicOffer(o) {
  return {
    id: o.id,
    name: o.name,
    market: o.market,
    currency: o.currency,
    monthlyMinor: o.monthly_minor,
    description: o.description,
    requiresSubscription: o.requires_subscription,
    termsUrl: o.terms_url,
  };
}
export async function readBody(req, max = 131072) {
  const reader = req.body?.getReader();
  if (!reader) return "";
  let total = 0;
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new BridgeError("body_too_large", 413);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(out);
}
