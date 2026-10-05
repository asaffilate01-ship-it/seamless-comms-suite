import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Boxes, Building2, Factory, Layers3, Network, ShieldCheck, Store, WandSparkles,
} from "lucide-react";
import {
  OMNIQORA_MODULES,
  OMNIQORA_PRODUCTS,
  PLATFORM_MODULE_KEYS,
} from "@/modules/platform/registry";
import { getMyOperatorContext, listManagedTenants } from "@/modules/platform/operator.functions";
import { listSaasFactoryProducts } from "@/modules/platform/saas-factory.functions";

export const Route = createFileRoute("/_authenticated/app/platform-control")({
  head: () => ({
    meta: [
      { title: "Platform Control — Omniqora" },
      { name: "description", content: "Omniqora landlord, tenant, SaaS Factory and shared-engine control centre." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlatformControl,
});

const GAP_ENGINES = [
  ["CRM & Customer 360", PLATFORM_MODULE_KEYS.crm, "Customer records, leads, pipelines, tasks and interaction timeline"],
  ["Journeys", PLATFORM_MODULE_KEYS.journeys, "Trigger → condition → AI decision → action → delay → branch → outcome"],
  ["RFM & Intelligence", PLATFORM_MODULE_KEYS.analytics, "Recency, frequency, value, churn and segment activation"],
  ["Sales Engagement", PLATFORM_MODULE_KEYS.sales, "Sequences, calls, callbacks, meetings, scoring and follow-up"],
  ["Feedback / NPS", PLATFORM_MODULE_KEYS.feedback, "NPS, CSAT, CES, review routing and recovery"],
  ["Geo", PLATFORM_MODULE_KEYS.geo, "Geocoding, distance, ETA, routes, geofences and provider abstraction"],
  ["Dispatch & Fleet", PLATFORM_MODULE_KEYS.dispatch, "Jobs, drivers, shifts, vehicles, tracking, POD and utilisation"],
  ["Marketplace Core", PLATFORM_MODULE_KEYS.marketplace, "Vendors, listings, availability, orders, payouts, reviews and disputes"],
  ["Universal Agent App", PLATFORM_MODULE_KEYS.mobile, "Tenant-branded field, courier, recovery and service-agent surface"],
  ["Identity", PLATFORM_MODULE_KEYS.identity, "Shared membership, OTP/passkey/SSO policy and service identity"],
  ["Analytics", PLATFORM_MODULE_KEYS.analytics, "Shared metrics, product dimensions, financials and data-plane reporting"],
  ["SaaS Factory", PLATFORM_MODULE_KEYS.provisioning, "Blueprints, variants, modules, regions, domains and provisioning"],
] as const;

function PlatformControl() {
  const operatorRequest = useServerFn(getMyOperatorContext);
  const tenantRequest = useServerFn(listManagedTenants);
  const blueprintRequest = useServerFn(listSaasFactoryProducts);

  const operator = useQuery({
    queryKey: ["platform-operator-context"],
    queryFn: () => operatorRequest(),
    retry: false,
  });
  const tenants = useQuery({
    queryKey: ["platform-managed-tenants"],
    queryFn: () => tenantRequest({ data: { productKey: null } }),
    retry: false,
  });
  const blueprints = useQuery({
    queryKey: ["platform-saas-factory-products"],
    queryFn: () => blueprintRequest(),
    retry: false,
  });

  const tenantRows = (tenants.data ?? []) as any[];
  const blueprintRows = (blueprints.data ?? []) as any[];
  const variants = OMNIQORA_PRODUCTS.filter((item) => item.kind === "product_variant");
  const landlords = OMNIQORA_PRODUCTS.filter((item) => item.kind === "vertical_landlord");
  const previewModules = OMNIQORA_MODULES.filter((item) => item.status !== "planned");
  const platformRole = operator.data?.platform?.role ?? null;

  return (
    <AppShell
      title="Omniqora Platform Control"
      subtitle="Landlords, tenants, SaaS Factory, shared engines and launch readiness in one control plane."
      actions={
        platformRole ? <Badge variant="outline">{String(platformRole).replaceAll("_", " ")}</Badge> : undefined
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric icon={Factory} label="SaaS landlords" value={landlords.length} />
        <Metric icon={Network} label="Country variants" value={variants.length} />
        <Metric icon={Building2} label="Managed tenants" value={tenantRows.length} />
        <Metric icon={Layers3} label="Shared modules" value={OMNIQORA_MODULES.length} />
        <Metric icon={ShieldCheck} label="Backend-ready modules" value={previewModules.length} />
      </div>

      <Tabs defaultValue="factory" className="mt-6">
        <TabsList className="mb-6 flex h-auto flex-wrap justify-start">
          <TabsTrigger value="factory">SaaS Factory</TabsTrigger>
          <TabsTrigger value="gaps">Jungleworks gaps</TabsTrigger>
          <TabsTrigger value="tenants">Landlords & tenants</TabsTrigger>
          <TabsTrigger value="modules">Module catalogue</TabsTrigger>
          <TabsTrigger value="kindelo">Kindelo family</TabsTrigger>
        </TabsList>

        <TabsContent value="factory" className="space-y-5">
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <WandSparkles className="h-5 w-5 text-primary" />
                    <h2 className="font-display text-xl font-semibold">Reusable SaaS launch pipeline</h2>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                    A product is a blueprint plus shared modules, regional rules, branding and genuinely vertical objects.
                    Country variants inherit from the landlord product rather than forking the application.
                  </p>
                </div>
                <Badge variant="secondary">{blueprintRows.length} database blueprints</Badge>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-4">
                {[
                  ["1", "Product blueprint", "Industry, roles, objects and workflows"],
                  ["2", "Region + locale", "Country packs, currency, terminology and compliance"],
                  ["3", "Modules + providers", "Entitlements, integrations, routing and limits"],
                  ["4", "Tenant launch", "Brand, domain, locations, users and readiness"],
                ].map(([n, title, body]) => (
                  <div key={n} className="rounded-xl border bg-card p-4">
                    <div className="text-xs font-semibold text-primary">STEP {n}</div>
                    <div className="mt-2 font-medium">{title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{body}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {blueprintRows.slice(0, 20).map((row: any) => (
              <Card key={String(row.id ?? row.product_key) + String(row.version ?? "")}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{row.name ?? row.product_key}</h3>
                      <p className="text-xs text-muted-foreground">{row.product_key} · v{row.version ?? "—"}</p>
                    </div>
                    <Badge variant="outline">{row.status ?? "draft"}</Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {(row.module_keys ?? []).slice(0, 8).map((key: string) => (
                      <Badge key={key} variant="secondary">{key}</Badge>
                    ))}
                    {(row.module_keys ?? []).length > 8 && (
                      <Badge variant="secondary">+{(row.module_keys ?? []).length - 8}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {!blueprintRows.length && (
              <Card className="lg:col-span-2">
                <CardContent className="p-6 text-sm text-muted-foreground">
                  No database blueprints are visible to this account yet. The compiled product registry remains available below.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="gaps">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {GAP_ENGINES.map(([name, key, description]) => {
              const module = OMNIQORA_MODULES.find((item) => item.key === key);
              return (
                <Card key={name}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Boxes className="h-4 w-4 text-primary" />
                        <h3 className="font-semibold">{name}</h3>
                      </div>
                      <Badge variant="outline">{module?.status ?? "preview"}</Badge>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">{description}</p>
                    <div className="mt-4 text-xs text-muted-foreground">
                      {module?.capabilities?.length ? module.capabilities.join(" · ") : key}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="tenants" className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {OMNIQORA_PRODUCTS.filter((item) => item.kind === "vertical_landlord" || item.kind === "product_variant").map((product) => (
              <Card key={product.key}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{product.name}</h3>
                      <p className="text-xs text-muted-foreground">{product.key}</p>
                    </div>
                    <Badge variant="secondary">{product.kind.replaceAll("_", " ")}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{product.industry ?? "Shared platform"}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {product.supportedRegions.map((region) => <Badge key={region} variant="outline">{region}</Badge>)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="border-b px-5 py-4">
                <h3 className="font-semibold">Managed tenant products</h3>
                <p className="text-xs text-muted-foreground">Live operator-visible tenant/product bindings from the control plane.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3">Tenant</th>
                      <th className="px-5 py-3">Product</th>
                      <th className="px-5 py-3">Region</th>
                      <th className="px-5 py-3">Plan</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {tenantRows.map((row: any) => (
                      <tr key={row.tenant_product_id}>
                        <td className="px-5 py-3">
                          <div className="font-medium">{row.tenant_name}</div>
                          <div className="text-xs text-muted-foreground">{row.tenant_slug}</div>
                        </td>
                        <td className="px-5 py-3">{row.product_key}</td>
                        <td className="px-5 py-3">{row.region_key}</td>
                        <td className="px-5 py-3">{row.plan_key ?? "—"}</td>
                        <td className="px-5 py-3"><Badge variant="outline">{row.status}</Badge></td>
                      </tr>
                    ))}
                    {!tenantRows.length && (
                      <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No managed tenants visible.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="modules">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {OMNIQORA_MODULES.map((module) => (
              <Card key={module.key}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{module.name}</h3>
                      <p className="text-xs text-muted-foreground">{module.key} · {module.version}</p>
                    </div>
                    <Badge variant={module.status === "active" ? "default" : "outline"}>{module.status}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{module.description}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {module.capabilities.slice(0, 6).map((capability) => (
                      <Badge key={capability} variant="secondary">{capability}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="kindelo">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <Store className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl font-semibold">Kindelo as the multi-country reference SaaS</h2>
              </div>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Kindelo is the proof that landlord → country variant → agency tenant → marketplace vendor/customer can run
                without separate UK and Germany codebases.
              </p>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {["kindelo", "kindelo-gb", "kindelo-de"].map((key) => {
                  const product = OMNIQORA_PRODUCTS.find((item) => item.key === key)!;
                  return (
                    <div key={key} className="rounded-xl border p-5">
                      <div className="font-semibold">{product.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{product.key}</div>
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {product.supportedRegions.map((region) => <Badge key={region} variant="outline">{region}</Badge>)}
                      </div>
                      <div className="mt-4 text-xs text-muted-foreground">
                        {product.parentProductKey ? `Inherits from ${product.parentProductKey}` : "Family root / landlord blueprint"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Factory;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="mt-2 font-display text-3xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
