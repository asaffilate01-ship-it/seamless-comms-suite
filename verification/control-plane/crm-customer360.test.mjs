import assert from "node:assert/strict";
import {seedIsolatedDishbeeTestTenants} from "./dishbee-fixture.mjs";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

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
const admin="aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",stranger="bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
for(const id of [admin,stranger])await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,id+"@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);

async function asUser(user,fn){await db.exec("BEGIN;SET LOCAL ROLE authenticated;");await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);try{const v=await fn();await db.exec("COMMIT");return v;}catch(e){await db.exec("ROLLBACK");throw e;}}
const pilot=await seedIsolatedDishbeeTestTenants(db,admin);
const luton=pilot.tenants.find(x=>x.tenantSlug==="cafe1-luton");assert(luton?.tenantId);

await asUser(admin,()=>db.query("SELECT public.platform_set_tenant_service($1,'omniqora.crm',true,'{}'::jsonb)",[luton.tenantId]));
await db.exec("SET ROLE service_role");
await db.query("UPDATE public.tenant_services SET status='active' WHERE tenant_id=$1 AND service_key='omniqora.crm'",[luton.tenantId]);
const contactId="cccccccc-3333-4333-8333-cccccccccccc";
await db.query("INSERT INTO public.contacts(id,tenant_id,wa_id,display_name,locale,consent_marketing) VALUES($1,$2,$3,$4,$5,$6)",[contactId,luton.tenantId,"447700900123","Aisha Customer","en-GB",true]);
await db.exec("RESET ROLE");

const people=await asUser(admin,()=>db.query("SELECT whatsapp_contact_id,display_name,marketing_consent,source_product_key FROM public.crm_people WHERE tenant_id=$1",[luton.tenantId]));
assert.equal(people.rows.length,1);
assert.deepEqual(people.rows[0],{whatsapp_contact_id:contactId,display_name:"Aisha Customer",marketing_consent:true,source_product_key:"omniqora-connect"});

await db.exec("SET ROLE service_role");
await db.query("UPDATE public.contacts SET display_name='Aisha Updated',consent_marketing=false WHERE id=$1",[contactId]);
await db.exec("RESET ROLE");
const updated=await asUser(admin,()=>db.query("SELECT display_name,marketing_consent FROM public.crm_people WHERE whatsapp_contact_id=$1",[contactId]));
assert.deepEqual(updated.rows[0],{display_name:"Aisha Updated",marketing_consent:false});

const pipeline=await asUser(admin,async()=> (await db.query("SELECT public.crm_ensure_default_pipeline($1) AS id",[luton.tenantId])).rows[0].id);
assert(pipeline);
const stages=await asUser(admin,()=>db.query("SELECT stage_key FROM public.crm_pipeline_stages WHERE pipeline_id=$1 ORDER BY position",[pipeline]));
assert.deepEqual(stages.rows.map(r=>r.stage_key),["new","qualified","proposal","won","lost"]);
await asUser(admin,()=>db.query("SELECT public.crm_ensure_default_pipeline($1)",[luton.tenantId]));
const pipelineCount=await asUser(admin,()=>db.query("SELECT count(*)::int AS count FROM public.crm_pipelines WHERE tenant_id=$1",[luton.tenantId]));
assert.equal(pipelineCount.rows[0].count,1);

const hidden=await asUser(stranger,()=>db.query("SELECT * FROM public.crm_people WHERE tenant_id=$1",[luton.tenantId]));
assert.equal(hidden.rows.length,0);

const service=await db.query("SELECT implementation_status FROM public.service_catalogue WHERE service_key='omniqora.crm'");
assert.equal(service.rows[0].implementation_status,"built_main");


// Sales-board stage transitions execute as authenticated users against real SQL/RLS.
const stageRows=(await asUser(admin,()=>db.query("SELECT * FROM public.crm_pipeline_stages WHERE pipeline_id=$1 ORDER BY position",[pipeline]))).rows;
const opportunity=(await asUser(admin,()=>db.query("INSERT INTO public.crm_opportunities(tenant_id,pipeline_id,stage_id,title,amount,currency,probability_percent,metadata) VALUES($1,$2,$3,'Sales test',100,'GBP',10,'{\"keep\":true}') RETURNING *,updated_at::text AS version",[luton.tenantId,pipeline,stageRows[0].id]))).rows[0];
const move=async(user,id,stage,version)=>asUser(user,()=>db.query("SELECT r.*,r.updated_at::text AS version FROM public.crm_move_opportunity($1,$2,$3,$4) r",[luton.tenantId,id,stage,version]));
await assert.rejects(()=>move(stranger,opportunity.id,stageRows[1].id,opportunity.version),/write access denied/);
await assert.rejects(()=>move(admin,opportunity.id,stageRows[1].id,null),/Refresh and try again/);
await db.query("INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES($1,$2,'viewer')",[luton.tenantId,stranger]);
await assert.rejects(()=>move(stranger,opportunity.id,stageRows[1].id,opportunity.version),/write access denied/);
const secondPipeline=(await db.query("INSERT INTO public.crm_pipelines(tenant_id,name,pipeline_key) VALUES($1,'Other','other-test') RETURNING id",[luton.tenantId])).rows[0].id;
const secondStage=(await db.query("INSERT INTO public.crm_pipeline_stages(tenant_id,pipeline_id,name,stage_key) VALUES($1,$2,'Other','other') RETURNING id",[luton.tenantId,secondPipeline])).rows[0].id;
await assert.rejects(()=>move(admin,opportunity.id,secondStage,opportunity.version),/stage unavailable/);
const won=(await move(admin,opportunity.id,stageRows[3].id,opportunity.version)).rows[0];
assert.equal(won.status,'won');assert.equal(won.probability_percent,100);assert.deepEqual(won.metadata,{keep:true});
await assert.rejects(()=>move(admin,opportunity.id,stageRows[1].id,opportunity.version),/Refresh and try again/);
const reopened=(await move(admin,opportunity.id,stageRows[1].id,won.version)).rows[0];
assert.equal(reopened.status,'open');assert.equal(reopened.probability_percent,30);
const lost=(await move(admin,opportunity.id,stageRows[4].id,reopened.version)).rows[0];
assert.equal(lost.status,'lost');assert.equal(lost.probability_percent,0);
const receipts=await asUser(admin,()=>db.query("SELECT metadata FROM public.crm_activities WHERE opportunity_id=$1",[opportunity.id]));
assert.equal(receipts.rows.length,3);
await move(admin,opportunity.id,stageRows[4].id,lost.version);
assert.equal((await db.query("SELECT count(*)::int AS n FROM public.crm_activities WHERE opportunity_id=$1",[opportunity.id])).rows[0].n,3);
const otherTenant=pilot.tenants.find(x=>x.tenantId!==luton.tenantId).tenantId;
const otherPipeline=await asUser(admin,async()=> (await db.query("SELECT public.crm_ensure_default_pipeline($1) AS id",[otherTenant])).rows[0].id);
const otherStage=(await db.query("SELECT id FROM public.crm_pipeline_stages WHERE pipeline_id=$1 LIMIT 1",[otherPipeline])).rows[0].id;
await assert.rejects(()=>move(admin,opportunity.id,otherStage,lost.version),/stage unavailable/);
// A failed audit insert must roll the deal transition back.
await db.exec("CREATE FUNCTION public.reject_test_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt failure'; END; $$; CREATE TRIGGER reject_test_receipt BEFORE INSERT ON public.crm_activities FOR EACH ROW EXECUTE FUNCTION public.reject_test_receipt();");
await assert.rejects(()=>move(admin,opportunity.id,stageRows[0].id,lost.version),/receipt failure/);
assert.equal((await db.query("SELECT status FROM public.crm_opportunities WHERE id=$1",[opportunity.id])).rows[0].status,'lost');
await db.exec("DROP TRIGGER reject_test_receipt ON public.crm_activities; DROP FUNCTION public.reject_test_receipt();");

// Lead conversion and follow-up completion use the same tenant/RLS boundary.
const personId=(await db.query("SELECT id FROM public.crm_people WHERE tenant_id=$1 LIMIT 1",[luton.tenantId])).rows[0].id;
async function newLead(status='qualified') { return (await db.query("INSERT INTO public.crm_leads(tenant_id,title,status,person_id,owner_user_id) VALUES($1,'Conversion test',$2,$3,$4) RETURNING *,updated_at::text AS version",[luton.tenantId,status,personId,admin])).rows[0]; }
const leadToConvert=await newLead();
const convert=(user,lead,stage=stageRows[1].id,amount=250,currency='EUR',version=lead.version)=>asUser(user,()=>db.query("SELECT r.*,r.updated_at::text AS version FROM public.crm_convert_lead($1,$2,$3,$4,$5,$6) r",[luton.tenantId,lead.id,stage,version,amount,currency]));
await assert.rejects(()=>convert(stranger,leadToConvert),/write access denied/);
await assert.rejects(()=>convert(admin,leadToConvert,otherStage),/Open pipeline stage required/);
await assert.rejects(()=>convert(admin,leadToConvert,stageRows[3].id),/Open pipeline stage required/);
await assert.rejects(()=>convert(admin,leadToConvert,stageRows[1].id,-1),/Invalid deal value/);
await assert.rejects(()=>convert(admin,leadToConvert,stageRows[1].id,250,null),/currency required/);
await assert.rejects(()=>convert(admin,leadToConvert,stageRows[1].id,250,'EUR',null),/Refresh and try again/);
const unqualified=await newLead('unqualified');
await assert.rejects(()=>convert(admin,unqualified),/Only active leads/);
const converted=(await convert(admin,leadToConvert)).rows[0];
assert.equal(converted.person_id,personId);assert.equal(converted.owner_user_id,admin);assert.equal(converted.currency,'EUR');
const retry=(await convert(admin,leadToConvert)).rows[0];assert.equal(retry.id,converted.id);
const savedLead=(await db.query("SELECT status,converted_opportunity_id FROM public.crm_leads WHERE id=$1",[leadToConvert.id])).rows[0];
assert.deepEqual(savedLead,{status:'converted',converted_opportunity_id:converted.id});
assert.equal((await db.query("SELECT count(*)::int n FROM public.crm_activities WHERE lead_id=$1",[leadToConvert.id])).rows[0].n,1);
const foreignLead=(await db.query("INSERT INTO public.crm_leads(tenant_id,title) VALUES($1,'Other tenant') RETURNING *,updated_at::text AS version",[otherTenant])).rows[0];
await assert.rejects(()=>convert(admin,foreignLead),/lead unavailable/);
const follow=(await db.query("INSERT INTO public.crm_tasks(tenant_id,title,related_type,related_id,due_at) VALUES($1,'Call customer','opportunity',$2,now()) RETURNING *,updated_at::text AS version",[luton.tenantId,converted.id])).rows[0];
const complete=(user,task,version=task.version)=>asUser(user,()=>db.query("SELECT r.*,r.updated_at::text AS version FROM public.crm_complete_deal_followup($1,$2,$3) r",[luton.tenantId,task.id,version]));
await assert.rejects(()=>complete(stranger,follow),/write access denied/);
await assert.rejects(()=>complete(admin,follow,null),/Refresh and try again/);
const done=(await complete(admin,follow)).rows[0];assert.equal(done.status,'completed');
assert.equal((await complete(admin,follow)).rows[0].id,done.id);
assert.equal((await db.query("SELECT count(*)::int n FROM public.crm_activities WHERE metadata->>'taskId'=$1",[follow.id])).rows[0].n,1);
const cancelled=(await db.query("INSERT INTO public.crm_tasks(tenant_id,title,status,related_type,related_id) VALUES($1,'Cancelled','cancelled','opportunity',$2) RETURNING *,updated_at::text AS version",[luton.tenantId,converted.id])).rows[0];
await assert.rejects(()=>complete(admin,cancelled),/Only active follow-ups/);
const foreignTask=(await db.query("INSERT INTO public.crm_tasks(tenant_id,title,related_type,related_id) VALUES($1,'Other tenant','opportunity',$2) RETURNING *,updated_at::text AS version",[otherTenant,converted.id])).rows[0];
await assert.rejects(()=>complete(admin,foreignTask),/follow-up unavailable/);
const rollbackLead=await newLead();
const rollbackTask=(await db.query("INSERT INTO public.crm_tasks(tenant_id,title,related_type,related_id) VALUES($1,'Rollback','opportunity',$2) RETURNING *,updated_at::text AS version",[luton.tenantId,converted.id])).rows[0];
await db.exec("CREATE FUNCTION public.reject_test_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt failure'; END; $$; CREATE TRIGGER reject_test_receipt BEFORE INSERT ON public.crm_activities FOR EACH ROW EXECUTE FUNCTION public.reject_test_receipt();");
await assert.rejects(()=>convert(admin,rollbackLead),/receipt failure/);
await assert.rejects(()=>complete(admin,rollbackTask),/receipt failure/);
assert.equal((await db.query("SELECT converted_opportunity_id FROM public.crm_leads WHERE id=$1",[rollbackLead.id])).rows[0].converted_opportunity_id,null);
assert.equal((await db.query("SELECT count(*)::int n FROM public.crm_opportunities WHERE metadata->>'sourceLeadId'=$1",[rollbackLead.id])).rows[0].n,0);
assert.equal((await db.query("SELECT status FROM public.crm_tasks WHERE id=$1",[rollbackTask.id])).rows[0].status,'open');
await db.exec("DROP TRIGGER reject_test_receipt ON public.crm_activities; DROP FUNCTION public.reject_test_receipt();");
console.log("CRM conversion and completion: idempotency, validation, isolation and rollback verified");

const edit=(user,id,version,title='Updated deal',amount=500,currency='GBP',close='2026-12-01T10:00:00Z')=>asUser(user,()=>db.query("SELECT r.*,r.updated_at::text AS version FROM public.crm_edit_deal($1,$2,$3,$4,$5,$6,$7) r",[luton.tenantId,id,version,title,amount,currency,close]));
await assert.rejects(()=>edit(stranger,converted.id,converted.version),/write access denied/);
await assert.rejects(()=>edit(admin,converted.id,null),/Refresh and try again/);
await assert.rejects(()=>edit(admin,converted.id,converted.version,'   '),/title required/);
await assert.rejects(()=>edit(admin,converted.id,converted.version,'Invalid',-1),/Invalid deal value/);
await assert.rejects(()=>edit(admin,converted.id,converted.version,'Invalid',100,null),/currency required/);
await assert.rejects(()=>edit(admin,converted.id,converted.version,'Invalid',100,'GBP','infinity'),/Invalid close date/);
const edited=(await edit(admin,converted.id,converted.version)).rows[0];
assert.equal(edited.title,'Updated deal');assert.equal(Number(edited.amount),500);assert.equal(edited.currency,'GBP');
assert.equal(edited.stage_id,converted.stage_id);assert.equal(edited.owner_user_id,converted.owner_user_id);assert.deepEqual(edited.metadata,converted.metadata);
await assert.rejects(()=>edit(admin,converted.id,converted.version),/Refresh and try again/);
const beforeNoop=(await db.query("SELECT count(*)::int n FROM public.crm_activities WHERE opportunity_id=$1",[converted.id])).rows[0].n;
await edit(admin,converted.id,edited.version);
assert.equal((await db.query("SELECT count(*)::int n FROM public.crm_activities WHERE opportunity_id=$1",[converted.id])).rows[0].n,beforeNoop);
const editReceipt=(await db.query("SELECT metadata FROM public.crm_activities WHERE opportunity_id=$1 AND summary='Deal details updated'",[converted.id])).rows[0];
assert.equal(editReceipt.metadata.before.currency,'EUR');assert.equal(editReceipt.metadata.after.currency,'GBP');
await db.exec("CREATE FUNCTION public.reject_test_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt failure'; END; $$; CREATE TRIGGER reject_test_receipt BEFORE INSERT ON public.crm_activities FOR EACH ROW EXECUTE FUNCTION public.reject_test_receipt();");
await assert.rejects(()=>edit(admin,converted.id,edited.version,'Should roll back'),/receipt failure/);
assert.equal((await db.query("SELECT title FROM public.crm_opportunities WHERE id=$1",[converted.id])).rows[0].title,'Updated deal');
await db.exec("DROP TRIGGER reject_test_receipt ON public.crm_activities; DROP FUNCTION public.reject_test_receipt();");
const cleared=(await edit(admin,converted.id,edited.version,'Cleared',null,null,null)).rows[0];
assert.equal(cleared.amount,null);assert.equal(cleared.expected_close_at,null);
console.log("CRM deal details: guarded edits, unchanged fields, no-op audit and rollback verified");

const requestId='12345678-1234-4234-8234-123456789012';
const log=(user,request=requestId,kind='note',text='Customer requested a proposal',dealId=converted.id)=>asUser(user,()=>db.query("SELECT * FROM public.crm_log_deal_activity($1,$2,$3,$4,$5)",[luton.tenantId,dealId,request,kind,text]));
await assert.rejects(()=>log(stranger),/write access denied/);
await assert.rejects(()=>log(admin,null),/Invalid activity request/);
await assert.rejects(()=>log(admin,requestId,'email'),/Invalid activity request/);
await assert.rejects(()=>log(admin,requestId,'note','   '),/Activity text required/);
await assert.rejects(()=>log(admin,requestId,'note','x'.repeat(4001)),/Activity text required/);
await assert.rejects(()=>log(admin,requestId,'note','Missing deal','00000000-0000-4000-8000-000000000000'),/opportunity unavailable/);
const logged=(await log(admin)).rows[0];assert.equal(logged.person_id,personId);assert.equal(logged.actor_user_id,admin);
assert.equal(logged.metadata.capture,'manual');assert.equal(logged.opportunity_id,converted.id);
assert.equal((await log(admin)).rows[0].id,logged.id);
assert.equal((await db.query("SELECT count(*)::int n FROM public.crm_activities WHERE tenant_id=$1 AND external_ref=$2",[luton.tenantId,requestId])).rows[0].n,1);
await assert.rejects(()=>log(admin,requestId,'call'),/different details/);
await assert.rejects(()=>log(admin,requestId,'note','Changed'),/different details/);
await assert.rejects(()=>log(admin,requestId,'note','Customer requested a proposal',opportunity.id),/different details/);
for(const kind of ['call','meeting']){
 const id=(await db.query('SELECT gen_random_uuid() AS id')).rows[0].id;
 assert.equal((await log(admin,id,kind,'Discussed next steps')).rows[0].activity_type,kind);
}
assert.equal((await db.query("SELECT title FROM public.crm_opportunities WHERE id=$1",[converted.id])).rows[0].title,'Cleared');
console.log("CRM manual activity: linked customer, allowed types, actor and idempotent retry verified");
await db.query("UPDATE public.tenant_services SET status='suspended' WHERE tenant_id=$1 AND service_key='omniqora.crm'",[luton.tenantId]);
await assert.rejects(()=>move(admin,opportunity.id,stageRows[0].id,lost.version),/entitlement required/);
await assert.rejects(()=>convert(admin,rollbackLead),/entitlement required/);
await assert.rejects(()=>complete(admin,rollbackTask),/entitlement required/);
await assert.rejects(()=>edit(admin,converted.id,cleared.version),/entitlement required/);
await assert.rejects(()=>log(admin),/entitlement required/);
console.log("CRM sales stage transitions, concurrency, rollback, outcomes and isolation verified");
await db.close();
console.log("CRM Customer 360 contact bridge, pipeline and tenant isolation verified");
