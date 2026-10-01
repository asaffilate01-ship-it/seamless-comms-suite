import { z } from 'zod';

export const architectureRoleSchema = z.enum([
  'platform_landlord',
  'landlord',
  'tenant',
  'regional_variant',
  'shared_module',
  'merge_candidate',
  'vertical_product',
  'standalone_candidate',
]);
export type ArchitectureRole = z.infer<typeof architectureRoleSchema>;

export const targetModeSchema = z.enum([
  'pending',
  'retain_product',
  'platform_landlord',
  'landlord',
  'tenant',
  'regional_variant',
  'shared_module',
  'marketplace',
  'merge',
  'site_native',
]);
export type TargetMode = z.infer<typeof targetModeSchema>;

export const migrationStageSchema = z.enum([
  'inventory',
  'repo_audit',
  'decision',
  'adapter',
  'shadow_sync',
  'cutover_ready',
  'cutover',
  'complete',
  'blocked',
]);
export type MigrationStage = z.infer<typeof migrationStageSchema>;

export const migrationStages = migrationStageSchema.options;

export const portfolioSeedRowSchema = z.object({
  sourceRow: z.number().int().positive(),
  name: z.string().min(1),
  repositoryUrl: z.string().nullable().optional(),
  liveUrl: z.string().nullable().optional(),
  linksTo: z.string().nullable().optional(),
  proposedRole: z.string().min(1),
  architectureRole: architectureRoleSchema,
  parentLandlord: z.string().nullable().optional(),
  migrationStructure: z.string().nullable().optional(),
  commonServices: z.array(z.string()),
  auditStatus: z.string().nullable().optional(),
  traits: z.array(z.string()),
});
export type PortfolioSeedRow = z.infer<typeof portfolioSeedRowSchema>;

export const portfolioAssetSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  source_row: z.number().int().positive(),
  name: z.string(),
  repository_url: z.string().nullable(),
  live_url: z.string().nullable(),
  links_to: z.string().nullable(),
  proposed_role: z.string(),
  architecture_role: architectureRoleSchema,
  parent_landlord: z.string().nullable(),
  migration_structure: z.string().nullable(),
  common_services: z.array(z.string()),
  audit_status: z.string().nullable(),
  traits: z.array(z.string()),
  target_mode: targetModeSchema,
  migration_stage: migrationStageSchema,
  canonical_product_key: z.string().nullable(),
  canonical_repository_url: z.string().nullable(),
  stage_progress: z.number().int().min(0).max(100),
  owner_notes: z.string().nullable(),
  updated_at: z.string(),
  created_at: z.string(),
});
export type PortfolioAsset = z.infer<typeof portfolioAssetSchema>;

export const updatePortfolioAssetInputSchema = z.object({
  tenantId: z.string().uuid(),
  assetId: z.string().uuid(),
  targetMode: targetModeSchema.optional(),
  migrationStage: migrationStageSchema.optional(),
  canonicalProductKey: z.string().trim().max(80).nullable().optional(),
  canonicalRepositoryUrl: z.string().url().nullable().optional(),
  ownerNotes: z.string().trim().max(4000).nullable().optional(),
});

export const listPortfolioInputSchema = z.object({ tenantId: z.string().uuid() });

export const stageProgress: Record<MigrationStage, number> = {
  inventory: 10,
  repo_audit: 25,
  decision: 40,
  adapter: 55,
  shadow_sync: 70,
  cutover_ready: 85,
  cutover: 95,
  complete: 100,
  blocked: 0,
};

export const suggestedTargetMode = (row: Pick<PortfolioSeedRow, 'architectureRole' | 'traits'>): TargetMode => {
  if (row.traits.includes('site_only')) return 'site_native';
  if (row.traits.includes('marketplace') && ['landlord', 'standalone_candidate'].includes(row.architectureRole)) return 'marketplace';
  switch (row.architectureRole) {
    case 'platform_landlord': return 'platform_landlord';
    case 'landlord': return 'landlord';
    case 'tenant': return 'tenant';
    case 'regional_variant': return 'regional_variant';
    case 'shared_module': return 'shared_module';
    case 'merge_candidate': return 'merge';
    case 'vertical_product': return 'retain_product';
    default: return 'pending';
  }
};
