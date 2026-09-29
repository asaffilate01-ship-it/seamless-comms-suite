export type AudienceFilter = {
  field: string;
  operator: "eq" | "neq" | "in" | "not_in" | "gt" | "gte" | "lt" | "lte" | "contains" | "exists";
  value?: unknown;
};

export type AudienceDefinition = {
  id: string;
  tenantId: string;
  name: string;
  filters: AudienceFilter[];
  estimatedSize?: number | null;
  status: "draft" | "active" | "archived";
};

export type MarketingCampaign = {
  id: string;
  tenantId: string;
  name: string;
  objective: string;
  audienceId: string;
  channels: Array<"email" | "sms" | "whatsapp" | "push" | "web" | "social">;
  creativeBriefId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  status: "draft" | "scheduled" | "running" | "paused" | "completed" | "cancelled";
  attributionWindowDays?: number | null;
};

export type SalesSequence = {
  id: string;
  tenantId: string;
  name: string;
  steps: Array<{
    order: number;
    kind: "email" | "sms" | "whatsapp" | "call" | "task" | "meeting";
    delayMinutes: number;
    templateKey?: string | null;
  }>;
  status: "draft" | "active" | "paused" | "archived";
};

export type JourneyNode = {
  id: string;
  kind: "trigger" | "condition" | "ai_decision" | "action" | "delay" | "branch" | "outcome";
  config: Record<string, unknown>;
};

export type JourneyDefinition = {
  id: string;
  tenantId: string;
  name: string;
  nodes: JourneyNode[];
  edges: Array<{ from: string; to: string; condition?: string | null }>;
  status: "draft" | "active" | "paused" | "archived";
};

export type RfmProfile = {
  crmPersonId: string;
  recencyDays: number | null;
  frequency: number;
  monetaryMinor: number;
  currency: string;
  rScore?: number | null;
  fScore?: number | null;
  mScore?: number | null;
  segments: string[];
  calculatedAt: string;
};

export type FeedbackSurvey = {
  id: string;
  tenantId: string;
  type: "nps" | "csat" | "ces" | "custom";
  name: string;
  triggerEvent?: string | null;
  channel: "email" | "sms" | "whatsapp" | "web" | "app";
  status: "draft" | "active" | "paused" | "archived";
};

export const GROWTH_EVENT_TYPES = {
  audienceRefreshed: "marketing.audience.refreshed",
  campaignStarted: "marketing.campaign.started",
  campaignConverted: "marketing.campaign.converted",
  sequenceStarted: "sales.sequence.started",
  sequenceCompleted: "sales.sequence.completed",
  journeyStarted: "journey.started",
  journeyStepCompleted: "journey.step.completed",
  journeyCompleted: "journey.completed",
  rfmUpdated: "customer.rfm.updated",
  feedbackRequested: "feedback.requested",
  feedbackReceived: "feedback.received",
} as const;
