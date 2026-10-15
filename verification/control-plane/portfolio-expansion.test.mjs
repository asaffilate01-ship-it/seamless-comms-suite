import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const root=new URL("../../",import.meta.url);
const read=async path=>readFile(new URL(path,root),"utf8");
const seed=JSON.parse(await read("src/modules/control-plane/portfolio-seed.json"));
const registry=JSON.parse(await read("src/modules/control-plane/portfolio-factory-registry.json"));
const sql=await read("supabase/migrations/20261012130000_portfolio_factory_expansion.sql");

test("inventory preserves source records and every named tenant without duplicate SaaS identities",()=>{
 assert.equal(seed.length,127);
 assert.equal(registry.sourceRowCount,seed.length);
 assert.equal(new Set(seed.map(x=>x.sourceRow)).size,seed.length);
 assert.equal(registry.products.length,88);
 assert.equal(new Set(registry.products.map(x=>x.productKey)).size,registry.products.length);
 const tenantSources=seed.filter(x=>x.architectureRole==="tenant");
 assert.equal(registry.tenants.length,tenantSources.length);
 assert.deepEqual(registry.tenants.map(x=>x.sourceRow).sort((a,b)=>a-b),
   tenantSources.map(x=>x.sourceRow).sort((a,b)=>a-b));
 const referencedRows=new Set(registry.products.flatMap(x=>x.sourceRows));
 for(const s of seed.filter(x=>["landlord","platform_landlord","regional_variant","vertical_product","standalone_candidate"].includes(x.architectureRole))){
  assert.ok(referencedRows.has(s.sourceRow),"unaccounted product source "+s.sourceRow);
 }
});

test("requested SaaS parent/tenant mappings do not turn brands into landlords",()=>{
 const expected={
 kalethon:["merqano","merqano.kalethon"],
 dulcis:["merqano","merqano.dulcis"],
 alstero:["merqano","merqano.alstero"],
 sofevella:["merqano","merqano.sofevella"],
 meyzaar:["merqano","merqano.meyzaar"],
 zarvane:["merqano","merqano.zarvane"],
 cafe1stalbans:["dishbee","dishbee.cafe1stalbans"],
 cafe1luton:["dishbee","dishbee.cafe1luton"],
 mealdeck:["dishbee","mealdeck-uk"],
 chefzhub:["dishbee","dishbee.chefzhub"],
 finvessa:["omniqora-accounts","accounts.finvessa"],
 taxlounge:["omniqora-accounts","accounts.taxlounge"],
 };
 for(const [key,[parent,blueprint]] of Object.entries(expected)){
  const t=registry.tenants.find(x=>x.tenantKey===key);
  assert.ok(t,"Missing tenant "+key);
  assert.equal(t.parentLandlord,parent);
  assert.equal(t.blueprintKey,blueprint);
  assert.equal(t.provisioning,"not_activated");
 }
 assert.ok(registry.tenants.every(t=>!registry.products.some(p=>p.productKey===t.tenantKey)), "merchant brands must not be duplicate SaaS products");
 const money=registry.products.find(x=>x.productKey==="fastremit");
 assert.equal(money.displayName,"MoneyBridge");
 assert.ok(!registry.products.some(x=>x.productKey==="moneybridge"));
 assert.equal(registry.products.filter(x=>x.productKey==="courier-connect").length,1);
 assert.ok(registry.aliases.some(a=>a.alias==="FastRemit"&&a.canonicalProductKey==="fastremit"));
 assert.ok(registry.aliases.some(a=>a.alias==="Courier Job SaaS"&&a.canonicalProductKey==="courier-connect"));
 assert.equal(seed.find(x=>x.sourceRow===83).architectureRole,"landlord");
 assert.equal(seed.find(x=>x.sourceRow===110).architectureRole,"tenant");
});

test("source registration does not manufacture tenant authorisation or payment/live status",()=>{
 assert.match(sql,/INSERT INTO public\.product_catalogue/);
 assert.match(sql,/'internal'/);
 assert.match(sql,/ON CONFLICT \(product_key\) DO NOTHING/);
 assert.match(sql,/INSERT INTO public\.tenant_blueprints/);
 assert.match(sql,/'draft'/);
 assert.match(sql,/INSERT INTO public\.blueprint_products/);
 for(const x of ["merqano.sofevella","merqano.zarvane","dishbee.cafe1stalbans",
 "dishbee.cafe1luton","dishbee.chefzhub","accounts.finvessa","courier-broker-uk"]){
  assert.ok(sql.includes("'"+x+"'"),"missing SQL blueprint "+x);
 }
 assert.doesNotMatch(sql,/INSERT INTO public\.tenants\b/i);
 assert.doesNotMatch(sql,/INSERT INTO public\.tenant_products\b/i);
 assert.doesNotMatch(sql,/INSERT INTO public\.product_connections\b/i);
 assert.doesNotMatch(sql,/INSERT INTO public\.provider_bindings\b/i);
 assert.doesNotMatch(sql,/INSERT INTO public\.tenant_services\b/i);
 assert.doesNotMatch(sql,/MIGRATE-PRODUCTION/);
 assert.match(sql,/ON CONFLICT\s*(\([^)]*\))?\s*DO NOTHING/);
});

test("factory registry is scoped to existing owner/admin portfolio workspace",async()=>{
 const service=await read("src/modules/control-plane/control-plane.functions.ts");
 const ui=await read("src/modules/control-plane/ControlPlaneWorkspace.tsx");
 assert.match(service,/await requireWorkspaceAdmin\s*\(context,\s*data\.tenantId\s*\)/);
 assert.match(service,/factoryRegistry/);
 assert.match(ui,/PortfolioFactoryDirectory/);
 const brandGroup=registry.brandGroups.find(x=>x.parentTenantKey==="mealdeck");
 for(const item of ["Paratique","Taconelle","Tavo Chicken","Skorch Burgers","TarkaBox"]){
  assert.ok(brandGroup?.brands.includes(item));
 }
});

test("travel landlord and existing draft travel brands survive main-branch reconciliation",()=> {
 const landlord=registry.products.find(x=>x.productKey==="travenexa");
 assert.ok(landlord);
 assert.deepEqual(landlord.sourceRows,[123]);
 assert.equal(landlord.tenantProvisioning,"not_activated");
 const expected=[
  ["flightlounge",124,"travenexa-flightlounge"],
  ["bestfares-bestrates",125,"travenexa-bestfares"],
  ["marocways",126,"travenexa-marocways"],
  ["route50",127,"travenexa-route50"]
 ];
 for(const [key,row,blueprint] of expected){
  const t=registry.tenants.find(x=>x.tenantKey===key);
  assert.ok(t,"missing travel tenant: "+key);
  assert.equal(t.sourceRow,row);
  assert.equal(t.parentLandlord,"travenexa");
  assert.equal(t.productKey,"travenexa");
  assert.equal(t.blueprintKey,blueprint);
  assert.equal(t.provisioning,"not_activated");
 }
 assert.equal(registry.tenants.length,17);
 assert.equal(seed.filter(x=>x.architectureRole==="tenant").length,17);
});
