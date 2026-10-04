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
const admin="55555555-aaaa-4aaa-8aaa-555555555555",stranger="44444444-bbbb-4bbb-8bbb-444444444444";
for(const id of[admin,stranger])await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,id+"@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
async function asUser(user,fn){await db.exec("BEGIN;SET LOCAL ROLE authenticated;");await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);try{const v=await fn();await db.exec("COMMIT");return v;}catch(e){await db.exec("ROLLBACK");throw e;}}

const pilot=await asUser(admin,async()=> (await db.query("SELECT public.platform_bootstrap_dishbee_pilot() AS result")).rows[0].result);
const t=pilot.tenants.find(x=>x.tenantSlug==="mealdeck");assert(t?.tenantId);

const services=await db.query("SELECT service_key FROM public.service_catalogue WHERE service_key IN('omniqora.contact','omniqora.media-intelligence','omniqora.mobile','omniqora.sales-engagement','omniqora.decision-learning') ORDER BY service_key");
assert.equal(services.rows.length,5);

const session=(await asUser(admin,()=>db.query(`
 INSERT INTO public.contact_sessions(tenant_id,product_key,channel,direction,ai_enabled,status,priority)
 VALUES($1,'mealdeck','voice','inbound',true,'active_ai','normal') RETURNING id`,[t.tenantId]))).rows[0].id;
const esc=(await asUser(admin,()=>db.query(`
 INSERT INTO public.contact_escalations(tenant_id,session_id,escalation_type,reason,requested_by,status)
 VALUES($1,$2,'supervisor_takeover','Customer requested a human',$3,'requested') RETURNING id`,[t.tenantId,session,admin]))).rows[0].id;assert(esc);
await asUser(admin,()=>db.query(`
 INSERT INTO public.contact_callbacks(tenant_id,product_key,session_id,channel,destination,scheduled_for,status)
 VALUES($1,'mealdeck',$2,'voice','+441234567890',now()+interval '1 hour','scheduled')`,[t.tenantId,session]));
await asUser(admin,()=>db.query(`
 INSERT INTO public.contact_masking_sessions(tenant_id,product_key,proxy_number,caller_hash,recipient_hash,context_type,context_id,state,expires_at)
 VALUES($1,'mealdeck','+441111111111','caller-hash','recipient-hash','booking','book-1','active',now()+interval '2 hours')`,[t.tenantId]));

const media=(await asUser(admin,()=>db.query(`
 INSERT INTO public.media_analysis_jobs(tenant_id,product_key,media_type,storage_ref,purpose,status,created_by)
 VALUES($1,'mealdeck','pdf','storage://fixture','extract invoice evidence','review',$2) RETURNING id`,[t.tenantId,admin]))).rows[0].id;assert(media);

const device=(await asUser(admin,()=>db.query(`
 INSERT INTO public.mobile_devices(tenant_id,product_key,user_id,device_ref,platform,location_permission,status)
 VALUES($1,'mealdeck',$2,'device-1','android','background','active') RETURNING id`,[t.tenantId,admin]))).rows[0].id;
await asUser(admin,()=>db.query(`
 INSERT INTO public.mobile_location_events(tenant_id,device_id,subject_type,subject_id,latitude,longitude,captured_at,purpose)
 VALUES($1,$2,'driver','driver-1',51.88,-0.42,now(),'active dispatch tracking')`,[t.tenantId,device]));

const proposal=(await asUser(admin,()=>db.query(`
 INSERT INTO public.sales_proposals(tenant_id,product_key,proposal_ref,title,currency,total_minor,status,created_by)
 VALUES($1,'mealdeck','PROP-1','Fixture proposal','GBP',250000,'approved',$2) RETURNING id`,[t.tenantId,admin]))).rows[0].id;
await asUser(admin,()=>db.query(`
 INSERT INTO public.signature_envelopes(tenant_id,product_key,proposal_id,signers,status)
 VALUES($1,'mealdeck',$2,'[{"name":"Fixture signer"}]'::jsonb,'draft')`,[t.tenantId,proposal]));
await asUser(admin,()=>db.query(`
 INSERT INTO public.cross_sell_recommendations(tenant_id,source_product_key,target_product_key,reason,score,status)
 VALUES($1,'mealdeck','omniqora','Shared CRM/AI opportunity',80,'suggested')`,[t.tenantId]));

const useCase=(await asUser(admin,()=>db.query(`
 INSERT INTO public.ai_use_cases(tenant_id,product_key,use_case_key,name,owner_user_id,purpose,status,risk_level)
 VALUES($1,'mealdeck','fixture-learning','Fixture learning',$2,'Review outcomes before changing any model','approved','low') RETURNING id`,[t.tenantId,admin]))).rows[0].id;
const review=(await asUser(admin,()=>db.query(`
 INSERT INTO public.ai_outcome_reviews(tenant_id,product_key,use_case_id,review_summary,evidence_refs,reviewed_by)
 VALUES($1,'mealdeck',$2,'Observed result reviewed by human','["evidence-1"]'::jsonb,$3) RETURNING id`,[t.tenantId,useCase,admin]))).rows[0].id;
const lesson=(await asUser(admin,()=>db.query(`
 INSERT INTO public.ai_reviewed_lessons(tenant_id,product_key,use_case_id,outcome_review_id,lesson_type,title,lesson,status)
 VALUES($1,'mealdeck',$2,$3,'prompt','Candidate lesson','Change only after review','candidate') RETURNING id,status`,[t.tenantId,useCase,review]))).rows[0];
assert.equal(lesson.status,"candidate");
await asUser(admin,()=>db.query(`
 INSERT INTO public.ai_candidate_model_tests(tenant_id,product_key,use_case_id,candidate_provider,candidate_model,evaluation_set_ref,status)
 VALUES($1,'mealdeck',$2,'openai','candidate-model','eval-set-1','planned')`,[t.tenantId,useCase]));

const hidden=await asUser(stranger,()=>db.query("SELECT * FROM public.contact_sessions WHERE tenant_id=$1",[t.tenantId]));
assert.equal(hidden.rows.length,0);
const hiddenLocations=await asUser(stranger,()=>db.query("SELECT * FROM public.mobile_location_events WHERE tenant_id=$1",[t.tenantId]));
assert.equal(hiddenLocations.rows.length,0);
await db.close();
console.log("Omniqora v4 contact, masking, media, mobile, sales and reviewed-learning runtime verified");
