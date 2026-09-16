import assert from "node:assert/strict";
import {
  summarise,
  effectiveStatus,
  buildDossier,
} from "../../src/modules/procurement/readiness.ts";
import { PACKS } from "../../src/modules/procurement/catalog.ts";
import { editSchema } from "../../src/modules/procurement/contracts.ts";
const base = {
  id: "one",
  template: {
    title: "CCC+",
    kind: "certification",
    source_url: "https://www.aramco.com",
    applies_when: "Scoped engagement",
  },
  status: "reviewed",
  valid_until: "2026-09-15",
  evidence_title: "Certificate",
  evidence_url: "https://private.example/cert",
  issuer: "Actual assessor",
  reference: "Example reference",
  notes: "Private finding",
  owner_name: "Private owner",
  reviewed_by: "private-id",
  reviewed_at: "2026-08-01",
};
assert.equal(effectiveStatus(base, "2026-09-16"), "expired");
assert.equal(summarise([base], "2026-09-16").percent, 0);
assert.equal(summarise([{ ...base, status: "not_applicable" }], "2026-09-16").percent, 0);
assert.equal(summarise([{ ...base, valid_until: "2026-10-01" }], "2026-09-16").renewal, 1);
assert.equal(summarise([{ ...base, valid_until: "2026-09-16" }], "2026-09-16").percent, 100);
const dossier = buildDossier(
  {
    legal_entity: "Test Ltd",
    buyer: "Aramco",
    country: "UK",
    scope: "Defined systems",
    pack_id: "aramco-ccc-plus",
    pack_version: "test",
  },
  [base],
  new Date("2026-09-16T12:00:00Z"),
);
assert.equal(dossier.requirements[0].status, "Evidence expired");
for (const secret of ["private.example", "Private finding", "Private owner", "private-id"])
  assert(!JSON.stringify(dossier).includes(secret));
assert(dossier.statement.includes("not certification"));
assert.equal(PACKS.length, 5);
assert.equal(new Set(PACKS.map((p) => p.id)).size, 5);
const ccc = PACKS.find((p) => p.id === "aramco-ccc-plus");
assert(ccc.requirements.find((r) => r.key === "aramco-ccc-plus-15").mandatory);
assert(ccc.requirements.some((r) => r.title.includes("On-site") && r.mandatory));
assert(ccc.requirements.some((r) => r.title.includes("Complete scoped") && r.mandatory));
for (const pack of PACKS)
  for (const item of pack.requirements) assert(new URL(item.source_url).protocol === "https:");
for (const url of ["javascript:alert(1)", "http://vault.test", "https://user:password@vault.test"])
  assert(
    !editSchema.safeParse({
      status: "in_progress",
      owner_name: "",
      due_date: null,
      evidence_title: "",
      evidence_url: url,
      issuer: "",
      reference: "",
      valid_until: null,
      notes: "",
    }).success,
  );
console.log(
  "Readiness: expiry, scope, no false certification, private export, CCC+ gates and URL validation passed.",
);
