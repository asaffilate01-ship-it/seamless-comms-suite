import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AppShell, StatusBadge } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/hooks/useTenant";
import {
  bootstrapDishbeePilot,
  createPlatformTenant,
  enableHaccoraDishbeePilot,
  enableHaccoraForDishbee,
  getHaccoraReadiness,
  getDishbeeFamilyReadiness,
  getProductLocationLinks,
  getControlPlaneCatalogue,
  getTenantControlPlane,
  listPlatformTenants,
  linkTenantProduct,
  rotateProductCredential,
  retryHaccoraProvisioning,
  requestTenantDomainVerification,
  runHaccoraPilotSmokeTest,
  runHaccoraSmokeTest,
  saveTenantBranding,
  setTenantProduct,
  setTenantService,
  setTenantEcosystemAddon,
  type JsonValue,
  type TenantControlPlane,
  upsertTenantDomain,
  upsertProductLocationLink,
  type ProductLocationLink,
  type DishbeeFamilyReadiness,
} from "@/lib/control-plane.functions";
import {
  Building2,
  Boxes,
  GitBranch as GitBranchIcon,
  Globe2,
  Layers3,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { FleetoraOperatorPanel } from "@/modules/control-plane/FleetoraOperatorPanel";

export const Route = createFileRoute("/_authenticated/app/tenant-factory")({
  component: ControlPlane,
  head: () => ({
    meta: [
      { title: "Tenant Factory — Omniqora" },
      {
        name: "description",
        content: "Omniqora tenant, product, add-on and provisioning control plane.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function ControlPlane() {
  const current = useTenant();
  const catalogueRequest = useServerFn(getControlPlaneCatalogue);
  const listTenantsRequest = useServerFn(listPlatformTenants);
  const tenantRequest = useServerFn(getTenantControlPlane);
  const productLocationLinksRequest = useServerFn(getProductLocationLinks);
  const upsertProductLocationLinkRequest = useServerFn(upsertProductLocationLink);
  const createTenantRequest = useServerFn(createPlatformTenant);
  const bootstrapDishbeeRequest = useServerFn(bootstrapDishbeePilot);
  const enableHaccoraPilotRequest = useServerFn(enableHaccoraDishbeePilot);
  const enableHaccoraRequest = useServerFn(enableHaccoraForDishbee);
  const haccoraReadinessRequest = useServerFn(getHaccoraReadiness);
  const dishbeeFamilyReadinessRequest = useServerFn(getDishbeeFamilyReadiness);
  const retryHaccoraRequest = useServerFn(retryHaccoraProvisioning);
  const haccoraSmokeRequest = useServerFn(runHaccoraSmokeTest);
  const haccoraPilotSmokeRequest = useServerFn(runHaccoraPilotSmokeTest);
  const setProductRequest = useServerFn(setTenantProduct);
  const setServiceRequest = useServerFn(setTenantService);
  const setEcosystemAddonRequest = useServerFn(setTenantEcosystemAddon);
  const linkProductRequest = useServerFn(linkTenantProduct);
  const rotateCredentialRequest = useServerFn(rotateProductCredential);
  const saveBrandingRequest = useServerFn(saveTenantBranding);
  const saveDomainRequest = useServerFn(upsertTenantDomain);
  const verifyDomainRequest = useServerFn(requestTenantDomainVerification);

  const catalogue = useQuery({
    queryKey: ["control-plane-catalogue"],
    queryFn: () => catalogueRequest(),
    retry: false,
  });
  const isPlatformAdmin = !!catalogue.data?.isPlatformAdmin;

  const tenants = useQuery({
    queryKey: ["platform-tenants", isPlatformAdmin],
    queryFn: () => listTenantsRequest(),
    enabled: isPlatformAdmin,
    retry: false,
  });

  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  useEffect(() => {
    setHaccoraSmoke(null);
  }, [selectedTenantId]);

  useEffect(() => {
    if (selectedTenantId) return;
    if (current.tenantId) setSelectedTenantId(current.tenantId);
    else if (isPlatformAdmin && tenants.data?.[0]?.id) setSelectedTenantId(tenants.data[0].id);
  }, [current.tenantId, isPlatformAdmin, selectedTenantId, tenants.data]);

  const detail = useQuery({
    queryKey: ["tenant-control-plane", selectedTenantId],
    queryFn: () => tenantRequest({ data: { tenantId: selectedTenantId } }),
    enabled: !!selectedTenantId,
    retry: false,
  });

  const productLocationLinks = useQuery({
    queryKey: ["product-location-links", selectedTenantId],
    queryFn: () => productLocationLinksRequest({ data: { tenantId: selectedTenantId } }),
    enabled: !!selectedTenantId,
    retry: false,
  });

  const dishbeeFamilyReadiness = useQuery({
    queryKey: ["dishbee-family-readiness", selectedTenantId],
    queryFn: () => dishbeeFamilyReadinessRequest({ data: { tenantId: selectedTenantId } }),
    enabled: !!selectedTenantId,
    retry: false,
  });

  const haccoraReadiness = useQuery({
    queryKey: ["haccora-readiness", selectedTenantId],
    queryFn: () => haccoraReadinessRequest({ data: { tenantId: selectedTenantId } }),
    enabled: !!selectedTenantId,
    retry: false,
  });

  const [newTenant, setNewTenant] = useState({
    organisationName: "",
    tenantName: "",
    slug: "",
    countryCode: "GB",
    currency: "GBP",
    timezone: "Europe/London",
    blueprintKey: "mealdeck-uk",
  });
  const [creating, setCreating] = useState(false);
  const [bootstrappingDishbee, setBootstrappingDishbee] = useState(false);
  const [bootstrappingHaccora, setBootstrappingHaccora] = useState(false);
  const [haccoraSmoke, setHaccoraSmoke] = useState<Awaited<
    ReturnType<typeof haccoraSmokeRequest>
  > | null>(null);
  const [pilotSmoke, setPilotSmoke] = useState<Awaited<
    ReturnType<typeof haccoraPilotSmokeRequest>
  > | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const enabledProducts = useMemo(
    () =>
      new Set(
        (detail.data?.products ?? [])
          .filter((p) => !["cancelled", "failed"].includes(p.status))
          .map((p) => p.product_key),
      ),
    [detail.data?.products],
  );
  const enabledServices = useMemo(
    () =>
      new Set(
        (detail.data?.services ?? [])
          .filter((s) => !["cancelled", "failed"].includes(s.status))
          .map((s) => s.service_key),
      ),
    [detail.data?.services],
  );
  const enabledEcosystemAddons = useMemo(
    () =>
      new Set(
        (detail.data?.ecosystemAddons ?? [])
          .filter((a) => !["cancelled", "suspended"].includes(a.status))
          .map((a) => a.addon_key),
      ),
    [detail.data?.ecosystemAddons],
  );

  async function refreshTenant() {
    await Promise.all([
      detail.refetch(),
      tenants.refetch(),
      haccoraReadiness.refetch(),
      productLocationLinks.refetch(),
      dishbeeFamilyReadiness.refetch(),
    ]);
  }

  async function createTenant() {
    setCreating(true);
    try {
      const result = await createTenantRequest({
        data: {
          organisationName: newTenant.organisationName,
          tenantName: newTenant.tenantName,
          slug: newTenant.slug,
          countryCode: newTenant.countryCode.toUpperCase(),
          currency: newTenant.currency.toUpperCase(),
          timezone: newTenant.timezone,
          blueprintKey: newTenant.blueprintKey || null,
        },
      });
      toast.success("Tenant created and provisioning queued");
      setSelectedTenantId(result.tenantId);
      setNewTenant((v) => ({ ...v, organisationName: "", tenantName: "", slug: "" }));
      await tenants.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to create tenant");
    } finally {
      setCreating(false);
    }
  }

  async function bootstrapDishbee() {
    setBootstrappingDishbee(true);
    try {
      const result = await bootstrapDishbeeRequest();
      toast.success("Dishbee landlord pilot created/reconciled");
      await tenants.refetch();
      const firstTenant = result.tenants?.[0]?.tenantId;
      if (firstTenant) setSelectedTenantId(firstTenant);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dishbee pilot bootstrap failed");
    } finally {
      setBootstrappingDishbee(false);
    }
  }

  async function bootstrapHaccoraPilot() {
    setBootstrappingHaccora(true);
    try {
      await enableHaccoraPilotRequest();
      toast.success("Haccora requested for Cafe 1 Luton, Cafe 1 St Albans and MealDeck");
      await refreshTenant();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Haccora pilot rollout failed");
    } finally {
      setBootstrappingHaccora(false);
    }
  }

  async function runPilotHaccoraSmoke() {
    setBusyKey("haccora:pilot-smoke");
    try {
      const result = await haccoraPilotSmokeRequest();
      setPilotSmoke(result);
      if (result.overall === "pass")
        toast.success("All three Haccora pilot tenants passed live checks");
      else toast.warning("One or more Haccora pilot tenants still have rollout blockers");
    } catch (e) {
      setPilotSmoke(null);
      toast.error(e instanceof Error ? e.message : "Haccora pilot smoke check failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function enableSelectedHaccora() {
    if (!selectedTenantId) return;
    setBusyKey("haccora:enable");
    try {
      await enableHaccoraRequest({ data: { tenantId: selectedTenantId, enableAi: true } });
      toast.success("Haccora compliance + AI rollout queued");
      await refreshTenant();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Haccora rollout failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function retrySelectedHaccora() {
    if (!selectedTenantId) return;
    setBusyKey("haccora:retry");
    try {
      const result = await retryHaccoraRequest({ data: { tenantId: selectedTenantId } });
      toast.success(
        result.queued
          ? `Requeued ${result.queued} Haccora job(s)`
          : "No failed Haccora jobs to retry",
      );
      await refreshTenant();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Haccora retry failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function runSelectedHaccoraSmoke() {
    if (!selectedTenantId) return;
    setBusyKey("haccora:smoke");
    try {
      const result = await haccoraSmokeRequest({ data: { tenantId: selectedTenantId } });
      setHaccoraSmoke(result);
      if (result.overall === "pass") toast.success("Haccora live smoke check passed");
      else toast.warning("Haccora smoke check found rollout blockers");
      await haccoraReadiness.refetch();
    } catch (e) {
      setHaccoraSmoke(null);
      toast.error(e instanceof Error ? e.message : "Haccora smoke check failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleProduct(productKey: string, enabled: boolean) {
    setBusyKey(`product:${productKey}`);
    try {
      await setProductRequest({ data: { tenantId: selectedTenantId, productKey, enabled } });
      toast.success(enabled ? "Product provisioning queued" : "Product deprovisioning queued");
      await refreshTenant();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Product update failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleService(serviceKey: string, enabled: boolean) {
    setBusyKey(`service:${serviceKey}`);
    try {
      await setServiceRequest({ data: { tenantId: selectedTenantId, serviceKey, enabled } });
      toast.success(enabled ? "Add-on provisioning queued" : "Add-on deprovisioning queued");
      await refreshTenant();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Add-on update failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleEcosystemAddon(hostProductKey: string, addonKey: string, enabled: boolean) {
    setBusyKey(`ecosystem:${addonKey}`);
    try {
      await setEcosystemAddonRequest({
        data: { tenantId: selectedTenantId, hostProductKey, addonKey, enabled },
      });
      toast.success(
        enabled ? "Ecosystem add-on requested" : "Ecosystem add-on removed from this product",
      );
      await refreshTenant();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ecosystem add-on update failed");
    } finally {
      setBusyKey(null);
    }
  }

  const tenantLabel = detail.data?.tenant?.name ?? current.name ?? "Workspace";

  return (
    <AppShell
      title="Tenant Factory"
      subtitle="One control plane for organisations, tenants, products, add-ons, branding, domains and provisioning."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshTenant()}
          disabled={!selectedTenantId || detail.isFetching}
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      }
    >
      {catalogue.error && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {catalogue.error.message}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Metric icon={Building2} label="Tenant" value={tenantLabel} />
        <Metric icon={Boxes} label="Products" value={String(detail.data?.products?.length ?? 0)} />
        <Metric icon={Layers3} label="Add-ons" value={String(detail.data?.services?.length ?? 0)} />
        <Metric
          icon={Sparkles}
          label="Provisioning jobs"
          value={String(detail.data?.provisioning?.length ?? 0)}
        />
      </div>

      {selectedTenantId && (
        <Card className="mt-6">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold">Haccora readiness</h2>
                  <p className="text-sm text-muted-foreground">
                    Dishbee add-on provisioning, connector verification, compliance services and
                    governed AI readiness.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={runSelectedHaccoraSmoke}
                  disabled={busyKey === "haccora:smoke"}
                >
                  {busyKey === "haccora:smoke" ? "Checking…" : "Run live check"}
                </Button>
                {isPlatformAdmin && haccoraReadiness.data?.productStatus === "not_requested" && (
                  <Button
                    size="sm"
                    onClick={enableSelectedHaccora}
                    disabled={busyKey === "haccora:enable"}
                  >
                    Enable Haccora + AI
                  </Button>
                )}
                {isPlatformAdmin &&
                  ((haccoraReadiness.data?.jobs.failed ?? 0) > 0 ||
                    (haccoraReadiness.data?.jobs.blocked ?? 0) > 0) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={retrySelectedHaccora}
                      disabled={busyKey === "haccora:retry"}
                    >
                      Retry failed / blocked
                    </Button>
                  )}
              </div>
            </div>
            {haccoraReadiness.isLoading ? (
              <p className="mt-4 text-sm text-muted-foreground">Checking Haccora rollout…</p>
            ) : haccoraReadiness.error ? (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {haccoraReadiness.error.message}
              </p>
            ) : haccoraReadiness.data ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <ReadinessStat label="Product" value={haccoraReadiness.data.productStatus} />
                <ReadinessStat label="Connection" value={haccoraReadiness.data.connectionStatus} />
                <ReadinessStat
                  label="Compliance"
                  value={haccoraReadiness.data.ready ? "ready" : "not ready"}
                />
                <ReadinessStat
                  label="AI"
                  value={
                    haccoraReadiness.data.aiReady
                      ? "ready"
                      : haccoraReadiness.data.services.aiRequested
                        ? "provisioning"
                        : "not requested"
                  }
                />
                <ReadinessStat
                  label="Active services"
                  value={`${haccoraReadiness.data.services.active}/${haccoraReadiness.data.services.requested}`}
                />
                <ReadinessStat
                  label="Jobs"
                  value={`${haccoraReadiness.data.jobs.pending} pending · ${haccoraReadiness.data.jobs.blocked} blocked · ${haccoraReadiness.data.jobs.failed} failed`}
                />
              </div>
            ) : null}
            {haccoraSmoke && (
              <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">Live smoke check</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(haccoraSmoke.checkedAt).toLocaleString()} ·{" "}
                      {haccoraSmoke.countryCode}
                    </div>
                  </div>
                  <StatusBadge status={haccoraSmoke.overall === "pass" ? "active" : "blocked"} />
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {haccoraSmoke.checks.map((item) => (
                    <div key={item.key} className="rounded-md border bg-background p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <b>{item.key.replaceAll("-", " ")}</b>
                        <span className={item.ok ? "text-primary" : "text-destructive"}>
                          {item.ok ? "PASS" : "FAIL"}
                        </span>
                      </div>
                      <p className="mt-1 text-muted-foreground">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardContent className="p-5">
              <h2 className="font-display text-lg font-semibold">Workspace</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {isPlatformAdmin
                  ? "Platform administrator · manage any tenant"
                  : "Tenant view · your own workspace"}
              </p>
              {isPlatformAdmin ? (
                <select
                  className="mt-4 h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={selectedTenantId}
                  onChange={(e) => setSelectedTenantId(e.target.value)}
                >
                  {(tenants.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.organisationName} · {t.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-4 rounded-lg bg-muted p-3 text-sm">
                  {current.name ?? "Loading workspace…"}
                </div>
              )}
              {detail.data?.organisation && (
                <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                  <p>{detail.data.organisation.name}</p>
                  <p>
                    {detail.data.tenant.country_code} · {detail.data.tenant.currency} ·{" "}
                    {detail.data.tenant.timezone}
                  </p>
                  <p className="font-mono">{detail.data.tenant.slug}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {isPlatformAdmin && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <h2 className="font-display text-lg font-semibold">Dishbee landlord pilot</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create or reconcile 313 Brands Ltd with Dishbee as landlord, Cafe 1 St Albans,
                  Cafe 1 Luton and MealDeck as tenant workspaces.
                </p>
                <Button
                  className="mt-4 w-full"
                  variant="outline"
                  disabled={bootstrappingDishbee}
                  onClick={bootstrapDishbee}
                >
                  {bootstrappingDishbee ? "Reconciling…" : "Create / reconcile Dishbee pilot"}
                </Button>
                <Button
                  className="mt-2 w-full"
                  variant="outline"
                  disabled={bootstrappingHaccora}
                  onClick={bootstrapHaccoraPilot}
                >
                  {bootstrappingHaccora ? "Queuing Haccora…" : "Enable Haccora + AI for pilot"}
                </Button>
                <Button
                  className="mt-2 w-full"
                  variant="outline"
                  disabled={busyKey === "haccora:pilot-smoke"}
                  onClick={runPilotHaccoraSmoke}
                >
                  {busyKey === "haccora:pilot-smoke"
                    ? "Checking all three…"
                    : "Run Haccora pilot live checks"}
                </Button>
                {pilotSmoke && (
                  <div className="mt-3 space-y-2 rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <b>Pilot smoke result</b>
                      <StatusBadge status={pilotSmoke.overall === "pass" ? "active" : "blocked"} />
                    </div>
                    {pilotSmoke.tenants.map((tenant) => (
                      <div key={tenant.tenantId} className="rounded-md bg-background p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{tenant.tenantName}</span>
                          <span
                            className={
                              tenant.overall === "pass" ? "text-primary" : "text-destructive"
                            }
                          >
                            {tenant.overall.toUpperCase()}
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {tenant.checks.filter((item) => item.ok).length}/{tenant.checks.length}{" "}
                          checks passed
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {isPlatformAdmin && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4 text-primary" />
                  <h2 className="font-display text-lg font-semibold">New tenant</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create an organisation/workspace and apply a launch blueprint in one operation.
                </p>
                <div className="mt-4 space-y-3">
                  <Input
                    placeholder="Organisation name"
                    value={newTenant.organisationName}
                    onChange={(e) =>
                      setNewTenant((v) => ({ ...v, organisationName: e.target.value }))
                    }
                  />
                  <Input
                    placeholder="Tenant / workspace name"
                    value={newTenant.tenantName}
                    onChange={(e) =>
                      setNewTenant((v) => ({
                        ...v,
                        tenantName: e.target.value,
                        slug: v.slug || slugify(e.target.value),
                      }))
                    }
                  />
                  <Input
                    placeholder="tenant-slug"
                    value={newTenant.slug}
                    onChange={(e) => setNewTenant((v) => ({ ...v, slug: slugify(e.target.value) }))}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      aria-label="Country code"
                      value={newTenant.countryCode}
                      onChange={(e) =>
                        setNewTenant((v) => ({
                          ...v,
                          countryCode: e.target.value.toUpperCase().slice(0, 2),
                        }))
                      }
                    />
                    <Input
                      aria-label="Currency"
                      value={newTenant.currency}
                      onChange={(e) =>
                        setNewTenant((v) => ({
                          ...v,
                          currency: e.target.value.toUpperCase().slice(0, 3),
                        }))
                      }
                    />
                  </div>
                  <Input
                    aria-label="Timezone"
                    value={newTenant.timezone}
                    onChange={(e) => setNewTenant((v) => ({ ...v, timezone: e.target.value }))}
                  />
                  <select
                    aria-label="Blueprint"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={newTenant.blueprintKey}
                    onChange={(e) => setNewTenant((v) => ({ ...v, blueprintKey: e.target.value }))}
                  >
                    <option value="">Blank tenant</option>
                    {(catalogue.data?.blueprints ?? []).map((b) => (
                      <option key={b.blueprint_key} value={b.blueprint_key}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    className="w-full"
                    disabled={creating || !newTenant.tenantName || !newTenant.slug}
                    onClick={createTenant}
                  >
                    {creating ? "Creating…" : "Create & provision"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {selectedTenantId && (
            <FleetoraOperatorPanel
              tenantId={selectedTenantId}
              organisationId={detail.data?.tenant.organisation_id}
              tenantName={detail.data?.tenant.name}
              tenantSlug={detail.data?.tenant.slug}
              isPlatformAdmin={isPlatformAdmin}
            />
          )}
          <section>
            <SectionTitle
              icon={Boxes}
              title="Products"
              description="Attach SaaS products to this tenant. Product data stays in the product's own database."
            />
            <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {(catalogue.data?.products ?? []).map((product) => {
                const active = enabledProducts.has(product.product_key);
                const tenantProduct = detail.data?.products.find(
                  (p) => p.product_key === product.product_key,
                );
                return (
                  <Card key={product.product_key} className={active ? "border-primary/40" : ""}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">{product.name}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {product.description}
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          aria-label={`Enable ${product.name}`}
                          checked={active}
                          disabled={
                            !isPlatformAdmin || busyKey === `product:${product.product_key}`
                          }
                          onChange={(e) => toggleProduct(product.product_key, e.target.checked)}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{product.category}</Badge>
                        {product.product_role && (
                          <Badge variant="outline">
                            {product.product_role.replaceAll("_", " ")}
                          </Badge>
                        )}
                        {product.implementation_status && (
                          <Badge variant="outline">
                            {product.implementation_status.replaceAll("_", " ")}
                          </Badge>
                        )}
                        {product.parent_product_key && (
                          <Badge variant="outline">under {product.parent_product_key}</Badge>
                        )}
                        {tenantProduct && <StatusBadge status={tenantProduct.status} />}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <section>
            <SectionTitle
              icon={Layers3}
              title="Services & add-ons"
              description="Reusable Omniqora and product modules. Required dependencies are added automatically."
            />
            <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {(catalogue.data?.services ?? []).map((service) => {
                const active = enabledServices.has(service.service_key);
                const tenantService = detail.data?.services.find(
                  (s) => s.service_key === service.service_key,
                );
                const deps = (catalogue.data?.dependencies ?? [])
                  .filter((d) => d.service_key === service.service_key)
                  .map((d) => d.depends_on_service_key);
                return (
                  <Card key={service.service_key} className={active ? "border-primary/40" : ""}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">{service.name}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {service.description}
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          aria-label={`Enable ${service.name}`}
                          checked={active}
                          disabled={
                            !isPlatformAdmin || busyKey === `service:${service.service_key}`
                          }
                          onChange={(e) => toggleService(service.service_key, e.target.checked)}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{service.family}</Badge>
                        {service.implementation_status && (
                          <Badge variant="outline">
                            {service.implementation_status.replaceAll("_", " ")}
                          </Badge>
                        )}
                        {tenantService && <StatusBadge status={tenantService.status} />}
                      </div>
                      {deps.length > 0 && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Requires: {deps.join(", ")}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <section>
            <SectionTitle
              icon={GitBranchIcon}
              title="Ecosystem add-ons"
              description="Attach another SaaS capability without copying its authoritative data. Each card shows the integration mode and data boundary."
            />
            <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {(catalogue.data?.ecosystemAddons ?? [])
                .filter((addon) => enabledProducts.has(addon.host_product_key))
                .map((addon) => {
                  const active = enabledEcosystemAddons.has(addon.addon_key);
                  const tenantAddon = detail.data?.ecosystemAddons?.find(
                    (a) =>
                      a.addon_key === addon.addon_key &&
                      a.host_product_key === addon.host_product_key,
                  );
                  return (
                    <Card key={addon.addon_key} className={active ? "border-primary/40" : ""}>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-wide text-primary">
                              {addon.host_product_key} · {addon.category}
                            </p>
                            <h3 className="mt-1 font-semibold">{addon.name}</h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {addon.description}
                            </p>
                          </div>
                          <input
                            type="checkbox"
                            aria-label={`Enable ${addon.name}`}
                            checked={active}
                            disabled={
                              !isPlatformAdmin || busyKey === `ecosystem:${addon.addon_key}`
                            }
                            onChange={(e) =>
                              toggleEcosystemAddon(
                                addon.host_product_key,
                                addon.addon_key,
                                e.target.checked,
                              )
                            }
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant="outline">
                            {addon.integration_mode.replaceAll("_", " ")}
                          </Badge>
                          {addon.addon_product_key && (
                            <Badge variant="secondary">{addon.addon_product_key}</Badge>
                          )}
                          {addon.addon_service_key && (
                            <Badge variant="secondary">{addon.addon_service_key}</Badge>
                          )}
                          {tenantAddon && <StatusBadge status={tenantAddon.status} />}
                        </div>
                        <p className="mt-3 rounded-lg bg-muted p-2 text-[11px] leading-5 text-muted-foreground">
                          <b>Data boundary:</b> {addon.data_boundary}
                        </p>
                        {!!addon.capabilities?.length && (
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            Capabilities: {addon.capabilities.join(", ")}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              {!(catalogue.data?.ecosystemAddons ?? []).some((addon) =>
                enabledProducts.has(addon.host_product_key),
              ) && (
                <Card>
                  <CardContent className="p-5 text-sm text-muted-foreground">
                    Enable a host product to see its compatible ecosystem add-ons.
                  </CardContent>
                </Card>
              )}
            </div>
          </section>

          <ProductConnections
            tenantId={selectedTenantId}
            connections={detail.data?.connections ?? []}
            products={catalogue.data?.products ?? []}
            canEdit={isPlatformAdmin}
            onRotate={async (connectionId) => {
              try {
                const credential = await rotateCredentialRequest({
                  data: { connectionId, validDays: 365 },
                });
                await detail.refetch();
                return credential.token;
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Credential generation failed");
                return "";
              }
            }}
            onSave={async (productKey, externalTenantId, baseUrl) => {
              try {
                await linkProductRequest({
                  data: {
                    tenantId: selectedTenantId,
                    productKey,
                    externalTenantId,
                    baseUrl,
                    capabilities: [],
                  },
                });
                toast.success("Product tenant linked; verification queued");
                await detail.refetch();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Product link failed");
              }
            }}
          />

          <ProductLocationMappings
            tenantId={selectedTenantId}
            connections={detail.data?.connections ?? []}
            locations={detail.data?.locations ?? []}
            links={productLocationLinks.data ?? []}
            products={catalogue.data?.products ?? []}
            canEdit={isPlatformAdmin}
            onSave={async (connectionId, tenantLocationId, externalLocationId) => {
              try {
                await upsertProductLocationLinkRequest({
                  data: { connectionId, tenantLocationId, externalLocationId },
                });
                toast.success("External product location mapped; verification queued");
                await Promise.all([productLocationLinks.refetch(), detail.refetch()]);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Location mapping failed");
              }
            }}
          />

          <BrandingAndDomains
            tenantId={selectedTenantId}
            detail={detail.data}
            products={catalogue.data?.products ?? []}
            canEdit={
              !!selectedTenantId &&
              (isPlatformAdmin || current.role === "owner" || current.role === "admin")
            }
            saveBranding={async (payload) => {
              try {
                await saveBrandingRequest({ data: { tenantId: selectedTenantId, ...payload } });
                toast.success("Branding saved");
                await detail.refetch();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Branding update failed");
              }
            }}
            saveDomain={async (productKey, domain) => {
              try {
                await saveDomainRequest({
                  data: {
                    tenantId: selectedTenantId,
                    productKey: productKey || null,
                    domain,
                    primary: true,
                  },
                });
                toast.success("Domain added; verification queued");
                await detail.refetch();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Domain update failed");
              }
            }}
            verifyDomain={async (domain) => {
              try {
                await verifyDomainRequest({ data: { tenantId: selectedTenantId, domain } });
                toast.success("Domain verification queued");
                await detail.refetch();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Domain verification failed");
              }
            }}
          />

          <section>
            <SectionTitle
              icon={Building2}
              title="Brands & locations"
              description="Tenant-level brand and location hierarchy used by Dishbee, MealDeck and future landlord SaaS products."
            />
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <Card>
                <CardContent className="p-5">
                  <h3 className="font-semibold">Brands</h3>
                  <div className="mt-3 space-y-2">
                    {(detail.data?.brands ?? []).length ? (
                      (detail.data?.brands ?? []).map((brand) => (
                        <div
                          key={brand.id}
                          className="flex items-center justify-between rounded-lg bg-muted p-3 text-sm"
                        >
                          <div>
                            <b>{brand.name}</b>
                            <p className="text-xs text-muted-foreground">
                              {brand.slug} · {brand.product_key ?? "tenant"}
                            </p>
                          </div>
                          {brand.is_primary && <Badge variant="outline">Primary</Badge>}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No tenant brands configured.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <h3 className="font-semibold">Locations</h3>
                  <div className="mt-3 space-y-2">
                    {(detail.data?.locations ?? []).length ? (
                      (detail.data?.locations ?? []).map((location) => (
                        <div
                          key={location.id}
                          className="flex items-center justify-between rounded-lg bg-muted p-3 text-sm"
                        >
                          <div>
                            <b>{location.name}</b>
                            <p className="text-xs text-muted-foreground">
                              {location.code} · {location.timezone}
                            </p>
                          </div>
                          <StatusBadge status={location.status} />
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No locations configured.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          <section>
            <SectionTitle
              icon={Settings2}
              title="Provisioning queue"
              description="Every product/add-on/domain change becomes an auditable idempotent job for the relevant product adapter."
            />
            <div className="mt-3 overflow-hidden rounded-xl border bg-background">
              {(detail.data?.provisioning ?? []).length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">No provisioning jobs yet.</p>
              ) : (
                <div className="divide-y">
                  {(detail.data?.provisioning ?? []).slice(0, 20).map((job) => (
                    <div
                      key={job.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
                    >
                      <div>
                        <b>{job.target_key}</b>
                        <p className="text-xs text-muted-foreground">
                          {job.target_kind} · {job.action}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={job.status} />
                        <span className="text-xs text-muted-foreground">
                          {new Date(job.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function ReadinessStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold">{value.replaceAll("_", " ")}</div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="mt-2 truncate font-display text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Building2;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-lg bg-primary/10 p-2">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ProductConnections({
  tenantId,
  connections,
  products,
  canEdit,
  onSave,
  onRotate,
}: {
  tenantId: string;
  connections: Array<{
    id: string;
    product_key: string;
    external_tenant_id: string;
    base_url?: string | null;
    status: string;
  }>;
  products: Array<{ product_key: string; name: string }>;
  canEdit: boolean;
  onSave: (productKey: string, externalTenantId: string, baseUrl: string) => Promise<void>;
  onRotate: (connectionId: string) => Promise<string>;
}) {
  const [productKey, setProductKey] = useState("dishbee");
  const [externalTenantId, setExternalTenantId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [issuedToken, setIssuedToken] = useState("");
  const [issuedFor, setIssuedFor] = useState("");

  useEffect(() => {
    setExternalTenantId("");
    setBaseUrl("");
    setIssuedToken("");
    setIssuedFor("");
  }, [tenantId]);

  return (
    <section>
      <SectionTitle
        icon={GitBranchIcon}
        title="Product tenant links"
        description="Bind this Omniqora tenant to the real tenant/workspace ID in Dishbee, Kindelo or another SaaS. No vertical data is copied into Omniqora."
      />
      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardContent className="space-y-3 p-5">
            <h3 className="font-semibold">Link product workspace</h3>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={productKey}
              onChange={(e) => setProductKey(e.target.value)}
            >
              {products.map((p) => (
                <option key={p.product_key} value={p.product_key}>
                  {p.name}
                </option>
              ))}
            </select>
            <Input
              placeholder="External tenant/workspace ID"
              value={externalTenantId}
              onChange={(e) => setExternalTenantId(e.target.value)}
            />
            <Input
              placeholder="Product base URL (optional)"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <Button
              disabled={!canEdit || !externalTenantId || !productKey}
              onClick={() => onSave(productKey, externalTenantId, baseUrl)}
            >
              Link & verify
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold">Connected workspaces</h3>
            <div className="mt-3 space-y-2">
              {connections.length ? (
                connections.map((connection) => {
                  const product = products.find((p) => p.product_key === connection.product_key);
                  return (
                    <div
                      key={connection.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted p-3 text-sm"
                    >
                      <div>
                        <b>{product?.name ?? connection.product_key}</b>
                        <p className="font-mono text-xs text-muted-foreground">
                          {connection.external_tenant_id}
                        </p>
                        {connection.base_url && (
                          <p className="text-xs text-muted-foreground">{connection.base_url}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {canEdit && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              const token = await onRotate(connection.id);
                              if (token) {
                                setIssuedToken(token);
                                setIssuedFor(connection.id);
                                toast.success("New connector credential generated");
                              }
                            }}
                          >
                            Generate key
                          </Button>
                        )}
                        <StatusBadge status={connection.status} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">
                  No product workspace links configured.
                </p>
              )}
            </div>
            {issuedToken && (
              <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
                <p className="text-xs font-medium">
                  Copy this key into the product connector now. It is shown only in this session.
                </p>
                <code className="mt-2 block break-all rounded bg-background p-2 text-xs">
                  {issuedToken}
                </code>
                <Button
                  className="mt-2"
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard?.writeText(issuedToken)}
                >
                  Copy key
                </Button>
                <span className="ml-2 text-xs text-muted-foreground">
                  Connection {issuedFor.slice(0, 8)}…
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}


function ProductLocationMappings({
  tenantId,
  connections,
  locations,
  links,
  products,
  canEdit,
  onSave,
}: {
  tenantId:string;
  connections:Array<{
    id:string;
    product_key:string;
    external_tenant_id:string;
    base_url?:string|null;
    status:string;
  }>;
  locations:Array<{
    id:string;
    name:string;
    code:string;
    status:string;
  }>;
  links:ProductLocationLink[];
  products:Array<{product_key:string;name:string}>;
  canEdit:boolean;
  onSave:(connectionId:string,tenantLocationId:string,externalLocationId:string)=>Promise<void>;
}) {
  const [connectionId,setConnectionId]=useState("");
  const [values,setValues]=useState<Record<string,string>>({});
  const [saving,setSaving]=useState("");

  const eligible=connections.filter(connection=>["dishbee","haccora","dishbee-plus"].includes(connection.product_key));
  const selected=eligible.find(connection=>connection.id===connectionId)??eligible[0]??null;

  useEffect(()=>{
    if(!selected){setConnectionId("");setValues({});return}
    if(connectionId!==selected.id)setConnectionId(selected.id);
    const next:Record<string,string>={};
    for(const location of locations){
      next[location.id]=links.find(link=>
        link.connectionId===selected.id&&link.tenantLocationId===location.id
      )?.externalLocationId??"";
    }
    setValues(next);
  },[tenantId,selected?.id,connections.length,locations.length,links]);

  if(!eligible.length)return null;

  return <section>
    <SectionTitle
      icon={GitBranchIcon}
      title="Product location map"
      description="Explicitly map each Omniqora location to the real location UUID in Dishbee, Haccora or Dishbee+. Runtime provisioning fails closed when an active site is unmapped."
    />
    <Card className="mt-3">
      <CardContent className="p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
          <div>
            <label className="text-xs font-medium text-muted-foreground">External product workspace</label>
            <select
              className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={selected?.id??""}
              onChange={e=>setConnectionId(e.target.value)}
            >
              {eligible.map(connection=>{
                const product=products.find(p=>p.product_key===connection.product_key);
                return <option key={connection.id} value={connection.id}>
                  {product?.name??connection.product_key} · {connection.external_tenant_id.slice(0,12)}…
                </option>
              })}
            </select>
            {selected&&<div className="mt-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              <p><b>Product:</b> {selected.product_key}</p>
              <p className="mt-1 break-all"><b>Workspace:</b> {selected.external_tenant_id}</p>
              <p className="mt-1"><b>Connection:</b> {selected.status}</p>
            </div>}
          </div>
          <div className="space-y-2">
            {locations.filter(location=>location.status==="active").map(location=>{
              const link=selected?links.find(item=>
                item.connectionId===selected.id&&item.tenantLocationId===location.id
              ):undefined;
              return <div key={location.id} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_1.4fr_auto] md:items-center">
                <div>
                  <b className="text-sm">{location.name}</b>
                  <p className="font-mono text-[11px] text-muted-foreground">{location.id}</p>
                </div>
                <Input
                  value={values[location.id]??""}
                  onChange={e=>setValues(current=>({...current,[location.id]:e.target.value.trim()}))}
                  placeholder={"External "+(selected?.product_key??"product")+" location UUID"}
                  className="font-mono text-xs"
                />
                <div className="flex items-center gap-2">
                  {link&&<StatusBadge status={link.status}/>}
                  <Button
                    size="sm"
                    disabled={!canEdit||!selected||!values[location.id]||saving===location.id}
                    onClick={async()=>{
                      if(!selected)return;
                      setSaving(location.id);
                      try{await onSave(selected.id,location.id,values[location.id]??"")}
                      finally{setSaving("")}
                    }}
                  >
                    {saving===location.id?"Saving…":"Map"}
                  </Button>
                </div>
              </div>
            })}
            {!locations.some(location=>location.status==="active")&&
              <p className="text-sm text-muted-foreground">No active tenant locations.</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  </section>;
}

function BrandingAndDomains({
  tenantId,
  detail,
  products,
  canEdit,
  saveBranding,
  saveDomain,
  verifyDomain,
}: {
  tenantId: string;
  detail: TenantControlPlane | undefined;
  products: Array<{ product_key: string; name: string }>;
  canEdit: boolean;
  saveBranding: (payload: Record<string, string>) => Promise<void>;
  saveDomain: (productKey: string, domain: string) => Promise<void>;
  verifyDomain: (domain: string) => Promise<void>;
}) {
  const branding =
    detail?.branding && typeof detail.branding === "object" && !Array.isArray(detail.branding)
      ? (detail.branding as Record<string, JsonValue>)
      : {};
  const [brandName, setBrandName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColour, setPrimaryColour] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [domain, setDomain] = useState("");
  const [productKey, setProductKey] = useState("");
  const [checkingDomain, setCheckingDomain] = useState<string | null>(null);

  useEffect(() => {
    setBrandName(String(branding.brand_name ?? detail?.tenant?.name ?? ""));
    setLogoUrl(String(branding.logo_url ?? ""));
    setPrimaryColour(String(branding.primary_colour ?? ""));
    setSupportEmail(String(branding.support_email ?? ""));
  }, [
    tenantId,
    branding.brand_name,
    branding.logo_url,
    branding.primary_colour,
    branding.support_email,
    detail?.tenant?.name,
  ]);

  return (
    <section>
      <SectionTitle
        icon={Globe2}
        title="Branding & domains"
        description="White-label each tenant without forking the underlying SaaS application."
      />
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-5">
            <h3 className="font-semibold">Tenant branding</h3>
            <Input
              placeholder="Brand name"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
            />
            <Input
              placeholder="Logo URL"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
            />
            <Input
              placeholder="Primary colour e.g. #111827"
              value={primaryColour}
              onChange={(e) => setPrimaryColour(e.target.value)}
            />
            <Input
              placeholder="Support email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
            />
            <Button
              disabled={!canEdit}
              onClick={() => saveBranding({ brandName, logoUrl, primaryColour, supportEmail })}
            >
              Save branding
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-5">
            <h3 className="font-semibold">Custom domain</h3>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={productKey}
              onChange={(e) => setProductKey(e.target.value)}
            >
              <option value="">Whole tenant</option>
              {products.map((p) => (
                <option key={p.product_key} value={p.product_key}>
                  {p.name}
                </option>
              ))}
            </select>
            <Input
              placeholder="portal.customer.co.uk"
              value={domain}
              onChange={(e) => setDomain(e.target.value.toLowerCase().trim())}
            />
            <Button disabled={!canEdit || !domain} onClick={() => saveDomain(productKey, domain)}>
              Add domain
            </Button>
            <div className="space-y-2">
              {(detail?.domains ?? []).map((d) => (
                <div key={d.id} className="rounded-lg bg-muted p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <b>{d.domain}</b>
                      <p className="text-xs text-muted-foreground">
                        {d.product_key ?? "tenant"} · SSL {d.ssl_status}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={d.verification_status} />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canEdit || checkingDomain === d.domain}
                        onClick={async () => {
                          setCheckingDomain(d.domain);
                          try {
                            await verifyDomain(d.domain);
                          } finally {
                            setCheckingDomain(null);
                          }
                        }}
                      >
                        {checkingDomain === d.domain ? "Checking…" : "Check again"}
                      </Button>
                    </div>
                  </div>
                  {d.verification_record_name && d.verification_record_value && (
                    <div className="mt-3 rounded-md border bg-background p-3 text-xs">
                      <p className="font-medium">DNS TXT record</p>
                      <p className="mt-1 break-all text-muted-foreground">
                        Name: <code>{d.verification_record_name}</code>
                      </p>
                      <p className="mt-1 break-all text-muted-foreground">
                        Value: <code>{d.verification_record_value}</code>
                      </p>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>Attempts: {d.verification_attempts ?? 0}</span>
                    {d.last_checked_at && (
                      <span>Last checked: {new Date(d.last_checked_at).toLocaleString()}</span>
                    )}
                  </div>
                  {d.failure_reason && (
                    <p className="mt-2 text-xs text-destructive">{d.failure_reason}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}
