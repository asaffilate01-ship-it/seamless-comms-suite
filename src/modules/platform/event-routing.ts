export function eventTypeMatches(pattern: string, eventType: string): boolean {
  if (pattern === "*") return true;
  if (!pattern.includes("*")) return pattern === eventType;

  if (!pattern.endsWith("*") || pattern.slice(0, -1).includes("*")) {
    throw new Error("Only exact event types or a single trailing wildcard are supported");
  }

  return eventType.startsWith(pattern.slice(0, -1));
}

export type ModuleEventManifest = {
  moduleKey: string;
  consumes: string[];
  produces: string[];
};

export const MODULE_EVENT_MANIFESTS: ModuleEventManifest[] = [
  { moduleKey: "crm.core", consumes: ["customer.*","lead.*","order.*","booking.*","case.*","dispatch.job.*"], produces: ["crm.*"] },
  { moduleKey: "analytics.core", consumes: ["crm.*","order.*","booking.*","dispatch.*","marketing.*","sales.*","feedback.*","marketplace.*","financial.*"], produces: ["analytics.*"] },
  { moduleKey: "financials.core", consumes: ["order.completed","invoice.paid","refund.*","payment.*","marketplace.order.completed","marketplace.refund.*","dispatch.job.completed"], produces: ["financial.*"] },
  { moduleKey: "journeys.core", consumes: ["crm.*","order.*","booking.*","feedback.*","marketing.*"], produces: ["journey.*","customer.rfm.*"] },
  { moduleKey: "feedback.core", consumes: ["order.completed","booking.completed","dispatch.job.completed","case.closed"], produces: ["feedback.*"] },
  { moduleKey: "marketing.core", consumes: ["crm.*","customer.rfm.*","feedback.*"], produces: ["marketing.*"] },
  { moduleKey: "sales.core", consumes: ["crm.lead.*","crm.opportunity.*","connect.*"], produces: ["sales.*"] },
  { moduleKey: "creative.core", consumes: ["marketing.campaign.*","creative.brief.*"], produces: ["creative.*"] },
  { moduleKey: "dispatch.core", consumes: ["order.ready","delivery.requested","service.job_requested","marketplace.order.accepted"], produces: ["dispatch.*"] },
  { moduleKey: "marketplace.core", consumes: ["payment.*","dispatch.job.*","feedback.*"], produces: ["marketplace.*"] },
  { moduleKey: "compliance.core", consumes: ["document.*","compliance.*","business360.*","regulatory.*"], produces: ["compliance.*"] },
  { moduleKey: "inventory.core", consumes: ["inventory.movement.*","hospitality.waste.*"], produces: ["inventory.*"] },
  { moduleKey: "ordering.core", consumes: ["reception.order.*","payment.*","catalogue.*"], produces: ["ordering.*","order.*"] },
  { moduleKey: "hospitality.intelligence", consumes: ["epos.*","inventory.*","hospitality.waste.*","order.*","refund.*"], produces: ["hospitality.*"] },
  { moduleKey: "practice.core", consumes: ["crm.*","document.*","signature.*","payment.*","compliance.*"], produces: ["practice.*"] },
  { moduleKey: "business360.core", consumes: ["crm.*","financial.*","analytics.*","document.*","compliance.*"], produces: ["business360.*"] },
  { moduleKey: "transactions.core", consumes: ["business360.*","financial.*","document.*","compliance.*"], produces: ["transaction.*"] },
];

export function modulesForEvent(eventType: string): string[] {
  return MODULE_EVENT_MANIFESTS
    .filter((manifest) => manifest.consumes.some((pattern) => eventTypeMatches(pattern, eventType)))
    .map((manifest) => manifest.moduleKey);
}