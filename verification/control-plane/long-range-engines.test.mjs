import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

const db=new PGlite();
const migrations=new URL("../../supabase/migrations/",import.meta.url);
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE PUBLICATION supabase_realtime;`);
for(const name of (await readdir(migrations)).filter(x=>x.endsWith(".sql")).sort()){
 const sql=await readFile(new URL(name,migrations),"utf8");
 if(name.startsWith("20260816120554")){
  for(const id of ["18bafcd5-3e4c-4044-bb63-10325a0b7209","e66c0525-1787-4250-be26-79f849624521","890c71b1-cf6e-4b68-a56e-dd6050372481","97319fe5-82fd-44cd-b27d-6ae314ee368b"])
   await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,"fixture@example.invalid"]);
 }
 await db.exec(sql);
}
const admin="55555555-aaaa-4aaa-8aaa-555555555555",stranger="44444444-bbbb-4bbb-8bbb-444444444444";
for(const id of[admin,stranger])await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,id+"@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
async function asUser(user,fn){
 await db.exec("BEGIN;SET LOCAL ROLE authenticated;");
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);
 try{const v=await fn();await db.exec("COMMIT");return v;}catch(e){await db.exec("ROLLBACK");throw e;}
}
const pilot=await asUser(admin,async()=> (await db.query("SELECT public.platform_bootstrap_dishbee_pilot() AS result")).rows[0].result);
const tenant=pilot.tenants.find(x=>x.tenantSlug==="mealdeck");assert(tenant?.tenantId);

const templates=await asUser(admin,()=>db.query("SELECT template_key FROM public.agent_template_catalogue WHERE status='active'"));
assert.equal(templates.rows.length,38);
for(const key of ["sales.prospect","service.triage","finance.bookkeeping","education.student","foodsafe.readiness"])
 assert(templates.rows.some(r=>r.template_key===key),key);

const services=await db.query("SELECT service_key FROM public.service_catalogue WHERE service_key IN('omniqora.sales-engagement','omniqora.contact-centre','omniqora.agent-library','omniqora.attribution','omniqora.company-memory','omniqora.bi','omniqora.education','omniqora.food-safety')");
assert.equal(services.rows.length,8);
const products=await db.query("SELECT product_key FROM public.product_catalogue WHERE product_key IN('unipathway','haccora')");
assert.equal(products.rows.length,2);
const packs=await db.query("SELECT pack_key,jurisdiction FROM public.compliance_pack_definitions WHERE pack_key IN('haccora-gb-food-safety','haccora-de-food-safety') ORDER BY pack_key");
assert.deepEqual(packs.rows.map(r=>r.jurisdiction).sort(),["DE","GB"]);

await asUser(admin,()=>db.query("INSERT INTO public.sales_prospect_lists(tenant_id,product_key,name,source_type,status,owner_user_id) VALUES($1,'omniqora','Priority prospects','manual','active',$2)",[tenant.tenantId,admin]));
const queue=(await asUser(admin,()=>db.query("INSERT INTO public.contact_centre_queues(tenant_id,product_key,queue_key,name,channels,ai_first,human_overflow,status) VALUES($1,'omniqora','general','General',ARRAY['voice','whatsapp'],true,true,'active') RETURNING id",[tenant.tenantId]))).rows[0].id;
await asUser(admin,()=>db.query("INSERT INTO public.contact_centre_sessions(tenant_id,product_key,queue_id,channel,direction,status,ai_handled,human_escalated) VALUES($1,'omniqora',$2,'voice','inbound','completed',true,false)",[tenant.tenantId,queue]));
await asUser(admin,()=>db.query("INSERT INTO public.company_memory_facts(tenant_id,product_key,subject_type,subject_ref,fact_key,fact_value,evidence_refs,status,reviewed_by) VALUES($1,'omniqora','company','fixture-company','preferred-channel','\"whatsapp\"'::jsonb,'[\"source-1\"]'::jsonb,'reviewed',$2)",[tenant.tenantId,admin]));
await asUser(admin,()=>db.query("INSERT INTO public.marketing_attribution_touchpoints(tenant_id,product_key,channel,source,medium,campaign_ref) VALUES($1,'omniqora','email','newsletter','email','autumn-26')",[tenant.tenantId]));
await asUser(admin,()=>db.query("INSERT INTO public.education_students(tenant_id,product_key,student_ref,status,profile) VALUES($1,'unipathway','STU-1','active','{\"programme\":\"Business\"}'::jsonb)",[tenant.tenantId]));
await asUser(admin,()=>db.query("INSERT INTO public.analytics_datasets(tenant_id,product_key,dataset_key,name) VALUES($1,'omniqora','executive-kpi','Executive KPI')",[tenant.tenantId]));

const hidden=await asUser(stranger,()=>db.query("SELECT * FROM public.company_memory_facts WHERE tenant_id=$1",[tenant.tenantId]));
assert.equal(hidden.rows.length,0);
const hiddenStudents=await asUser(stranger,()=>db.query("SELECT * FROM public.education_students WHERE tenant_id=$1",[tenant.tenantId]));
assert.equal(hiddenStudents.rows.length,0);

await db.close();
console.log("Long-range Omniqora engines verified: sales, contact centre, 38 agent templates, attribution, memory, BI, education and Haccora packs");
