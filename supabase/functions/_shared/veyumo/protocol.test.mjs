import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  signedHeaders,
  verify,
  verifySvix,
  parseAction,
  eligible,
  canOffer,
  safeSessionUrl,
  readBody,
} from "./protocol.mjs";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const secret = "test-only-bridge-secret-32-characters-minimum";
const now = Date.UTC(2026, 8, 12);
test("signed identity survives transport and body tampering is rejected", async () => {
  const raw = JSON.stringify({ actor: { subject: "owner" }, command: { action: "workspace" } });
  const h = new Headers(await signedHeaders("craftvaro", secret, raw, now));
  assert.equal((await verify(h, secret, raw, now)).source, "craftvaro");
  await assert.rejects(() => verify(h, secret, raw + " ", now), /invalid_signature/);
  h.set("x-veyumo-source", "haccora");
  await assert.rejects(() => verify(h, secret, raw, now), /invalid_signature/);
});
test("stale and future signatures are rejected", async () => {
  const h = new Headers(await signedHeaders("craftvaro", secret, "{}", now));
  await assert.rejects(() => verify(h, secret, "{}", now + 301000));
  await assert.rejects(() => verify(h, secret, "{}", now - 301000));
});
test("browser cannot assert an account, identity, price or entitlement", () => {
  for (const key of ["accountId", "actor", "source", "price", "entitlement", "callbackUrl"])
    assert.throws(() => parseAction({ action: "checkout", [key]: "forged" }));
  assert.throws(() => parseAction({ action: "deleteAccount" }));
});
test("expired entitlement, wrong country and disabled offers fail closed", () => {
  const offer = { enabled: true, market: "GB", requires_subscription: true };
  assert.equal(canOffer(offer, { active: true, expiresAt: "2000-01-01" }, "GB"), false);
  assert.equal(canOffer(offer, { active: true, expiresAt: "2999-01-01" }, "DE"), false);
  assert.equal(
    canOffer({ ...offer, enabled: false }, { active: true, expiresAt: "2999-01-01" }, "GB"),
    false,
  );
  assert.equal(eligible({ active: "true", expiresAt: "2999-01-01" }), false);
  assert.equal(canOffer(offer, { active: true, expiresAt: "2999-01-01" }, "GB"), true);
});
test("checkout redirect origin is exact and requires HTTPS", () => {
  assert.equal(
    safeSessionUrl("https://connect.gigs.com/session/x", ["https://connect.gigs.com"]),
    "https://connect.gigs.com/session/x",
  );
  for (const u of [
    "https://connect.gigs.com.evil.test/x",
    "https://user:pass@connect.gigs.com/x",
    "http://connect.gigs.com/x",
    "javascript:alert(1)",
  ])
    assert.throws(() => safeSessionUrl(u, ["https://connect.gigs.com"]));
});
test("oversized body rejected before JSON parsing", async () => {
  await assert.rejects(
    () =>
      readBody(new Request("https://example.test", { method: "POST", body: "a".repeat(20) }), 10),
    /body_too_large/,
  );
});
test("Svix rotation candidate accepted; changed body and stale event rejected", async () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const secret = "whsec_" + btoa(String.fromCharCode(...key));
  const raw = '{"id":"evt_1"}';
  const id = "msg_test",
    timestamp = String(now / 1000);
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = await crypto.subtle.sign(
    "HMAC",
    k,
    new TextEncoder().encode(`${id}.${timestamp}.${raw}`),
  );
  const h = new Headers({
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": "v1,old v1," + btoa(String.fromCharCode(...new Uint8Array(mac))),
  });
  assert.equal(await verifySvix(h, secret, raw, now), id);
  await assert.rejects(() => verifySvix(h, secret, raw + " ", now));
  await assert.rejects(() => verifySvix(h, secret, raw, now + 301000));
});
