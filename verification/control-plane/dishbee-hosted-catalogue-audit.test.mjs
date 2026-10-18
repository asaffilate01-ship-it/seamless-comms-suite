import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const sql = await readFile(new URL("./dishbee-hosted-catalogue-audit.sql",import.meta.url),"utf8");
const root = new URL("../../",import.meta.url);

test("deployed catalogue audit is a read-only report without activation",()=>{
  const stripped = sql.replace(/--[^\n]*/g,"").replace(/'(?:[^']|'')*'/g,"''");
  assert.match(stripped,/\bSELECT\b/i);
  assert.doesNotMatch(stripped,/\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CALL|DO|EXECUTE|GRANT|REVOKE|COPY)\b/i);
  assert.match(sql,/false AS production_accepted/);
  assert.match(sql,/catalogue_deployed/);
  assert.match(sql,/assigned_tenant_products/);
  assert.match(sql,/dishbee_connections/);
});

test("audit enumerates the full family without inventing separate Hive/Buzz landlords",()=>{
  for(const product of ["dishbee","dishbee-one","dishbee-plus","dishbee-stay","mealdeck"]){
    assert.ok(sql.includes("'"+product+"'"),"product missing: "+product);
  }
  for(const service of ["dishbee.one","dishbee.hive","dishbee.hive-kiosk","dishbee.stay","dishbee.stay.connect","dishbee.buzz","dishbee.court-connect","dishbee-plus.subscription"]){
    assert.ok(sql.includes("'"+service+"'"),"service missing: "+service);
  }
  for(const blueprint of ["restaurant-uk","mealdeck-uk","dishbee-one-uk","dishbee-hive-uk","dishbee-plus-uk","dishbee-stay-connect-uk","dishbee-stay-uk","dishbee-court-uk","dishbee-court-connect-uk"]){
    assert.ok(sql.includes("'"+blueprint+"'"),"blueprint missing: "+blueprint);
  }
  assert.doesNotMatch(sql,/\('dishbee-hive','landlord'/);
  assert.doesNotMatch(sql,/\('dishbee-buzz','landlord'/);
});

test("required family product definitions are committed as migrations, not inferred from catalog snapshots",async()=>{
  const paths=[
    "supabase/migrations/20261003205000_dishbee_product_family.sql",
    "supabase/migrations/20261003223000_dishbee_stay_court_factory.sql",
    "supabase/migrations/20261003194500_dishbee_plus_marketplace_factory.sql",
    "supabase/migrations/20261003225500_dishbee_court_connect_factory.sql"
  ];
  for(const path of paths){
    const content=await readFile(new URL(path,root),"utf8");
    assert.match(content,/INSERT INTO public\.(?:product_catalogue|service_catalogue)/i,"migration source missing: "+path);
  }
});
