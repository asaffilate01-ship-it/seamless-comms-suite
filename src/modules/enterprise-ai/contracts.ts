/** Proposed host contracts only. No network/auth/UI implementation is supplied. */
export const MODULE_ID = 'enterprise-ai' as const;
export type Permission = 'read' | 'write' | 'approve' | 'operate' | 'audit';
export type Currency = 'GBP' | 'EUR' | 'USD';
export interface VerifiedHostAccess {
  tenant: string;
  workspace: string;
  subject: string;
  permissions: Permission[];
  expires_at: number;
  entitlement_until: number;
  human: boolean;
}
export interface UseCaseSpec {
  name: string;
  owner: string; // Resolved host subject ID, not a free-text display name.
  purpose: string;
  data_classification: 'public' | 'internal' | 'confidential' | 'restricted';
  action_mode: 'read_only' | 'draft' | 'external_write';
  decision_impact: 'internal_productivity' | 'client_communication' | 'investment_decision';
  data_sources: string[];
  model_reference: string;
  jurisdiction: string;
  currency: Currency;
  monthly_budget_minor: number;
}
export interface UseCaseRecord {
  id: string;
  revision: number;
  status: 'draft' | 'assessed' | 'approved' | 'pilot' | 'suspended';
  spec: UseCaseSpec;
  editor: string;
  contributors: string[];
  assessment: null | { risk_tier: 'low' | 'medium' | 'high'; required_controls: string[]; policy_version: string };
  evidence: Record<string, string>;
  approval: null | { reviewer: string; expires_at: number; content_hash: string };
  approved_forecast_minor?: number;
  suspension_reason?: string;
}
export interface IdentityEntitlementPort {
  /** Run on server. Recheck membership and entitlement for every operation. */
  resolveEnterpriseAI(workspaceId: string): Promise<VerifiedHostAccess>;
}
export interface EvidencePort {
  /** Preserve source permissions; return immutable version references. */
  verifyReferences(access: VerifiedHostAccess, references: string[]): Promise<{ accepted: boolean; versions: string[] }>;
}
export interface UsageEvent {
  eventId: string;
  tenant: string;
  workspace: string;
  useCaseId: string;
  runId: string;
  provider: string;
  modelVersion: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  occurredAt: string;
  priceVersion: string;
}
export interface UsagePort {
  /** Future runtime adapter: authenticate source and deduplicate event IDs. */
  record(access: VerifiedHostAccess, event: UsageEvent): Promise<void>;
}
export interface RevocationPort {
  /** Future runtime integration must stop new calls and report in-flight work. */
  suspendUseCase(access: VerifiedHostAccess, useCaseId: string, reason: string): Promise<{ receipt: string }>;
}
