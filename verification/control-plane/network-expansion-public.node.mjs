import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = await readFile(new URL("../../src/modules/network-expansion/public.server.ts", import.meta.url), "utf8");
const entry = source
  .replace('"zod"', JSON.stringify(pathToFileURL(require.resolve("zod")).href))
  .replace('import("@/integrations/supabase/client.server")', "({supabaseAdmin:globalThis.__networkPublicDB})");
const compiled = ts.transpileModule(entry, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { servePublicNetworkExpansion } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);

const payload = {
  name: "Test operator",
  email: "Franchise@Example.invalid",
  preferredArea: "Southall",
  consent: true,
};

function fixture(existingPerson = null) {
  const state = { calls: [], inserts: [], person: existingPerson };
  const tenant = { id: "tenant-1", slug: "mealdeck", name: "MealDeck" };
  const programme = { id: "programme-1", programme_key: "mealdeck-england-wales", status: "active" };
  globalThis.__networkPublicDB = {
    from(table) {
      state.calls.push(table);
      let inserted;
      const query = {
        select() { return this; },
        eq() { return this; },
        ilike() { return this; },
        insert(row) {
          state.inserts.push({ table, row });
          inserted = { id: table + "-1", ...row };
          if (table === "crm_people") state.person = inserted;
          return this;
        },
        async maybeSingle() {
          const data = table === "tenants" ? tenant
            : table === "network_programmes" ? programme
            : table === "crm_people" ? state.person
            : undefined;
          assert.notEqual(data, undefined, "Unexpected read from " + table);
          return { data, error: null };
        },
        async single() {
          assert.ok(inserted, "Expected an insert before single()");
          return { data: inserted, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: inserted ?? null, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return state;
}

function invoke(changes = {}) {
  return servePublicNetworkExpansion(new Request("https://example.invalid/api/public/network-expansion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, ...changes }),
  }));
}

async function assertAccepted(response, state) {
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.applicationId, "network_applications-1");
  for (const table of ["crm_leads", "network_applications", "network_application_events", "crm_activities", "growth_attribution_events"]) {
    assert.equal(state.inserts.filter(x => x.table === table).length, 1, table + " remains in the application pipeline");
  }
  const application = state.inserts.find(x => x.table === "network_applications").row;
  assert.equal(application.consent, true);
  assert.equal(application.crm_person_id, state.person.id);
  assert.equal(application.crm_lead_id, "crm_leads-1");
}

test("application follow-up consent alone does not opt a new contact into marketing", async () => {
  const state = fixture();
  await assertAccepted(await invoke(), state);
  assert.equal(state.person.marketing_consent, false);
  assert.equal(state.person.email, "franchise@example.invalid");
});

for (const marketingConsent of [false, true]) {
  test("new contact stores explicit marketingConsent=" + marketingConsent, async () => {
    const state = fixture();
    await assertAccepted(await invoke({ marketingConsent }), state);
    assert.equal(state.person.marketing_consent, marketingConsent);
  });
}

for (const storedConsent of [false, true]) {
  for (const marketingConsent of [undefined, false]) {
    test("an application preserves existing marketing consent " + storedConsent + " when incoming consent is " + String(marketingConsent), async () => {
      const person = { id: "existing-person", email: "franchise@example.invalid", marketing_consent: storedConsent };
      const state = fixture(person);
      await assertAccepted(await invoke({ marketingConsent }), state);
      assert.equal(state.person, person);
      assert.equal(state.person.marketing_consent, storedConsent);
      assert.equal(state.inserts.filter(x => x.table === "crm_people").length, 0);
    });
  }
}

for (const marketingConsent of ["true", "false", 1, null]) {
  test("non-boolean marketing consent is rejected: " + JSON.stringify(marketingConsent), async () => {
    const state = fixture();
    const response = await invoke({ marketingConsent });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).ok, false);
    assert.equal(state.calls.length, 0, "invalid input must not reach the database");
  });
}

for (const consent of [undefined, false]) {
  test("marketing consent cannot replace required application follow-up consent: " + String(consent), async () => {
    const state = fixture();
    const response = await invoke({ consent, marketingConsent: true });
    assert.equal(response.status, 400);
    assert.equal(state.calls.length, 0);
  });
}
