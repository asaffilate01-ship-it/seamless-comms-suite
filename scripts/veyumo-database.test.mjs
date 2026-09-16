import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const { PGlite } = await import(process.env.VEYUMO_PGLITE_MODULE || "@electric-sql/pglite");
const migration =
  process.env.VEYUMO_MIGRATION ||
  fileURLToPath(
    new URL("../supabase/migrations/20260912090000_veyumo_control_plane.sql", import.meta.url),
  );
const db = new PGlite();
await db.exec("create role anon;create role authenticated;create role service_role;");
await db.exec(await readFile(migration, "utf8"));
const create = async (source, subject, email = "owner@example.test", market = "GB") =>
  (
    await db.query("select veyumo_create_account($1,$2,$3,$4) as id", [
      source,
      subject,
      email,
      market,
    ])
  ).rows[0].id;
const claim = async (hash, source, subject, market = "GB") =>
  db.query("select veyumo_claim_token($1,'link',$2,$3,'owner@example.test',$4)", [
    hash,
    source,
    subject,
    market,
  ]);
const token = async (hash, account, expires = "now()+interval '10 minutes'") =>
  db.query(
    `insert into veyumo_link_tokens(token_hash,account_id,kind,created_by,expires_at)values($1,$2,'link','test',${expires})`,
    [hash, account],
  );
test("control-plane security and lifecycle", async (t) => {
  await t.test(
    "local roles cannot read service-only accounts or invoke privileged linking",
    async () => {
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`set role ${role}`);
        await assert.rejects(() => db.query("select * from veyumo_accounts"), /permission denied/);
        await assert.rejects(() => create("craftvaro", "forged"), /permission denied/);
        await db.exec("reset role");
      }
    },
  );
  const a = await create("craftvaro", "alice");
  const b = await create("craftvaro", "bob");
  await t.test("idempotent account creation and no accidental email linking", async () => {
    assert.equal(await create("craftvaro", "alice"), a);
    assert.notEqual(b, a);
  });
  await t.test("one-time token links an authenticated workspace exactly once", async () => {
    await token("good", a);
    await claim("good", "haccora", "org-a");
    const r = await db.query(
      "select account_id from veyumo_account_links where source='haccora' and subject='org-a'",
    );
    assert.equal(r.rows[0].account_id, a);
    await assert.rejects(() => claim("good", "omniqora", "intruder"), /invalid_or_expired_token/);
  });
  await t.test(
    "expired, wrong-market and existing-account claims rejected without consuming valid token",
    async () => {
      await token("expired", a, "now()-interval '1 second'");
      await assert.rejects(() => claim("expired", "omniqora", "new"), /invalid_or_expired_token/);
      await token("country", a);
      await assert.rejects(() => claim("country", "omniqora", "new", "DE"), /market_mismatch/);
      await assert.rejects(() => claim("country", "craftvaro", "bob"), /account_already_linked/);
      await claim("country", "omniqora", "new");
    },
  );
  await t.test("durable reservation prevents concurrent provider creation", async () => {
    await db.query("insert into veyumo_provider_provisioning(account_id)values($1)", [a]);
    await assert.rejects(
      () => db.query("insert into veyumo_provider_provisioning(account_id)values($1)", [a]),
      /duplicate key/,
    );
  });
  await t.test("older observations and another account cannot overwrite a line", async () => {
    const save = (account, status, time) =>
      db.query("select veyumo_store_subscription('sub_test',$1,'usr_test',$2,'Test',null,$3)", [
        account,
        status,
        time,
      ]);
    await save(a, "ended", "2026-09-12T10:00:00Z");
    await save(a, "active", "2026-09-12T09:00:00Z");
    await save(b, "active", "2026-09-12T11:00:00Z");
    const r = await db.query(
      "select account_id,status from veyumo_subscriptions where id='sub_test'",
    );
    assert.equal(r.rows[0].status, "ended");
    assert.equal(r.rows[0].account_id, a);
  });
  await t.test("duplicate webhook cannot reset a processed job", async () => {
    await db.query("insert into veyumo_inbox(source,event_id,payload)values('gigs','evt_1','{}')");
    let r = await db.query("select * from veyumo_claim_jobs('inbox',5)");
    assert.equal(r.rows.length, 1);
    r = await db.query("select * from veyumo_claim_jobs('inbox',5)");
    assert.equal(r.rows.length, 0);
    await db.query("update veyumo_inbox set state='done' where event_id='evt_1'");
    await assert.rejects(
      () =>
        db.query("insert into veyumo_inbox(source,event_id,payload)values('gigs','evt_1','{}')"),
      /duplicate key/,
    );
    assert.equal(
      (await db.query("select state from veyumo_inbox where event_id='evt_1'")).rows[0].state,
      "done",
    );
  });
  await t.test("worker reclaims abandoned jobs, but not completed jobs", async () => {
    await db.query(
      "insert into veyumo_outbox(destination,event_id,payload,state,locked_at)values('zoryn_pay','evt_1','{}','processing',now()-interval '6 minutes')",
    );
    const r = await db.query("select * from veyumo_claim_jobs('outbox',5)");
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].veyumo_claim_jobs.attempts, 1);
  });
});
test.after(() => db.close());

