import { z } from "zod";
import { growthScopeSchema, type GrowthProviderView } from "./studio.contract";
import type { StudioProductKey } from "./studio.types";

export type GrowthWorkspaceRole = "owner" | "admin" | "agent" | "viewer" | "platform_admin";
export type GrowthAccess = {
  allowed: boolean;
  canWrite: boolean;
  canReview: boolean;
  canHandoff: boolean;
  role: GrowthWorkspaceRole;
  reason?: string;
};
export type GrowthWorkspaceChoice = {
  id: string;
  name: string;
  status: string;
  role: GrowthWorkspaceRole;
};
export type GrowthWorkspacePage = {
  workspaces: GrowthWorkspaceChoice[];
  hasMore: boolean;
  nextOffset: number | null;
};
export type GrowthSetupRequest = {
  id: string;
  tenantId: string;
  productKey: StudioProductKey;
  requestKey: string;
  includeCreative: boolean;
  status: "requested" | "approved" | "rejected";
  note: string;
  decisionNote: string | null;
  requestedBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
  receipt: {
    productActivated: boolean;
    servicesActivated: string[];
    servicesPreserved: string[];
  } | null;
};
export type GrowthSetupService = {
  key: string;
  name: string;
  status: string | null;
  active: boolean;
  validFrom: string | null;
  validUntil: string | null;
  implementationStatus: string | null;
  provisionable: boolean;
};
export type GrowthSetupBlocker = { code: string; message: string };
export type GrowthSetup = {
  tenant: { id: string; name: string; status: string };
  product: {
    key: StudioProductKey;
    name: string;
    status: string | null;
    deploymentMode: string;
    implementationStatus: string;
  };
  access: GrowthAccess;
  permissions: { canRequest: boolean; canConfigure: boolean; canDecide: boolean; reviewAvailable: boolean };
  services: GrowthSetupService[];
  connection: { verified: boolean; lastVerifiedAt: string | null };
  request: GrowthSetupRequest | null;
  history: GrowthSetupRequest[];
  blockers: GrowthSetupBlocker[];
  providers: GrowthProviderView[];
};

export const growthWorkspacePageSchema = z.object({
  offset: z.number().int().min(0).max(10000).default(0),
  limit: z.number().int().min(1).max(50).default(25),
}).strict();
export const growthSetupSchema = growthScopeSchema.extend({
  includeCreative: z.boolean().default(true),
}).strict();
export const requestGrowthSetupSchema = growthSetupSchema.extend({
  requestKey: z.string().uuid(),
  note: z.string().trim().max(1000).default(""),
}).strict();
export const decideGrowthSetupSchema = growthScopeSchema.extend({
  requestId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(1000).default(""),
}).strict();
export const saveGrowthWriterSchema = growthScopeSchema.extend({
  providerKey: z.enum(["ai.openai", "ai.anthropic", "ai.gemini"]),
  model: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{1,160}$/, "Enter a valid provider model ID."),
  maxOutputTokens: z.number().int().min(512).max(4096).default(2048),
}).strict();

export type GrowthSetupInput = z.infer<typeof growthSetupSchema>;
export type RequestGrowthSetupInput = z.infer<typeof requestGrowthSetupSchema>;
export type DecideGrowthSetupInput = z.infer<typeof decideGrowthSetupSchema>;
export type SaveGrowthWriterInput = z.infer<typeof saveGrowthWriterSchema>;
