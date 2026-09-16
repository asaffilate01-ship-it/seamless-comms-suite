import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PACKS } from "../../src/modules/procurement/catalog.ts";
const db = new PGlite();
let checks = 0;
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE PUBLICATION supabase_realtime;`);
const dir = new URL("../../supabase/migrations/", import.meta.url);
for (const name of (await readdir(dir)).filter((n) => n.endsWith(".sql")).sort()) {
  if (name.startsWith("20260816120554"))
    for (const id of [
      "18bafcd5-3e4c-4044-bb63-10325a0b7209",
      "e66c0525-1787-4250-be26-79f849624521",
      "890c71b1-cf6e-4b68-a56e-dd6050372481",
      "97319fe5-82fd-44cd-b27d-6ae314ee368b",
    ])
      await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [
        id,
        "fixture@example.invalid",
      ]);
  await db.exec(await readFile(new URL(name, dir), "utf8"));
}
assert.deepEqual(
  (await db.query("SELECT * FROM public.procurement_packs ORDER BY id")).rows.map((p) => ({
    ...p,
    source_checked_on: new Date(p.source_checked_on).toISOString().slice(0, 10),
  })),
  [...PACKS].sort((a, b) => a.id.localeCompare(b.id)),
);
checks++;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  E = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  R = "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  V = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
for (const id of [A, B, E, R, V])
  await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [id, "fixture@example.invalid"]);
async function as(user, fn) {
  await db.exec("BEGIN; SET LOCAL ROLE authenticated;");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
  try {
    const value = await fn();
    await db.exec("COMMIT");
    return value;
  } catch (e) {
    await db.exec("ROLLBACK");
    throw e;
  }
}
const tenant = (
  await as(A, () => db.query("SELECT public.create_my_tenant('Supplier','supplier') t"))
).rows[0].t.id;
await db.query(
  "INSERT INTO public.addon_entitlements VALUES($1,'rrci','active',now()+interval '10 days','fixture',now())",
  [tenant],
);
const ws = (
  await as(A, () =>
    db.query("SELECT public.create_rrci_workspace($1,'Readiness','pilot') id", [tenant]),
  )
).rows[0].id;
for (const [user, role] of [
  [E, "editor"],
  [R, "reviewer"],
  [V, "reader"],
]) {
  await db.query(
    "INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES($1,$2,'viewer')",
    [tenant, user],
  );
  await db.query("INSERT INTO public.rrci_members VALUES($1,$2,$3)", [ws, user, role]);
}
const create = () =>
  db.query(
    "SELECT public.create_procurement_assessment($1,'aramco-ccc-plus','CCC+ readiness','Supplier Ltd','Managed IT services in specified sites','Aramco','UK') id",
    [ws],
  );
for (const user of [B, R, V]) {
  await assert.rejects(() => as(user, create));
  checks++;
}
const assessment = (await as(E, create)).rows[0].id;
let items = (
  await as(A, () =>
    db.query("SELECT * FROM public.procurement_requirements WHERE assessment_id=$1", [assessment]),
  )
).rows;
assert.equal(items.length, 16);
checks++;
const certificate = items.find((i) => i.template.key === "aramco-ccc-plus-15");
const general = items.find((i) => i.template.key === "aramco-ccc-plus-11");
const save = (id, version, changes) =>
  db.query("SELECT public.save_procurement_requirement($1,$2,$3)", [id, version, changes]);
const review = (
  id,
  version,
  decision = "reviewed",
  reason = "Evidence checked for the agreed scope",
) =>
  db.query("SELECT public.review_procurement_requirement($1,$2,$3,$4)", [
    id,
    version,
    decision,
    reason,
  ]);
const evidence = {
  status: "evidence_ready",
  owner_name: "Owner",
  due_date: "2030-01-01",
  evidence_title: "Issued record",
  evidence_url: "https://vault.example/record",
  issuer: "Authorised assessor",
  reference: "TEST-ONLY",
  valid_until: "2030-01-01",
  notes: "Fixture",
};
await as(B, async () => {
  assert.equal((await db.query("SELECT * FROM public.procurement_assessments")).rows.length, 0);
  assert.equal((await db.query("SELECT * FROM public.procurement_requirements")).rows.length, 0);
  assert.equal((await db.query("SELECT * FROM public.procurement_audit")).rows.length, 0);
});
checks++;
for (const user of [B, R, V]) {
  await assert.rejects(() => as(user, () => save(certificate.id, 1, evidence)));
  checks++;
}
await assert.rejects(
  () =>
    as(E, () =>
      db.query("UPDATE public.procurement_requirements SET status='reviewed' WHERE id=$1", [
        certificate.id,
      ]),
    ),
  (e) => e.code === "42501",
);
checks++;
await assert.rejects(() =>
  as(E, () => save(certificate.id, 1, { ...evidence, status: "reviewed" })),
);
checks++;
await assert.rejects(() => as(R, () => review(certificate.id, 1, "not_applicable")));
checks++;
await assert.rejects(() => as(R, () => review(certificate.id, 1)));
checks++;
await as(E, () => save(certificate.id, 1, { ...evidence, valid_until: null }));
await assert.rejects(() => as(R, () => review(certificate.id, 2)));
checks++;
await as(E, () => save(certificate.id, 2, { ...evidence, issuer: "" }));
await assert.rejects(() => as(R, () => review(certificate.id, 3)));
checks++;
await as(E, () => save(certificate.id, 3, { ...evidence, valid_until: "2000-01-01" }));
await assert.rejects(() => as(R, () => review(certificate.id, 4)));
checks++;
await as(E, () => save(certificate.id, 4, evidence));
await assert.rejects(() => as(E, () => review(certificate.id, 5)));
checks++;
await as(R, () => review(certificate.id, 5));
let row = (
  await as(A, () =>
    db.query("SELECT * FROM public.procurement_requirements WHERE id=$1", [certificate.id]),
  )
).rows[0];
assert.equal(row.status, "reviewed");
assert.equal(row.reviewed_by, R);
checks++;
await assert.rejects(() => as(E, () => save(certificate.id, 5, evidence)));
checks++;
await assert.rejects(() => as(E, () => save(certificate.id, null, evidence)));
checks++;
await as(E, () => save(certificate.id, 6, { ...evidence, notes: "Evidence replaced" }));
row = (
  await as(A, () =>
    db.query("SELECT * FROM public.procurement_requirements WHERE id=$1", [certificate.id]),
  )
).rows[0];
assert.equal(row.status, "evidence_ready");
assert.equal(row.reviewed_by, null);
checks++;
await assert.rejects(() => as(R, () => review(general.id, 1, "not_applicable", "too short")));
checks++;
await as(R, () =>
  review(
    general.id,
    1,
    "not_applicable",
    "Documented scope exclusion for this optional planning prompt",
  ),
);
checks++;
const template = {
  title: "TPC1.12 applicability",
  kind: "readiness",
  applies_when: "Within the confirmed service boundary",
  guidance: "Demonstrate implementation",
  evidence: "Secure dated record",
  source_url: "https://www.aramco.com/",
};
await as(E, () =>
  db.query("SELECT public.add_procurement_requirement($1,$2)", [assessment, template]),
);
checks++;
await assert.rejects(() =>
  as(E, () =>
    db.query("SELECT public.add_procurement_requirement($1,$2)", [
      assessment,
      { ...template, source_url: "javascript:alert(1)" },
    ]),
  ),
);
checks++;
await assert.rejects(() =>
  as(B, () => db.query("SELECT public.add_procurement_requirement($1,$2)", [assessment, template])),
);
checks++;
await as(V, () => db.query("SELECT public.record_procurement_export($1)", [assessment]));
checks++;
await assert.rejects(() =>
  as(B, () => db.query("SELECT public.record_procurement_export($1)", [assessment])),
);
checks++;
await as(E, async () =>
  assert.equal((await db.query("SELECT * FROM public.procurement_audit")).rows.length, 0),
);
checks++;
await as(R, async () =>
  assert((await db.query("SELECT * FROM public.procurement_audit")).rows.length > 0),
);
checks++;
await assert.rejects(
  () => as(A, () => db.query("UPDATE public.procurement_audit SET action='tampered'")),
  (e) => e.code === "42501",
);
checks++;
await db.query("UPDATE public.addon_entitlements SET status='suspended' WHERE tenant_id=$1", [
  tenant,
]);
await as(A, async () =>
  assert.equal((await db.query("SELECT * FROM public.procurement_requirements")).rows.length, 0),
);
checks++;
await assert.rejects(() => as(E, () => save(certificate.id, 7, evidence)));
checks++;
await db.query(
  "UPDATE public.addon_entitlements SET status='active',valid_until=now()-interval '1 day' WHERE tenant_id=$1",
  [tenant],
);
await assert.rejects(() => as(R, () => review(certificate.id, 7)));
checks++;
await db.query(
  "UPDATE public.addon_entitlements SET valid_until=now()+interval '1 day' WHERE tenant_id=$1",
  [tenant],
);
await db.query("DELETE FROM public.tenant_members WHERE tenant_id=$1 AND user_id=$2", [tenant, E]);
await assert.rejects(() => as(E, () => save(certificate.id, 7, evidence)));
checks++;
await db.close();
console.log(
  `${checks} procurement database checks passed, including CCC+ gates, cross-tenant isolation, roles, revocation, audit and stale edits.`,
);
