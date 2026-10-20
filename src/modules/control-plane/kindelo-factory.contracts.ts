import { z } from 'zod';

/**
 * Kindelo UK white-label launch contract.
 * Product identity is Kindelo; each operator has its own workspace and regulator status.
 * A valid schema is never proof of registration or suitability.
 */
export const kindeloProductKey = 'kindelo' as const;
export const kindeloWorkspaceKinds = ['operator', 'agency_tenant', 'software_tenant', 'nanny_tenant'] as const;

export const kindeloTenantLaunchSchema = z.object({
  omniqoraTenantId: z.string().uuid(),
  externalWorkspaceKey: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/),
  displayName: z.string().trim().min(2).max(160),
  workspaceKind: z.enum(kindeloWorkspaceKinds),
  country: z.literal('GB'),
  jurisdiction: z.literal('England'),
  currency: z.literal('GBP'),
  timezone: z.literal('Europe/London'),
  regulatoryStatus: z.enum(['unverified', 'application_pending', 'approved', 'suspended']).default('unverified'),
  regulatoryEvidenceReference: z.string().trim().min(4).max(180).optional(),
  approvedFeatureKeys: z.array(z.enum([
    'kindelo.software', 'kindelo.parent-portal', 'kindelo.prospects',
    'kindelo.training', 'kindelo.qa', 'kindelo.white-label', 'kindelo.nanny',
  ])).default([]),
  brand: z.object({
    name: z.string().trim().min(2).max(120),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    domain: z.string().optional(), // must be independently verified, not accepted at launch
  }),
}).superRefine((input, ctx) => {
  if (input.workspaceKind === 'software_tenant' && input.approvedFeatureKeys.includes('kindelo.qa')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['approvedFeatureKeys'], message: 'Regulated QA is not a generic software subscription.' });
  }
  if (input.workspaceKind === 'nanny_tenant' && input.approvedFeatureKeys.includes('kindelo.qa')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['approvedFeatureKeys'], message: 'CMA quality assurance cannot be supplied to a nanny tenant as its registration.' });
  }
  if ((input.workspaceKind === 'agency_tenant' || input.workspaceKind === 'operator') &&
      input.regulatoryStatus === 'approved' && !input.regulatoryEvidenceReference) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['regulatoryEvidenceReference'], message: 'Documented independent CMA evidence must be provided before approval may be recorded.' });
  }
});

export type KindeloTenantLaunch = z.infer<typeof kindeloTenantLaunchSchema>;

/** Readiness is calculated from server-authoritative evidence, never brand/URL alone. */
export function kindeloCmaFeaturesAllowed(input: {
  workspaceKind: string;
  registrationStatus: string;
  currentEvidenceVerified: boolean;
  provisioningConnected: boolean;
}): boolean {
  return (input.workspaceKind === 'operator' || input.workspaceKind === 'agency_tenant') &&
    input.registrationStatus === 'approved' &&
    input.currentEvidenceVerified &&
    input.provisioningConnected;
}
