import assert from "node:assert/strict";
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
const pilot=await asUser(admin,async()=> (await db.query("SELECT public.platform_bootstrap_dishbee_pilot() AS result")).rows[0].result);
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

await db.close();
console.log("CRM Customer 360 contact bridge, pipeline and tenant isolation verified");
