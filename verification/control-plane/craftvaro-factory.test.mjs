import { PGlite } from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
const source=readFileSync(new URL('../../supabase/migrations/20261001171000_omniqora_saas_factory.sql',import.meta.url),'utf8');
for(const name of ['product_catalogue','service_catalogue','product_services','tenant_blueprints','blueprint_products','blueprint_services']){
 const match=source.match(new RegExp('CREATE TABLE IF NOT EXISTS public\\.'+name+' \\([\\s\\S]*?\\n\\);'));
 if(!match) throw new Error(name);
 await db.exec(match[0]);
}
const sql=readFileSync(new URL('../../supabase/migrations/20261023073521_craftvaro_factory_readiness.sql',import.meta.url),'utf8');
await db.exec(sql); await db.exec(sql);
const p=(await db.query("select * from product_catalogue where product_key='craftvaro'")).rows[0];
assert.equal(p.metadata.authority_mode,'local');assert.equal(p.metadata.tenant_provisioning_enabled,false);assert.equal(p.metadata.provider_activation_verified,false);
const b=(await db.query('select country_code,status,metadata from tenant_blueprints order by country_code')).rows;
assert.deepEqual(b.map(x=>x.country_code),['DE','GB']);assert(b.every(x=>x.status==='draft'&&x.metadata.autoProvision===false));
assert.equal((await db.query('select * from product_services where default_enabled')).rows.length,0);
await db.close(); console.log('Factory migration applies twice; local authority, disabled provisioning and two draft country templates verified.');
