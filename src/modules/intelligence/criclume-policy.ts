/**
 * The generic Omniqora run.start endpoint is not a billable-budget admission
 * path. CricLume must use approved Agent Factory reservations once that
 * service-authenticated queue is certified. A flag or browser model choice
 * must never bypass the budget.
 */
export const CRICLUME_BUDGET_REQUIRED =
  "CricLume AI generation requires approved budgeted Agent Factory admission.";

export function legacyIntelligenceRunAllowed(productKey: string): boolean {
  return productKey.trim().toLowerCase() !== "criclume";
}
