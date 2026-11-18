import assert from "node:assert/strict";
import test from "node:test";
import { merqanoTenantLaunchSchema,merqanoPortfolioSeed } from "../../src/modules/control-plane/merqano-factory.contracts.ts";

test("Merqano portfolio seed contains the five agreed initial shops",()=>{assert.deepEqual(merqanoPortfolioSeed.map(x=>x.tenantKey),["alstero","kalethon","dulcis","meyzaar","marshcrunch"])});
test("Merqano launch contract rejects malformed tenant keys",()=>{assert.equal(merqanoTenantLaunchSchema.safeParse({omniqoraTenantId:"00000000-0000-4000-8000-000000000000",externalTenantKey:"Bad Key",displayName:"Bad",vertical:"retail",country:"GB",currency:"GBP",timezone:"Europe/London",aiProfile:"premium-retail",services:[]}).success,false)});
test("Merqano launch contract accepts a valid tenant",()=>{assert.equal(merqanoTenantLaunchSchema.safeParse({omniqoraTenantId:"00000000-0000-4000-8000-000000000000",externalTenantKey:"alstero",displayName:"Alstero",vertical:"professional-instruments",country:"GB",currency:"GBP",timezone:"Europe/London",aiProfile:"regulated-commerce",services:["merqano.marktpass","merqano.omniqora-ai"]}).success,true)});

import { readFileSync } from "node:fs";
test("MarshCrunch source inventory remains unactivated until genuine provisioning", () => {
  const registry = JSON.parse(readFileSync(new URL("../../src/modules/control-plane/portfolio-factory-registry.json", import.meta.url), "utf8"));
  const tenant = registry.tenants.find((item) => item.tenantKey === "marshcrunch");
  assert.equal(tenant?.productKey, "merqano");
  assert.equal(tenant?.parentLandlord, "merqano");
  assert.equal(tenant?.provisioning, "not_activated");
  assert.deepEqual(tenant?.categories, ["tissues", "fragrances", "soft-drinks", "chocolate-bars"]);
});
