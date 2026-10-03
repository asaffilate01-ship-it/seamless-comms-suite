import assert from "node:assert/strict";
import { readFile,readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

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
const admin="77777777-aaaa-4aaa-8aaa-777777777777",stranger="66666666-bbbb-4bbb-8bbb-666666666666";
for(const id of[admin,stranger])await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,id+"@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
async function asUser(user,fn){
 await db.exec("BEGIN;SET LOCAL ROLE authenticated;");
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);
 try{const v=await fn();await db.exec("COMMIT");return v;}catch(e){await db.exec("ROLLBACK");throw e;}
}
const pilot=await asUser(admin,async()=> (await db.query("SELECT public.platform_bootstrap_dishbee_pilot() AS result")).rows[0].result);
const tenant=pilot.tenants.find(x=>x.tenantSlug==="mealdeck");assert(tenant?.tenantId);

const ing=(await asUser(admin,()=>db.query(
 "INSERT INTO public.accounting_ingestion_jobs(tenant_id,product_key,client_ref,source_kind,status) VALUES($1,'mealdeck','313-brands','pdf','review') RETURNING id",
 [tenant.tenantId]))).rows[0].id;
const review=(await asUser(admin,()=>db.query(`
 INSERT INTO public.accounting_review_items(
  tenant_id,product_key,ingestion_job_id,client_ref,issue_type,question,proposed_entry,status,reviewed_by,reviewed_at
 ) VALUES($1,'mealdeck',$2,'313-brands','accounting_policy','Approve balanced test journal',
 $3::jsonb,'approved',$4,now()) RETURNING id`,[
 tenant.tenantId,ing,JSON.stringify({
  journalDate:"2026-10-03",periodEnd:"2026-10-31",reference:"TEST-1",description:"Test purchase",currency:"GBP",
  lines:[
   {accountCode:"5000",accountName:"Purchases",debitMinor:10000,creditMinor:0},
   {accountCode:"1200",accountName:"Bank",debitMinor:0,creditMinor:10000}
  ]
 }),admin
]))).rows[0].id;
const journal=(await asUser(admin,async()=> (await db.query(
 "SELECT public.accounting_post_reviewed_entry($1,$2,$3) AS id",[tenant.tenantId,review,admin])).rows[0].id));
assert(journal);
const balanced=await asUser(admin,()=>db.query(
 "SELECT sum(debit_minor)::bigint AS d,sum(credit_minor)::bigint AS c FROM public.accounting_journal_lines WHERE journal_id=$1",[journal]));
assert.equal(String(balanced.rows[0].d),"10000");assert.equal(String(balanced.rows[0].c),"10000");

await asUser(admin,()=>db.query(`
 INSERT INTO public.tax_knowledge_sources(jurisdiction,authority,source_type,authority_level,title,source_url,checked_at)
 VALUES('GB','HMRC','manual','official_guidance','Fixture guidance','https://example.invalid/hmrc',now())`));
const taxCase=(await asUser(admin,()=>db.query(
 "INSERT INTO public.tax_research_cases(tenant_id,product_key,client_ref,jurisdiction,tax_type,question) VALUES($1,'mealdeck','313-brands','GB','corporation_tax','Fixture question') RETURNING id",
 [tenant.tenantId]))).rows[0].id;
await asUser(admin,()=>db.query(`
 INSERT INTO public.tax_positions(tenant_id,product_key,research_case_id,title,position_type,proposed_treatment,legal_basis,confidence,risk)
 VALUES($1,'mealdeck',$2,'Fixture position','deduction','Draft treatment','Must be reviewed against authority',0.7,'specialist_review')`,
 [tenant.tenantId,taxCase]));

const run=(await asUser(admin,()=>db.query(`
 INSERT INTO public.ai_agent_runs(tenant_id,product_key,profile_key,goal,status,created_by)
 VALUES($1,'mealdeck','transaction','Review carve-out readiness','queued',$2) RETURNING id`,[tenant.tenantId,admin]))).rows[0].id;
await asUser(admin,()=>db.query(`
 INSERT INTO public.ai_agent_steps(tenant_id,run_id,step_no,step_type,tool_key,input,output,evidence_refs)
 VALUES($1,$2,1,'tool','evidence.search','{}','{"result":"fixture"}','["fixture-source"]')`,[tenant.tenantId,run]));
await asUser(admin,()=>db.query(`
 INSERT INTO public.ai_action_approvals(tenant_id,run_id,action_key,proposal,status,proposed_by)
 VALUES($1,$2,'task.create','{"title":"Review TSA"}','pending',$3)`,[tenant.tenantId,run,admin]));

const enrich=(await asUser(admin,()=>db.query(`
 INSERT INTO public.knowledge_enrichment_runs(tenant_id,product_key,collection_key,document_ref,document_revision,status,entity_count,edge_count,created_by)
 VALUES($1,'mealdeck','deal-room','doc-1',1,'review',2,1,$2) RETURNING id`,[tenant.tenantId,admin]))).rows[0].id;
await asUser(admin,()=>db.query(`
 INSERT INTO public.knowledge_entity_candidates(tenant_id,run_id,entity_key,label,entity_type,evidence_quote,confidence)
 VALUES($1,$2,'seller','Seller Ltd','company','Seller Ltd supplies Target Ltd.',0.98),
       ($1,$2,'target','Target Ltd','company','Seller Ltd supplies Target Ltd.',0.98)`,[tenant.tenantId,enrich]));
await asUser(admin,()=>db.query(`
 INSERT INTO public.knowledge_edge_candidates(tenant_id,run_id,source_key,relation,target_key,supporting_quote,confidence)
 VALUES($1,$2,'seller','supplies','target','Seller Ltd supplies Target Ltd.',0.96)`,[tenant.tenantId,enrich]));

const programme=(await asUser(admin,()=>db.query(`
 INSERT INTO public.transaction_programmes(tenant_id,product_key,name,programme_type,status,owner_user_id)
 VALUES($1,'mealdeck','Fixture carve-out','carve_out','planning',$2) RETURNING id`,[tenant.tenantId,admin]))).rows[0].id;
await asUser(admin,()=>db.query(`
 INSERT INTO public.transaction_day1_gates(tenant_id,programme_id,domain,gate_key,title,critical,status,reviewed_by,reviewed_at)
 VALUES($1,$2,'identity','identity-ready','Identity ready',true,'passed',$3,now())`,[tenant.tenantId,programme,admin]));
await asUser(admin,()=>db.query(`
 INSERT INTO public.transaction_tsa_obligations(tenant_id,programme_id,service_name,provider_party,recipient_party,exit_criteria,status)
 VALUES($1,$2,'IT support','Seller','Buyer','Buyer service live','agreed')`,[tenant.tenantId,programme]));
const readiness=await asUser(admin,async()=> (await db.query("SELECT public.transaction_readiness($1) AS r",[programme])).rows[0].r);
assert.equal(readiness.ready,true);

const household=(await asUser(admin,()=>db.query(
 "INSERT INTO public.childcare_households(tenant_id,product_key,household_ref,postcode,care_requirements) VALUES($1,'kindelo','hh-1','LU1','{\"days\":[\"mon\"]}'::jsonb) RETURNING id",
 [tenant.tenantId]))).rows[0].id;
const provider=(await asUser(admin,()=>db.query(
 "INSERT INTO public.childcare_providers(tenant_id,product_key,provider_ref,postcode,status) VALUES($1,'kindelo','cm-1','LU1','active') RETURNING id",
 [tenant.tenantId]))).rows[0].id;
const match=(await asUser(admin,async()=> (await db.query(
 "SELECT public.childcare_propose_match($1,'kindelo',$2,$3,92,1.4,'[\"location\",\"availability\"]'::jsonb,'[]'::jsonb) AS id",
 [tenant.tenantId,household,provider])).rows[0].id));assert(match);

const vehicle=(await asUser(admin,()=>db.query(
 "INSERT INTO public.vehicle_profiles(tenant_id,product_key,vehicle_ref,vin,registration,make,model,identity_status) VALUES($1,'sparesgrid','veh-1','VIN-FIXTURE-1','AB12CDE','Fixture','Car','partially_verified') RETURNING id",
 [tenant.tenantId]))).rows[0].id;
await asUser(admin,()=>db.query(
 "INSERT INTO public.vehicle_evidence_records(tenant_id,vehicle_id,evidence_type,source_provider,result,confidence) VALUES($1,$2,'identity','fixture','{\"verified\":true}'::jsonb,0.99)",
 [tenant.tenantId,vehicle]));
const verticalStatus=await asUser(admin,()=>db.query(
 "SELECT package_key,implementation_status FROM public.vertical_package_catalogue WHERE package_key IN('kindelo.childcare','automotive.shared') ORDER BY package_key"));
assert(verticalStatus.rows.every(r=>r.implementation_status==="live_main"));

const hidden=await asUser(stranger,()=>db.query("SELECT * FROM public.transaction_programmes WHERE id=$1",[programme]));
assert.equal(hidden.rows.length,0);
const profiles=await asUser(admin,()=>db.query("SELECT profile_key FROM public.ai_agent_profiles ORDER BY profile_key"));
assert(profiles.rows.some(r=>r.profile_key==="accounting"));
assert(profiles.rows.some(r=>r.profile_key==="transaction"));
await db.close();
console.log("Omniqora non-Dishbee completion: accounting, tax, governed AI, knowledge enrichment and M&A controls verified");
