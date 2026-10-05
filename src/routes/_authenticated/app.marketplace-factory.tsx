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
  createSyndrivaMarketplace,
  getSyndrivaMarketplaceEngine,
  setSyndrivaMarketplaceCapability,
} from "@/modules/syndriva/marketplace.functions";
import {
  Boxes,
  CheckCircle2,
  Layers3,
  RefreshCw,
  Settings2,
  ShoppingBasket,
  Sparkles,
  Store,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/marketplace-factory")({
  component: MarketplaceFactory,
  head: () => ({
    meta: [
      { title: "Syndriva Marketplace Factory — Omniqora" },
      {
        name: "description",
        content:
          "Create and configure reusable product, service, booking, delivery, rental, RFQ and hybrid marketplaces.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type MarketplaceRecord = {
  id: string;
  product_key: string;
  name: string;
  slug: string;
  template_key: string | null;
  status: string;
  seller_model: string;
  branch_model: string;
  marketplace_modes: string[];
  capabilities?: Array<{
    capability_key: string;
    enabled: boolean;
    source: string;
    config?: Record<string, unknown>;
  }>;
  connections?: Array<{
    id: string;
    connection_type: string;
    provider_key: string | null;
    status: string;
  }>;
};

type TemplateRecord = {
  template_key: string;
  name: string;
  description: string;
  marketplace_modes: string[];
  capabilities: string[];
};

type CapabilityRecord = {
  capability_key: string;
  name: string;
  family: string;
  description: string;
  requires: string[];
};

const MARKETPLACE_MODES = [
  "products",
  "services",
  "bookings",
  "delivery",
  "consultations",
  "freelancer",
  "rental",
  "peer_to_peer",
  "rfq",
] as const;

function MarketplaceFactory() {
  const tenant = useTenant();
  const getEngine = useServerFn(getSyndrivaMarketplaceEngine);
  const createMarketplace = useServerFn(createSyndrivaMarketplace);
  const setCapability = useServerFn(setSyndrivaMarketplaceCapability);

  const engine = useQuery({
    queryKey: ["syndriva-marketplace-engine", tenant.tenantId],
    queryFn: () => getEngine({ data: { tenantId: tenant.tenantId! } }),
    enabled: !!tenant.tenantId,
    retry: false,
  });

  const templates = (engine.data?.templates ?? []) as TemplateRecord[];
  const capabilities = (engine.data?.capabilities ?? []) as CapabilityRecord[];
  const marketplaces = (engine.data?.marketplaces ?? []) as MarketplaceRecord[];

  const [selectedMarketplaceId, setSelectedMarketplaceId] = useState("");
  const selectedMarketplace = marketplaces.find((m) => m.id === selectedMarketplaceId) ?? marketplaces[0];

  useEffect(() => {
    if (!selectedMarketplaceId && marketplaces[0]?.id) setSelectedMarketplaceId(marketplaces[0].id);
  }, [marketplaces, selectedMarketplaceId]);

  const [draft, setDraft] = useState({
    name: "",
    slug: "",
    productKey: "omniqora",
    templateKey: "hybrid",
    sellerModel: "multi_seller" as "single_brand" | "single_seller" | "multi_seller" | "peer_to_peer",
    branchModel: "multi_branch" as "single_branch" | "multi_branch" | "not_applicable",
    currency: "GBP",
    country: "GB",
    timezone: "Europe/London",
    modes: ["products", "services"] as string[],
  });
  const [creating, setCreating] = useState(false);
  const [busyCapability, setBusyCapability] = useState<string | null>(null);

  const selectedTemplate = templates.find((t) => t.template_key === draft.templateKey);
  const selectedCapabilityKeys = useMemo(
    () =>
      new Set(
        (selectedMarketplace?.capabilities ?? [])
          .filter((c) => c.enabled)
          .map((c) => c.capability_key),
      ),
    [selectedMarketplace?.capabilities],
  );

  const capabilityFamilies = useMemo(() => {
    const result = new Map<string, CapabilityRecord[]>();
    for (const capability of capabilities) {
      const rows = result.get(capability.family) ?? [];
      rows.push(capability);
      result.set(capability.family, rows);
    }
    return [...result.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [capabilities]);

  function toggleMode(mode: string) {
    setDraft((value) => ({
      ...value,
      modes: value.modes.includes(mode)
        ? value.modes.filter((item) => item !== mode)
        : [...value.modes, mode],
    }));
  }

  async function provisionMarketplace() {
    if (!tenant.tenantId) return;
    if (!draft.name.trim() || !draft.slug.trim() || !draft.productKey.trim()) {
      toast.error("Name, slug and product key are required");
      return;
    }
    setCreating(true);
    try {
      const result = await createMarketplace({
        data: {
          tenantId: tenant.tenantId,
          productKey: draft.productKey.trim(),
          name: draft.name.trim(),
          slug: draft.slug.trim().toLowerCase(),
          templateKey: draft.templateKey,
          sellerModel: draft.sellerModel,
          branchModel: draft.branchModel,
          currency: draft.currency.toUpperCase(),
          country: draft.country.toUpperCase(),
          timezone: draft.timezone,
          marketplaceModes: draft.modes as any,
          config: {},
        },
      });
      toast.success("Syndriva marketplace provisioned");
      setSelectedMarketplaceId(result.marketplaceId);
      setDraft((value) => ({ ...value, name: "", slug: "" }));
      await engine.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Marketplace provisioning failed");
    } finally {
      setCreating(false);
    }
  }

  async function toggleCapability(capabilityKey: string, enabled: boolean) {
    if (!selectedMarketplace) return;
    setBusyCapability(capabilityKey);
    try {
      await setCapability({
        data: {
          marketplaceId: selectedMarketplace.id,
          capabilityKey,
          enabled,
          config: {},
        },
      });
      toast.success(`${capabilityKey.replaceAll("_", " ")} ${enabled ? "enabled" : "disabled"}`);
      await engine.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Capability update failed");
    } finally {
      setBusyCapability(null);
    }
  }

  return (
    <AppShell
      title="Syndriva Marketplace Factory"
      subtitle="Create a marketplace from configuration, then compose capabilities instead of rebuilding another SaaS."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => engine.refetch()}
          disabled={!tenant.tenantId || engine.isFetching}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      }
    >
      {engine.error && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {engine.error.message}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Metric icon={Store} label="Marketplaces" value={String(marketplaces.length)} />
        <Metric icon={Layers3} label="Templates" value={String(templates.length)} />
        <Metric icon={Boxes} label="Capabilities" value={String(capabilities.length)} />
        <Metric
          icon={Sparkles}
          label="Omniqora"
          value={
            selectedMarketplace?.connections?.some(
              (connection) =>
                connection.connection_type === "omniqora" && connection.status === "connected",
            )
              ? "Connected"
              : "Pending"
          }
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2">
              <ShoppingBasket className="h-4 w-4 text-primary" />
              <h2 className="font-display text-lg font-semibold">Create marketplace</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Template defaults install the capability set; every capability can be adjusted afterwards.
            </p>

            <div className="mt-5 space-y-4">
              <Field label="Marketplace name">
                <Input
                  value={draft.name}
                  placeholder="e.g. SparesGrid UK"
                  onChange={(e) =>
                    setDraft((value) => ({
                      ...value,
                      name: e.target.value,
                      slug:
                        value.slug ||
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/^-|-$/g, ""),
                    }))
                  }
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Slug">
                  <Input
                    value={draft.slug}
                    placeholder="sparesgrid-uk"
                    onChange={(e) => setDraft((value) => ({ ...value, slug: e.target.value }))}
                  />
                </Field>
                <Field label="Product key">
                  <Input
                    value={draft.productKey}
                    placeholder="sparesgrid"
                    onChange={(e) => setDraft((value) => ({ ...value, productKey: e.target.value }))}
                  />
                </Field>
              </div>

              <Field label="Template">
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={draft.templateKey}
                  onChange={(e) => setDraft((value) => ({ ...value, templateKey: e.target.value }))}
                >
                  {templates.map((template) => (
                    <option key={template.template_key} value={template.template_key}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </Field>

              {selectedTemplate && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-sm font-medium">{selectedTemplate.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedTemplate.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selectedTemplate.capabilities.slice(0, 12).map((key) => (
                      <Badge key={key} variant="secondary" className="text-[10px]">
                        {key.replaceAll("_", " ")}
                      </Badge>
                    ))}
                    {selectedTemplate.capabilities.length > 12 && (
                      <Badge variant="secondary" className="text-[10px]">
                        +{selectedTemplate.capabilities.length - 12}
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              <Field label="Marketplace modes">
                <div className="flex flex-wrap gap-2">
                  {MARKETPLACE_MODES.map((mode) => {
                    const active = draft.modes.includes(mode);
                    return (
                      <Button
                        type="button"
                        key={mode}
                        size="sm"
                        variant={active ? "default" : "outline"}
                        onClick={() => toggleMode(mode)}
                      >
                        {mode.replaceAll("_", " ")}
                      </Button>
                    );
                  })}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Seller model">
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={draft.sellerModel}
                    onChange={(e) =>
                      setDraft((value) => ({ ...value, sellerModel: e.target.value as typeof value.sellerModel }))
                    }
                  >
                    <option value="multi_seller">Multi seller</option>
                    <option value="single_brand">Single brand</option>
                    <option value="single_seller">Single seller</option>
                    <option value="peer_to_peer">Peer-to-peer</option>
                  </select>
                </Field>
                <Field label="Branch model">
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={draft.branchModel}
                    onChange={(e) =>
                      setDraft((value) => ({ ...value, branchModel: e.target.value as typeof value.branchModel }))
                    }
                  >
                    <option value="multi_branch">Multi branch</option>
                    <option value="single_branch">Single branch</option>
                    <option value="not_applicable">Not applicable</option>
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Country">
                  <Input
                    value={draft.country}
                    onChange={(e) => setDraft((value) => ({ ...value, country: e.target.value }))}
                  />
                </Field>
                <Field label="Currency">
                  <Input
                    value={draft.currency}
                    onChange={(e) => setDraft((value) => ({ ...value, currency: e.target.value }))}
                  />
                </Field>
                <Field label="Timezone">
                  <Input
                    value={draft.timezone}
                    onChange={(e) => setDraft((value) => ({ ...value, timezone: e.target.value }))}
                  />
                </Field>
              </div>

              <Button className="w-full" onClick={provisionMarketplace} disabled={creating || !tenant.tenantId}>
                {creating ? "Provisioning…" : "Create marketplace"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold">Marketplace instances</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    One engine, different templates, brands and capability combinations.
                  </p>
                </div>
                {selectedMarketplace && <StatusBadge status={selectedMarketplace.status} />}
              </div>

              {marketplaces.length === 0 ? (
                <div className="mt-5 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No Syndriva marketplaces have been provisioned for this tenant yet.
                </div>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {marketplaces.map((marketplace) => (
                      <Button
                        key={marketplace.id}
                        size="sm"
                        variant={selectedMarketplace?.id === marketplace.id ? "default" : "outline"}
                        onClick={() => setSelectedMarketplaceId(marketplace.id)}
                      >
                        {marketplace.name}
                      </Button>
                    ))}
                  </div>

                  {selectedMarketplace && (
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <Detail label="Template" value={selectedMarketplace.template_key ?? "Custom"} />
                      <Detail label="Seller model" value={selectedMarketplace.seller_model} />
                      <Detail label="Branches" value={selectedMarketplace.branch_model} />
                      <Detail
                        label="Modes"
                        value={(selectedMarketplace.marketplace_modes ?? []).join(", ") || "Custom"}
                      />
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {selectedMarketplace && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-primary" />
                  <h2 className="font-display text-lg font-semibold">Capability composition</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Switch capabilities by contract. Vertical applications should consume this state rather than hard-code brand names.
                </p>

                <div className="mt-5 space-y-6">
                  {capabilityFamilies.map(([family, rows]) => (
                    <section key={family}>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {family}
                      </h3>
                      <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                        {rows.map((capability) => {
                          const enabled = selectedCapabilityKeys.has(capability.capability_key);
                          return (
                            <div
                              key={capability.capability_key}
                              className="flex items-start justify-between gap-3 rounded-lg border bg-background p-3"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  {enabled && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                                  <p className="text-sm font-medium">{capability.name}</p>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {capability.description}
                                </p>
                                {capability.requires?.length > 0 && (
                                  <p className="mt-1 text-[10px] text-muted-foreground">
                                    Requires: {capability.requires.join(", ")}
                                  </p>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant={enabled ? "secondary" : "outline"}
                                disabled={busyCapability === capability.capability_key}
                                onClick={() => toggleCapability(capability.capability_key, !enabled)}
                              >
                                {enabled ? "On" : "Off"}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Store;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-primary/10 p-2">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium capitalize">{value.replaceAll("_", " ")}</p>
    </div>
  );
}
