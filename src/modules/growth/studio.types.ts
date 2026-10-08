/** Shared Growth Studio records. Safe to import from browser code. */
export type StudioProductKey = "omniqora" | "syndriva" | "merqora" | "affivon";
export type StudioLocale = "en" | "ur" | "es";
export type StudioChannel = "social" | "email" | "whatsapp" | "web";
export type StudioEvidenceKind =
  "brand_fact" | "competitor_ad" | "customer_feedback" | "product_data" | "affiliate_offer";
export type StudioScope = { tenantId: string; productKey: StudioProductKey };
export type StudioVersioned = StudioScope & {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export type StudioBrand = StudioVersioned & {
  name: string;
  voice: string;
  offer: string;
  rules: string[];
  audience: string;
  locale: StudioLocale;
  disclosure: string;
};
export type StudioEvidence = StudioVersioned & {
  brandId: string;
  title: string;
  content: string;
  sourceUrl: string | null;
  kind: StudioEvidenceKind;
  validUntil: string | null;
  provenance?: { credentialId: string; externalRef: string };
};
export type StudioCampaign = StudioVersioned & {
  brandId: string;
  title: string;
  objective: string;
  channel: StudioChannel;
  locale: StudioLocale;
  evidenceIds: string[];
};
export type StudioInputSnapshot = {
  brand: StudioBrand;
  campaign: StudioCampaign;
  evidence: StudioEvidence[];
  writerBindingId: string | null;
  classifierBindingId: string | null;
};
export type StudioOutput = {
  angle: string;
  rationale: string;
  variants: Array<{
    key: string;
    headline: string;
    body: string;
    callToAction: string;
    hashtags: string[];
    evidenceIds: string[];
    disclosure: string;
  }>;
  creativeBrief: { direction: string; assetTypes: string[] };
  warnings: string[];
};
export type StudioGenerationResult = {
  output: StudioOutput;
  checks: Array<{ key: string; label: string; status: "pass" | "review" | "fail"; detail: string }>;
  provider: {
    providerKey: string;
    model: string;
    resolvedModel?: string;
    requestId?: string;
    usage?: { inputTokens?: number; outputTokens?: number };
  };
  classification?: {
    provider: {
      providerKey: string;
      model: string;
      resolvedModel?: string;
      requestId?: string;
      usage: { inputTokens?: number; outputTokens?: number };
    };
    answers: Record<string, { choice: string; confidence: number }>;
  };
};
export type StudioRun = StudioVersioned & {
  brandId: string;
  campaignId: string;
  requestKey: string;
  status: "running" | "completed" | "blocked" | "failed" | "stale";
  reviewStatus: "pending" | "approved" | "rejected";
  inputSnapshot: StudioInputSnapshot;
  providerKey: string;
  model: string;
  result: StudioGenerationResult | null;
  error: string | null;
  note: string | null;
  reviewedAt: string | null;
  finishedAt: string | null;
  marketingCampaignId: string | null;
  creativeBriefId: string | null;
};
export type StudioWorkspace = {
  brands: StudioBrand[];
  evidence: StudioEvidence[];
  campaigns: StudioCampaign[];
  runs: StudioRun[];
};
export type SaveStudioBrand = StudioScope &
  Partial<Pick<StudioVersioned, "id">> & {
    expectedRevision?: number;
    name: string;
    voice: string;
    offer: string;
    rules: string[];
    audience: string;
    locale: StudioLocale;
    disclosure: string;
  };
export type SaveStudioEvidence = StudioScope & {
  id?: string;
  expectedRevision?: number;
  brandId: string;
  title: string;
  content: string;
  sourceUrl?: string | null;
  kind: StudioEvidenceKind;
  validUntil?: string | null;
};
export type SaveStudioCampaign = StudioScope & {
  id?: string;
  expectedRevision?: number;
  brandId: string;
  title: string;
  objective: string;
  channel: StudioChannel;
  locale: StudioLocale;
  evidenceIds: string[];
};
