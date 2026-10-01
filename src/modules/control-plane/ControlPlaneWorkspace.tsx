import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Boxes, ExternalLink, GitBranch, Globe2, Search, Store } from 'lucide-react';
import { AppShell } from '@/components/app/shell';
import { useTenant } from '@/hooks/useTenant';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getPortfolioControlPlane, updatePortfolioAsset } from './control-plane.functions';
import {
  migrationStages,
  targetModeSchema,
  type MigrationStage,
  type PortfolioAsset,
  type TargetMode,
} from './contracts';

const targetModes = targetModeSchema.options;
const label = (value: string) =>
  value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());

function Metric({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: number;
  hint: string;
  icon: typeof Boxes;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function AssetRow({
  asset,
  onUpdate,
  busy,
}: {
  asset: PortfolioAsset;
  onUpdate: (
    asset: PortfolioAsset,
    patch: { targetMode?: TargetMode; migrationStage?: MigrationStage },
  ) => void;
  busy: boolean;
}) {
  return (
    <div className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 xl:grid-cols-[minmax(220px,1.3fr)_minmax(180px,1fr)_180px_190px_140px] xl:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-medium">{asset.name}</div>
          {asset.traits.includes('marketplace') && <Badge variant="outline">Marketplace</Badge>}
          {asset.traits.includes('site_only') && <Badge variant="outline">Site-only</Badge>}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Row {asset.source_row} · {asset.proposed_role}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {asset.repository_url?.includes('github.com') && (
            <a
              className="inline-flex items-center gap-1 text-primary hover:underline"
              href={asset.repository_url}
              target="_blank"
              rel="noreferrer"
            >
              <GitBranch className="h-3 w-3" />
              Repo
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {asset.live_url && (
            <a
              className="inline-flex items-center gap-1 text-primary hover:underline"
              href={asset.live_url}
              target="_blank"
              rel="noreferrer"
            >
              <Globe2 className="h-3 w-3" />
              Live
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-muted-foreground">Parent / canonical family</div>
        <div className="mt-1 text-sm">{asset.parent_landlord || 'Unassigned'}</div>
        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {asset.migration_structure || 'Audit required'}
        </div>
      </div>

      <Select
        disabled={busy}
        value={asset.target_mode}
        onValueChange={(value) => onUpdate(asset, { targetMode: value as TargetMode })}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {targetModes.map((mode) => (
            <SelectItem key={mode} value={mode}>
              {label(mode)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="space-y-2">
        <Select
          disabled={busy}
          value={asset.migration_stage}
          onValueChange={(value) => onUpdate(asset, { migrationStage: value as MigrationStage })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {migrationStages.map((migrationStage) => (
              <SelectItem key={migrationStage} value={migrationStage}>
                {label(migrationStage)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Progress value={asset.stage_progress} className="h-1.5" />
      </div>

      <Badge variant="outline" className="w-fit">
        {asset.audit_status || 'Audit pending'}
      </Badge>
    </div>
  );
}

export default function ControlPlaneWorkspace() {
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const getPortfolio = useServerFn(getPortfolioControlPlane);
  const updateAsset = useServerFn(updatePortfolioAsset);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [stage, setStage] = useState('all');

  const query = useQuery({
    queryKey: ['portfolio-control-plane', tenant.tenantId],
    enabled:
      !!tenant.tenantId &&
      !tenant.loading &&
      ['owner', 'admin'].includes(tenant.role ?? ''),
    queryFn: () => getPortfolio({ data: { tenantId: tenant.tenantId! } }),
  });

  const mutation = useMutation({
    mutationFn: ({
      asset,
      patch,
    }: {
      asset: PortfolioAsset;
      patch: { targetMode?: TargetMode; migrationStage?: MigrationStage };
    }) =>
      updateAsset({
        data: {
          tenantId: tenant.tenantId!,
          assetId: asset.id,
          ...patch,
        },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['portfolio-control-plane', tenant.tenantId],
      }),
  });

  const assets = query.data?.assets ?? [];
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return assets.filter((asset) => {
      if (role !== 'all' && asset.architecture_role !== role) return false;
      if (stage !== 'all' && asset.migration_stage !== stage) return false;
      if (!needle) return true;
      return [
        asset.name,
        asset.parent_landlord,
        asset.repository_url,
        asset.live_url,
        asset.migration_structure,
      ].some((value) => value?.toLowerCase().includes(needle));
    });
  }, [assets, role, search, stage]);

  if (tenant.loading) {
    return (
      <AppShell title="SaaS Factory control plane">
        <div>Loading workspace…</div>
      </AppShell>
    );
  }

  if (!['owner', 'admin'].includes(tenant.role ?? '')) {
    return (
      <AppShell title="SaaS Factory control plane">
        <Card>
          <CardContent className="p-6">Owner or admin access is required.</CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="SaaS Factory control plane"
      subtitle="Canonical inventory → repo audit → decision → adapter → shadow sync → cutover"
      actions={
        <Button asChild>
          <Link to="/app/tenant-factory">Tenants & add-ons</Link>
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric
            title="Portfolio rows"
            value={query.data?.stats.total ?? 0}
            hint={`${query.data?.sourceRows ?? 120} source rows preserved`}
            icon={Boxes}
          />
          <Metric
            title="Landlord products"
            value={
              (query.data?.stats.byRole?.landlord ?? 0) +
              (query.data?.stats.byRole?.platform_landlord ?? 0)
            }
            hint="Platform + SaaS landlords"
            icon={Store}
          />
          <Metric
            title="Marketplace-tagged"
            value={query.data?.stats.marketplaces ?? 0}
            hint="Marketplace topology retained"
            icon={GitBranch}
          />
          <Metric
            title="Site-only candidates"
            value={query.data?.stats.siteOnly ?? 0}
            hint="Prefer native Omniqora configuration unless specialist logic needs a repo"
            icon={Globe2}
          />
        </div>

        <Card>
          <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_220px_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search product, repo, parent or migration decision"
                className="pl-9"
              />
            </div>

            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue placeholder="Architecture role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {Object.keys(query.data?.stats.byRole ?? {})
                  .sort()
                  .map((item) => (
                    <SelectItem key={item} value={item}>
                      {label(item)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger>
                <SelectValue placeholder="Migration stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {migrationStages.map((item) => (
                  <SelectItem key={item} value={item}>
                    {label(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <div className="hidden grid-cols-[minmax(220px,1.3fr)_minmax(180px,1fr)_180px_190px_140px] gap-3 border-b bg-muted/30 px-4 py-3 text-xs font-medium text-muted-foreground xl:grid">
            <div>Portfolio asset</div>
            <div>Target family</div>
            <div>Target mode</div>
            <div>Migration stage</div>
            <div>Audit</div>
          </div>

          {query.isLoading && (
            <CardContent className="p-6">Loading portfolio inventory…</CardContent>
          )}
          {query.error && (
            <CardContent className="p-6 text-destructive">
              {query.error instanceof Error
                ? query.error.message
                : 'Unable to load control plane'}
            </CardContent>
          )}
          {!query.isLoading &&
            !query.error &&
            filtered.map((asset) => (
              <AssetRow
                key={asset.id}
                asset={asset}
                busy={mutation.isPending && mutation.variables?.asset.id === asset.id}
                onUpdate={(item, patch) => mutation.mutate({ asset: item, patch })}
              />
            ))}
          {!query.isLoading && !query.error && filtered.length === 0 && (
            <CardContent className="p-6 text-sm text-muted-foreground">
              No portfolio rows match these filters.
            </CardContent>
          )}
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {filtered.length} of {assets.length} rows shown. Changes are tenant-scoped
            and written to the migration event history.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            Refresh
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
