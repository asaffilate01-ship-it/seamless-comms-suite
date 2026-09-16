import type { Assessment, Requirement } from "./contracts";

export const STATUS_LABELS = {
  not_started: "Not started",
  in_progress: "In progress",
  evidence_ready: "Awaiting review",
  reviewed: "Internally reviewed",
  not_applicable: "Not applicable",
  expired: "Evidence expired",
};
export function effectiveStatus(item: Requirement, today = new Date().toISOString().slice(0, 10)) {
  if (item.status !== "not_applicable" && item.valid_until && item.valid_until < today)
    return "expired";
  return item.status;
}
export function summarise(items: Requirement[], today = new Date().toISOString().slice(0, 10)) {
  const applicable = items.filter((item) => item.status !== "not_applicable");
  const reviewed = applicable.filter((item) => effectiveStatus(item, today) === "reviewed").length;
  return {
    total: items.length,
    applicable: applicable.length,
    reviewed,
    excluded: items.length - applicable.length,
    percent: applicable.length ? Math.floor((reviewed / applicable.length) * 100) : 0,
    expired: applicable.filter((item) => effectiveStatus(item, today) === "expired").length,
    overdue: applicable.filter(
      (item) =>
        item.due_date && item.due_date < today && effectiveStatus(item, today) !== "reviewed",
    ).length,
    renewal: applicable.filter(
      (item) =>
        item.valid_until &&
        item.valid_until >= today &&
        Date.parse(item.valid_until) - Date.parse(today) <= 30 * 86400000,
    ).length,
  };
}

// Safe default for a client-facing dossier: omit private URLs, notes, people and audit IDs.
export function buildDossier(assessment: Assessment, items: Requirement[], now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return {
    schema: "omniqora.procurement-dossier.v1",
    generated_at: now.toISOString(),
    statement:
      "Supplier-prepared readiness record. Internal review is not certification, government approval, bank acceptance or a contract award. Verify issuer records and the applicable tender before relying on a claim.",
    entity: assessment.legal_entity,
    buyer: assessment.buyer,
    country: assessment.country,
    scope: assessment.scope,
    pack: assessment.pack_id,
    pack_version: assessment.pack_version,
    coverage:
      "Starter pack plus any buyer-specific requirements added to this assessment; not an exhaustive compliance determination.",
    summary: summarise(items, today),
    requirements: items.map((item) => ({
      title: item.template.title,
      kind: item.template.kind,
      applies_when: item.template.applies_when,
      source_url: item.template.category === "Buyer-specific" ? null : item.template.source_url,
      status: STATUS_LABELS[effectiveStatus(item, today)],
      evidence_title: item.evidence_title,
      reported_issuer: item.issuer,
      reported_reference: item.reference,
      valid_until: item.valid_until,
      internally_reviewed_at: item.reviewed_at,
      // Applicability decisions need an explanation, but the private review text stays private.
      applicability:
        item.status === "not_applicable"
          ? "Excluded by an internal reviewer; request the rationale before relying on this exclusion."
          : "Requires assessment for the stated scope",
    })),
  };
}
