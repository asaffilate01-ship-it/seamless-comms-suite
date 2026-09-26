import { z } from "zod";

export const evidenceProviderResultSchema = z.object({
  provider: z.string().min(1).max(80),
  providerEvidenceId: z.string().min(1).max(160),
  providerTimestamp: z.string().datetime(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  originalObjectKey: z.string().min(1).max(500),
  locationCaptured: z.literal(false),
  metadataSanitised: z.boolean().default(true),
}).strict();

export type EvidenceProviderResult = z.infer<typeof evidenceProviderResultSchema>;

export interface EvidenceProvider {
  createCaptureSession(input: {
    tenantId: string;
    vehicleId: string;
    appraisalId?: string;
    requestedItems: string[];
    expiresAt: string;
    captureGeolocation: false;
  }): Promise<{ sessionId: string; captureUrl: string; expiresAt: string }>;

  verifyEvidence(input: {
    tenantId: string;
    sessionId: string;
    providerEvidenceId: string;
  }): Promise<EvidenceProviderResult>;
}

/**
 * Provider adapters (for example Dokuvera) must map into this contract.
 * Precise latitude/longitude are intentionally not represented in the shared schema.
 */
