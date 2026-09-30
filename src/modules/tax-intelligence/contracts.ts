export type TaxAuthorityLevel=
  | "legislation"
  | "regulation"
  | "binding_case_law"
  | "persuasive_case_law"
  | "official_ruling"
  | "official_guidance"
  | "administrative_manual"
  | "secondary";

export type TaxKnowledgeSource={
  id:string;jurisdiction:string;authority:string;sourceType:string;
  authorityLevel:TaxAuthorityLevel;title:string;citation?:string|null;sourceUrl:string;
  effectiveFrom?:string|null;effectiveUntil?:string|null;publishedAt?:string|null;
  checkedAt:string;contentHash?:string|null;supersedesSourceId?:string|null;metadata:Record<string,unknown>;
};

export type TaxResearchIssue={
  id:string;tenantId:string;practiceClientId:string;engagementId?:string|null;
  jurisdiction:string;taxType:string;periodKey:string;issue:string;
  factualBasis:string;factEvidenceRefs:string[];
  status:"draft"|"researching"|"review"|"approved"|"rejected"|"superseded";
};

export type TaxPositionProposal={
  id:string;researchIssueId:string;title:string;positionType:string;
  proposedTreatment:string;legalBasis:string;sourceIds:string[];
  factDependencies:string[];evidenceRefs:string[];
  estimatedTaxImpactMinor?:number|null;currency?:string|null;
  confidence:number;risk:"low"|"medium"|"high"|"specialist_review";
  status:"proposed"|"changes_required"|"approved"|"rejected";
  modelRunId?:string|null;reviewedBy?:string|null;reviewedAt?:string|null;
};

export type TaxResearchRun={
  id:string;researchIssueId:string;query:string;
  sourceHierarchy:string[];retrievedSourceIds:string[];
  answerDraft:string;uncertainties:string[];contraryAuthorities:string[];
  modelRunId?:string|null;status:"running"|"completed"|"failed";
};

export const TAX_INTELLIGENCE_FEATURES={
  research:"tax_intelligence.research",
  legislation:"tax_intelligence.legislation",
  caseLaw:"tax_intelligence.case_law",
  officialGuidance:"tax_intelligence.official_guidance",
  taxPositions:"tax_intelligence.positions",
  reliefSearch:"tax_intelligence.relief_search",
  planning:"tax_intelligence.planning",
  review:"tax_intelligence.review",
  changeMonitoring:"tax_intelligence.change_monitoring",
} as const;

export const TAX_INTELLIGENCE_EVENT_TYPES={
  issueCreated:"tax_intelligence.issue.created",
  researchRequested:"tax_intelligence.research.requested",
  researchCompleted:"tax_intelligence.research.completed",
  positionProposed:"tax_intelligence.position.proposed",
  positionApproved:"tax_intelligence.position.approved",
  lawChangeDetected:"tax_intelligence.law_change.detected",
} as const;

/**
 * Objective: identify the lowest lawful tax treatment supported by the actual facts,
 * evidence and current authoritative sources. The engine must not fabricate facts,
 * conceal income, create false expenses, backdate documents, or treat an aggressive
 * position as approved without competent human review.
 */
export const TAX_INTELLIGENCE_GUARDRAIL="lowest_lawful_tax_supported_by_facts_and_authority";
