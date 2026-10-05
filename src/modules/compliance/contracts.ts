export const COMPLIANCE_FEATURES = {
  core: "compliance.core",
  applications: "compliance.applications",
  evidence: "compliance.evidence",
  aiCopilot: "compliance.ai_copilot",
  aiDrafting: "compliance.ai_drafting",
  inspections: "compliance.inspections",
  monitoring: "compliance.monitoring",
  correspondence: "compliance.correspondence",
  portfolio: "compliance.portfolio",
  whiteLabel: "compliance.white_label",
} as const;

export type ComplianceFeature =
  (typeof COMPLIANCE_FEATURES)[keyof typeof COMPLIANCE_FEATURES];

export type RegulatoryPackKey =
  | "fca"
  | "cqc"
  | "ofsted"
  | "aramco"
  | "nca"
  | "sama"
  | "iso"
  | "buyer_tender"
  | `custom:${string}`;

export type ComplianceDecisionState =
  | "not_started"
  | "in_progress"
  | "evidence_ready"
  | "review_required"
  | "reviewed"
  | "gap"
  | "not_applicable"
  | "expired";

export type RegulatoryPackDescriptor = {
  key: RegulatoryPackKey;
  version: string;
  title: string;
  jurisdiction: string;
  regulator?: string | null;
  effectiveFrom?: string | null;
  sourceCheckedOn: string;
  sourceReferences: string[];
  caution: string;
};

export type ComplianceTenantContext = {
  tenantId: string;
  workspaceId?: string | null;
  productKey?: string | null;
  locationId?: string | null;
  region?: string | null;
};

export type AiEvidenceProposal = {
  requirementId: string;
  evidenceIds: string[];
  rationale: string;
  gaps: string[];
  contradictions: string[];
  uncertainty: string[];
  modelRunId: string;
  generatedAt: string;
  status: "draft";
};

export type AiApplicationDraft = {
  requirementId: string;
  response: string;
  citations: string[];
  assumptions: string[];
  missingEvidence: string[];
  modelRunId: string;
  status: "draft";
};

export type HumanReviewDecision = {
  decision: "approved" | "changes_required" | "rejected" | "not_applicable";
  reviewerId: string;
  evidenceVersionIds: string[];
  reason: string;
  decidedAt: string;
};

export const COMPLIANCE_EVENT_TYPES = {
  assessmentCreated: "compliance.assessment.created",
  requirementChanged: "compliance.requirement.changed",
  evidenceAdded: "compliance.evidence.added",
  evidenceExpired: "compliance.evidence.expired",
  gapCreated: "compliance.gap.created",
  remediationCompleted: "compliance.remediation.completed",
  reviewRequested: "compliance.review.requested",
  reviewDecided: "compliance.review.decided",
  applicationDrafted: "compliance.application.drafted",
  applicationSubmitted: "compliance.application.submitted",
  correspondenceReceived: "compliance.correspondence.received",
  inspectionScheduled: "compliance.inspection.scheduled",
  registrationRenewalDue: "compliance.registration.renewal_due",
} as const;

/** AI output is advisory/draft evidence. Final regulatory decisions are recorded through an authorised review operation bound to exact evidence and pack versions. */
export type ComplianceAiBoundary = {
  mayPropose: true;
  mayRetrievePermittedEvidence: true;
  mayDraft: true;
  mayCreateFinalRegulatoryApproval: false;
  maySubmitWithoutHumanApproval: false;
};