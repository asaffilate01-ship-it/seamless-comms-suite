import assert from "node:assert/strict";
import test from "node:test";
import { merqanoTenantLaunchSchema,merqanoPortfolioSeed } from "../../src/modules/control-plane/merqano-factory.contracts.ts";

test("Merqano portfolio seed contains the four agreed initial shops",()=>{assert.deepEqual(merqanoPortfolioSeed.map(x=>x.tenantKey),["alstero","kalethon","dulcis","meyzaar"])});
test("Merqano launch contract rejects malformed tenant keys",()=>{assert.equal(merqanoTenantLaunchSchema.safeParse({omniqoraTenantId:"00000000-0000-4000-8000-000000000000",externalTenantKey:"Bad Key",displayName:"Bad",vertical:"retail",country:"GB",currency:"GBP",timezone:"Europe/London",aiProfile:"premium-retail",services:[]}).success,false)});
test("Merqano launch contract accepts a valid tenant",()=>{assert.equal(merqanoTenantLaunchSchema.safeParse({omniqoraTenantId:"00000000-0000-4000-8000-000000000000",externalTenantKey:"alstero",displayName:"Alstero",vertical:"professional-instruments",country:"GB",currency:"GBP",timezone:"Europe/London",aiProfile:"regulated-commerce",services:["merqano.marktpass","merqano.omniqora-ai"]}).success,true)});
