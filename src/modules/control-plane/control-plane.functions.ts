import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import seedRaw from './portfolio-seed.json';
import {
  listPortfolioInputSchema,
  migrationStageSchema,
  portfolioAssetSchema,
  portfolioSeedRowSchema,
  stageProgress,
  suggestedTargetMode,
  updatePortfolioAssetInputSchema,
} from './contracts';

const seed = portfolioSeedRowSchema.array().parse(seedRaw);

type TenantContext = {
  supabase: any;
  userId: string;
};

async function requireWorkspaceAdmin(context: TenantContext, tenantId: string) {
  const { data: member, error } = await context.supabase
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', context.userId)
    .maybeSingle();

  if (error || !member || !['owner', 'admin'].includes(member.role)) {
    throw new Error('Workspace administrator access is required for the SaaS Factory control plane');
  }
}

async function ensurePortfolioSeed(context: TenantContext, tenantId: string) {
  const rows = seed.map((row) => ({
    tenant_id: tenantId,
    source_row: row.sourceRow,
    name: row.name,
    repository_url: row.repositoryUrl ?? null,
    live_url: row.liveUrl ?? null,
    links_to: row.linksTo ?? null,
    proposed_role: row.proposedRole,
    architecture_role: row.architectureRole,
    parent_landlord: row.parentLandlord ?? null,
    migration_structure: row.migrationStructure ?? null,
    common_services: row.commonServices,
    audit_status: row.auditStatus ?? null,
    traits: row.traits,
    target_mode: suggestedTargetMode(row),
    migration_stage: 'inventory',
    stage_progress: stageProgress.inventory,
  }));

  const { error } = await context.supabase
    .from('portfolio_assets')
    .upsert(rows, { onConflict: 'tenant_id,source_row', ignoreDuplicates: true });

  if (error) throw new Error(`Unable to initialise portfolio inventory: ${error.message}`);
}

export const getPortfolioControlPlane = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(listPortfolioInputSchema)
  .handler(async ({ context, data }) => {
    await requireWorkspaceAdmin(context, data.tenantId);
    await ensurePortfolioSeed(context, data.tenantId);
    const db = context.supabase as any;

    const { data: assets, error } = await db
      .from('portfolio_assets')
      .select('*')
      .eq('tenant_id', data.tenantId)
      .order('source_row', { ascending: true });

    if (error) throw new Error(`Unable to load portfolio inventory: ${error.message}`);

    const parsed = portfolioAssetSchema.array().parse(assets ?? []);
    const stats = parsed.reduce((acc, asset) => {
      acc.total += 1;
      acc.byRole[asset.architecture_role] = (acc.byRole[asset.architecture_role] ?? 0) + 1;
      acc.byStage[asset.migration_stage] = (acc.byStage[asset.migration_stage] ?? 0) + 1;
      if (asset.traits.includes('marketplace')) acc.marketplaces += 1;
      if (asset.traits.includes('site_only')) acc.siteOnly += 1;
      return acc;
    }, {
      total: 0,
      marketplaces: 0,
      siteOnly: 0,
      byRole: {} as Record<string, number>,
      byStage: {} as Record<string, number>,
    });

    return { assets: parsed, stats, sourceRows: seed.length };
  });

export const updatePortfolioAsset = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(updatePortfolioAssetInputSchema)
  .handler(async ({ context, data }) => {
    await requireWorkspaceAdmin(context, data.tenantId);
    const db = context.supabase as any;

    const { data: current, error: currentError } = await db
      .from('portfolio_assets')
      .select('*')
      .eq('tenant_id', data.tenantId)
      .eq('id', data.assetId)
      .single();

    if (currentError || !current) throw new Error('Portfolio asset was not found');
    const before = portfolioAssetSchema.parse(current);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.targetMode !== undefined) patch.target_mode = data.targetMode;
    if (data.migrationStage !== undefined) {
      patch.migration_stage = data.migrationStage;
      patch.stage_progress = stageProgress[migrationStageSchema.parse(data.migrationStage)];
    }
    if (data.canonicalProductKey !== undefined) patch.canonical_product_key = data.canonicalProductKey;
    if (data.canonicalRepositoryUrl !== undefined) patch.canonical_repository_url = data.canonicalRepositoryUrl;
    if (data.ownerNotes !== undefined) patch.owner_notes = data.ownerNotes;

    const { data: updated, error: updateError } = await db
      .from('portfolio_assets')
      .update(patch)
      .eq('tenant_id', data.tenantId)
      .eq('id', data.assetId)
      .select('*')
      .single();

    if (updateError || !updated) {
      throw new Error(updateError?.message ?? 'Unable to update portfolio asset');
    }

    const after = portfolioAssetSchema.parse(updated);
    const changes = Object.entries(patch)
      .filter(([key]) => key !== 'updated_at')
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {} as Record<string, unknown>);

    await db.from('portfolio_migration_events').insert({
      tenant_id: data.tenantId,
      asset_id: data.assetId,
      actor_user_id: context.userId,
      event_type: data.migrationStage && data.migrationStage !== before.migration_stage
        ? 'stage.changed'
        : 'asset.updated',
      from_stage: before.migration_stage,
      to_stage: after.migration_stage,
      details: changes,
    });

    await db.from('audit_log').insert({
      tenant_id: data.tenantId,
      actor: context.userId,
      action: 'portfolio_asset.updated',
      entity: 'portfolio_asset',
      entity_id: data.assetId,
      payload: {
        before: {
          target_mode: before.target_mode,
          migration_stage: before.migration_stage,
        },
        changes,
      },
    });

    return after;
  });
