import assert from "node:assert/strict";
import {seedIsolatedDishbeeTestTenants} from "../control-plane/dishbee-fixture.mjs";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migrations = new URL("../../supabase/migrations/", import.meta.url);

await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE PUBLICATION supabase_realtime;`);

for (const name of (await readdir(migrations)).filter((x) => x.endsWith(".sql")).sort()) {
  const sql = await readFile(new URL(name, migrations), "utf8");
  if (name.startsWith("20260816120554")) {
    for (const id of [
      "18bafcd5-3e4c-4044-bb63-10325a0b7209",
      "e66c0525-1787-4250-be26-79f849624521",
      "890c71b1-cf6e-4b68-a56e-dd6050372481",
      "97319fe5-82fd-44cd-b27d-6ae314ee368b",
    ]) {
      await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [id, "fixture@example.invalid"]);
    }
  }
  await db.exec(sql);
}

const admin = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const stranger = "ffffffff-ffff-4fff-8fff-ffffffffffff";
for (const id of [admin, stranger]) {
  await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [id, id + "@example.invalid"]);
}
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)", [admin]);

async function asUser(user, fn) {
  await db.exec("BEGIN; SET LOCAL ROLE authenticated;");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
  try { const value=await fn(); await db.exec("COMMIT"); return value; }
  catch (error) { await db.exec("ROLLBACK"); throw error; }
}

const pilot = await seedIsolatedDishbeeTestTenants(db,admin);
const luton = pilot.tenants.find((row) => row.tenantSlug === "cafe1-luton");
assert(luton?.tenantId);

const tenant=luton.tenantId,other=pilot.tenants.find(x=>x.tenantId!==tenant).tenantId;
const officer='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',viewer='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
for(const id of [officer,viewer])await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id,'test@invalid.example']);
await db.query("INSERT INTO tenant_members(tenant_id,user_id,role) VALUES($1,$2,'owner') ON CONFLICT DO NOTHING",[tenant,admin]);
await db.query("INSERT INTO tenant_members(tenant_id,user_id,role) VALUES($1,$2,'agent'),($1,$3,'viewer')",[tenant,officer,viewer]);
await db.query("INSERT INTO tenant_products(tenant_id,product_key,status) VALUES($1,'aegis-command','active')",[tenant]);
async function add(user,kind,area,title,parent=null,assigned=null,tenantId=tenant){return asUser(user,()=>db.query('INSERT INTO aegis_operations(tenant_id,kind,area,title,status,parent_id,assigned_user_id,request_id) VALUES($1,$2,$3,$4,$5,$6,$7,gen_random_uuid()) RETURNING *',[tenantId,kind,area,title,kind==='incident'?'open':'draft',parent,assigned]))}
const site=(await add(admin,'site','static-guarding','Site A',null,officer)).rows[0];
const restricted=(await add(admin,'site','close-protection','Restricted reference')).rows[0];
assert.equal((await asUser(officer,()=>db.query('SELECT * FROM aegis_operations'))).rows.length,1);
assert.equal((await asUser(viewer,()=>db.query('SELECT * FROM aegis_operations'))).rows.length,0);
await assert.rejects(()=>add(officer,'site','static-guarding','Forbidden'));
await assert.rejects(()=>add(viewer,'incident','static-guarding','Forbidden',site.id));
await assert.rejects(()=>add(officer,'incident','close-protection','Forbidden',restricted.id));
await assert.rejects(()=>add(admin,'incident','static-guarding','Cross tenant',site.id,null,other));
const incident=(await add(officer,'incident','static-guarding','Door defect',site.id)).rows[0];
assert.equal((await asUser(officer,()=>db.query('SELECT * FROM aegis_operation_events'))).rows.length,2);
await assert.rejects(()=>asUser(officer,()=>db.query("INSERT INTO aegis_operation_events(tenant_id,operation_id,actor,action,revision) VALUES($1,$2,$3,'forged',1)",[tenant,incident.id,officer])));
assert.equal((await asUser(officer,()=>db.query("UPDATE aegis_operations SET status='resolved',revision=2 WHERE id=$1 RETURNING *",[incident.id]))).rows.length,0);
await assert.rejects(()=>asUser(admin,()=>db.query("UPDATE aegis_operations SET status='resolved',revision=2 WHERE id=$1",[incident.id])));
await asUser(admin,()=>db.query("UPDATE aegis_operations SET status='review',revision=2 WHERE id=$1",[incident.id]));
await assert.rejects(()=>asUser(admin,()=>db.query("UPDATE aegis_operations SET status='resolved',revision=2 WHERE id=$1",[incident.id])));
await assert.rejects(()=>asUser(admin,()=>db.query("UPDATE aegis_operations SET tenant_id=$2,revision=3 WHERE id=$1",[incident.id,other])));
const engagement=(await add(admin,'engagement','static-guarding','Patrol shift',site.id,officer)).rows[0];
await asUser(admin,()=>db.query("UPDATE aegis_operations SET status='scheduled',revision=2 WHERE id=$1",[engagement.id]));
await asUser(admin,()=>db.query("UPDATE aegis_operations SET status='active',revision=3 WHERE id=$1",[engagement.id]));
const checkpoint=(await asUser(admin,()=>db.query("INSERT INTO aegis_checkpoints(tenant_id,site_id,label) VALUES($1,$2,'Front entrance') RETURNING *",[tenant,site.id]))).rows[0];
async function field(user,kind,cp=null,op=engagement.id){return asUser(user,()=>db.query("INSERT INTO aegis_field_events(tenant_id,operation_id,kind,checkpoint_id,request_id,recorded_at) VALUES($1,$2,$3,$4,gen_random_uuid(),'1990-01-01') RETURNING *",[tenant,op,kind,cp]))}
await assert.rejects(()=>field(officer,'attendance_out'));
const start=(await field(officer,'attendance_in')).rows[0];
assert.equal(start.actor,officer);assert.equal(start.evidence_class,'operator_reported');assert.ok(Date.parse(start.recorded_at)>Date.now()-60000);
await assert.rejects(()=>field(officer,'attendance_in'));
await field(officer,'checkpoint_observation',checkpoint.id);
await field(officer,'welfare_check');
await asUser(admin,()=>db.query("UPDATE aegis_checkpoints SET status='disabled' WHERE id=$1",[checkpoint.id]));
await assert.rejects(()=>field(officer,'checkpoint_observation',checkpoint.id),/Active checkpoint/);
await field(officer,'attendance_out');
await assert.rejects(()=>field(officer,'welfare_check'),/Open attendance/);
await assert.rejects(()=>field(viewer,'attendance_in'));
await assert.rejects(()=>field(stranger,'welfare_check'));
await assert.rejects(()=>field(officer,'checkpoint_observation',null));
await assert.rejects(()=>asUser(officer,()=>db.query("UPDATE aegis_field_events SET note='Changed' WHERE id=$1",[start.id])));
await asUser(admin,()=>db.query("UPDATE aegis_checkpoints SET status='disabled' WHERE id=$1",[checkpoint.id]));
await assert.rejects(()=>field(officer,'checkpoint_observation',checkpoint.id));
// Phase 4 access and custody controls on the same isolated tenant/site.
await asUser(admin,()=>db.query("UPDATE aegis_operations SET status='active',revision=2 WHERE id=$1",[site.id]));
async function resource(kind,label,siteId=site.id){return asUser(admin,()=>db.query("INSERT INTO aegis_resources(tenant_id,site_id,kind,label,host_ref,stage,request_id) VALUES($1,$2,$3,$4,$5,$6,gen_random_uuid()) RETURNING *",[tenant,siteId,kind,label,kind==='visitor'?'Host-A':'',kind==='visitor'?'expected':'available']))}
async function move(user,id,revision,stage,custodian=null,note='Reviewed handover'){return asUser(user,()=>db.query("UPDATE aegis_resources SET stage=$3,custodian_id=$4,note=$5,revision=revision+1 WHERE id=$1 AND revision=$2 RETURNING *",[id,revision,stage,custodian,note]))}
const visitor=(await resource('visitor','Visit-001')).rows[0];
const key=(await resource('key','Key set A')).rows[0];
assert.equal((await asUser(viewer,()=>db.query('SELECT * FROM aegis_resources'))).rows.length,0);
await assert.rejects(()=>move(officer,visitor.id,1,'approved'),/Supervisor approval/);
await assert.rejects(()=>move(officer,visitor.id,1,'cancelled'),/Supervisor approval/);
await assert.rejects(()=>move(officer,visitor.id,1,'onsite'),/Invalid resource transition/);
await move(admin,visitor.id,1,'approved');
await move(officer,visitor.id,2,'onsite');
await move(officer,visitor.id,3,'departed');
await assert.rejects(()=>move(admin,visitor.id,4,'onsite'),/Invalid resource transition/);
await assert.rejects(()=>move(officer,key.id,1,'issued'),/Custodian required/);
await assert.rejects(()=>move(officer,key.id,1,'issued',stranger));
await move(officer,key.id,1,'issued',officer);
assert.equal((await move(officer,key.id,1,'returned')).rows.length,0);
await assert.rejects(()=>move(officer,key.id,2,'lost',officer),/Supervisor review/);
await assert.rejects(()=>move(officer,key.id,2,'returned',null,''),/note required/);
await move(officer,key.id,2,'returned');
const trail=(await asUser(admin,()=>db.query('SELECT * FROM aegis_resource_events WHERE resource_id=$1 ORDER BY revision',[key.id]))).rows;
assert.equal(trail.length,3);assert.equal(trail[2].previous_custodian_id,officer);assert.equal(trail[2].custodian_id,null);
await assert.rejects(()=>asUser(officer,()=>db.query("UPDATE aegis_resources SET label='Altered',revision=revision+1,stage='issued',custodian_id=$2,note='x' WHERE id=$1",[key.id,officer])),/identity is immutable/);
await assert.rejects(()=>asUser(admin,()=>db.query('DELETE FROM aegis_resource_events WHERE resource_id=$1',[key.id])));
await assert.rejects(()=>asUser(officer,()=>db.query("INSERT INTO aegis_resource_events(tenant_id,resource_id,actor,to_stage,revision) VALUES($1,$2,$3,'issued',99)",[tenant,key.id,officer])));
await asUser(admin,()=>db.query("UPDATE aegis_operations SET status='active',revision=2 WHERE id=$1",[restricted.id]));
await resource('equipment','Restricted equipment',restricted.id);
assert.equal((await asUser(officer,()=>db.query("SELECT * FROM aegis_resources WHERE site_id=$1",[restricted.id]))).rows.length,0);
await db.query("INSERT INTO tenant_members(tenant_id,user_id,role) VALUES($1,$2,'owner') ON CONFLICT DO NOTHING",[other,admin]);
await db.query("INSERT INTO tenant_products(tenant_id,product_key,status) VALUES($1,'aegis-command','active') ON CONFLICT(tenant_id,product_key) DO UPDATE SET status='active'",[other]);
const foreignSite=(await add(admin,'site','static-guarding','Other agency site',null,null,other)).rows[0];
await asUser(admin,()=>db.query("UPDATE aegis_operations SET status='active',revision=2 WHERE id=$1",[foreignSite.id]));
await assert.rejects(()=>resource('equipment','Foreign site',foreignSite.id));
assert.equal((await asUser(officer,()=>db.query('SELECT * FROM aegis_resources WHERE tenant_id=$1',[other]))).rows.length,0);
await db.query("UPDATE tenant_products SET status='suspended' WHERE tenant_id=$1 AND product_key='aegis-command'",[tenant]);
assert.equal((await asUser(admin,()=>db.query('SELECT * FROM aegis_operations WHERE tenant_id=$1',[tenant]))).rows.length,0);
await assert.rejects(()=>add(admin,'site','static-guarding','Suspended'));
await assert.rejects(()=>field(officer,'welfare_check'));
assert.equal((await asUser(officer,()=>db.query('SELECT * FROM aegis_field_events'))).rows.length,0);
assert.equal((await asUser(officer,()=>db.query('SELECT * FROM aegis_resources'))).rows.length,0);
assert.equal((await move(officer,key.id,3,'issued',officer)).rows.length,0);
console.log('Aegis full-chain database checks passed: restricted areas, assignments, cross-tenant denial, viewer denial, immutable audit, transitions, stale revisions, revocation, visitors, asset custody and cross-agency references.');
await db.close();
