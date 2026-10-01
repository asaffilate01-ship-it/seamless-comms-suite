import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
const db=new PGlite(),migrations=new URL("../../supabase/migrations/",import.meta.url);
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE PUBLICATION supabase_realtime;`);
for(const name of (await readdir(migrations)).filter(x=>x.endsWith(".sql")).sort()){const sql=await readFile(new URL(name,migrations),"utf8");if(name.startsWith("20260816120554"))for(const id of ["18bafcd5-3e4c-4044-bb63-10325a0b7209","e66c0525-1787-4250-be26-79f849624521","890c71b1-cf6e-4b68-a56e-dd6050372481","97319fe5-82fd-44cd-b27d-6ae314ee368b"])await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,"fixture@example.invalid"]);await db.exec(sql);}
const admin="11111111-aaaa-4aaa-8aaa-111111111111",clientUser="22222222-bbbb-4bbb-8bbb-222222222222",stranger="33333333-cccc-4ccc-8ccc-333333333333";
for(const id of [admin,clientUser,stranger])await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,id+"@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
async function asUser(user,fn){await db.exec("BEGIN;SET LOCAL ROLE authenticated;");await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);try{const v=await fn();await db.exec("COMMIT");return v;}catch(e){await db.exec("ROLLBACK");throw e;}}
const pilot=await asUser(admin,async()=> (await db.query("SELECT public.platform_bootstrap_dishbee_pilot() AS result")).rows[0].result);
const luton=pilot.tenants.find(x=>x.tenantSlug==="cafe1-luton");assert(luton?.tenantId);
await asUser(admin,()=>db.query("SELECT public.platform_set_tenant_product($1,'omniqora-accounts',true,'{}'::jsonb)",[luton.tenantId]));
await asUser(admin,()=>db.query("SELECT public.platform_set_tenant_service($1,'omniqora.practice',true,'{}'::jsonb)",[luton.tenantId]));
await db.exec("SET ROLE service_role");
await db.query("UPDATE public.tenant_products SET status='active' WHERE tenant_id=$1 AND product_key='omniqora-accounts'",[luton.tenantId]);
await db.query("UPDATE public.tenant_services SET status='active' WHERE tenant_id=$1 AND service_key IN ('omniqora.crm','omniqora.practice')",[luton.tenantId]);
await db.exec("RESET ROLE");

const company=await asUser(admin,async()=> (await db.query("INSERT INTO public.crm_companies(tenant_id,name,status) VALUES($1,'Practice Client Ltd','customer') RETURNING id",[luton.tenantId])).rows[0].id);
const client=await asUser(admin,async()=> (await db.query("SELECT public.practice_workspace_command($1,$2,$3::jsonb) AS result",[luton.tenantId,"omniqora-accounts",JSON.stringify({operation:"client.save",client:{crmCompanyId:company,displayName:"Practice Client Ltd",billingEmail:"client@example.invalid",status:"active",metadata:{}}})])).rows[0].result.id);
assert(client);

const phases=[{title:"Collect records",budgetMinutes:30},{title:"Prepare",budgetMinutes:90},{title:"Review",budgetMinutes:30}];
const service=await asUser(admin,async()=> (await db.query("SELECT public.practice_workspace_command($1,$2,$3::jsonb) AS result",[luton.tenantId,"omniqora-accounts",JSON.stringify({operation:"service.save",service:{key:"accounts",name:"Accounts preparation",industry:"Accounting",currency:"GBP",baseMinor:10000,unitMinor:2500,recurrence:"annual",phases}})])).rows[0].result.id);
assert(service);

const createJob={operation:"job.create",clientId:client,serviceId:service,periodKey:"2026",internalDue:null,externalDue:null};
const job1=await asUser(admin,async()=> (await db.query("SELECT public.practice_workspace_command($1,$2,$3::jsonb) AS result",[luton.tenantId,"omniqora-accounts",JSON.stringify(createJob)])).rows[0].result);
const job2=await asUser(admin,async()=> (await db.query("SELECT public.practice_workspace_command($1,$2,$3::jsonb) AS result",[luton.tenantId,"omniqora-accounts",JSON.stringify(createJob)])).rows[0].result);
assert.equal(job1.id,job2.id);assert.equal(job2.existing,true);
const jobRow=await asUser(admin,()=>db.query("SELECT work_version FROM public.practice_engagements WHERE id=$1",[job1.id]));
const phaseRows=await asUser(admin,()=>db.query("SELECT id,position FROM public.practice_job_phases WHERE engagement_id=$1 ORDER BY position",[job1.id]));
await assert.rejects(()=>asUser(admin,()=>db.query("SELECT public.practice_workspace_command($1,$2,$3::jsonb)",[luton.tenantId,"omniqora-accounts",JSON.stringify({operation:"phase.complete",jobId:job1.id,phaseId:phaseRows.rows[1].id,expectedVersion:jobRow.rows[0].work_version})])),/Earlier phases/);
await asUser(admin,()=>db.query("SELECT public.practice_workspace_command($1,$2,$3::jsonb)",[luton.tenantId,"omniqora-accounts",JSON.stringify({operation:"phase.complete",jobId:job1.id,phaseId:phaseRows.rows[0].id,expectedVersion:jobRow.rows[0].work_version})]));

const due=new Date(Date.now()-86400000).toISOString();
const request=await asUser(admin,async()=> (await db.query("SELECT public.practice_workspace_command($1,$2,$3::jsonb) AS result",[luton.tenantId,"omniqora-accounts",JSON.stringify({operation:"request.create",jobId:job1.id,title:"Bank statements",dueAt:due,chaseEnabled:true})])).rows[0].result.id);
const expires=new Date(Date.now()+7*86400000).toISOString();
const proposal=await asUser(admin,async()=> (await db.query("SELECT public.practice_workspace_command($1,$2,$3::jsonb) AS result",[luton.tenantId,"omniqora-accounts",JSON.stringify({operation:"proposal.create",clientId:client,serviceId:service,units:1,catchupMinor:5000,terms:"Agreed services",expiresAt:expires})])).rows[0].result.id);
await asUser(admin,()=>db.query("SELECT public.practice_workspace_command($1,$2,$3::jsonb)",[luton.tenantId,"omniqora-accounts",JSON.stringify({operation:"proposal.issue",proposalId:proposal})]));
await asUser(admin,()=>db.query("SELECT public.practice_grant_client_user($1,$2,$3,$4,$5)",[luton.tenantId,"omniqora-accounts",client,clientUser,"client_owner"]));
const portal=await asUser(clientUser,async()=> (await db.query("SELECT public.practice_portal_workspace($1,'read',NULL,NULL) AS result",[client])).rows[0].result);
assert.equal(portal.client.displayName,"Practice Client Ltd");assert.equal(portal.proposals.length,1);
await asUser(clientUser,()=>db.query("SELECT public.practice_portal_workspace($1,'respond',$2,$3)",[client,request,"Uploaded / explained"]));
await asUser(clientUser,()=>db.query("SELECT public.practice_portal_workspace($1,'accept',$2,NULL)",[client,proposal]));
const accepted=await db.query("SELECT status,accepted_by FROM public.practice_proposals WHERE id=$1",[proposal]);
assert.deepEqual(accepted.rows[0],{status:"accepted",accepted_by:clientUser});

const hidden=await asUser(stranger,()=>db.query("SELECT * FROM public.practice_clients WHERE tenant_id=$1",[luton.tenantId]));
assert.equal(hidden.rows.length,0);

const today=new Date().toISOString().slice(0,10);
await asUser(admin,()=>db.query("SELECT public.practice_workspace_command($1,$2,$3::jsonb)",[luton.tenantId,"omniqora-accounts",JSON.stringify({operation:"recurrence.save",clientId:client,serviceId:service,nextOn:today,internalDays:10,externalDays:20,enabled:true})]));
await db.exec("SET ROLE service_role");
const automated=await db.query("SELECT public.run_practice_automation(50) AS result");
await db.exec("RESET ROLE");
assert(automated.rows[0].result.jobsCreated>=1);
assert(automated.rows[0].result.reminderEventsQueued>=1);
const reminder=await db.query("SELECT count(*)::int AS count FROM public.platform_events WHERE event_type='practice.request.reminder_due'");
assert.equal(reminder.rows[0].count,1);

const status=await db.query("SELECT implementation_status FROM public.service_catalogue WHERE service_key='omniqora.practice'");
assert.equal(status.rows[0].implementation_status,"built_main");
await db.close();
console.log("Practice workspace, portal, recurrence and reminder event gates verified");
