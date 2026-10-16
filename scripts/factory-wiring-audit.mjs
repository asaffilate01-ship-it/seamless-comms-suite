#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const FILE = new URL("../src/modules/control-plane/portfolio-wiring-evidence.json", import.meta.url);
const STATES = new Set(["absent","mapped","implemented","staged","live","blocked"]);
const DIMENSIONS = ["source","landlordTenant","omniqoraContract","aiIntelligence","externalProviders","deployment"];

export function auditWiringEvidence(input) {
  const errors = [];
  const products = Array.isArray(input?.products) ? input.products : [];
  const keys = new Set();
  if (!products.length) errors.push("products must be a non-empty array");
  for (const product of products) {
    if (!product?.productKey || keys.has(product.productKey)) errors.push("missing or duplicate productKey: " + String(product?.productKey));
    keys.add(product?.productKey);
    for (const field of DIMENSIONS) if (!STATES.has(product?.[field])) errors.push(product?.productKey + ": invalid " + field);
    if (["staged","live"].includes(product?.deployment) && !(product.evidence || []).some(x => /deploy|production|staging/i.test(x))) errors.push(product.productKey + ": deployment status lacks deployment evidence");
    if (product?.deployment === "live" && (product.blockers || []).length) errors.push(product.productKey + ": live status cannot retain blockers");
    if (product?.productKey === "sparesgrid" && (product.repositories || []).length === 0 && product.source !== "absent") errors.push("sparesgrid without a repository must remain absent");
  }
  return {status:errors.length ? "invalid" : "evidence_only", reviewedAt:input?.reviewedAt || null, products:products.length, errors};
}

async function main() {
  const input=JSON.parse(await readFile(FILE,"utf8"));
  const report=auditWiringEvidence(input);
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
  if (report.errors.length) process.exitCode=1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
