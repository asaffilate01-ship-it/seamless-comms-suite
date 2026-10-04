import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

const db=new PGlite();
const migrations=new URL("../../supabase/migrations/",import.meta.url);
await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE PUBLICATION supabase_realtime;");
for(const name of (await readdir(migrations)).filter(x=>x.endsWith(".sql")).sort()){
 const sql=await readFile(new URL(name,migrations),"utf8");
 if(name.startsWith("20260816120554")){
  for(const id of ["18bafcd5-3e4c-4044-bb63-10325a0b7209","e66c0525-1787-4250-be26-79f849624521","890c71b1-cf6e-4b68-a56e-dd6050372481","97319fe5-82fd-44cd-b27d-6ae314ee368b"])await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,"fixture@example.invalid"]);
 }
 await db.exec(sql);
}
const admin="abababab-aaaa-4aaa-8aaa-abababababab";
const portal="cdcdcdcd-bbbb-4bbb-8bbb-cdcdcdcdcdcd";
const stranger="efefefef-cccc-4ccc-8ccc-efefefefefef";
for(const id of[admin,portal,stranger])await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,id+"@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
async function asUser(user,fn){await db.exec("BEGIN;SET LOCAL ROLE authenticated;");await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);try{const v=await fn();await db.exec("COMMIT");return v;}catch(e){await db.exec("ROLLBACK");throw e;}}
async function asService(fn){await db.exec("BEGIN;SET LOCAL ROLE service_role;");try{const v=await fn();await db.exec("COMMIT");return v;}catch(e){await db.exec("ROLLBACK");throw e;}}

const pilot=await asUser(admin,async()=> (await db.query("SELECT public.platform_bootstrap_dishbee_pilot() AS result")).rows[0].result);
const tenant=pilot.tenants.find(x=>x.tenantSlug==="mealdeck");assert(tenant?.tenantId);

await asService(()=>db.query("INSERT INTO public.tenant_services(tenant_id,service_key,status,source) VALUES($1,'omniqora.practice-delivery','active','test') ON CONFLICT(tenant_id,service_key) DO UPDATE SET status='active'",[tenant.tenantId]));
const client=(await asUser(admin,()=>db.query("INSERT INTO public.practice_clients(tenant_id,product_key,client_ref,display_name,status,jurisdiction) VALUES($1,'mealdeck','client-1','Practice Client','active','GB') RETURNING id",[tenant.tenantId]))).rows[0].id;
const tpl=(await asUser(admin,()=>db.query("INSERT INTO public.practice_service_templates(tenant_id,product_key,template_key,name,service_family,currency,base_fee_minor,recurrence,phases,status,created_by) VALUES($1,'mealdeck','annual-accounts','Annual Accounts','accounting','GBP',120000,'annual',$2::jsonb,'active',$3) RETURNING id",[tenant.tenantId,JSON.stringify([{title:"Collect records",budgetMinutes:60},{title:"Prepare",budgetMinutes:240},{title:"Review",budgetMinutes:60}]),admin]))).rows[0].id;

const engagement=await asUser(admin,async()=> (await db.query("SELECT public.practice_create_managed_engagement($1,'mealdeck',$2,$3,'2026','2026-01-01','2026-12-31',$4,NULL,NULL) AS id",[tenant.tenantId,client,tpl,admin])).rows[0].id);
const same=await asUser(admin,async()=> (await db.query("SELECT public.practice_create_managed_engagement($1,'mealdeck',$2,$3,'2026','2026-01-01','2026-12-31',$4,NULL,NULL) AS id",[tenant.tenantId,client,tpl,admin])).rows[0].id);
assert.equal(engagement,same);
const phases=await asUser(admin,()=>db.query("SELECT id,position,status FROM public.practice_job_phases WHERE engagement_id=$1 ORDER BY position",[engagement]));
assert.equal(phases.rows.length,3);

await asService(()=>db.query("INSERT INTO public.customer_portal_users(tenant_id,product_key,user_id,status,permissions) VALUES($1,'mealdeck',$2,'active',ARRAY['practice'])",[tenant.tenantId,portal]));
await asUser(admin,()=>db.query("INSERT INTO public.practice_client_portal_access(tenant_id,product_key,client_id,user_id,portal_role,status) VALUES($1,'mealdeck',$2,$3,'client_owner','active')",[tenant.tenantId,client,portal]));
const portalAccess=await asUser(portal,()=>db.query("SELECT client_id,portal_role FROM public.practice_client_portal_access WHERE client_id=$1",[client]));
assert.equal(portalAccess.rows[0].portal_role,"client_owner");
const strangerAccess=await asUser(stranger,()=>db.query("SELECT * FROM public.practice_client_portal_access WHERE client_id=$1",[client]));
assert.equal(strangerAccess.rows.length,0);

const request=(await asUser(admin,()=>db.query("INSERT INTO public.practice_document_requests(tenant_id,product_key,client_id,engagement_id,request_key,title,due_at,status) VALUES($1,'mealdeck',$2,$3,'bank-statements','Bank statements',now()-interval '1 day','outstanding') RETURNING id",[tenant.tenantId,client,engagement]))).rows[0].id;
await assert.rejects(()=>asUser(admin,()=>db.query("SELECT public.practice_complete_phase($1,1)",[phases.rows[0].id])),/Outstanding client document requests/);
await asUser(portal,()=>db.query("SELECT public.practice_portal_respond_request($1,'Uploaded separately',NULL)",[request]));
let req=await asUser(admin,()=>db.query("SELECT status,submitted_by FROM public.practice_document_requests WHERE id=$1",[request]));
assert.equal(req.rows[0].status,"submitted");assert.equal(req.rows[0].submitted_by,portal);
await asUser(admin,()=>db.query("UPDATE public.practice_document_requests SET status='accepted',reviewed_by=$1,reviewed_at=now() WHERE id=$2",[admin,request]));
await assert.rejects(()=>asUser(admin,()=>db.query("SELECT public.practice_complete_phase($1,1)",[phases.rows[1].id])),/Complete earlier phases first/);
const v2=await asUser(admin,async()=> (await db.query("SELECT public.practice_complete_phase($1,1) AS v",[phases.rows[0].id])).rows[0].v);
assert.equal(Number(v2),2);
const v3=await asUser(admin,async()=> (await db.query("SELECT public.practice_complete_phase($1,2) AS v",[phases.rows[1].id])).rows[0].v);
assert.equal(Number(v3),3);

await asUser(admin,()=>db.query("INSERT INTO public.practice_time_entries(tenant_id,product_key,engagement_id,user_id,work_date,minutes,cost_rate_minor,charge_rate_minor,description,billable,status) VALUES($1,'mealdeck',$2,$3,current_date,120,3000,7500,'Prepare accounts',true,'posted')",[tenant.tenantId,engagement,admin]));
await asUser(admin,()=>db.query("INSERT INTO public.practice_fee_items(tenant_id,product_key,engagement_id,fee_type,description,quantity,unit_minor,amount_minor,currency,status,approved_by,approved_at) VALUES($1,'mealdeck',$2,'fixed','Annual fee',1,120000,120000,'GBP','approved',$3,now())",[tenant.tenantId,engagement,admin]));
const wip=await asUser(admin,async()=> (await db.query("SELECT public.practice_wip_summary($1) AS w",[engagement])).rows[0].w);
assert.equal(Number(wip.minutes),120);assert.equal(Number(wip.timeCostMinor),6000);assert.equal(Number(wip.timeChargeMinor),15000);assert.equal(Number(wip.approvedFeeItemsMinor),120000);

const proposal=(await asUser(admin,()=>db.query("INSERT INTO public.practice_proposals(tenant_id,product_key,client_id,engagement_id,template_id,proposal_ref,service_snapshot,fee_snapshot,total_minor,currency,terms,status,valid_until,created_by) VALUES($1,'mealdeck',$2,$3,$4,'PROP-1',$5::jsonb,'[]'::jsonb,120000,'GBP','Engagement terms','draft',now()+interval '30 days',$6) RETURNING id",[tenant.tenantId,client,engagement,tpl,JSON.stringify({templateKey:"annual-accounts",version:1}),admin]))).rows[0].id;
await asUser(admin,()=>db.query("SELECT public.practice_issue_proposal($1)",[proposal]));
let proposalState=await asUser(portal,()=>db.query("SELECT status FROM public.practice_proposals WHERE id=$1",[proposal]));assert.equal(proposalState.rows[0].status,"issued");
await asUser(portal,()=>db.query("SELECT public.practice_portal_accept_proposal($1,true)",[proposal]));
proposalState=await asUser(admin,()=>db.query("SELECT status,accepted_by FROM public.practice_proposals WHERE id=$1",[proposal]));assert.equal(proposalState.rows[0].status,"accepted");assert.equal(proposalState.rows[0].accepted_by,portal);

const signature=(await asUser(admin,()=>db.query("INSERT INTO public.practice_signature_requests(tenant_id,product_key,client_id,proposal_id,signer_ref,signer_name,status,approved_by,approved_at) VALUES($1,'mealdeck',$2,$3,'client-owner','Practice Client','approved',$4,now()) RETURNING id",[tenant.tenantId,client,proposal,admin]))).rows[0].id;
await assert.rejects(()=>asUser(admin,()=>db.query("UPDATE public.practice_signature_requests SET status='signed' WHERE id=$1",[signature])),e=>e.code==="42501");
await asService(()=>db.query("SELECT public.practice_record_provider_signature($1,'signed','provider-sign-1',now(),NULL,'{}'::jsonb)",[signature]));
const sigState=await asUser(portal,()=>db.query("SELECT status,signed_at FROM public.practice_signature_requests WHERE id=$1",[signature]));assert.equal(sigState.rows[0].status,"signed");assert(sigState.rows[0].signed_at);

const deadline=(await asUser(admin,()=>db.query("INSERT INTO public.practice_deadlines(tenant_id,product_key,client_id,engagement_id,deadline_type,due_at,status,authority_ref) VALUES($1,'mealdeck',$2,$3,'accounts-filing',now()+interval '10 days','due','Authority') RETURNING id",[tenant.tenantId,client,engagement]))).rows[0].id;
const submission=(await asUser(admin,()=>db.query("INSERT INTO public.practice_submissions(tenant_id,product_key,client_id,engagement_id,deadline_id,submission_type,authority,status,approved_by,approved_at) VALUES($1,'mealdeck',$2,$3,$4,'accounts','Authority','approved',$5,now()) RETURNING id",[tenant.tenantId,client,engagement,deadline,admin]))).rows[0].id;
await assert.rejects(()=>asUser(admin,()=>db.query("UPDATE public.practice_submissions SET status='accepted' WHERE id=$1",[submission])),e=>e.code==="42501");
await asService(()=>db.query("SELECT public.practice_record_provider_submission($1,'submitted','provider-file-1','{}'::jsonb,NULL)",[submission]));
await asService(()=>db.query("SELECT public.practice_record_provider_submission($1,'accepted','provider-file-1','{\"accepted\":true}'::jsonb,NULL)",[submission]));
const subState=await asUser(admin,()=>db.query("SELECT status FROM public.practice_submissions WHERE id=$1",[submission]));assert.equal(subState.rows[0].status,"accepted");
const deadlineState=await asUser(admin,()=>db.query("SELECT status FROM public.practice_deadlines WHERE id=$1",[deadline]));assert.equal(deadlineState.rows[0].status,"filed");

const recurring=(await asUser(admin,()=>db.query("INSERT INTO public.practice_recurring_work(tenant_id,product_key,client_id,template_id,recurrence,next_period_start,status) VALUES($1,'mealdeck',$2,$3,'annual','2025-01-01','active') RETURNING id",[tenant.tenantId,client,tpl]))).rows[0].id;
const generated=await asService(async()=> (await db.query("SELECT public.practice_generate_recurring_work(10) AS n")).rows[0].n);
assert(Number(generated)>=1);
const rw=await asUser(admin,()=>db.query("SELECT last_generated_period_key,next_period_start FROM public.practice_recurring_work WHERE id=$1",[recurring]));assert(rw.rows[0].last_generated_period_key);

const remindRequest=(await asUser(admin,()=>db.query("INSERT INTO public.practice_document_requests(tenant_id,product_key,client_id,engagement_id,request_key,title,due_at,status) VALUES($1,'mealdeck',$2,$3,'reminder-test','Reminder test',now()-interval '10 days','outstanding') RETURNING id",[tenant.tenantId,client,engagement]))).rows[0].id;
const reminders1=await asService(async()=> (await db.query("SELECT public.practice_enqueue_due_reminders(100) AS n")).rows[0].n);assert(Number(reminders1)>=1);
const reminderRow=await asUser(admin,()=>db.query("SELECT reminder_count,last_reminder_at FROM public.practice_document_requests WHERE id=$1",[remindRequest]));assert.equal(Number(reminderRow.rows[0].reminder_count),1);
await asService(()=>db.query("SELECT public.practice_enqueue_due_reminders(100)"));
const reminderRow2=await asUser(admin,()=>db.query("SELECT reminder_count FROM public.practice_document_requests WHERE id=$1",[remindRequest]));assert.equal(Number(reminderRow2.rows[0].reminder_count),1);
const event=await asUser(admin,()=>db.query("SELECT event_type FROM public.platform_events WHERE subject_id=$1",[remindRequest]));assert.equal(event.rows[0].event_type,"practice.request.reminder_due");

await db.close();
console.log("Practice Operations depth verified");
