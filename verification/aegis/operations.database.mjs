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
// Reports preserve evidence and require an independent supervisor.
async function report(user,siteId=site.id,tenantId=tenant){return asUser(user,()=>db.query("INSERT INTO aegis_reports(tenant_id,site_id,kind,title,request_id) VALUES($1,$2,'inspection','Weekly inspection',gen_random_uuid()) RETURNING *",[tenantId,siteId]))}
await assert.rejects(()=>report(viewer));
await assert.rejects(()=>report(officer,restricted.id));
await assert.rejects(()=>report(admin,foreignSite.id));
const rpt=(await report(officer)).rows[0];
async function reportMove(user,revision,stage,body='Door inspection complete',checks=[{label:'Door latch',result:'fail',finding:'Repair latch'}],note='Reviewed'){return asUser(user,()=>db.query('UPDATE aegis_reports SET stage=$2,body=$3,checks=$4,review_note=$5,revision=$6 WHERE id=$1 AND revision=$7 RETURNING *',[rpt.id,stage,body,JSON.stringify(checks),note,revision+1,revision]))}
await assert.rejects(()=>reportMove(officer,1,'approved'),/Invalid report transition/);
await assert.rejects(()=>reportMove(officer,1,'submitted','',[]),/Complete report evidence/);
await assert.rejects(()=>reportMove(officer,1,'submitted','x',[{label:'Door',result:'fail',finding:''}]),/Invalid checklist evidence/);
await reportMove(officer,1,'submitted');
await assert.rejects(()=>reportMove(officer,2,'approved'),/Independent supervisor/);
await assert.rejects(()=>reportMove(admin,2,'approved','Altered evidence'),/Review cannot alter/);
await assert.rejects(()=>reportMove(admin,2,'approved',undefined,undefined,''),/Review note required/);
await reportMove(admin,2,'changes_requested');
await reportMove(officer,3,'submitted');
await reportMove(admin,4,'approved');
assert.equal((await reportMove(admin,4,'approved')).rows.length,0);
await assert.rejects(()=>reportMove(officer,5,'draft'),/Invalid report transition/);
const reportHistory=(await asUser(admin,()=>db.query('SELECT * FROM aegis_report_events WHERE report_id=$1 ORDER BY revision',[rpt.id]))).rows;
assert.equal(reportHistory.length,5);assert.equal(reportHistory[4].snapshot.reviewed_by,admin);assert.equal(reportHistory[1].snapshot.checks[0].finding,'Repair latch');
await assert.rejects(()=>asUser(admin,()=>db.query('DELETE FROM aegis_report_events WHERE report_id=$1',[rpt.id])));
const self=(await report(admin)).rows[0];
await asUser(admin,()=>db.query("UPDATE aegis_reports SET body='x',checks='[{\"label\":\"Door\",\"result\":\"pass\",\"finding\":\"\"}]',stage='submitted',revision=2 WHERE id=$1",[self.id]));
await assert.rejects(()=>asUser(admin,()=>db.query("UPDATE aegis_reports SET stage='approved',review_note='Self',revision=3 WHERE id=$1",[self.id])),/Independent supervisor/);
assert.equal((await asUser(stranger,()=>db.query('SELECT * FROM aegis_reports'))).rows.length,0);
// Corrective actions remain linked to immutable approved findings.
async function corrective(user=admin,reportId=rpt.id,index=0,assignee=officer,tenantId=tenant){return asUser(user,()=>db.query("INSERT INTO aegis_corrective_actions(tenant_id,report_id,check_index,assignee_id,due_on,priority,request_id) VALUES($1,$2,$3,$4,'2026-10-25','high',gen_random_uuid()) RETURNING *",[tenantId,reportId,index,assignee]))}
await assert.rejects(()=>corrective(officer));
await assert.rejects(()=>corrective(viewer));
await assert.rejects(()=>corrective(admin,self.id),/approved source report/);
await assert.rejects(()=>corrective(admin,rpt.id,1),/Failed source check/);
await assert.rejects(()=>corrective(admin,rpt.id,0,viewer),/Eligible tenant assignee/);
await assert.rejects(()=>corrective(admin,rpt.id,0,stranger),/Eligible tenant assignee/);
await db.query("INSERT INTO tenant_members(tenant_id,user_id,role) VALUES($1,$2,'agent')",[tenant,stranger]);
await assert.rejects(()=>corrective(admin,rpt.id,0,stranger),/Assignee must have site access/);
await assert.rejects(()=>corrective(admin,rpt.id,0,officer,other));
const action=(await corrective()).rows[0];
await assert.rejects(()=>corrective(),/unique constraint/);
async function actionMove(user,revision,stage,evidence='',note='Verified repair',actionId=action.id){return asUser(user,()=>db.query('UPDATE aegis_corrective_actions SET stage=$2,evidence=$3,review_note=$4,revision=$5 WHERE id=$1 AND revision=$6 RETURNING *',[actionId,stage,evidence,note,revision+1,revision]))}
await assert.rejects(()=>actionMove(officer,1,'closed'),/Invalid corrective transition/);
await assert.rejects(()=>actionMove(admin,1,'in_progress'),/Only assignee/);
await actionMove(officer,1,'in_progress');
await assert.rejects(()=>actionMove(officer,2,'submitted'),/Remediation evidence/);
await db.query("UPDATE tenant_members SET role='viewer' WHERE tenant_id=$1 AND user_id=$2",[tenant,officer]);
await assert.rejects(()=>actionMove(officer,2,'submitted','Repair reference R1'),/Corrective action role/);
await db.query("UPDATE tenant_members SET role='agent' WHERE tenant_id=$1 AND user_id=$2",[tenant,officer]);
await actionMove(officer,2,'submitted','Repair reference R1');
await assert.rejects(()=>actionMove(officer,3,'closed','Repair reference R1'),/Independent supervisor/);
await assert.rejects(()=>actionMove(admin,3,'closed','Different evidence'),/Review cannot alter/);
await assert.rejects(()=>actionMove(admin,3,'closed','Repair reference R1',''),/Review note required/);
await actionMove(admin,3,'in_progress','Repair reference R1','Please confirm latch test');
await actionMove(officer,4,'submitted','Repair reference R1; latch tested');
await actionMove(admin,5,'closed','Repair reference R1; latch tested');
assert.equal((await actionMove(admin,5,'closed','Repair reference R1; latch tested')).rows.length,0);
await assert.rejects(()=>actionMove(officer,6,'in_progress'),/Invalid corrective transition/);
await assert.rejects(()=>asUser(admin,()=>db.query("UPDATE aegis_corrective_actions SET assignee_id=$2,revision=7 WHERE id=$1",[action.id,admin])),/identity is immutable/);
const correctionTrail=(await asUser(admin,()=>db.query('SELECT * FROM aegis_corrective_events WHERE action_id=$1 ORDER BY revision',[action.id]))).rows;
assert.equal(correctionTrail.length,6);assert.equal(correctionTrail[2].snapshot.evidence,'Repair reference R1');assert.equal(correctionTrail[5].snapshot.reviewed_by,admin);
assert.equal((await asUser(stranger,()=>db.query('SELECT * FROM aegis_corrective_actions'))).rows.length,0);
await assert.rejects(()=>asUser(admin,()=>db.query('DELETE FROM aegis_corrective_events WHERE action_id=$1',[action.id])));
await assert.rejects(()=>asUser(admin,()=>db.query("INSERT INTO aegis_corrective_events(tenant_id,action_id,actor,revision,snapshot) VALUES($1,$2,$3,99,'{}')",[tenant,action.id,admin])));
await assert.rejects(()=>asUser(admin,()=>db.query('DELETE FROM aegis_corrective_actions WHERE id=$1',[action.id])));
// Even a supervisor assigned the work cannot verify their own completion.
const adminWork=(await report(officer)).rows[0];
await asUser(officer,()=>db.query("UPDATE aegis_reports SET body='Work required',checks=$2,stage='submitted',revision=2 WHERE id=$1",[adminWork.id,JSON.stringify([{label:'Alarm panel reference',result:'fail',finding:'Specialist review required'}])]));
await asUser(admin,()=>db.query("UPDATE aegis_reports SET stage='approved',review_note='Accepted',revision=3 WHERE id=$1",[adminWork.id]));
const adminAction=(await corrective(admin,adminWork.id,0,admin)).rows[0];
await actionMove(admin,1,'in_progress','',undefined,adminAction.id);
await actionMove(admin,2,'submitted','Specialist work reference',undefined,adminAction.id);
await assert.rejects(()=>actionMove(admin,3,'closed','Specialist work reference','Self verified',adminAction.id),/Independent supervisor/);
await db.query("UPDATE tenant_members SET role='admin' WHERE tenant_id=$1 AND user_id=$2",[tenant,stranger]);
await actionMove(stranger,3,'closed','Specialist work reference','Independently reviewed',adminAction.id);
const restrictedReport=(await report(admin,restricted.id)).rows[0];
await asUser(admin,()=>db.query("UPDATE aegis_reports SET body='Restricted check',checks=$2,stage='submitted',revision=2 WHERE id=$1",[restrictedReport.id,JSON.stringify([{label:'Reference check',result:'fail',finding:'Review reference'}])]));
await asUser(stranger,()=>db.query("UPDATE aegis_reports SET stage='approved',review_note='Accepted',revision=3 WHERE id=$1",[restrictedReport.id]));
await assert.rejects(()=>corrective(admin,restrictedReport.id,0,officer),/Assignee must have site access/);
await db.query('DELETE FROM tenant_members WHERE tenant_id=$1 AND user_id=$2',[tenant,stranger]);
// Shift handover receipt is exclusive to the named incoming member.
async function handover(user=officer,receiver=admin,siteId=site.id,tenantId=tenant){return asUser(user,()=>db.query("INSERT INTO aegis_handovers(tenant_id,site_id,incoming_id,summary,outstanding,request_id) VALUES($1,$2,$3,'Evening handover','Incident reference: door defect',gen_random_uuid()) RETURNING *",[tenantId,siteId,receiver]))}
await assert.rejects(()=>handover(viewer));
await assert.rejects(()=>handover(officer,viewer),/Eligible incoming/);
await assert.rejects(()=>handover(officer,stranger),/Eligible incoming/);
await assert.rejects(()=>handover(officer,officer));
await assert.rejects(()=>handover(officer,admin,restricted.id));
await assert.rejects(()=>handover(admin,officer,foreignSite.id));
const ho=(await handover()).rows[0];
async function handoverMove(user,rev,stage,summary='Evening handover',response='Received and read'){return asUser(user,()=>db.query('UPDATE aegis_handovers SET stage=$2,summary=$3,response=$4,revision=$5 WHERE id=$1 AND revision=$6 RETURNING *',[ho.id,stage,summary,response,rev+1,rev]))}
await assert.rejects(()=>handoverMove(officer,1,'acknowledged'),/Invalid handover transition/);
await assert.rejects(()=>handoverMove(admin,1,'offered'),/Only outgoing/);
await handoverMove(officer,1,'offered');
await assert.rejects(()=>handoverMove(officer,2,'acknowledged'),/Only incoming/);
await assert.rejects(()=>handoverMove(admin,2,'acknowledged','Changed evidence'),/cannot alter offered/);
await assert.rejects(()=>handoverMove(admin,2,'acknowledged',undefined,''),/note required/);
await handoverMove(admin,2,'returned');
await handoverMove(officer,3,'offered');
await handoverMove(admin,4,'acknowledged');
assert.equal((await handoverMove(admin,4,'acknowledged')).rows.length,0);
await assert.rejects(()=>handoverMove(officer,5,'draft'),/Invalid handover transition/);
await assert.rejects(()=>asUser(officer,()=>db.query('UPDATE aegis_handovers SET incoming_id=$2,revision=6 WHERE id=$1',[ho.id,viewer])),/identity is immutable/);
const handoverTrail=(await asUser(admin,()=>db.query('SELECT * FROM aegis_handover_events WHERE handover_id=$1 ORDER BY revision',[ho.id]))).rows;
assert.equal(handoverTrail.length,5);assert.equal(handoverTrail[4].actor,admin);assert.equal(handoverTrail[1].snapshot.outstanding,'Incident reference: door defect');
await assert.rejects(()=>asUser(admin,()=>db.query('DELETE FROM aegis_handover_events WHERE handover_id=$1',[ho.id])));
await assert.rejects(()=>asUser(admin,()=>db.query('DELETE FROM aegis_handovers WHERE id=$1',[ho.id])));
await assert.rejects(()=>asUser(admin,()=>db.query("INSERT INTO aegis_handover_events(tenant_id,handover_id,actor,revision,snapshot) VALUES($1,$2,$3,99,'{}')",[tenant,ho.id,officer])));
// A named recipient without site access cannot read or acknowledge a handover.
await db.query("INSERT INTO tenant_members(tenant_id,user_id,role) VALUES($1,$2,'agent')",[tenant,stranger]);
const inaccessible=(await handover(admin,stranger)).rows[0];
assert.equal((await asUser(stranger,()=>db.query('SELECT * FROM aegis_handovers WHERE id=$1',[inaccessible.id]))).rows.length,0);
assert.equal((await asUser(stranger,()=>db.query("UPDATE aegis_handovers SET stage='acknowledged',response='x',revision=2 WHERE id=$1 RETURNING *",[inaccessible.id]))).rows.length,0);
await db.query("UPDATE tenant_products SET status='suspended' WHERE tenant_id=$1 AND product_key='aegis-command'",[tenant]);
assert.equal((await asUser(admin,()=>db.query('SELECT * FROM aegis_operations WHERE tenant_id=$1',[tenant]))).rows.length,0);
await assert.rejects(()=>add(admin,'site','static-guarding','Suspended'));
await assert.rejects(()=>field(officer,'welfare_check'));
assert.equal((await asUser(officer,()=>db.query('SELECT * FROM aegis_field_events'))).rows.length,0);
assert.equal((await asUser(officer,()=>db.query('SELECT * FROM aegis_resources'))).rows.length,0);
assert.equal((await move(officer,key.id,3,'issued',officer)).rows.length,0);
assert.equal((await asUser(officer,()=>db.query('SELECT * FROM aegis_reports'))).rows.length,0);
assert.equal((await asUser(officer,()=>db.query('SELECT * FROM aegis_corrective_actions'))).rows.length,0);
assert.equal((await asUser(admin,()=>db.query('SELECT * FROM aegis_corrective_events WHERE tenant_id=$1',[tenant]))).rows.length,0);
assert.equal((await asUser(officer,()=>db.query('SELECT * FROM aegis_handovers'))).rows.length,0);
assert.equal((await asUser(admin,()=>db.query('SELECT * FROM aegis_handover_events WHERE tenant_id=$1',[tenant]))).rows.length,0);
console.log('Aegis handovers, corrective actions, reports and full-chain database checks passed: restricted areas, assignments, cross-tenant denial, viewer denial, immutable audit, transitions, stale revisions, revocation, visitors, asset custody and cross-agency references.');
await db.close();
