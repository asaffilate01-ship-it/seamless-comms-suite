import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFlightLoungeRuntime } from "../flightlounge/runtime.mjs";
import { createPostgresFlightControls } from "../flightlounge/postgres-controls.mjs";
import { createFileOfferStore } from "../flightlounge/offer-store.mjs";
import { createServer } from "../server.mjs";
const tenantId = "travenexa-flightlounge",
  origin = "https://journeys.example",
  at = Date.parse("2026-10-29T12:00:00Z");
const query = {
  legs: [{ origin: "LHR", destination: "ISB", departure_date: "2026-11-20" }],
  adults: 1,
  cabin: "economy",
  maxConnections: 1,
  checkedBags: 1,
};
function offer(date = "2026-11-20") {
  return {
    id: "off_fixture",
    live_mode: true,
    total_amount: "220.50",
    total_currency: "GBP",
    expires_at: "2026-10-29T12:10:00Z",
    passengers: [{ id: "p1" }],
    slices: [
      {
        segments: [
          {
            id: "seg1",
            origin: { iata_code: "LHR" },
            destination: { iata_code: "ISB" },
            departing_at: date + "T09:00:00",
            arriving_at: date + "T20:00:00",
            operating_carrier: { name: "Fixture" },
            passengers: [{ cabin_class: "economy", baggages: [{ type: "checked", quantity: 1 }] }],
          },
        ],
      },
    ],
    available_services: [
      {
        id: "bag1",
        type: "baggage",
        metadata: { type: "checked", maximum_weight_kg: 23 },
        total_amount: "10.25",
        total_currency: "GBP",
        maximum_quantity: 2,
        passenger_ids: ["p1"],
        segment_ids: ["seg1"],
      },
    ],
  };
}
async function setup(t, overrides = {}) {
  const pg = new PGlite();
  t.after(() => pg.close());
  const migration = await readFile(
    new URL(
      "../../../supabase/migrations/20261016130000_travenexa_transaction_ledger.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await pg.exec(
    migration.slice(
      migration.indexOf("CREATE TABLE public.travenexa_supplier_approvals"),
      migration.indexOf("CREATE TABLE public.travenexa_live_offers"),
    ),
  );
  await pg.exec(
    await readFile(new URL("../flightlounge/sql/runtime-controls.sql", import.meta.url), "utf8"),
  );
  await pg.exec(`INSERT INTO public.travenexa_supplier_approvals(tenant_key,supplier_key,product_type,status,active,contract_approved,credentials_verified,travel_compliance_approved,payment_approved,servicing_approved,multi_brand_permission,payment_mode,merchant_of_record) VALUES ('${tenantId}','duffel','flights','approved',true,true,true,true,true,true,true,'supplier_checkout','supplier');
 INSERT INTO flightlounge_private.budgets VALUES ('${tenantId}','*',20,now()+interval '1 day'),('${tenantId}','alice',10,now()+interval '1 day'),('${tenantId}','bob',10,now()+interval '1 day');`);
  const db = {
    query: (...args) => pg.query(...args),
    transaction: (fn) => pg.transaction((tx) => fn(tx)),
  };
  const controls = createPostgresFlightControls({ db });
  const directory = await mkdtemp(join(tmpdir(), "flight-runtime-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const state = { actorId: "alice", calls: 0, secretScopes: [] };
  const options = {
    siteOrigin: origin,
    db,
    controls,
    offerStore: createFileOfferStore({ directory, now: () => at }),
    now: () => at,
    activation: {
      commercialApproval: true,
      secureConfiguration: true,
      hostedStagingAccepted: true,
      liveSearchEnabled: true,
    },
    resolveAccess: async () => ({ allowed: true, tenantId, actorId: state.actorId }),
    authorizePassenger: async (c) => ({ allowed: true, ...c }),
    secretReader: async (t, s) => {
      state.secretScopes.push([t, s]);
      return "duffel_live_fixture-not-a-credential";
    },
    fetchImpl: async (url, init) => {
      state.calls++;
      const data =
        init.method === "GET"
          ? offer()
          : {
              live_mode: true,
              offers: [offer(JSON.parse(init.body).data.slices[0].departure_date)],
            };
      return new Response(JSON.stringify({ data }));
    },
    ...overrides,
  };
  const handler = createFlightLoungeRuntime(options);
  const request = (path = "search", body = query, signal) =>
    handler(
      new Request(origin + "/api/flights/" + path, {
        method: "POST",
        headers: { origin, "content-type": "application/json", "x-actor-id": "forged" },
        body: JSON.stringify(body),
        signal,
      }),
    );
  return { pg, db, controls, state, options, handler, request };
}
test("persisted approval, scoped credentials, budgets, audit and private references compose through HTTP", async (t) => {
  const s = await setup(t);
  const response = await s.request();
  assert.equal(response.status, 200);
  const r = await response.json();
  assert.match(r.offers[0].offerRef, /^offer_/);
  assert.equal(r.bookingsEnabled, false);
  assert.deepEqual(s.state.secretScopes, [[tenantId, "duffel"]]);
  const rows = (
    await s.pg.query("SELECT subject,remaining FROM flightlounge_private.budgets ORDER BY subject")
  ).rows;
  assert.deepEqual(
    rows.map((r) => r.remaining),
    [19, 9, 10],
  );
  const events = (await s.pg.query("SELECT actor_id,event,details FROM flightlounge_private.audit"))
    .rows;
  assert.ok(events.some((e) => e.event === "supplier_dispatch"));
  assert.ok(events.every((e) => e.actor_id === "alice"));
  assert.ok(!JSON.stringify(events).includes("credential"));
  const refresh = await s.request("refresh", {
    offerRef: r.offers[0].offerRef,
    selectedBaggage: [{ id: "bag1", quantity: 2 }],
  });
  assert.equal(refresh.status, 200);
  assert.equal((await refresh.json()).baggageSubtotal.knownSubtotal, "241");
  s.state.actorId = "bob";
  assert.equal((await s.request("refresh", { offerRef: r.offers[0].offerRef })).status, 404);
  assert.equal(s.state.calls, 2);
});
test("default activation and missing persisted approval block credentials and supplier transport", async (t) => {
  const s = await setup(t, { activation: {} });
  assert.equal((await s.request()).status, 403);
  assert.equal(s.state.calls, 0);
  assert.equal(s.state.secretScopes.length, 0);
  s.options.activation = {
    commercialApproval: true,
    secureConfiguration: true,
    hostedStagingAccepted: true,
    liveSearchEnabled: true,
  };
  await s.pg.exec("DELETE FROM public.travenexa_supplier_approvals");
  const h = createFlightLoungeRuntime(s.options);
  assert.equal(
    (
      await h(
        new Request(origin + "/api/flights/search", {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify(query),
        }),
      )
    ).status,
    403,
  );
  assert.equal(s.state.calls, 0);
});
test("revocation during supplier response suppresses delivery", async (t) => {
  const s = await setup(t);
  s.options.fetchImpl = async () => {
    s.state.calls++;
    await s.pg.exec("UPDATE public.travenexa_supplier_approvals SET active=false");
    return Response.json({ data: { live_mode: true, offers: [offer()] } });
  };
  const h = createFlightLoungeRuntime(s.options);
  const r = await h(
    new Request(origin + "/api/flights/search", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(query),
    }),
  );
  assert.equal(r.status, 403);
  assert.equal(s.state.calls, 1);
});
test("atomic tenant and actor budgets survive competing reservations and rollback partial debits", async (t) => {
  const s = await setup(t);
  await s.pg.exec("UPDATE flightlounge_private.budgets SET remaining=1");
  const results = await Promise.all(
    ["alice", "bob"].map((actorId) => s.controls.reserveBudget({ tenantId, actorId, calls: 1 })),
  );
  assert.equal(results.filter((r) => r.allowed).length, 1);
  assert.equal(
    (await s.controls.reserveBudget({ tenantId, actorId: "alice", calls: 1 })).allowed,
    false,
  );
  await s.pg.exec(
    "UPDATE flightlounge_private.budgets SET remaining=5 WHERE subject='*'; UPDATE flightlounge_private.budgets SET remaining=0 WHERE subject='alice'",
  );
  assert.equal(
    (await s.controls.reserveBudget({ tenantId, actorId: "alice", calls: 1 })).allowed,
    false,
  );
  assert.equal(
    (await s.pg.query("SELECT remaining FROM flightlounge_private.budgets WHERE subject='*'"))
      .rows[0].remaining,
    5,
  );
});
test("flexible dates reserve once, retain complete itineraries and report partial supplier coverage", async (t) => {
  let count = 0;
  const s = await setup(t, {
    fetchImpl: async (url, init) => {
      count++;
      return count === 2
        ? new Response("private supplier error", { status: 429 })
        : Response.json({
            data: {
              live_mode: true,
              offers: [offer(JSON.parse(init.body).data.slices[0].departure_date)],
            },
          });
    },
  });
  const r = await s.request("flexible-search", { query, dateOffsets: [[1, 2]] });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.coverage.partial, true);
  assert.equal(body.coverage.completed, 2);
  assert.equal(body.candidates[1].status, "unavailable");
  assert.ok(body.candidates[2].offers[0].offerRef);
  assert.equal(
    (await s.pg.query("SELECT remaining FROM flightlounge_private.budgets WHERE subject='alice'"))
      .rows[0].remaining,
    7,
  );
});
test("exhausted flexible budget returns 429 without supplier requests", async (t) => {
  const s = await setup(t);
  await s.pg.exec("UPDATE flightlounge_private.budgets SET remaining=0");
  assert.equal((await s.request("flexible-search", { query, dateOffsets: [[1]] })).status, 429);
  assert.equal(s.state.calls, 0);
});
test("expired supplier fares cannot be stored or refreshed", async (t) => {
  const o = offer();
  o.expires_at = "2020-01-01";
  const s = await setup(t, {
    fetchImpl: async () => Response.json({ data: { live_mode: true, offers: [o] } }),
  });
  assert.deepEqual((await (await s.request()).json()).offers, []);
});
test("cancellation while secret lookup stalls never advances to supplier dispatch", async (t) => {
  let finish;
  const s = await setup(t, {
    timeoutMs: 20,
    secretReader: () =>
      new Promise((r) => {
        finish = r;
      }),
  });
  const response = await s.request();
  assert.equal(response.status, 408);
  if (finish) finish("duffel_live_fixture");
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(s.state.calls, 0);
});
test("audit failure rolls budget transaction back and suppresses outbound calls", async (t) => {
  const s = await setup(t);
  await s.pg.exec("DROP TABLE flightlounge_private.audit");
  assert.equal(
    (await s.controls.reserveBudget({ tenantId, actorId: "alice", calls: 1 })).allowed,
    false,
  );
  assert.equal(
    (await s.pg.query("SELECT remaining FROM flightlounge_private.budgets WHERE subject='*'"))
      .rows[0].remaining,
    20,
  );
  assert.equal((await s.request()).status, 503);
  assert.equal(s.state.calls, 0);
});
test("existing Node gateway mounts passenger handler without tenant-token identity", async (t) => {
  const s = await setup(t);
  const server = createServer({ travellerHandler: s.handler, passengerOrigin: origin });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const r = await fetch(`http://127.0.0.1:${server.address().port}/api/flights/search`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(query),
  });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(
    (
      await fetch(`http://127.0.0.1:${server.address().port}/api/flights/book`, {
        method: "POST",
        headers: { origin },
      })
    ).status,
    404,
  );
});
test("single-search quota exhaustion returns 429 and never dispatches", async (t) => {
  const s = await setup(t);
  await s.pg.exec("UPDATE flightlounge_private.budgets SET remaining=0 WHERE subject='alice'");
  assert.equal((await s.request()).status, 429);
  assert.equal(s.state.calls, 0);
});
test("passenger identity mismatch is denied even with an approved supplier", async (t) => {
  const s = await setup(t, {
    authorizePassenger: async () => ({ allowed: true, tenantId, actorId: "someone-else" }),
  });
  assert.equal((await s.request()).status, 403);
  assert.equal(s.state.secretScopes.length, 0);
});
test("private controls deny an unprivileged database role", async (t) => {
  const s = await setup(t);
  await s.pg.exec("CREATE ROLE browser_role; SET ROLE browser_role");
  await assert.rejects(s.pg.query("SELECT * FROM flightlounge_private.audit"), /permission denied/);
  await assert.rejects(
    s.pg.query("UPDATE flightlounge_private.budgets SET remaining=999"),
    /permission denied/,
  );
  await s.pg.exec("RESET ROLE");
});
