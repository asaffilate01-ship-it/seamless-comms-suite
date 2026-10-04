import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

const db=new PGlite();const migrations=new URL("../../supabase/migrations/",import.meta.url);
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE PUBLICATION supabase_realtime;`);
for(const name of (await readdir(migrations)).filter(x=>x.endsWith(".sql")).sort()){
 const sql=await readFile(new URL(name,migrations),"utf8");
 if(name.startsWith("20260816120554"))for(const id of ["18bafcd5-3e4c-4044-bb63-10325a0b7209","e66c0525-1787-4250-be26-79f849624521","890c71b1-cf6e-4b68-a56e-dd6050372481","97319fe5-82fd-44cd-b27d-6ae314ee368b"])
  await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,"fixture@example.invalid"]);
 await db.exec(sql);
}
const admin="33333333-aaaa-4aaa-8aaa-333333333333",stranger="22222222-bbbb-4bbb-8bbb-222222222222";
for(const id of[admin,stranger])await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,id+"@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
async function asUser(user,fn){await db.exec("BEGIN;SET LOCAL ROLE authenticated;");await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);try{const v=await fn();await db.exec("COMMIT");return v;}catch(e){await db.exec("ROLLBACK");throw e;}}

const pilot=await asUser(admin,async()=> (await db.query("SELECT public.platform_bootstrap_dishbee_pilot() AS result")).rows[0].result);
const t=pilot.tenants.find(x=>x.tenantSlug==="mealdeck");assert(t?.tenantId);

const institution=(await asUser(admin,()=>db.query(
 "INSERT INTO public.education_institutions(tenant_id,product_key,institution_ref,name,institution_type,status) VALUES($1,'mealdeck','inst-1','Fixture Institute','provider','active') RETURNING id",
 [t.tenantId]))).rows[0].id;
const programme=(await asUser(admin,()=>db.query(
 "INSERT INTO public.education_programmes(tenant_id,product_key,institution_id,programme_ref,name,level,status) VALUES($1,'mealdeck',$2,'prog-1','Fixture Programme','Level 5','active') RETURNING id",
 [t.tenantId,institution]))).rows[0].id;
const cohort=(await asUser(admin,()=>db.query(
 "INSERT INTO public.education_cohorts(tenant_id,product_key,programme_id,cohort_ref,name,status) VALUES($1,'mealdeck',$2,'cohort-1','October Cohort','active') RETURNING id",
 [t.tenantId,programme]))).rows[0].id;
const student=(await asUser(admin,()=>db.query(
 "INSERT INTO public.education_students(tenant_id,product_key,student_ref,status,profile) VALUES($1,'mealdeck','student-1','active','{\"name\":\"Fixture Student\"}'::jsonb) RETURNING id",
 [t.tenantId]))).rows[0].id;
await asUser(admin,()=>db.query(
 "INSERT INTO public.education_enrolments(tenant_id,product_key,student_id,programme_id,cohort_id,status) VALUES($1,'mealdeck',$2,$3,$4,'active')",
 [t.tenantId,student,programme,cohort]));
for(const [ref,status] of [["session-1","present"],["session-2","late"],["session-3","absence"]]){
 await asUser(admin,()=>db.query(
  "INSERT INTO public.education_attendance_events(tenant_id,product_key,student_id,cohort_id,session_ref,occurred_on,status) VALUES($1,'mealdeck',$2,$3,$4,current_date,$5)",
  [t.tenantId,student,cohort,ref,status]));
}
await asUser(admin,()=>db.query(
 "INSERT INTO public.education_assessment_results(tenant_id,product_key,student_id,programme_id,assessment_ref,score,max_score,status,recorded_by) VALUES($1,'mealdeck',$2,$3,'a1',72,100,'confirmed',$4)",
 [t.tenantId,student,programme,admin]));
const intervention=(await asUser(admin,()=>db.query(
 "INSERT INTO public.education_interventions(tenant_id,product_key,student_id,intervention_type,reason,proposed_by,status) VALUES($1,'mealdeck',$2,'support','Attendance support review','intelligence','proposed') RETURNING id,status",
 [t.tenantId,student]))).rows[0];
assert.equal(intervention.status,"proposed","intelligence must not auto-approve an intervention");

const view=await asUser(admin,async()=> (await db.query("SELECT public.education_student_360($1,'mealdeck',$2) AS v",[t.tenantId,student])).rows[0].v);
assert.equal(view.humanDecisionRequired,true);
assert.equal(Number(view.attendanceRate),66.67);
assert.equal(Number(view.assessmentAverage),72);
assert.equal(view.interventions.length,1);

await asUser(admin,()=>db.query(
 "INSERT INTO public.factory_launch_gates(tenant_id,product_key,gate_key,category,title,required,status,evidence_refs,reviewed_by,reviewed_at) VALUES($1,'mealdeck','security.rls','security','Tenant isolation verified',true,'passed','[\"rls-test\"]'::jsonb,$2,now())",
 [t.tenantId,admin]));
await asUser(admin,()=>db.query(
 "INSERT INTO public.factory_launch_gates(tenant_id,product_key,gate_key,category,title,required,status) VALUES($1,'mealdeck','operations.runbook','operations','Operations runbook',true,'pending')",
 [t.tenantId]));
let readiness=await asUser(admin,async()=> (await db.query("SELECT public.saas_factory_readiness($1,'mealdeck') AS r",[t.tenantId])).rows[0].r);
assert.equal(readiness.pendingGates,1);
assert(readiness.blockers.includes("factory_launch_gates_incomplete"));
await asUser(admin,()=>db.query(
 "UPDATE public.factory_launch_gates SET status='passed',evidence_refs='[\"runbook-v1\"]'::jsonb,reviewed_by=$2,reviewed_at=now() WHERE tenant_id=$1 AND product_key='mealdeck' AND gate_key='operations.runbook'",
 [t.tenantId,admin]));
readiness=await asUser(admin,async()=> (await db.query("SELECT public.saas_factory_readiness($1,'mealdeck') AS r",[t.tenantId])).rows[0].r);
assert.equal(readiness.requiredGates,2);
assert.equal(readiness.passedGates,2);

const hidden=await asUser(stranger,()=>db.query("SELECT * FROM public.education_students WHERE tenant_id=$1",[t.tenantId]));
assert.equal(hidden.rows.length,0);
const hiddenGates=await asUser(stranger,()=>db.query("SELECT * FROM public.factory_launch_gates WHERE tenant_id=$1",[t.tenantId]));
assert.equal(hiddenGates.rows.length,0);

await db.close();
console.log("Education Factory Student 360 and universal SaaS launch-readiness gates verified");
