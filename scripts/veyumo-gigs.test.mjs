import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
// Use the existing TypeScript compiler; no extra bundler dependency for this isolated provider contract test.
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
const input=await readFile(new URL('../supabase/functions/_shared/veyumo/gigs.ts',import.meta.url),'utf8');
const prepared=input.replace('import { env } from "./runtime.ts";', `const env=(k:string)=>({GIGS_TOKEN:'test',GIGS_PROJECT:'test',GIGS_CONNECT_ORIGINS:'https://connect.gigs.com'}[k]||'');`)
 .replace('"./protocol.mjs"',JSON.stringify(new URL('../supabase/functions/_shared/veyumo/protocol.mjs',import.meta.url).href));
const compiled=ts.transpileModule(prepared,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {syncUser,connect}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
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
