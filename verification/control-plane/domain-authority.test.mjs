import assert from "node:assert/strict";
import { verifyDomainOwnership } from "../../src/modules/control-plane/domain-verification.server.ts";
import { decideProvisioning } from "../../src/modules/control-plane/provisioning-policy.ts";

const verified = await verifyDomainOwnership(
  {
    domain: "fleet.customer.example",
    recordName: "_omniqora-verification.fleet.customer.example",
    recordValue: "omniqora-domain=challenge",
  },
  {
    resolveTxt: async () => [["omniqora-domain=", "challenge"]],
    fetch: async () => new Response(null, { status: 204 }),
  },
);
assert.deepEqual(verified, {
  dnsVerified: true,
  sslActive: true,
  observedTxt: ["omniqora-domain=challenge"],
  httpStatus: 204,
  failureReason: null,
});

const mismatch = await verifyDomainOwnership(
  {
    domain: "fleet.customer.example",
    recordName: "_omniqora-verification.fleet.customer.example",
    recordValue: "omniqora-domain=expected",
  },
  {
    resolveTxt: async () => [["omniqora-domain=wrong"]],
    fetch: async () => {
      throw new Error("HTTPS must not be called before DNS ownership is proven");
    },
  },
);
assert.equal(mismatch.dnsVerified, false);
assert.equal(mismatch.sslActive, false);
assert.match(mismatch.failureReason, /does not match/);

const job = { target_kind: "domain", target_key: "fleet.customer.example", action: "verify" };
assert.deepEqual(
  decideProvisioning({
    job,
    domain: {
      domain: job.target_key,
      verification_status: "verified",
      ssl_status: "active",
    },
  }),
  { outcome: "succeed", reason: "DNS ownership and HTTPS certificate were verified." },
);
assert.equal(
  decideProvisioning({
    job,
    domain: {
      domain: job.target_key,
      verification_status: "verified",
      ssl_status: "pending",
      failure_reason: "Certificate is pending",
    },
  }).outcome,
  "block",
);

console.log("Tenant domain DNS ownership, TLS evidence and provisioning gates verified");
