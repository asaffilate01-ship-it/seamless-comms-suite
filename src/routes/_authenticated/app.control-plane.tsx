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
  createPlatformTenant,
  getControlPlaneCatalogue,
  getTenantControlPlane,
  listPlatformTenants,
  saveTenantBranding,
  setTenantProduct,
  setTenantService,
  upsertTenantDomain,
} from "@/lib/control-plane.functions";
import { Building2, Boxes, Globe2, Layers3, Plus, RefreshCw, Settings2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/control-plane")({
  component: ControlPlane,
  head: () => ({
    meta: [
      { title: "SaaS Factory — Omniqora" },
      { name: "description", content: "Omniqora tenant, product, add-on and provisioning control plane." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function ControlPlane() {
  const current = useTenant();
  const catalogueRequest = useServerFn(getControlPlaneCatalogue);
  const listTenantsRequest = useServerFn(listPlatformTenants);
  const tenantRequest = useServerFn(getTenantControlPlane);
  const createTenantRequest = useServerFn(createPlatformTenant);
  const setProductRequest = useServerFn(setTenantProduct);
  const setServiceRequest = useServerFn(setTenantService);
  const saveBrandingRequest = useServerFn(saveTenantBranding);
  const saveDomainRequest = useServerFn(upsertTenantDomain);

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
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const enabledProducts = useMemo(
    () => new Set((detail.data?.products ?? []).filter((p) => !["cancelled", "failed"].includes(p.status)).map((p) => p.product_key)),
    [detail.data?.products],
  );
  const enabledServices = useMemo(
    () => new Set((detail.data?.services ?? []).filter((s) => !["cancelled", "failed"].includes(s.status)).map((s) => s.service_key)),
    [detail.data?.services],
  );

  async function refreshTenant() {
    await Promise.all([detail.refetch(), tenants.refetch()]);
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

  const tenantLabel = detail.data?.tenant?.name ?? current.name ?? "Workspace";

  return (
    <AppShell
      title="SaaS Factory"
      subtitle="One control plane for organisations, tenants, products, add-ons, branding, domains and provisioning."
      actions={
        <Button variant="outline" size="sm" onClick={() => refreshTenant()} disabled={!selectedTenantId || detail.isFetching}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      }
    >
      {catalogue.error && <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{catalogue.error.message}</p>}

      <div className="grid gap-4 md:grid-cols-4">
        <Metric icon={Building2} label="Tenant" value={tenantLabel} />
        <Metric icon={Boxes} label="Products" value={String(detail.data?.products?.length ?? 0)} />
        <Metric icon={Layers3} label="Add-ons" value={String(detail.data?.services?.length ?? 0)} />
        <Metric icon={Sparkles} label="Provisioning jobs" value={String(detail.data?.provisioning?.length ?? 0)} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardContent className="p-5">
              <h2 className="font-display text-lg font-semibold">Workspace</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {isPlatformAdmin ? "Platform administrator · manage any tenant" : "Tenant view · your own workspace"}
              </p>
              {isPlatformAdmin ? (
                <select
                  className="mt-4 h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={selectedTenantId}
                  onChange={(e) => setSelectedTenantId(e.target.value)}
                >
                  {(tenants.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>{t.organisationName} · {t.name}</option>
                  ))}
                </select>
              ) : (
                <div className="mt-4 rounded-lg bg-muted p-3 text-sm">{current.name ?? "Loading workspace…"}</div>
              )}
              {detail.data?.organisation && (
                <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                  <p>{detail.data.organisation.name}</p>
                  <p>{detail.data.tenant.country_code} · {detail.data.tenant.currency} · {detail.data.tenant.timezone}</p>
                  <p className="font-mono">{detail.data.tenant.slug}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {isPlatformAdmin && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /><h2 className="font-display text-lg font-semibold">New tenant</h2></div>
                <p className="mt-1 text-xs text-muted-foreground">Create an organisation/workspace and apply a launch blueprint in one operation.</p>
                <div className="mt-4 space-y-3">
                  <Input placeholder="Organisation name" value={newTenant.organisationName} onChange={(e) => setNewTenant((v) => ({ ...v, organisationName: e.target.value }))} />
                  <Input placeholder="Tenant / workspace name" value={newTenant.tenantName} onChange={(e) => setNewTenant((v) => ({ ...v, tenantName: e.target.value, slug: v.slug || slugify(e.target.value) }))} />
                  <Input placeholder="tenant-slug" value={newTenant.slug} onChange={(e) => setNewTenant((v) => ({ ...v, slug: slugify(e.target.value) }))} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input aria-label="Country code" value={newTenant.countryCode} onChange={(e) => setNewTenant((v) => ({ ...v, countryCode: e.target.value.toUpperCase().slice(0, 2) }))} />
                    <Input aria-label="Currency" value={newTenant.currency} onChange={(e) => setNewTenant((v) => ({ ...v, currency: e.target.value.toUpperCase().slice(0, 3) }))} />
                  </div>
                  <Input aria-label="Timezone" value={newTenant.timezone} onChange={(e) => setNewTenant((v) => ({ ...v, timezone: e.target.value }))} />
                  <select
                    aria-label="Blueprint"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={newTenant.blueprintKey}
                    onChange={(e) => setNewTenant((v) => ({ ...v, blueprintKey: e.target.value }))}
                  >
                    <option value="">Blank tenant</option>
                    {(catalogue.data?.blueprints ?? []).map((b) => <option key={b.blueprint_key} value={b.blueprint_key}>{b.name}</option>)}
                  </select>
                  <Button className="w-full" disabled={creating || !newTenant.tenantName || !newTenant.slug} onClick={createTenant}>
                    {creating ? "Creating…" : "Create & provision"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <section>
            <SectionTitle icon={Boxes} title="Products" description="Attach SaaS products to this tenant. Product data stays in the product's own database." />
            <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {(catalogue.data?.products ?? []).map((product) => {
                const active = enabledProducts.has(product.product_key);
                const tenantProduct = detail.data?.products.find((p) => p.product_key === product.product_key);
                return (
                  <Card key={product.product_key} className={active ? "border-primary/40" : ""}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div><h3 className="font-semibold">{product.name}</h3><p className="mt-1 text-xs text-muted-foreground">{product.description}</p></div>
                        <input type="checkbox" aria-label={`Enable ${product.name}`} checked={active} disabled={!isPlatformAdmin || busyKey === `product:${product.product_key}`} onChange={(e) => toggleProduct(product.product_key, e.target.checked)} />
                      </div>
                      <div className="mt-3 flex items-center gap-2"><Badge variant="secondary">{product.category}</Badge>{tenantProduct && <StatusBadge status={tenantProduct.status} />}</div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <section>
            <SectionTitle icon={Layers3} title="Services & add-ons" description="Reusable Omniqora and product modules. Required dependencies are added automatically." />
            <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {(catalogue.data?.services ?? []).map((service) => {
                const active = enabledServices.has(service.service_key);
                const tenantService = detail.data?.services.find((s) => s.service_key === service.service_key);
                const deps = (catalogue.data?.dependencies ?? []).filter((d) => d.service_key === service.service_key).map((d) => d.depends_on_service_key);
                return (
                  <Card key={service.service_key} className={active ? "border-primary/40" : ""}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div><h3 className="font-semibold">{service.name}</h3><p className="mt-1 text-xs text-muted-foreground">{service.description}</p></div>
                        <input type="checkbox" aria-label={`Enable ${service.name}`} checked={active} disabled={!isPlatformAdmin || busyKey === `service:${service.service_key}`} onChange={(e) => toggleService(service.service_key, e.target.checked)} />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2"><Badge variant="outline">{service.family}</Badge>{tenantService && <StatusBadge status={tenantService.status} />}</div>
                      {deps.length > 0 && <p className="mt-2 text-[11px] text-muted-foreground">Requires: {deps.join(", ")}</p>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <BrandingAndDomains
            tenantId={selectedTenantId}
            detail={detail.data}
            products={catalogue.data?.products ?? []}
            canEdit={!!selectedTenantId && (isPlatformAdmin || current.role === "owner" || current.role === "admin")}
            saveBranding={async (payload) => {
              try { await saveBrandingRequest({ data: { tenantId: selectedTenantId, ...payload } }); toast.success("Branding saved"); await detail.refetch(); }
              catch (e) { toast.error(e instanceof Error ? e.message : "Branding update failed"); }
            }}
            saveDomain={async (productKey, domain) => {
              try { await saveDomainRequest({ data: { tenantId: selectedTenantId, productKey: productKey || null, domain, primary: true } }); toast.success("Domain added; verification queued"); await detail.refetch(); }
              catch (e) { toast.error(e instanceof Error ? e.message : "Domain update failed"); }
            }}
          />

          <section>
            <SectionTitle icon={Settings2} title="Provisioning queue" description="Every product/add-on/domain change becomes an auditable idempotent job for the relevant product adapter." />
            <div className="mt-3 overflow-hidden rounded-xl border bg-background">
              {(detail.data?.provisioning ?? []).length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">No provisioning jobs yet.</p>
              ) : (
                <div className="divide-y">
                  {(detail.data?.provisioning ?? []).slice(0, 20).map((job) => (
                    <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                      <div><b>{job.target_key}</b><p className="text-xs text-muted-foreground">{job.target_kind} · {job.action}</p></div>
                      <div className="flex items-center gap-2"><StatusBadge status={job.status} /><span className="text-xs text-muted-foreground">{new Date(job.created_at).toLocaleString()}</span></div>
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

function Metric({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
  return <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary" /></div><div className="mt-2 truncate font-display text-2xl font-semibold">{value}</div></CardContent></Card>;
}

function SectionTitle({ icon: Icon, title, description }: { icon: typeof Building2; title: string; description: string }) {
  return <div className="flex items-start gap-3"><div className="rounded-lg bg-primary/10 p-2"><Icon className="h-4 w-4 text-primary" /></div><div><h2 className="font-display text-lg font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div></div>;
}

function BrandingAndDomains({
  tenantId, detail, products, canEdit, saveBranding, saveDomain,
}: {
  tenantId: string;
  detail: any;
  products: Array<{ product_key: string; name: string }>;
  canEdit: boolean;
  saveBranding: (payload: Record<string, string>) => Promise<void>;
  saveDomain: (productKey: string, domain: string) => Promise<void>;
}) {
  const branding = detail?.branding ?? {};
  const [brandName, setBrandName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColour, setPrimaryColour] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [domain, setDomain] = useState("");
  const [productKey, setProductKey] = useState("");

  useEffect(() => {
    setBrandName(String(branding.brand_name ?? detail?.tenant?.name ?? ""));
    setLogoUrl(String(branding.logo_url ?? ""));
    setPrimaryColour(String(branding.primary_colour ?? ""));
    setSupportEmail(String(branding.support_email ?? ""));
  }, [tenantId, branding.brand_name, branding.logo_url, branding.primary_colour, branding.support_email, detail?.tenant?.name]);

  return <section>
    <SectionTitle icon={Globe2} title="Branding & domains" description="White-label each tenant without forking the underlying SaaS application." />
    <div className="mt-3 grid gap-4 lg:grid-cols-2">
      <Card><CardContent className="space-y-3 p-5"><h3 className="font-semibold">Tenant branding</h3><Input placeholder="Brand name" value={brandName} onChange={(e) => setBrandName(e.target.value)} /><Input placeholder="Logo URL" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} /><Input placeholder="Primary colour e.g. #111827" value={primaryColour} onChange={(e) => setPrimaryColour(e.target.value)} /><Input placeholder="Support email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} /><Button disabled={!canEdit} onClick={() => saveBranding({ brandName, logoUrl, primaryColour, supportEmail })}>Save branding</Button></CardContent></Card>
      <Card><CardContent className="space-y-3 p-5"><h3 className="font-semibold">Custom domain</h3><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={productKey} onChange={(e) => setProductKey(e.target.value)}><option value="">Whole tenant</option>{products.map((p) => <option key={p.product_key} value={p.product_key}>{p.name}</option>)}</select><Input placeholder="portal.customer.co.uk" value={domain} onChange={(e) => setDomain(e.target.value.toLowerCase().trim())} /><Button disabled={!canEdit || !domain} onClick={() => saveDomain(productKey, domain)}>Add & verify domain</Button><div className="space-y-2">{(detail?.domains ?? []).map((d: any) => <div key={d.id} className="flex items-center justify-between rounded-lg bg-muted p-3 text-sm"><div><b>{d.domain}</b><p className="text-xs text-muted-foreground">{d.product_key ?? "tenant"} · SSL {d.ssl_status}</p></div><StatusBadge status={d.verification_status} /></div>)}</div></CardContent></Card>
    </div>
  </section>;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
}
