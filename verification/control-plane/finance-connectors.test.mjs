import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import ts from "typescript";

// Validate the actual committed TypeScript implementation without requiring a bundler.
const root=new URL("../../",import.meta.url);
function compile(source){const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});return outputText;}
const catSource=await readFile(new URL("src/modules/finance-connectors/catalogue.ts",root),"utf8");
const catUrl="data:text/javascript;base64,"+Buffer.from(compile(catSource)).toString("base64");
const catalogue=await import(catUrl);
assert.equal(catalogue.FINANCE_PROVIDERS.length,25);
assert(catalogue.FINANCE_PROVIDERS.every(p=>p.status==="candidate"&&p.contractRequired));
assert.equal(catalogue.recommendFinanceConnectors("travenexa","MarocWays").some(p=>p.key==="checkout.klarna"),true);
assert.equal(catalogue.recommendFinanceConnectors("travenexa","MarocWays","US").length,0);
assert.equal(catalogue.recommendFinanceConnectors("dishbee","Cafe 1").some(p=>p.family==="b2b_terms"),false);
assert(catalogue.FINANCE_PLACEMENTS.every(p=>!p.enabledByDefault));
const adaptersSource=await readFile(new URL("src/modules/finance-connectors/adapters.ts",root),"utf8");
const adaptersUrl="data:text/javascript;base64,"+Buffer.from(compile(adaptersSource)
 .replace('from "./catalogue"',`from "${catUrl}"`)
 .replace("from './catalogue'",`from "${catUrl}"`)).toString("base64");
const adapters=await import(adaptersUrl);
assert.equal(adapters.CONNECTOR_STUBS.length,25);
assert(adapters.CONNECTOR_STUBS.every(c=>c.certified===false&&c.isOperational()===false));
await assert.rejects(()=>adapters.connectorFor("finance.youlend").prequalify({}),/not contracted/);
await assert.rejects(()=>adapters.connectorFor("checkout.klarna").begin({}),/not contracted/);
await assert.rejects(()=>adapters.connectorFor("trade.kriya").request({}),/not contracted/);
await assert.rejects(()=>adapters.connectorFor("personal.monevo").quote({}),/not contracted/);
assert.equal(catalogue.recommendFinanceConnectors("zoryn").some(p=>p.family==="personal_finance"),true);
assert.equal(catalogue.recommendFinanceConnectors("dishbee").some(p=>p.family==="personal_finance"),false);

const engineSource=await readFile(new URL("src/modules/finance-connectors/engine.ts",root),"utf8");
const engineUrl="data:text/javascript;base64,"+Buffer.from(compile(engineSource)
  .replace('from "./catalogue"',`from "${catUrl}"`)
  .replace("from './catalogue'",`from "${catUrl}"`)).toString("base64");
const engine=await import(engineUrl);
const tx={
 tenantId:"tenant-a",productKey:"craftvaro",providerKey:"checkout.klarna",
 legalEntityId:"entity-a",merchantAccount:"merchant-a",countryCode:"GB",currency:"GBP",
 merchantCountryCode:"GB",category:"retail",audience:"consumer",programme:"paylater",
 sourceVerified:true,hasCustomerConsent:true,isCrossMerchantBasket:false,
 sellerOfRecordApproved:false,providerReturnedMethod:true,verifiedOrderTotal:true
};
const verifiedAt=new Date("2026-10-13T12:00:00Z").toISOString();
const binding={
 tenantId:"tenant-a",productKey:"craftvaro",providerKey:"checkout.klarna",environment:"production",status:"active",
 lastVerifiedAt:verifiedAt,legalEntityId:"entity-a",merchantAccount:"merchant-a",contracted:true,
 complianceApproved:true,countryApproved:true,categoryApproved:true,settlementApproved:true,
 exactProgrammes:["paylater"]
};
const now=new Date("2026-10-13T13:00:00Z");
assert.equal(engine.evaluateFinanceTransaction(tx,null,now).allowed,false);
assert.equal(engine.evaluateFinanceTransaction(tx,{...binding,tenantId:"tenant-b"},now).allowed,false);
assert.equal(engine.evaluateFinanceTransaction(tx,{...binding,status:"configured"},now).allowed,false);
assert.equal(engine.evaluateFinanceTransaction({...tx,providerReturnedMethod:false},binding,now).allowed,false);
assert.equal(engine.evaluateFinanceTransaction(tx,binding,new Date("2026-10-15T13:00:00Z")).allowed,false);
assert.equal(engine.evaluateFinanceTransaction({...tx,hasCustomerConsent:false},binding,now).allowed,false);
assert.equal(engine.evaluateFinanceTransaction({...tx,isCrossMerchantBasket:true},binding,now).allowed,false);
assert.equal(engine.evaluateFinanceTransaction({...tx,sellerOfRecordApproved:true,isCrossMerchantBasket:true},binding,now).allowed,true);
const personalTx={...tx,productKey:"zoryn",providerKey:"personal.monevo",merchantAccount:undefined,
 audience:"consumer",programme:"personal-loan",isCrossMerchantBasket:false,verifiedOrderTotal:false,
 providerReturnedMethod:false};
const personalBinding={...binding,productKey:"zoryn",providerKey:"personal.monevo",merchantAccount:undefined,
 exactProgrammes:["personal-loan"],regulatedCreditBrokerApproved:false,consumerDutyJourneyApproved:false};
assert.equal(engine.evaluateFinanceTransaction(personalTx,personalBinding,now).allowed,false);
assert(engine.evaluateFinanceTransaction(personalTx,personalBinding,now).reasonCodes.includes("personal_credit_broking_authorisation_missing"));
assert.equal(engine.evaluateFinanceTransaction(personalTx,{...personalBinding,regulatedCreditBrokerApproved:true,consumerDutyJourneyApproved:true},now).allowed,true);

assert.deepEqual(engine.verifiedCheckoutMethods(["klarna","paypal","klarna"],["klarna"]),["klarna"]);
assert.throws(()=>engine.invoiceTotalPence([{qty:2,unitPence:1500}],2999),/mismatch/);
await assert.rejects(()=>engine.disabledFinanceConnector("finance.youlend").execute({}),/not contracted/);

// Check the new migration against the same ordered schema chain as Omniqora control-plane tests.
const db=new PGlite();
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE PUBLICATION supabase_realtime;`);
const migrations=new URL("supabase/migrations/",root);
for(const name of (await readdir(migrations)).filter(name=>name.endsWith(".sql")).sort()){
 if(name.startsWith("20260816120554"))for(const id of [
 "18bafcd5-3e4c-4044-bb63-10325a0b7209","e66c0525-1787-4250-be26-79f849624521",
 "890c71b1-cf6e-4b68-a56e-dd6050372481","97319fe5-82fd-44cd-b27d-6ae314ee368b"
 ])await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,"fixture@example.invalid"]);
 await db.exec(await readFile(new URL(name,migrations),"utf8"));
}
const rows=await db.query("SELECT provider_key,status,implementation_status FROM public.provider_catalogue WHERE provider_key LIKE 'finance.%' OR provider_key LIKE 'checkout.%' OR provider_key LIKE 'trade.%'");
for(const p of catalogue.FINANCE_PROVIDERS){
 const row=rows.rows.find(r=>r.provider_key===p.key);
 assert(row,`Provider ${p.key} must be in the central platform catalogue`);
 assert.equal(row.status,"planned");
 assert.equal(row.implementation_status,"catalogue_only");
}
const mapped=await db.query("SELECT candidate_only,enabled_by_default FROM public.finance_product_applicability WHERE product_key='dishbee' AND finance_family='merchant_capital'");
assert.deepEqual(mapped.rows[0],{candidate_only:true,enabled_by_default:false});
const travelSuppliers=await db.query("SELECT count(*)::int AS total FROM public.product_provider_requirements WHERE product_key='travenexa'");
assert.equal(travelSuppliers.rows[0].total,16,"Finance placements must not change existing travel supplier requirements");
assert.equal((await db.query("SELECT count(*)::int AS total FROM public.provider_bindings WHERE provider_key='finance.youlend'")).rows[0].total,0);
assert.equal((await db.query("SELECT count(*)::int AS total FROM public.finance_programme_approvals")).rows[0].total,0);
const personalRows=await db.query("SELECT provider_key FROM public.provider_catalogue WHERE provider_kind='personal_finance'");
assert.deepEqual(personalRows.rows.map(x=>x.provider_key).sort(),["personal.clearscore","personal.monevo"]);
const fcaTable=await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='finance_case_drafts' AND column_name IN('name','email','date_of_birth','national_insurance')");
assert.equal(fcaTable.rows.length,0,"Omniqora finance drafts must not store consumer PII");
const admin="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[admin,admin+"@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
async function asAdmin(fn){
 await db.exec("BEGIN;SET LOCAL ROLE authenticated");
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[admin]);
 try{const v=await fn();await db.exec("COMMIT");return v;}
 catch(e){await db.exec("ROLLBACK");throw e;}
}
const bootstrap=await asAdmin(async()=> (await db.query("SELECT public.platform_bootstrap_dishbee_pilot() AS result")).rows[0].result);
const cafe=bootstrap.tenants.find(x=>x.tenantSlug==="cafe1-luton");
assert(cafe?.tenantId);
await db.exec("SET ROLE service_role");
await db.query("UPDATE public.tenant_products SET status='active' WHERE tenant_id=$1 AND product_key='dishbee'",[cafe.tenantId]);
await db.exec("RESET ROLE");
const requestKey="11111111-1111-4111-8111-111111111111",recordKey="22222222-2222-4222-8222-222222222222";
const createArgs=[cafe.tenantId,"dishbee","finance.youlend",recordKey,1500000,requestKey,null];
const caseId=await asAdmin(async()=> (await db.query("SELECT public.finance_create_draft($1,$2,$3,$4,$5,$6,$7) AS id",createArgs)).rows[0].id);
assert(caseId);
const repeated=await asAdmin(async()=> (await db.query("SELECT public.finance_create_draft($1,$2,$3,$4,$5,$6,$7) AS id",createArgs)).rows[0].id);
assert.equal(repeated,caseId,"Repeated keys must be idempotent");
await assert.rejects(()=>asAdmin(()=>db.query("SELECT public.finance_create_draft($1,$2,$3,$4,$5,$6,$7)",[...createArgs.slice(0,4),999,requestKey,null])),/Idempotency key/);
const withdrawn=await asAdmin(async()=> (await db.query("SELECT public.finance_withdraw_draft($1,$2) AS result",[cafe.tenantId,caseId])).rows[0].result);
assert.equal(withdrawn,true);
assert.equal(await asAdmin(async()=> (await db.query("SELECT public.finance_withdraw_draft($1,$2) AS result",[cafe.tenantId,caseId])).rows[0].result),false);
const logged=await db.query("SELECT action FROM public.finance_case_audit WHERE case_id=$1 ORDER BY occurred_at",[caseId]);
assert.deepEqual(logged.rows.map(x=>x.action),["draft_created","draft_withdrawn"]);
const stranger="ffffffff-ffff-4fff-8fff-ffffffffffff";
await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[stranger,stranger+"@example.invalid"]);
await db.exec("BEGIN;SET LOCAL ROLE authenticated");
await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[stranger]);
await assert.rejects(()=>db.query(
 "INSERT INTO public.finance_programme_approvals(tenant_id,product_key,provider_key,programme_key) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','dishbee','finance.youlend','test')"
),err=>err.code==="42501");
await db.exec("ROLLBACK");
await db.close();
console.log("Finance connector registry, SaaS placements, fail-closed gate and SQL access controls verified");
