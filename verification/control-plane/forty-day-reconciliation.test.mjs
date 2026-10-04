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
const admin="55555555-aaaa-4aaa-8aaa-555555555555",stranger="44444444-bbbb-4bbb-8bbb-444444444444",member="33333333-cccc-4ccc-8ccc-333333333333";
for(const id of[admin,stranger,member])await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,id+"@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
async function asUser(user,fn){await db.exec("BEGIN;SET LOCAL ROLE authenticated;");await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);try{const v=await fn();await db.exec("COMMIT");return v;}catch(e){await db.exec("ROLLBACK");throw e;}}
async function asService(fn){await db.exec("BEGIN;SET LOCAL ROLE service_role;");try{const v=await fn();await db.exec("COMMIT");return v;}catch(e){await db.exec("ROLLBACK");throw e;}}
const pilot=await asUser(admin,async()=> (await db.query("SELECT public.platform_bootstrap_dishbee_pilot() AS result")).rows[0].result);
const tenant=pilot.tenants.find(x=>x.tenantSlug==="mealdeck");assert(tenant?.tenantId);
await asService(()=>db.query("INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES($1,$2,'agent')",[tenant.tenantId,member]));

const sa=await asUser(admin,()=>db.query("SELECT country_code,currency,supported_locales FROM public.region_packs WHERE region_key='sa'"));
assert.equal(sa.rows[0].country_code,"SA");assert.equal(sa.rows[0].currency,"SAR");assert(sa.rows[0].supported_locales.includes("ar-SA"));
const ar=await asUser(admin,()=>db.query("SELECT rtl FROM public.locale_packs WHERE locale='ar-SA'"));assert.equal(ar.rows[0].rtl,true);
const asterisk=await asUser(admin,()=>db.query("SELECT capabilities FROM public.provider_catalogue WHERE provider_key='communications.asterisk'"));assert(asterisk.rows[0].capabilities.includes("warm_transfer"));
const templates=await asUser(admin,()=>db.query("SELECT count(*)::integer AS n FROM public.ai_agent_template_catalogue WHERE status='active'"));assert.equal(templates.rows[0].n,38);

const centre=(await asUser(admin,()=>db.query("INSERT INTO public.contact_centres(tenant_id,product_key,name,ai_resolution_target,status) VALUES($1,'mealdeck','General',80,'active') RETURNING id",[tenant.tenantId]))).rows[0].id;
const queue=(await asUser(admin,()=>db.query("INSERT INTO public.contact_queues(tenant_id,product_key,centre_id,name,ai_first,callback_enabled,same_agent_enabled,status) VALUES($1,'mealdeck',$2,'Customer Service',true,true,true,'active') RETURNING id",[tenant.tenantId,centre]))).rows[0].id;
const agent=(await asUser(admin,()=>db.query("INSERT INTO public.contact_agent_profiles(tenant_id,product_key,user_id,display_name,status) VALUES($1,'mealdeck',$2,'Agent One','available') RETURNING id",[tenant.tenantId,admin]))).rows[0].id;
await asUser(admin,()=>db.query("INSERT INTO public.contact_queue_members(queue_id,tenant_id,agent_id,priority) VALUES($1,$2,$3,10)",[queue,tenant.tenantId,agent]));
const routed=await asUser(admin,async()=> (await db.query("SELECT public.contact_route_candidate($1,'mealdeck',$2,NULL) AS r",[tenant.tenantId,queue])).rows[0].r);assert.equal(routed.available,true);assert.equal(routed.agentId,agent);
await asUser(admin,()=>db.query("INSERT INTO public.contact_interactions(tenant_id,product_key,centre_id,queue_id,direction,channel,status,ai_handled,ai_resolved,queued_at,answered_at,ended_at) VALUES($1,'mealdeck',$2,$3,'inbound','voice','completed',true,true,now()-interval '20 seconds',now()-interval '15 seconds',now())",[tenant.tenantId,centre,queue]));
const metrics=await asUser(admin,async()=> (await db.query("SELECT public.contact_centre_metrics($1,'mealdeck',now()-interval '1 day',now()+interval '1 minute') AS r",[tenant.tenantId])).rows[0].r);assert.equal(metrics.total,1);assert.equal(Number(metrics.aiResolutionRate),100);

const topic=(await asUser(admin,()=>db.query("INSERT INTO public.growth_consent_topics(tenant_id,product_key,topic_key,name,purpose) VALUES($1,'mealdeck','marketing','Marketing','Offers and lifecycle communications') RETURNING id",[tenant.tenantId]))).rows[0].id;
const person=(await asUser(admin,()=>db.query("INSERT INTO public.crm_people(tenant_id,source_product_key,external_ref,display_name,lifecycle_stage,marketing_consent) VALUES($1,'mealdeck','reconcile-person','Reconcile Person','customer',false) RETURNING id",[tenant.tenantId]))).rows[0].id;
await asUser(admin,()=>db.query("INSERT INTO public.growth_consent_records(tenant_id,product_key,person_id,topic_id,channel,state,source) VALUES($1,'mealdeck',$2,$3,'email','granted','fixture')",[tenant.tenantId,person,topic]));
const allowed=await asUser(admin,async()=> (await db.query("SELECT public.growth_consent_allowed($1,$2,$3,'email') AS ok",[tenant.tenantId,person,topic])).rows[0].ok);assert.equal(allowed,true);

const exp=(await asUser(admin,()=>db.query("INSERT INTO public.growth_experiments(tenant_id,product_key,name,hypothesis,goal_event,status,created_by) VALUES($1,'mealdeck','CTA test','A variant changes conversion','conversion.completed','active',$2) RETURNING id",[tenant.tenantId,admin]))).rows[0].id;
await asUser(admin,()=>db.query("INSERT INTO public.growth_experiment_variants(tenant_id,experiment_id,variant_key,name,weight_bps) VALUES($1,$2,'control','Control',5000),($1,$2,'variant','Variant',5000)",[tenant.tenantId,exp]));
const assigned1=await asUser(admin,async()=> (await db.query("SELECT public.growth_assign_variant($1,$2,'person-1') AS id",[tenant.tenantId,exp])).rows[0].id);
const assigned2=await asUser(admin,async()=> (await db.query("SELECT public.growth_assign_variant($1,$2,'person-1') AS id",[tenant.tenantId,exp])).rows[0].id);assert.equal(assigned1,assigned2);

await asUser(admin,()=>db.query("INSERT INTO public.billing_plan_catalogue(plan_key,product_key,name,currency,billing_interval,price_minor,status) VALUES('mealdeck-basic','mealdeck','MealDeck Basic','GBP','monthly',9900,'active')"));
await asUser(admin,()=>db.query("INSERT INTO public.billing_plan_services(plan_key,service_key,included,limits) VALUES('mealdeck-basic','omniqora.crm',true,'{\"contacts\":1000}'::jsonb)"));
await assert.rejects(()=>asUser(admin,()=>db.query("SELECT public.billing_activate_subscription($1,'mealdeck','mealdeck-basic',NULL,NULL,$2)",[tenant.tenantId,admin])),e=>e.code==="42501");
const subscription=await asService(async()=> (await db.query("SELECT public.billing_activate_subscription($1,'mealdeck','mealdeck-basic',NULL,NULL,$2) AS id",[tenant.tenantId,admin])).rows[0].id);assert(subscription);
const billedService=await asUser(admin,()=>db.query("SELECT status,source FROM public.tenant_services WHERE tenant_id=$1 AND service_key='omniqora.crm'",[tenant.tenantId]));assert.equal(billedService.rows[0].status,"active");assert.equal(billedService.rows[0].source,"billing");

const profile=(await asUser(admin,()=>db.query("INSERT INTO public.mobile_app_profiles(tenant_id,product_key,profile_key,name,capabilities,status) VALUES($1,'mealdeck','universal-agent','Universal Agent',ARRAY['offline','background_gps','camera'],'active') RETURNING id",[tenant.tenantId]))).rows[0].id;
const device=(await asUser(admin,()=>db.query("INSERT INTO public.mobile_devices(tenant_id,product_key,user_id,app_profile_id,platform,device_ref,status) VALUES($1,'mealdeck',$2,$3,'android','device-1','active') RETURNING id",[tenant.tenantId,admin,profile]))).rows[0].id;
await asUser(admin,()=>db.query("INSERT INTO public.mobile_offline_events(tenant_id,product_key,device_id,client_event_id,event_type,captured_at,payload) VALUES($1,'mealdeck',$2,'offline-1','job.arrived',now(),'{}')",[tenant.tenantId,device]));
await assert.rejects(()=>asUser(admin,()=>db.query("INSERT INTO public.mobile_offline_events(tenant_id,product_key,device_id,client_event_id,event_type,captured_at,payload) VALUES($1,'mealdeck',$2,'offline-1','job.arrived',now(),'{}')",[tenant.tenantId,device])),e=>e.code==="23505");
const dispatchAgent=(await asUser(admin,()=>db.query("INSERT INTO public.dispatch_agents(tenant_id,product_key,user_id,name,status) VALUES($1,'mealdeck',$2,'Driver One','available') RETURNING id",[tenant.tenantId,admin]))).rows[0].id;
const shift=(await asUser(admin,()=>db.query("INSERT INTO public.dispatch_shifts(tenant_id,product_key,agent_id,starts_at,ends_at) VALUES($1,'mealdeck',$2,now(),now()+interval '8 hours') RETURNING id",[tenant.tenantId,dispatchAgent]))).rows[0].id;assert(shift);

const decisionCase=(await asUser(admin,()=>db.query("INSERT INTO public.decision_cases(tenant_id,product_key,case_key,title,question,domain,owner_user_id) VALUES($1,'mealdeck','decision-1','Expansion decision','Which operating model should be used?','strategy',$2) RETURNING id",[tenant.tenantId,admin]))).rows[0].id;
const option=(await asUser(admin,()=>db.query("INSERT INTO public.decision_options(tenant_id,case_id,option_key,name,status) VALUES($1,$2,'option-a','Option A','selected') RETURNING id",[tenant.tenantId,decisionCase]))).rows[0].id;
const decision=(await asUser(admin,()=>db.query("INSERT INTO public.decision_records(tenant_id,case_id,selected_option_id,rationale,decided_by,expected_outcomes) VALUES($1,$2,$3,'Selected after evidence review',$4,'{\"target\":\"improve\"}'::jsonb) RETURNING id",[tenant.tenantId,decisionCase,option,admin]))).rows[0].id;
await asUser(admin,()=>db.query("INSERT INTO public.decision_outcomes(tenant_id,decision_id,outcome,expected_vs_actual,failure_patterns,reviewer_user_id) VALUES($1,$2,'{\"result\":\"mixed\"}'::jsonb,'{\"target\":\"improve\",\"actual\":\"mixed\"}'::jsonb,'[\"capacity\"]'::jsonb,$3)",[tenant.tenantId,decision,admin]));

const candidate=(await asUser(admin,()=>db.query("INSERT INTO public.decision_model_candidates(tenant_id,product_key,candidate_key,domain,model_id,training_cutoff,evaluation_start,evaluation_end) VALUES($1,'mealdeck','candidate-1','strategy','fixture-model','2026-06-30','2026-07-01','2026-09-30') RETURNING id",[tenant.tenantId]))).rows[0].id;
await asUser(admin,()=>db.query("INSERT INTO public.decision_model_evaluations(tenant_id,candidate_id,dataset_ref,period_start,period_end,metrics,future_data_check,reviewer_user_id) VALUES($1,$2,'holdout-2026q3','2026-07-01','2026-09-30','{\"accuracy\":0.8}'::jsonb,'passed',$3)",[tenant.tenantId,candidate,admin]));
await asUser(admin,()=>db.query("SELECT public.decision_promote_model_candidate($1)",[candidate]));
const candidateStatus=await asUser(admin,()=>db.query("SELECT status FROM public.decision_model_candidates WHERE id=$1",[candidate]));assert.equal(candidateStatus.rows[0].status,"challenger");

const qitt=await asUser(admin,()=>db.query("SELECT framework,status FROM public.advisory_templates WHERE template_key='qitt-business-diagnostic'"));assert.equal(qitt.rows[0].status,"active");
const taxPacks=await asUser(admin,()=>db.query("SELECT pack_key,metadata FROM public.tax_rule_packs WHERE pack_key IN('gb-core-framework','us-core-framework','de-core-framework') ORDER BY pack_key"));assert.equal(taxPacks.rows.length,3);assert(taxPacks.rows.every(r=>r.metadata.ratesIncluded===false));
const embed=(await asUser(admin,()=>db.query("INSERT INTO public.embedded_surfaces(tenant_id,product_key,surface_key,surface_type,name,status) VALUES($1,'mealdeck','portal-widget','widget','Portal Widget','active') RETURNING id",[tenant.tenantId]))).rows[0].id;assert(embed);
const line=(await asUser(admin,()=>db.query("INSERT INTO public.telecom_lines(tenant_id,product_key,provider_key,line_type,status) VALUES($1,'mealdeck','telecom.gigs','staff','requested') RETURNING id",[tenant.tenantId]))).rows[0].id;assert(line);

const documentId=(await asUser(admin,()=>db.query("INSERT INTO public.document_records(tenant_id,product_key,document_type,title,status,created_by) VALUES($1,'mealdeck','private_note','Restricted document','active',$2) RETURNING id",[tenant.tenantId,admin]))).rows[0].id;
await asUser(admin,()=>db.query("INSERT INTO public.document_versions(document_id,tenant_id,version,storage_ref,created_by) VALUES($1,$2,1,'urn:fixture:restricted',$3)",[documentId,tenant.tenantId,admin]));
const beforeAcl=await asUser(member,()=>db.query("SELECT id FROM public.document_records WHERE id=$1",[documentId]));assert.equal(beforeAcl.rows.length,1);
await asUser(admin,()=>db.query("INSERT INTO public.resource_access_rules(tenant_id,product_key,resource_type,resource_id,principal_type,principal_ref,permission,effect,created_by) VALUES($1,'mealdeck','document',$2,'user',$3::text,'read','allow',$3::uuid)",[tenant.tenantId,documentId,admin]));
const afterAcl=await asUser(member,()=>db.query("SELECT id FROM public.document_records WHERE id=$1",[documentId]));assert.equal(afterAcl.rows.length,0);
const adminDoc=await asUser(admin,()=>db.query("SELECT id FROM public.document_records WHERE id=$1",[documentId]));assert.equal(adminDoc.rows.length,1);

const financeProfile=(await asUser(admin,()=>db.query("INSERT INTO public.embedded_finance_profiles(tenant_id,product_key,provider_key,vendor_ref,status) VALUES($1,'mealdeck','payments.adyen','merchant-1','active') RETURNING id",[tenant.tenantId]))).rows[0].id;
const beneficiary=(await asUser(admin,()=>db.query("INSERT INTO public.embedded_finance_beneficiaries(tenant_id,profile_id,beneficiary_ref,name,status) VALUES($1,$2,'supplier-1','Supplier One','review') RETURNING id",[tenant.tenantId,financeProfile]))).rows[0].id;
const transfer=(await asUser(admin,()=>db.query("INSERT INTO public.embedded_finance_transfers(tenant_id,product_key,profile_id,beneficiary_id,amount_minor,currency,purpose,idempotency_key,status) VALUES($1,'mealdeck',$2,$3,2500,'GBP','Supplier payment','transfer-fixture-1','review') RETURNING id",[tenant.tenantId,financeProfile,beneficiary]))).rows[0].id;
await assert.rejects(()=>asUser(admin,()=>db.query("SELECT public.embedded_finance_approve_transfer($1)",[transfer])),/Approved beneficiary required/);
await asUser(admin,()=>db.query("UPDATE public.embedded_finance_beneficiaries SET status='approved',approved_by=$1,approved_at=now() WHERE id=$2",[admin,beneficiary]));
await asUser(admin,()=>db.query("SELECT public.embedded_finance_approve_transfer($1)",[transfer]));
const transferStatus=await asUser(admin,()=>db.query("SELECT status FROM public.embedded_finance_transfers WHERE id=$1",[transfer]));assert.equal(transferStatus.rows[0].status,"approved");

await asUser(admin,()=>db.query("INSERT INTO public.crm_tasks(tenant_id,title,status,priority,due_at,assignee_user_id,source_product_key,created_by) VALUES($1,'Prepare morning pack','open','high',now()+interval '2 hours',$2,'mealdeck',$2)",[tenant.tenantId,admin]));
await asUser(admin,()=>db.query("INSERT INTO public.support_tickets(tenant_id,product_key,subject,priority,status,assigned_user_id) VALUES($1,'mealdeck','Urgent customer blocker','urgent','open',$2)",[tenant.tenantId,admin]));
const briefId=await asUser(admin,async()=> (await db.query("SELECT public.daily_brief_generate($1,'mealdeck',$2) AS id",[tenant.tenantId,admin])).rows[0].id);
const brief=await asUser(admin,()=>db.query("SELECT status,summary FROM public.daily_brief_runs WHERE id=$1",[briefId]));assert.equal(brief.rows[0].status,"ready");assert(Number(brief.rows[0].summary.tasks)>=1);assert(Number(brief.rows[0].summary.blockers)>=1);

const webChat=(await asUser(admin,()=>db.query("INSERT INTO public.communication_identities(tenant_id,product_key,channel,address,display_name,status) VALUES($1,'mealdeck','web_chat','site-chat','Website Chat','active') RETURNING id",[tenant.tenantId]))).rows[0].id;assert(webChat);
const monitor=(await asUser(admin,()=>db.query("INSERT INTO public.regulatory_source_monitors(tenant_id,product_key,source_key,authority,jurisdiction,source_type,source_url,status) VALUES($1,'mealdeck','fixture-regulator','Fixture Authority','GB','official','https://example.invalid/rules','active') RETURNING id",[tenant.tenantId]))).rows[0].id;
const snap1=await asService(async()=> (await db.query("SELECT public.regulatory_record_snapshot($1,$2,NULL,'fixture:v1','{\"headline\":\"Initial source\"}'::jsonb,'{}'::jsonb) AS r",[monitor,"a".repeat(64)])).rows[0].r);assert.equal(snap1.changed,true);assert.equal(snap1.revision,1);
const same=await asService(async()=> (await db.query("SELECT public.regulatory_record_snapshot($1,$2,NULL,'fixture:v1','{}'::jsonb,'{}'::jsonb) AS r",[monitor,"a".repeat(64)])).rows[0].r);assert.equal(same.changed,false);assert.equal(same.revision,1);
const snap2=await asService(async()=> (await db.query("SELECT public.regulatory_record_snapshot($1,$2,NULL,'fixture:v2','{\"headline\":\"Rule changed\"}'::jsonb,'{}'::jsonb) AS r",[monitor,"b".repeat(64)])).rows[0].r);assert.equal(snap2.changed,true);assert.equal(snap2.revision,2);
const changes=await asUser(admin,()=>db.query("SELECT change_type,status FROM public.regulatory_change_events WHERE monitor_id=$1 ORDER BY to_revision",[monitor]));assert.equal(changes.rows.length,2);assert.equal(changes.rows[1].status,"review");

const hidden=await asUser(stranger,()=>db.query("SELECT * FROM public.contact_centres WHERE tenant_id=$1",[tenant.tenantId]));assert.equal(hidden.rows.length,0);
await assert.rejects(()=>asUser(stranger,()=>db.query("SELECT * FROM public.contact_masking_participants")),e=>e.code==="42501");

await db.close();
console.log("40-day Omniqora reconciliation verified");
