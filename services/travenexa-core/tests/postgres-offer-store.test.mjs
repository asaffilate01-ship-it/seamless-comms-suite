import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createPostgresOfferStore } from "../flightlounge/postgres-offer-store.mjs";
import { createTravellerFlightSession } from "../flightlounge/traveller-session.mjs";
const tenantId = "travenexa-flightlounge",
  alice = { tenantId, actorId: "alice" },
  bob = { tenantId, actorId: "bob" };
const query = () => ({
  legs: [
    {
      origin: "LHR",
      destination: "ISB",
      departure_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    },
  ],
  adults: 1,
  cabin: "economy",
  maxConnections: 1,
  checkedBags: 0,
});
const snapshot = () => ({
  query: query(),
  offer: {
    id: "off_fixture",
    source: "duffel",
    live: true,
    bookable: false,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    amount: 100,
    currency: "GBP",
    slices: [],
    baggageRequirementMet: true,
    priceScope: "supplier_fare_only",
  },
});
async function setup(t) {
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(
    await readFile(new URL("../flightlounge/sql/offer-store.sql", import.meta.url), "utf8"),
  );
  await pg.query(
    "INSERT INTO flightlounge_private.offer_quotas VALUES ($1,$2,10),($1,$3,5),($1,$4,5)",
    [tenantId, "*", "alice", "bob"],
  );
  const db = {
    query: (...args) => pg.query(...args),
    transaction: (fn) => pg.transaction((tx) => fn(tx)),
  };
  return { pg, db, store: createPostgresOfferStore({ db }) };
}
test("a second gateway store resolves the same private reference with a 30-minute ceiling", async (t) => {
  const { db, store } = await setup(t);
  const ref = await store.put(alice, snapshot());
  const other = createPostgresOfferStore({ db });
  const record = await other.get(alice, ref);
  assert.equal(record.actorId, "alice");
  assert.equal(record.offerRef, ref);
  assert.equal(record.offer.amount, 100);
  assert.equal(Date.parse(record.expiresAt) - Date.parse(record.storedAt), 1800000);
  assert.equal(await other.get(bob, ref), null);
  assert.equal(await other.get({ ...alice, tenantId: "other" }, ref), null);
  assert.equal(await other.remove(bob, ref), false);
  assert.equal(await other.remove(alice, ref), true);
  assert.equal(await store.get(alice, ref), null);
});
test("supplier expiry is the earlier storage boundary", async (t) => {
  const { store } = await setup(t),
    value = snapshot();
  value.offer.expiresAt = new Date(Date.now() + 60000).toISOString();
  const ref = await store.put(alice, value);
  assert.equal((await store.get(alice, ref)).expiresAt, value.offer.expiresAt);
});
test("missing, zero and exhausted tenant/passenger quotas reject writes", async (t) => {
  const { pg, store } = await setup(t);
  await pg.query(
    "UPDATE flightlounge_private.offer_quotas SET max_records=1 WHERE subject='alice'",
  );
  await store.put(alice, snapshot());
  await assert.rejects(store.put(alice, snapshot()), /quota_exceeded/);
  await pg.exec("DELETE FROM flightlounge_private.offer_quotas WHERE subject='bob'");
  await assert.rejects(store.put(bob, snapshot()), /quota_unavailable/);
  await pg.exec("UPDATE flightlounge_private.offer_quotas SET max_records=0 WHERE subject='*'");
  await assert.rejects(store.put(alice, snapshot()), /quota_unavailable/);
});
test("competing store instances cannot exceed the tenant quota", async (t) => {
  const { pg, db, store } = await setup(t);
  await pg.exec("UPDATE flightlounge_private.offer_quotas SET max_records=1 WHERE subject='*'");
  const other = createPostgresOfferStore({ db });
  const results = await Promise.allSettled([
    store.put(alice, snapshot()),
    other.put(bob, snapshot()),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await pg.query("SELECT count(*)::integer n FROM flightlounge_private.offers")).rows[0].n,
    1,
  );
});
test("expired rows are unreadable, count towards quotas, and are pruned in bounded batches", async (t) => {
  const { pg, store } = await setup(t);
  const refs = await Promise.all([
    store.put(alice, snapshot()),
    store.put(alice, snapshot()),
    store.put(bob, snapshot()),
  ]);
  await pg.exec(
    "UPDATE flightlounge_private.offers SET stored_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' WHERE actor_id='alice'; UPDATE flightlounge_private.offer_quotas SET max_records=2 WHERE subject='alice'",
  );
  assert.equal(await store.get(alice, refs[0]), null);
  await assert.rejects(store.put(alice, snapshot()), /quota_exceeded/);
  assert.deepEqual(await store.purgeExpired({ tenantId, limit: 1 }), { deleted: 1 });
  assert.deepEqual(await store.purgeExpired({ tenantId, limit: 1 }), { deleted: 1 });
  assert.ok(await store.get(bob, refs[2]));
  assert.deepEqual(await store.purgeExpired({ tenantId }), { deleted: 0 });
  assert.ok(await store.put(alice, snapshot()));
});
test("cancelled insert rolls back and pre-cancelled calls never write", async (t) => {
  const { pg, db } = await setup(t);
  const controller = new AbortController();
  const guarded = {
    query: db.query,
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          query: async (...args) => {
            const result = await tx.query(...args);
            if (args[0].includes("INSERT INTO")) controller.abort();
            return result;
          },
        }),
      ),
  };
  const store = createPostgresOfferStore({ db: guarded });
  await assert.rejects(store.put(alice, snapshot(), { signal: controller.signal }), /cancelled/);
  assert.equal(
    (await pg.query("SELECT count(*)::integer n FROM flightlounge_private.offers")).rows[0].n,
    0,
  );
  await assert.rejects(store.put(alice, snapshot(), { signal: controller.signal }), /cancelled/);
});
test("invalid scope, expired/malformed offers and oversized snapshots are refused", async (t) => {
  const { store } = await setup(t);
  await assert.rejects(store.put({ ...alice, actorId: "*" }, snapshot()), /scope/);
  for (const modify of [
    (v) => (v.offer.expiresAt = "2020-01-01"),
    (v) => (v.offer.bookable = true),
    (v) => (v.query.extra = "unsupported"),
    (v) => (v.offer.extra = "x".repeat(128001)),
  ]) {
    const value = snapshot();
    modify(value);
    await assert.rejects(store.put(alice, value));
  }
  assert.equal(await store.get(alice, "../../other"), null);
  assert.equal(await store.remove(alice, "bad"), false);
  await assert.rejects(store.purgeExpired({ tenantId, limit: 1001 }));
  await assert.rejects(store.purgeExpired({ tenantId: "other" }));
});
test("private schema and RLS block browser roles even after accidental table SELECT grants", async (t) => {
  const { pg, store } = await setup(t);
  await store.put(alice, snapshot());
  await pg.exec("CREATE ROLE passenger_role; SET ROLE passenger_role");
  await assert.rejects(pg.query("SELECT * FROM flightlounge_private.offers"), /permission denied/);
  await pg.exec("RESET ROLE");
  await pg.exec(
    "GRANT USAGE ON SCHEMA flightlounge_private TO passenger_role; GRANT SELECT ON flightlounge_private.offers TO passenger_role; SET ROLE passenger_role",
  );
  assert.deepEqual((await pg.query("SELECT * FROM flightlounge_private.offers")).rows, []);
  await pg.exec("RESET ROLE");
});
test("session cleans up partial writes when an offer batch exceeds storage quota", async (t) => {
  const { pg, store } = await setup(t);
  await pg.exec("UPDATE flightlounge_private.offer_quotas SET max_records=1 WHERE subject='alice'");
  const session = createTravellerFlightSession({
    offerStore: store,
    authorize: async (c) => ({ allowed: true, ...c }),
    searchService: {
      search: async () => ({ status: "live", offers: [snapshot().offer, snapshot().offer] }),
    },
  });
  const result = await session.search(alice, query());
  assert.equal(result.status, "unavailable");
  assert.equal(
    (await pg.query("SELECT count(*)::integer n FROM flightlounge_private.offers")).rows[0].n,
    0,
  );
});
