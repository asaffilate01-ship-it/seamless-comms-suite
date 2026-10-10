import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
// Use the real factory table definitions; authentication/tenant infrastructure is outside this catalogue-only test.
const base=await readFile(new URL('../../supabase/migrations/20261001171000_omniqora_saas_factory.sql',import.meta.url),'utf8');
const names=['product_catalogue','service_catalogue','product_services','tenant_blueprints','blueprint_products','blueprint_services'];
for(const name of names){const start=base.indexOf(`CREATE TABLE IF NOT EXISTS public.${name} (`);assert(start>=0);const end=base.indexOf('\n);',start)+3;await db.exec(base.slice(start,end));}
await db.exec(`insert into product_catalogue(product_key,name) values('formationgenie','FormationGenie'),('omniqora','Omniqora'),('omniqora-accounts','Omniqora Accounts');
insert into service_catalogue(service_key,name,family) values('formationgenie.secretarial','Secretarial','business-services'),('omniqora.analytics','Analytics','analytics'),('omniqora.connect','Connect','communications'),('omniqora.intelligence-runtime','Intelligence','ai');`);
const migration=await readFile(new URL('../../supabase/migrations/20261005071000_formationgenie_factory_readiness.sql',import.meta.url),'utf8');
await db.exec(migration);await db.exec(migration);
assert.equal((await db.query('select count(*)::int n from tenant_blueprints')).rows[0].n,2);
assert.equal((await db.query('select count(*)::int n from blueprint_products')).rows[0].n,2);
assert((await db.query('select default_enabled,required from product_services')).rows.every(r=>!r.default_enabled&&!r.required));
const service=(await db.query("select metadata from service_catalogue where service_key='formationgenie.secretarial'")).rows[0];
assert.equal(service.metadata.filingProviderEnabled,false);assert.equal(service.metadata.identityProviderEnabled,false);
await db.exec("update product_services set default_enabled=true where service_key='omniqora.analytics'");await db.exec(migration);
assert.equal((await db.query("select default_enabled from product_services where service_key='omniqora.analytics'")).rows[0].default_enabled,true);
await db.close();console.log('FormationGenie factory: real table constraints, reruns, optional defaults and existing settings preserved');
