import test from "node:test";
import assert from "node:assert/strict";
import { releaseChecks, runPublicSmoke } from "../scripts/omniqora-public-smoke.mjs";

function mockTransport(overrides = {}) {
  return async (url, request) => {
    const pathname = new URL(url).pathname;
    const status = overrides[pathname] ?? (request.method === "GET" ? 200 : 401);
    return new Response(status === 200 ? "<html><title>Omniqora</title></html>" : "Denied", {
      status,
      headers: { "content-type": status === 200 ? "text/html; charset=utf-8" : "application/json" },
    });
  };
}

test("public release suite covers three pages and three protected boundaries", () => {
  assert.equal(releaseChecks.filter(c => c.kind === "html").length, 3);
  assert.equal(releaseChecks.filter(c => c.kind === "reject").length, 3);
});

test("healthy public pages and denied unauthenticated calls pass", async () => {
  const report = await runPublicSmoke("https://omniqora.itechlounge.co.uk", mockTransport());
  assert.equal(report.passed, true);
  assert.equal(report.results.length, 6);
  assert.ok(report.results.every(result => result.passed));
});

test("a public 403 or missing protected endpoint fails", async () => {
  const unavailable = await runPublicSmoke("https://omniqora.itechlounge.co.uk", mockTransport({ "/auth": 403 }));
  assert.equal(unavailable.passed, false);
  assert.equal(unavailable.results.find(r => r.path === "/auth").passed, false);

  const missing = await runPublicSmoke("https://omniqora.itechlounge.co.uk", mockTransport({ "/api/platform/runtime": 404 }));
  assert.equal(missing.passed, false);
});

test("unexpected 200 on a protected endpoint fails closed", async () => {
  const report = await runPublicSmoke("https://omniqora.itechlounge.co.uk", mockTransport({ "/api/control-plane/tenant-snapshot": 200 }));
  assert.equal(report.passed, false);
});

test("server 500 and transport exceptions fail safely", async () => {
  const response = await runPublicSmoke("https://omniqora.itechlounge.co.uk", mockTransport({ "/pricing": 500 }));
  assert.equal(response.passed, false);
  const network = await runPublicSmoke("https://omniqora.itechlounge.co.uk", async () => { throw new Error("timed out"); });
  assert.equal(network.passed, false);
  assert.equal(network.results.length, releaseChecks.length);
});

test("unsafe or tokenised target origins are rejected", async () => {
  await assert.rejects(runPublicSmoke("http://omniqora.itechlounge.co.uk", mockTransport()), /HTTPS origin/);
  await assert.rejects(runPublicSmoke("https://omniqora.itechlounge.co.uk/?api_key=secret", mockTransport()), /HTTPS origin/);
  await assert.rejects(runPublicSmoke("https://omniqora.itechlounge.co.uk/app", mockTransport()), /Supply only/);
});
