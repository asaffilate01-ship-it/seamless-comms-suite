import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { auditWiringEvidence } from "../../scripts/factory-wiring-audit.mjs";

const evidence=JSON.parse(await readFile(new URL("../../src/modules/control-plane/portfolio-wiring-evidence.json",import.meta.url),"utf8"));

test("portfolio wiring evidence is internally valid",()=>{
  const report=auditWiringEvidence(evidence);
  assert.deepEqual(report.errors,[]);
  assert.equal(report.status,"evidence_only");
  assert.ok(report.products>=10);
});

test("source evidence cannot silently claim live deployment",()=>{
  const copy=structuredClone(evidence);
  copy.products[0].deployment="live";
  const report=auditWiringEvidence(copy);
  assert.ok(report.errors.some(x=>x.includes("live status cannot retain blockers")));
});

test("SparesGrid remains absent until a repository is mapped",()=>{
  const copy=structuredClone(evidence);
  const item=copy.products.find(x=>x.productKey==="sparesgrid");
  item.source="implemented";
  const report=auditWiringEvidence(copy);
  assert.ok(report.errors.some(x=>x.includes("sparesgrid without a repository")));
});
