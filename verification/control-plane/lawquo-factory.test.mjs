import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../../supabase/migrations/20261009123000_lawquo_saas_factory.sql", import.meta.url),
  "utf8",
);
const seed = JSON.parse(
  await readFile(
    new URL("../../src/modules/control-plane/portfolio-seed.json", import.meta.url),
    "utf8",
  ),
);

test("Lawquo is a legal SaaS landlord with marketplace as a workspace", () => {
  assert.match(migration, /category = 'legal'/);
  assert.match(migration, /'lawquo','marketplace','Lawquo Marketplace'/);
  assert.match(migration, /marketplaceIsWorkspace/);
  assert.match(migration, /'lawquo-platform'/);
});

test("Lawquo workspace catalogue contains system and tenant workspace types", () => {
  for (const workspace of [
    "landlord",
    "marketplace",
    "firm",
    "chambers",
    "solo_practitioner",
    "client",
  ]) {
    assert.match(migration, new RegExp(`'lawquo','${workspace}'`));
  }
  assert.match(migration, /'workspaceTypes'/);
});

test("canonical portfolio entry points Lawquo to law-remix", () => {
  const lawquo = seed.find((row) => row.sourceRow === 47);
  const legacy = seed.find((row) => row.sourceRow === 11);
  assert.equal(
    lawquo.repositoryUrl,
    "https://github.com/asaffilate01-ship-it/law-remix.git",
  );
  assert.equal(lawquo.architectureRole, "landlord");
  assert.ok(lawquo.traits.includes("canonical"));
  assert.equal(legacy.architectureRole, "merge_candidate");
  assert.equal(legacy.parentLandlord, "LAWQUO");
});
