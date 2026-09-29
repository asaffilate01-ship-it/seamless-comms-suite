export const CRM_FEATURES = {
  core: "crm.core",
  companies: "crm.companies",
  people: "crm.people",
  leads: "crm.leads",
  opportunities: "crm.opportunities",
  tasks: "crm.tasks",
  timeline: "crm.timeline",
  aiSummary: "crm.ai_summary",
  nextBestAction: "crm.next_best_action",
} as const;

export type CrmFeature = (typeof CRM_FEATURES)[keyof typeof CRM_FEATURES];

export type CrmEntityType =
  | "person"
  | "company"
  | "lead"
  | "opportunity"
  | "task"
  | "case"
  | "conversation"
  | "external";

export type CrmActivityType =
  | "note"
  | "call"
  | "email"
  | "sms"
  | "whatsapp"
  | "meeting"
  | "task"
  | "status_change"
  | "lead_event"
  | "opportunity_event"
  | "case_event"
  | "system_event";

export type CrmSourceReference = {
  productKey: string;
  externalRef: string;
};

export type CrmTenantContext = {
  tenantId: string;
  productKey?: string | null;
  brandId?: string | null;
  locationId?: string | null;
  workspaceId?: string | null;
};

export type CrmTimelineLink = {
  personId?: string | null;
  companyId?: string | null;
  leadId?: string | null;
  opportunityId?: string | null;
  caseId?: string | null;
  conversationId?: string | null;
};

export const CRM_EVENT_TYPES = {
  personCreated: "crm.person.created",
  personUpdated: "crm.person.updated",
  companyCreated: "crm.company.created",
  companyUpdated: "crm.company.updated",
  leadCreated: "crm.lead.created",
  leadQualified: "crm.lead.qualified",
  leadConverted: "crm.lead.converted",
  opportunityCreated: "crm.opportunity.created",
  opportunityStageChanged: "crm.opportunity.stage_changed",
  opportunityWon: "crm.opportunity.won",
  opportunityLost: "crm.opportunity.lost",
  taskCreated: "crm.task.created",
  taskCompleted: "crm.task.completed",
  activityRecorded: "crm.activity.recorded",
} as const;

/**
 * Product adapters should map their local identifiers into source_product_key/external_ref.
 * They must not infer tenant access from these values. Tenant membership and entitlement
 * are resolved by the trusted Omniqora host/service layer.
 */
export type CrmAdapterContract = {
  source: CrmSourceReference;
  tenant: CrmTenantContext;
  entityType: Exclude<CrmEntityType, "task" | "case" | "conversation">;
  payload: Record<string, unknown>;
};
