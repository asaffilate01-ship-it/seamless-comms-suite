import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const { build } = await import(process.env.VEYUMO_ESBUILD_MODULE || "esbuild");
const bundle = await build({
  entryPoints: [
    fileURLToPath(new URL("../supabase/functions/_shared/veyumo/gigs.ts", import.meta.url)),
  ],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "test-env",
      setup(b) {
        b.onResolve({ filter: /runtime\.ts$/ }, () => ({ path: "runtime", namespace: "test" }));
        b.onLoad({ filter: /.*/, namespace: "test" }, () => ({
          contents:
            "export const env=k=>({GIGS_TOKEN:'test',GIGS_PROJECT:'test',GIGS_CONNECT_ORIGINS:'https://connect.gigs.com'}[k]||'');",
          loader: "js",
        }));
      },
    },
  ],
});
const { syncUser, connect } = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const original = globalThis.fetch;
test.after(() => (globalThis.fetch = original));
test("sync includes ended/restricted lines, follows provider cursor and rejects other users", async () => {
  const urls = [],
    rows = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return Response.json(
      urls.length === 1
        ? {
            items: [
              {
                id: "sub_1",
                user: { id: "usr_owner" },
                status: "ended",
                plan: { name: "Approved" },
              },
              { id: "sub_other", user: { id: "usr_other" }, status: "active" },
            ],
            moreItemsAfter: "cursor_2",
          }
        : {
            items: [{ id: "sub_2", user: { id: "usr_owner" }, status: "restricted" }],
            moreItemsAfter: null,
          },
    );
  };
  const service = {
    rpc: async (name, args) => {
      assert.equal(name, "veyumo_store_subscription");
      rows.push(args);
      return { error: null };
    },
  };
  await syncUser(service, "account_a", "usr_owner");
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((x) => x.p_status),
    ["ended", "restricted"],
  );
  assert.equal(
    new URL(urls[0]).searchParams.get("status"),
    "pending,initiated,active,restricted,ended",
  );
  assert.equal(new URL(urls[1]).searchParams.get("after"), "cursor_2");
  assert(rows.every((x) => x.p_account === "account_a"));
});
test("malformed provider list fails instead of silently clearing lines", async () => {
  globalThis.fetch = async () => Response.json({ items: null });
  await assert.rejects(() => syncUser({}, "a", "u"), /invalid_provider_response/);
});
test("hosted checkout uses the mapped user and blocks a hostile provider redirect", async () => {
  let sent;
  globalThis.fetch = async (_url, init) => {
    sent = JSON.parse(init.body);
    return Response.json({ url: "https://evil.test/token" });
  };
  await assert.rejects(
    () => connect("usr_owner", { type: "viewSubscriptions" }, "https://app.test/account"),
    /unapproved_checkout_origin/,
  );
  assert.equal(sent.user, "usr_owner");
  assert.equal(sent.callbackUrl, "https://app.test/account");
});
