import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE PUBLICATION supabase_realtime;`);
 const dir=new URL('../../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(x=>x.endsWith('.sql')).sort()){
  if(file.startsWith('20260816120554'))for(const id of ['18bafcd5-3e4c-4044-bb63-10325a0b7209','e66c0525-1787-4250-be26-79f849624521','890c71b1-cf6e-4b68-a56e-dd6050372481','97319fe5-82fd-44cd-b27d-6ae314ee368b'])await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id,'fixture@example.invalid']);
  await db.exec(await readFile(new URL(file,dir),'utf8'));
 }
 const admin=randomUUID();await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[admin,'sales-fairness@example.invalid']);await db.query('INSERT INTO public.platform_admins(user_id) VALUES($1)',[admin]);
 async function run(sql,args=[]){
  await db.exec('BEGIN; SET LOCAL ROLE authenticated;');await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[admin]);
  try{const result=await db.query(sql,args);await db.exec('COMMIT');return result.rows;}catch(e){await db.exec('ROLLBACK');throw e;}
 }
 const pilot=(await run('SELECT public.platform_bootstrap_dishbee_pilot() AS x'))[0].x;
 const tenant=pilot.tenants.find(t=>t.tenantSlug==='mealdeck').tenantId;
 await db.query("INSERT INTO public.tenant_services(tenant_id,service_key,status) VALUES($1,'omniqora.sales-engagement','active') ON CONFLICT(tenant_id,service_key) DO UPDATE SET status='active'",[tenant]);
 async function sequence(kind){
  const id=(await run('SELECT public.sales_v1_create_sequence($1,$2,NULL,$3) AS id',[tenant,'Queue fairness '+kind,JSON.stringify([{kind,title:'Controlled fixture',body:'Not sent.',delayMinutes:0}])]))[0].id;
  await run("SELECT public.sales_v1_sequence_status($1,$2,'active')",[tenant,id]);return id;
 }
 async function enrol(sequence){
  const person=(await db.query("INSERT INTO public.crm_people(tenant_id,display_name) VALUES($1,'Queue fixture') RETURNING id",[tenant])).rows[0].id;
  return (await run('SELECT public.sales_v1_enrol($1,$2,$3) AS id',[tenant,sequence,person]))[0].id;
 }
 const email=await sequence('email');
 for(let i=0;i<70;i++)await enrol(email);
 const prepare=async()=> (await run('SELECT public.sales_v1_prepare_due($1,50) AS result',[tenant]))[0].result;
 assert.equal((await prepare()).prepared,50);
 assert.equal((await prepare()).prepared,20,'Existing blocked drafts must not starve the next batch');
 assert.equal((await prepare()).prepared,0);
 const manual=await sequence('call'),enrolment=await enrol(manual);
 assert.equal((await prepare()).prepared,1,'Later manual work must pass the 70 already-prepared drafts');
 assert.equal((await prepare()).prepared,0);
 const action=(await db.query('SELECT * FROM public.sales_sequence_actions WHERE enrolment_id=$1',[enrolment])).rows[0];
 await db.query("UPDATE public.crm_tasks SET status='completed' WHERE id=$1",[action.task_id]);
 assert.equal((await prepare()).reconciled,1,'CRM outcomes must remain selectable for reconciliation');
 const counts=(await db.query('SELECT status,count(*)::int AS n FROM public.sales_sequence_actions WHERE tenant_id=$1 GROUP BY status',[tenant])).rows;
 assert.equal(counts.find(x=>x.status==='pending_review').n,70);
 assert.equal(counts.find(x=>x.status==='completed').n,1);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM public.crm_tasks WHERE tenant_id=$1 AND external_ref LIKE $2',[tenant,'sales-v1:%'])).rows[0].n,1);
 console.log('PASS sales queue fairness: 70 blocked drafts do not starve later work; repeated preparation is duplicate-safe; external CRM completion reconciles.');
}finally{await db.close();}
