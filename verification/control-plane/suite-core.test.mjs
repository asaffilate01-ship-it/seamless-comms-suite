import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

const db=new PGlite();
const migrations=new URL("../../supabase/migrations/",import.meta.url);
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE PUBLICATION supabase_realtime;`);
for(const name of(await readdir(migrations)).filter(x=>x.endsWith(".sql")).sort()){
 const sql=await readFile(new URL(name,migrations),"utf8");
 if(name.startsWith("20260816120554"))for(const id of["18bafcd5-3e4c-4044-bb63-10325a0b7209","e66c0525-1787-4250-be26-79f849624521","890c71b1-cf6e-4b68-a56e-dd6050372481","97319fe5-82fd-44cd-b27d-6ae314ee368b"])
  await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,"fixture@example.invalid"]);
 await db.exec(sql);
}
const admin="99999999-aaaa-4aaa-8aaa-999999999999";
await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[admin,admin+"@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
async function asUser(fn){await db.exec("BEGIN;SET LOCAL ROLE authenticated;");await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[admin]);try{const v=await fn();await db.exec("COMMIT");return v;}catch(e){await db.exec("ROLLBACK");throw e;}}

const products=await db.query("SELECT product_key FROM public.product_catalogue WHERE product_key=ANY($1::text[]) ORDER BY product_key",[["onyngo","merqano","stylesync","schonova","xpertjobs","zivvo","autohashi","lawquo","haccora","iq-practice-cloud"]]);
assert.equal(products.rows.length,10);

const services=await db.query("SELECT service_key FROM public.service_catalogue WHERE service_key=ANY($1::text[]) ORDER BY service_key",[["omniqora.commerce","omniqora.commerce-fiscal","omniqora.marketplace-matching","omniqora.marketplace-trust","omniqora.marketplace-auctions","omniqora.marketplace-growth","omniqora.ai-router","omniqora.ai-actions","omniqora.webhooks"]]);
assert.equal(services.rows.length,9);

const dulcis=await db.query("SELECT product_key,required FROM public.blueprint_products WHERE blueprint_key='dulcis-hybrid-uk' ORDER BY product_key");
assert.deepEqual(dulcis.rows,[{product_key:"merqano",required:true}]);
const dulcisServices=await db.query("SELECT service_key FROM public.blueprint_services WHERE blueprint_key='dulcis-hybrid-uk' ORDER BY service_key");
assert(dulcisServices.rows.some(x=>x.service_key==="omniqora.commerce"));
assert(dulcisServices.rows.some(x=>x.service_key==="omniqora.marketplace"));

const dishbeeAddon=await db.query("SELECT target_product_key FROM public.ecosystem_addon_offers WHERE addon_key='dishbee'");
assert.equal(dishbeeAddon.rows[0].target_product_key,"dishbee");
const merqanoAddon=await db.query("SELECT 1 FROM public.ecosystem_product_addons WHERE source_product_key='merqano' AND addon_key='dishbee'");
assert.equal(merqanoAddon.rows.length,1);

const tenant=(await asUser(()=>db.query("SELECT public.platform_create_tenant(NULL,'Suite Core Test','Suite Core Test','suite-core-test','GB','GBP','Europe/London','dulcis-hybrid-uk') AS id"))).rows[0].id;
assert(tenant);
const tenantProducts=await db.query("SELECT product_key FROM public.tenant_products WHERE tenant_id=$1 ORDER BY product_key",[tenant]);
assert.deepEqual(tenantProducts.rows,[{product_key:"merqano"}]);

await asUser(()=>db.query("SELECT public.ecosystem_enable_addon($1,'merqano','dishbee','{}'::jsonb)",[tenant]));
const linked=await db.query("SELECT child_product_key,relation_type FROM public.tenant_product_relationships WHERE tenant_id=$1",[tenant]);
assert.deepEqual(linked.rows,[{child_product_key:"dishbee",relation_type:"addon"}]);

const vendor=(await asUser(()=>db.query("INSERT INTO public.marketplace_vendors(tenant_id,product_key,name,vendor_key) VALUES($1,'merqano','Dulcis','dulcis') RETURNING id",[tenant]))).rows[0].id;
const listing=(await asUser(()=>db.query("INSERT INTO public.marketplace_listings(tenant_id,product_key,vendor_id,listing_type,title,price_minor,currency,status) VALUES($1,'merqano',$2,'vehicle','Test listing',10000,'GBP','active') RETURNING id",[tenant,vendor]))).rows[0].id;
assert(listing);
const auction=(await asUser(()=>db.query("INSERT INTO public.marketplace_auctions(tenant_id,product_key,listing_id,auction_type,currency,opening_minor,minimum_increment_minor,starts_at,ends_at,status) VALUES($1,'merqano',$2,'english','GBP',10000,500,now()-interval '1 minute',now()+interval '1 hour','live') RETURNING id",[tenant,listing]))).rows[0].id;
const bid=await asUser(async()=> (await db.query("SELECT public.marketplace_place_bid($1,$2,'buyer:test',11000,'bid-001') AS id",[tenant,auction])).rows[0].id);
assert(bid);

const terminal=(await asUser(()=>db.query("INSERT INTO public.commerce_terminals(tenant_id,product_key,name,terminal_type) VALUES($1,'merqano','Till 1','epos') RETURNING id",[tenant]))).rows[0].id;
const sale=(await asUser(()=>db.query("INSERT INTO public.commerce_sales(tenant_id,product_key,terminal_id,source,currency,idempotency_key) VALUES($1,'merqano',$2,'epos','GBP','sale-001') RETURNING id",[tenant,terminal]))).rows[0].id;
await asUser(()=>db.query("INSERT INTO public.commerce_sale_lines(tenant_id,sale_id,line_type,name,quantity,unit_price_minor,line_total_minor) VALUES($1,$2,'item','Dulcis box',1,2500,2500)",[tenant,sale]));
await asUser(()=>db.query("SELECT public.commerce_recalculate_sale($1,$2)",[tenant,sale]));
await asUser(()=>db.query("SELECT public.commerce_capture_tender($1,$2,'cash',1000,'GBP','cash-001',NULL,NULL,'{}'::jsonb)",[tenant,sale]));
await asUser(()=>db.query("SELECT public.commerce_capture_tender($1,$2,'card',1500,'GBP','card-001',NULL,'psp-test','{}'::jsonb)",[tenant,sale]));
const paid=await db.query("SELECT status,total_minor,paid_minor FROM public.commerce_sales WHERE id=$1",[sale]);
assert.deepEqual(paid.rows[0],{status:"paid",total_minor:2500,paid_minor:2500});

const hook=await asUser(async()=> (await db.query("SELECT public.platform_register_webhook($1,'merqano','Dulcis test hook','https://example.com/hook','vault:hook-secret',ARRAY['commerce.sale.paid']) AS id",[tenant])).rows[0].id);
assert(hook);
const hookCount=await db.query("SELECT count(*)::int n FROM public.platform_webhook_endpoints WHERE tenant_id=$1",[tenant]);
assert.equal(hookCount.rows[0].n,1);

const aiOptional=await db.query("SELECT count(*)::int n FROM public.product_services WHERE service_key IN('omniqora.ai-router','omniqora.webhooks') AND default_enabled=false");
assert(aiOptional.rows[0].n>10);

await db.close();
console.log("Suite Marketplace, Commerce/EPOS, Dulcis hybrid, add-ons, AI and webhooks verified");
