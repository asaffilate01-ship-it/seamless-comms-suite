import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const commercialSource = await readFile(new URL("../../src/modules/network-expansion/commercial-terms.ts", import.meta.url), "utf8");
const commercialCompiled = ts.transpileModule(commercialSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const commercialUrl = "data:text/javascript;base64," + Buffer.from(commercialCompiled).toString("base64");
const { MEALDECK_CURRENT_PRICING, publicNetworkProgramme, networkWorkspaceProgramme, networkWorkspaceTerritory, territoryCommercialExhibit } = await import(commercialUrl);
const source = await readFile(new URL("../../src/modules/network-expansion/public.server.ts", import.meta.url), "utf8");
const entry = source
  .replace('"zod"', JSON.stringify(pathToFileURL(require.resolve("zod")).href))
  .replace('"./commercial-terms"', JSON.stringify(commercialUrl))
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

function fixture(existingPerson = null, options = {}) {
  const state = { calls: [], inserts: [], person: existingPerson, territories: options.territories ?? [] };
  const tenant = { id: "tenant-1", slug: "mealdeck", name: "MealDeck" };
  let programme = options.missingProgramme ? null : {
    id: "programme-1", programme_key: "mealdeck-england-wales", name: "MealDeck England & Wales", status: "active", currency: "GBP",
    fee_min_minor: 750000, fee_max_minor: 2500000, royalty_bps: 550, marketing_bps: 150, tech_fee_minor_per_order: 25, supply_markup_bps: 1000,
    ...options.programme,
  };
  globalThis.__networkPublicDB = {
    async rpc() { return { data: null, error: null }; },
    from(table) {
      state.calls.push(table);
      let inserted;
      const filters = {};
      const query = {
        select() { return this; },
        eq(key, value) { filters[key] = value; return this; },
        ilike() { return this; },
        order() { return this; },
        limit() { return this; },
        or() { return this; },
        insert(row) {
          state.inserts.push({ table, row });
          inserted = { id: table + "-1", ...row };
          if (table === "crm_people") state.person = inserted;
          if (table === "network_programmes") programme = inserted;
          if (table === "network_territories") state.territories = row;
          return this;
        },
        async maybeSingle() {
          const data = table === "tenants" ? tenant
            : table === "network_programmes" ? programme
            : table === "crm_people" ? state.person
            : table === "network_territories" ? state.territories.find(x => x.territory_code === filters.territory_code) ?? null
            : undefined;
          assert.notEqual(data, undefined, "Unexpected read from " + table);
          return { data, error: null };
        },
        async single() {
          assert.ok(inserted, "Expected an insert before single()");
          return { data: inserted, error: null };
        },
        then(resolve, reject) {
          const data = table === "network_territories" ? state.territories
            : table === "network_territory_templates" ? options.templates ?? []
            : inserted ?? null;
          return Promise.resolve({ data, error: null }).then(resolve, reject);
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

const revisedProgramme = {
  royalty_bps: null, royalty_status: "quote_required", fee_min_minor: 375000, fee_max_minor: 1250000,
  tech_fee_minor_per_order: 0, supply_markup_bps: 0,
  offer: { pricing: MEALDECK_CURRENT_PRICING, pricingHistory: { previousRoyaltyBps: 550 }, internalNegotiation: "private" },
};
const revisedTerritory = {
  territory_code: "MD-003", name: "Battersea / Clapham / Vauxhall", region: "London", status: "available", is_sellable: true,
  fee_minor: 1250000, currency: "GBP", metadata: { franchiseFeeVersion: "2026-10-06-r2", internalNote: "private" },
};

test("public current offer has monthly charges, split supplies and an undecided royalty", async () => {
  fixture(null, { programme: revisedProgramme, territories: [revisedTerritory] });
  const response = await servePublicNetworkExpansion(new Request("https://example.invalid/api/public/network-expansion"));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.programme.franchiseFeeVersion, "2026-10-06-r2");
  assert.equal(result.programme.royaltyPercent, null);
  assert.equal(result.programme.royaltyStatus, "quote_required");
  assert.equal(result.programme.royaltyDisplay, "To be confirmed in written quote");
  assert.equal(result.programme.marketingPercent, 1.5);
  assert.equal(result.programme.techFeePerMonth, 199);
  assert.equal(result.programme.accountancyFeePerMonth, 100);
  assert.equal(result.programme.boughtInSupplyMarkupPercent, 0);
  assert.equal(result.programme.manufacturedSupplyMarkupPercent, 15);
  assert.equal(result.programme.manufacturedSupplyCostBasis, "fully_costed_production");
  assert.equal(result.programme.equipmentOpeningSuppliesEstimate, 15000);
  assert.equal("techFeePerOrder" in result.programme, false);
  assert.equal("supplyMarkupPercent" in result.programme, false);
  assert.equal(JSON.stringify(result).includes("previousRoyaltyBps"), false);
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.equal(result.territories[0].fee, 12500, "the already revised stored fee is never halved in this API");
  assert.equal(result.territories[0].franchiseFeeVersion, "2026-10-06-r2");
});

test("a current programme never gives its version to an unmarked territory", async () => {
  fixture(null, { programme: revisedProgramme, territories: [{ ...revisedTerritory, fee_minor: 1000000, metadata: {} }] });
  const response = await servePublicNetworkExpansion(new Request("https://example.invalid/api/public/network-expansion"));
  const result = await response.json();
  assert.equal("franchiseFeeVersion" in result.territories[0], false);
  assert.equal(result.territories[0].fee, null, "the public route withholds the unverified catalogue price");
  const receipt = await invoke({ territoryCode: "MD-003" });
  assert.equal(receipt.status, 201);
  assert.equal((await receipt.json()).territory.fee, null, "the enquiry receipt also withholds an unverified price");
  const workspace = networkWorkspaceTerritory({ ...revisedTerritory, metadata: {} }, { programme_key: "mealdeck-england-wales", ...revisedProgramme });
  assert.equal(workspace.fee_minor, null);
  assert.equal(workspace.fee_status, "quote_required");
});

test("public territory responses use null for missing or invalid stored fee amounts", async () => {
  for (const feeMinor of [undefined, null, -1, 1.5, Number.NaN, "not-a-price"]) {
    fixture(null, { programme: revisedProgramme, territories: [{ ...revisedTerritory, fee_minor: feeMinor }] });
    const response = await servePublicNetworkExpansion(new Request("https://example.invalid/api/public/network-expansion"));
    assert.equal(response.status, 200);
    const territory = (await response.json()).territories[0];
    assert.equal(territory.fee, null, String(feeMinor));
    assert.equal(territory.franchiseFeeVersion, "2026-10-06-r2", "the row marker is preserved without inventing a price");
    assert.equal(territory.isSellable, true, "price validation does not change availability");
  }
});

test("legacy responses retain known bounds without falsely declaring revised record prices", async () => {
  fixture(null, { territories: [{ ...revisedTerritory, fee_minor: 2500000, metadata: {} }] });
  const response = await servePublicNetworkExpansion(new Request("https://example.invalid/api/public/network-expansion"));
  const result = await response.json();
  assert.equal(result.programme.feeMin, 7500);
  assert.equal(result.programme.feeMax, 25000);
  assert.equal("franchiseFeeVersion" in result.programme, false);
  assert.equal(result.territories[0].fee, 25000);
  assert.equal("franchiseFeeVersion" in result.territories[0], false);
});

test("bootstrap uses the new offer and preserves the template's own revision marker", async () => {
  const state = fixture(null, { missingProgramme: true, templates: [{ ...revisedTerritory, metadata: { franchiseFeeVersion: "2026-10-06-r2", publicStatus: "available", isSellable: true } }] });
  const response = await servePublicNetworkExpansion(new Request("https://example.invalid/api/public/network-expansion"));
  assert.equal(response.status, 200);
  const inserted = state.inserts.find(x => x.table === "network_programmes").row;
  assert.equal(inserted.royalty_bps, null);
  assert.equal(inserted.royalty_status, "quote_required");
  assert.equal(inserted.tech_fee_minor_per_order, 0);
  assert.deepEqual(inserted.offer.pricing, MEALDECK_CURRENT_PRICING);
  assert.equal(state.territories[0].fee_minor, 1250000);
  assert.equal(state.territories[0].metadata.franchiseFeeVersion, "2026-10-06-r2");
});

test("enquiry offer snapshots and the selected fee are preserved as received from the website adapter", async () => {
  const state = fixture(null, { programme: revisedProgramme, territories: [revisedTerritory] });
  const answers = { offerVersion: "2026-10-06-r2", offerSnapshot: MEALDECK_CURRENT_PRICING, selectedTerritoryFee: 12500 };
  await assertAccepted(await invoke({ territoryCode: "MD-003", answers }), state);
  assert.deepEqual(state.inserts.find(x => x.table === "network_applications").row.answers, answers);
});

test("CRM and exhibits suppress stale numeric royalties and distinguish the current offer from signed terms", () => {
  const programme = { programme_key: "mealdeck-england-wales", ...revisedProgramme, royalty_bps: 550 };
  const workspace = networkWorkspaceProgramme(programme);
  assert.equal(workspace.royalty_bps, null);
  assert.equal(workspace.current_terms.royaltyDisplay, "To be confirmed in written quote");
  const exhibit = territoryCommercialExhibit(revisedTerritory, programme);
  assert.equal(exhibit.currentOffer.baseFranchiseFee, 12500);
  assert.equal(exhibit.currentOffer.royaltyPercent, null);
  assert.equal(exhibit.currentOffer.royaltyDisplay, "To be confirmed in written quote");
  assert.equal(exhibit.contractualPricing.status, "agreement_schedule_required");
  assert.equal(territoryCommercialExhibit({ ...revisedTerritory, metadata: {} }, programme).currentOffer.baseFranchiseFee, null);
  assert.equal(publicNetworkProgramme({ royalty_status: "quote_required", royalty_bps: 550 }).royaltyPercent, null);
});
