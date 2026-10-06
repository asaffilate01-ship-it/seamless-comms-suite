import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(p)=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("SaaS Factory registry keeps Kindelo and portfolio products in the product array",()=>{
  const src=read("src/modules/platform/registry.ts");
  for(const key of ["kindelo","kindelo-gb","kindelo-de","mealdeck","sparesgrid","autohashi","formationgenie","lawquo","lessonahead"]){
    assert.ok(src.includes('key: "'+key+'"'),"missing product "+key);
  }
  assert.doesNotMatch(src,/\n\];\s*\n\s*\{\s*\n\s*key:\s*"mealdeck"/);
});

test("tenant provisioning exposes full white-label portal domain purposes",()=>{
  const files=[
    read("src/modules/platform/saas-factory.server.ts"),
    read("src/modules/platform/provisioning.functions.ts"),
    read("src/routes/_authenticated/app.tenant-launch.tsx"),
  ];
  for(const src of files){
    for(const purpose of ["customer_portal","provider_portal","staff_portal","email"]){
      assert.ok(src.includes(purpose),"missing domain purpose "+purpose);
    }
  }
});

test("provisioning applies product/country defaults after tenant product creation",()=>{
  const src=read("src/modules/platform/provisioning.functions.ts");
  assert.ok(src.includes("apply_product_variant_defaults"));
});

test("Kindelo UK and Germany defaults plus governed AI use cases are present",()=>{
  const sql=read("supabase/migrations/20261005072000_kindelo_country_profiles_readiness_ai.sql");
  for(const value of [
    "kindelo-gb","kindelo-de","gb-childcare-agency","de-childcare-configurable",
    "childcare.provider_match","childcare.compliance_risk","childcare.funding_anomaly",
    "childcare.capacity_demand","childcare.parent_engagement","childcare.case_summary"
  ]) assert.ok(sql.includes(value),"missing "+value);
  assert.ok(sql.includes("saas_factory_launch_checks"));
});
