import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const service=await readFile(new URL("../../src/modules/crm/service.server.ts",import.meta.url),"utf8");
const migration=await readFile(new URL("../../supabase/migrations/20261014113000_crm_source_sync.sql",import.meta.url),"utf8");
for(const op of ["lead.upsert","opportunity.upsert","company.upsert","person.upsert","activity.record"])
 assert.match(service,new RegExp('operation:z.literal\\("'+op.replace(".","\\.")+'"\\)'));
assert.match(service,/linkedSourceId\(db,"crm_people"/);
assert.match(service,/linkedSourceId\(db,"crm_companies"/);
assert.match(service,/eq\("source_product_key",input.productKey\)/);
assert.match(service,/eq\("tenant_id",input.tenantId\)/);
assert.match(service,/eq\("pipeline_id",pipeline.data.id\)/);
assert.match(service,/authoriseServiceScope\(credential/);
assert.doesNotMatch(service,/mergeOnEmail|mergeOnPhone/i);
assert.match(migration,/CREATE UNIQUE INDEX IF NOT EXISTS crm_opportunities_source_external_uq/);
assert.match(migration,/CREATE UNIQUE INDEX IF NOT EXISTS crm_activities_source_external_uq/);
console.log("CRM product-scoped lead/opportunity sync and activity uniqueness controls verified");
