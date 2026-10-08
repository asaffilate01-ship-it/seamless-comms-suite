import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
  FileCheck2,
  FileText,
  Fingerprint,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  Palette,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { GrowthSetupPanel } from "./GrowthSetupPanel";
import { SyndrivaSourcesPanel } from "./SyndrivaSourcesPanel";
import { getGrowthWorkspaces } from "./setup.functions";
import {
  GROWTH_PRODUCTS,
  growthOutputSchema,
  type GrowthCheck,
  type GrowthProviderView,
  type GrowthResult,
  type GrowthScope,
} from "@/modules/growth/studio.contract";
import {
  generateGrowthCampaign,
  getGrowthStudioWorkspace,
  handoffGrowthRun,
  reviewGrowthRun,
  saveGrowthBrand,
  saveGrowthCampaign,
  saveGrowthEvidence,
} from "@/modules/growth/studio.functions";

type Workspace = Awaited<ReturnType<typeof getGrowthStudioWorkspace>>;
type Brand = Workspace["brands"][number];
type Evidence = Workspace["evidence"][number];
type Campaign = Workspace["campaigns"][number];
type Run = Workspace["runs"][number];
type Access = Workspace["access"];
type Locale = "en" | "ur" | "es";
type Channel = "social" | "email" | "whatsapp" | "web";
type EvidenceKind =
  "brand_fact" | "competitor_ad" | "customer_feedback" | "product_data" | "affiliate_offer";
type Refresh = () => Promise<unknown>;

const LANGUAGES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ur", label: "Urdu / اردو" },
  { value: "es", label: "Spanish / Español" },
];
const CHANNELS: { value: Channel; label: string }[] = [
  { value: "social", label: "Social post" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "web", label: "Website" },
];
const EVIDENCE_KINDS: { value: EvidenceKind; label: string }[] = [
  { value: "brand_fact", label: "Brand fact" },
  { value: "product_data", label: "Product information" },
  { value: "affiliate_offer", label: "Affiliate offer" },
  { value: "competitor_ad", label: "Competitor observation" },
  { value: "customer_feedback", label: "Customer feedback" },
];
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The request could not be completed. Please try again.";
}

function displayDate(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not recorded";
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value)) + " UTC"
  );
}

function isExpired(evidence: Evidence) {
  return !!evidence.validUntil && Date.parse(evidence.validUntil) <= Date.now();
}

function sourceLink(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function useAction(refresh: Refresh) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function execute<T>(
    key: string,
    action: () => Promise<T>,
    message: string,
    done?: (result: T) => void,
  ) {
    if (busy.current) return;
    busy.current = true;
    setPending(key);
    setError(null);
    try {
      const result = await action();
      await refresh();
      if (mounted.current) {
        done?.(result);
        toast.success(message);
      }
    } catch (cause) {
      // A transport failure can follow a successful server write. Reconcile the
      // saved result before letting the user decide whether to retry.
      await refresh().catch(() => undefined);
      if (mounted.current) setError(errorMessage(cause));
    } finally {
      busy.current = false;
      if (mounted.current) setPending(null);
    }
  }
  return { pending, error, execute, clearError: () => setError(null) };
}

function ErrorBlock({
  title = "Something needs attention",
  message,
}: {
  title?: string;
  message: string | null;
}) {
  if (!message) return null;
  return (
    <Alert variant="destructive" className="bg-background">
      <AlertCircle className="h-4 w-4" aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="break-words">{message}</AlertDescription>
    </Alert>
  );
}

function Field({
  id,
  label,
  help,
  children,
  required,
}: {
  id: string;
  label: string;
  help?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="ml-1 text-muted-foreground" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {children}
      {help && (
        <p id={`${id}-help`} className="text-xs leading-relaxed text-muted-foreground">
          {help}
        </p>
      )}
    </div>
  );
}

function EmptyState({
  icon: Icon = FileText,
  title,
  children,
  action,
}: {
  icon?: typeof FileText;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed bg-background px-6 py-10 text-center">
      <div className="mb-4 rounded-xl bg-primary-soft p-3 text-primary">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{children}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function LoadingWorkspace() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading Growth workspace">
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
      <span className="sr-only">Loading your brands and campaign work.</span>
    </div>
  );
}

function StateBadge({ value }: { value: string }) {
  const successful = ["completed", "approved", "pass"].includes(value);
  const problematic = ["failed", "rejected", "fail"].includes(value);
  const attention = ["blocked", "stale", "pending", "review"].includes(value);
  return (
    <Badge
      variant="outline"
      className={cn(
        "capitalize whitespace-nowrap",
        successful && "border-success/25 bg-success/10 text-foreground",
        problematic && "border-destructive/25 bg-destructive/5 text-destructive",
        attention && "border-warning/30 bg-warning/10 text-foreground",
      )}
    >
      {value.replace(/_/g, " ")}
    </Badge>
  );
}

export function GrowthWorkspace() {
  const loadWorkspaces = useServerFn(getGrowthWorkspaces);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const workspacesQuery = useInfiniteQuery({
    queryKey: ["growth-workspace-choices"],
    queryFn: ({ pageParam }) => loadWorkspaces({ data: { offset: pageParam, limit: 25 } }),
    initialPageParam: 0,
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    retry: false,
  });
  const workspaces = workspacesQuery.data?.pages.flatMap((page) => page.workspaces) ?? [];
  const workspace = workspaces.find((item) => item.id === selectedWorkspaceId) ?? workspaces[0];
  return (
    <AppShell
      title="Omniqora Growth"
      subtitle="From trusted brand knowledge to original campaigns, human review and creative drafts."
    >
      <div className="mx-auto max-w-[1440px]">
        {workspacesQuery.isPending ? (
          <LoadingWorkspace />
        ) : workspacesQuery.isError ? (
          <div className="space-y-4">
            <ErrorBlock
              title="Your workspaces could not be loaded"
              message={errorMessage(workspacesQuery.error)}
            />
            <Button
              variant="outline"
              disabled={workspacesQuery.isFetching}
              onClick={() => workspacesQuery.refetch()}
            >
              <RefreshCw />
              Try again
            </Button>
          </div>
        ) : !workspace ? (
          <EmptyState
            icon={LockKeyhole}
            title="Choose a workspace to begin"
            action={
              <Button asChild variant="outline">
                <Link to="/app/settings">
                  Workspace settings
                  <ArrowRight />
                </Link>
              </Button>
            }
          >
            Brands, campaign sources and approvals belong to your workspace.
          </EmptyState>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-card px-5 py-4">
              <div className="w-full space-y-2 sm:max-w-md">
                <Label htmlFor="growth-workspace">Workspace</Label>
                <select
                  id="growth-workspace"
                  className={selectClass}
                  value={workspace.id}
                  onChange={(event) => setSelectedWorkspaceId(event.target.value)}
                >
                  {workspaces.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.status !== "active" ? ` (${item.status})` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Switching workspace clears unsaved campaign and setup forms.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {workspace.role.replaceAll("_", " ")}
                </Badge>
                {workspacesQuery.hasNextPage && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={workspacesQuery.isFetchingNextPage}
                    onClick={() => workspacesQuery.fetchNextPage()}
                  >
                    {workspacesQuery.isFetchingNextPage && (
                      <LoaderCircle className="animate-spin" />
                    )}
                    Load more workspaces
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Refresh workspace choices"
                  disabled={workspacesQuery.isFetching}
                  onClick={() => workspacesQuery.refetch()}
                >
                  <RefreshCw className={cn(workspacesQuery.isFetching && "animate-spin")} />
                </Button>
              </div>
            </div>
            <TenantGrowth key={workspace.id} tenantId={workspace.id} tenantName={workspace.name} />
          </div>
        )}
      </div>
    </AppShell>
  );
}

function TenantGrowth({ tenantId, tenantName }: { tenantId: string; tenantName: string | null }) {
  const [productKey, setProductKey] = useState<GrowthScope["productKey"]>("omniqora");
  const product = GROWTH_PRODUCTS.find((item) => item.key === productKey)!;
  return (
    <div className="space-y-6">
      <section
        className="overflow-hidden rounded-xl border bg-card shadow-sm"
        aria-label="Product workspace"
      >
        <div className="grid gap-5 border-l-4 border-primary px-5 py-5 md:grid-cols-[1fr_270px] md:items-center sm:px-6">
          <div className="flex items-start gap-4">
            <div className="hidden rounded-xl bg-primary-soft p-3 text-primary sm:block">
              <Layers3 className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <Fingerprint className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tenantName || "Current workspace"}</span>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{product.name}</span>
              </div>
              <h2 className="text-lg font-semibold">A shared studio. Your brand's own context.</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {product.purpose}. Every draft stays within the selected product.
              </p>
            </div>
          </div>
          <Field id="growth-product" label="Product">
            <select
              id="growth-product"
              className={selectClass}
              value={productKey}
              onChange={(event) => setProductKey(event.target.value as GrowthScope["productKey"])}
            >
              {GROWTH_PRODUCTS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>
      <ProductWorkspace
        key={`${tenantId}:${productKey}`}
        scope={{ tenantId, productKey }}
        tenantName={tenantName}
      />
    </div>
  );
}

function ProductWorkspace({
  scope,
  tenantName,
}: {
  scope: GrowthScope;
  tenantName: string | null;
}) {
  const productName = GROWTH_PRODUCTS.find((item) => item.key === scope.productKey)!.name;
  const load = useServerFn(getGrowthStudioWorkspace);
  const query = useQuery({
    queryKey: ["growth-studio", scope.tenantId, scope.productKey],
    queryFn: () => load({ data: scope }),
    retry: false,
    refetchInterval: (current) =>
      current.state.data?.runs.some((run) => run.status === "running") ? 5000 : false,
  });
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const data = query.data;
  const brand =
    selectedBrandId === "new"
      ? undefined
      : (data?.brands.find((item) => item.id === selectedBrandId) ?? data?.brands[0]);

  if (query.isPending) return <LoadingWorkspace />;
  if (query.isError || !data)
    return (
      <div className="space-y-4">
        <ErrorBlock title="Growth workspace is unavailable" message={errorMessage(query.error)} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}>
            <RefreshCw className={cn(query.isFetching && "animate-spin")} />
            Try again
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Ask your workspace or platform administrator to check that{" "}
          {tenantName || "this workspace"} is active with {productName} and Campaigns enabled.
        </p>
      </div>
    );

  return (
    <div className="space-y-5">
      <GrowthSetupPanel
        scope={scope}
        initiallyOpen={!data.access.allowed}
        onChanged={() => query.refetch()}
      />
      {!data.access.allowed ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={LockKeyhole}
              title="Growth setup required"
              action={
                <Button
                  variant="outline"
                  disabled={query.isFetching}
                  onClick={() => query.refetch()}
                >
                  <RefreshCw className={cn(query.isFetching && "animate-spin")} />
                  Refresh access
                </Button>
              }
            >
              <div className="space-y-3 text-left">
                <p>
                  Use Workspace setup above to request {productName} and Campaigns access for{" "}
                  {tenantName || "this workspace"}.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>The workspace and product must be active to use Growth.</li>
                  <li>A configured AI writer connection is required to generate drafts.</li>
                  <li>
                    Creative Studio must also be enabled before an owner or administrator can hand
                    off approved work.
                  </li>
                </ul>
              </div>
            </EmptyState>
          </CardContent>
        </Card>
      ) : (
        <>
          {!data.access.canWrite && (
            <Alert>
              <LockKeyhole className="h-4 w-4" />
              <AlertTitle>Read-only access</AlertTitle>
              <AlertDescription>
                You can inspect saved work. Ask a workspace owner or administrator for permission to
                create or edit it.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="w-full space-y-2 sm:max-w-sm">
              <Label htmlFor="growth-brand">Brand workspace</Label>
              <div className="flex gap-2">
                <select
                  id="growth-brand"
                  className={selectClass}
                  value={brand?.id ?? "new"}
                  onChange={(event) => setSelectedBrandId(event.target.value)}
                >
                  {data.brands.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                  <option value="new">New brand</option>
                </select>
                <Button
                  variant="outline"
                  disabled={!data.access.canWrite || !brand}
                  onClick={() => setSelectedBrandId("new")}
                  aria-label="Create a new brand"
                >
                  <Plus />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Changing brand or product clears unsaved form changes.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={query.isFetching}
              onClick={() => query.refetch()}
            >
              <RefreshCw className={cn(query.isFetching && "animate-spin")} />
              Refresh saved work
            </Button>
          </div>
          <BrandWorkspace
            key={brand?.id ?? "new"}
            scope={scope}
            brand={brand}
            data={data}
            refresh={() => query.refetch()}
            onBrandSaved={(saved) => setSelectedBrandId(saved.id)}
          />
        </>
      )}
    </div>
  );
}

function BrandWorkspace({
  scope,
  brand,
  data,
  refresh,
  onBrandSaved,
}: {
  scope: GrowthScope;
  brand?: Brand;
  data: Workspace;
  refresh: Refresh;
  onBrandSaved: (brand: Brand) => void;
}) {
  const [tab, setTab] = useState(
    brand && data.evidence.some((item) => item.brandId === brand.id) ? "campaigns" : "brand",
  );
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const requestKeys = useRef(new Map<string, string>());
  const evidence = data.evidence.filter((item) => item.brandId === brand?.id);
  const campaigns = data.campaigns.filter((item) => item.brandId === brand?.id);
  const runs = data.runs
    .filter((item) => item.brandId === brand?.id)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const campaign = campaigns.find((item) => item.id === campaignId) ?? campaigns[0];
  const run =
    runs.find((item) => item.id === runId) ??
    runs.find((item) => item.campaignId === campaign?.id) ??
    runs[0];

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-5">
      <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1.5 sm:w-auto sm:max-w-xl">
        <TabsTrigger value="brand" className="gap-2 px-2 py-2" aria-label="Brand and sources">
          <BookOpen className="hidden h-4 w-4 sm:block" />
          <span className="sm:hidden">Brand</span>
          <span className="hidden sm:inline">Brand & sources</span>
        </TabsTrigger>
        <TabsTrigger value="campaigns" className="gap-2 px-2 py-2" aria-label="Campaign briefs">
          <MessageSquareText className="hidden h-4 w-4 sm:block" />
          <span className="sm:hidden">Briefs</span>
          <span className="hidden sm:inline">Campaign briefs</span>
        </TabsTrigger>
        <TabsTrigger value="review" className="gap-2 px-2 py-2" aria-label="Review and handoff">
          <FileCheck2 className="hidden h-4 w-4 sm:block" />
          <span className="sm:hidden">Review</span>
          <span className="hidden sm:inline">Review & handoff</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="brand" forceMount className="mt-0 data-[state=inactive]:hidden">
        <div className="grid items-start gap-5 xl:grid-cols-[1.05fr_1fr]">
          <BrandEditor
            scope={scope}
            brand={brand}
            access={data.access}
            refresh={refresh}
            onSaved={onBrandSaved}
          />
          <EvidenceWorkspace
            key={brand?.id ?? "new"}
            scope={scope}
            brand={brand}
            evidence={evidence}
            access={data.access}
            refresh={refresh}
          />
        </div>
      </TabsContent>
      <TabsContent value="campaigns" forceMount className="mt-0 data-[state=inactive]:hidden">
        {!brand ? (
          <EmptyState
            icon={BookOpen}
            title="Give your campaigns a brand foundation"
            action={
              <Button onClick={() => setTab("brand")}>
                Set up brand & sources
                <ArrowRight />
              </Button>
            }
          >
            Save your voice, offer and audience, then add the sources a writer can use.
          </EmptyState>
        ) : (
          <div className="grid items-start gap-5 xl:grid-cols-[360px_1fr]">
            <CampaignComposer
              key={editingCampaignId ?? "new"}
              scope={scope}
              brand={brand}
              evidence={evidence}
              access={data.access}
              refresh={refresh}
              campaign={campaigns.find((item) => item.id === editingCampaignId)}
              onCancel={() => setEditingCampaignId(null)}
              onSaved={(saved) => {
                setCampaignId(saved.id);
                setRunId(null);
                setEditingCampaignId(null);
              }}
            />
            <div className="min-w-0 space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Saved campaign briefs</CardTitle>
                  <CardDescription>
                    Choose a brief to generate or inspect its content.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {campaigns.length ? (
                    campaigns.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setCampaignId(item.id);
                          setRunId(null);
                        }}
                        className={cn(
                          "flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          item.id === campaign?.id
                            ? "border-primary/40 bg-primary-soft/50"
                            : "hover:bg-muted/50",
                        )}
                        aria-pressed={item.id === campaign?.id}
                      >
                        <div className="min-w-0">
                          <p className="break-words text-sm font-medium">{item.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {CHANNELS.find((channel) => channel.value === item.channel)?.label ??
                              item.channel}{" "}
                            ·{" "}
                            {LANGUAGES.find((language) => language.value === item.locale)?.label ??
                              item.locale}
                          </p>
                        </div>
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))
                  ) : (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Your first saved brief will appear here.
                    </p>
                  )}
                </CardContent>
              </Card>
              {campaign && (
                <CampaignGeneration
                  key={campaign.id}
                  scope={scope}
                  campaign={campaign}
                  brand={brand}
                  evidence={evidence}
                  providers={data.providers}
                  access={data.access}
                  refresh={refresh}
                  runs={runs.filter((item) => item.campaignId === campaign.id)}
                  requestKeys={requestKeys.current}
                  onEdit={() => setEditingCampaignId(campaign.id)}
                  onGenerated={(saved) => {
                    setRunId(saved.id);
                    setTab("review");
                  }}
                  onReview={(id) => {
                    setRunId(id);
                    setTab("review");
                  }}
                />
              )}
            </div>
          </div>
        )}
      </TabsContent>
      <TabsContent value="review" forceMount className="mt-0 data-[state=inactive]:hidden">
        {!runs.length ? (
          <EmptyState
            icon={FileCheck2}
            title="The review queue is clear"
            action={
              <Button variant="outline" onClick={() => setTab(brand ? "campaigns" : "brand")}>
                {brand ? "Create campaign content" : "Set up a brand"}
                <ArrowRight />
              </Button>
            }
          >
            Generated content, brand checks and source references appear here before anything is
            handed off.
          </EmptyState>
        ) : (
          <div className="grid items-start gap-5 xl:grid-cols-[280px_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Generation history</CardTitle>
                <CardDescription>Saved results and failed attempts.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {runs.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setRunId(item.id)}
                    aria-pressed={run?.id === item.id}
                    className={cn(
                      "w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      run?.id === item.id
                        ? "border-primary/40 bg-primary-soft/50"
                        : "hover:bg-muted/50",
                    )}
                  >
                    <p className="break-words text-sm font-medium">
                      {campaigns.find((itemCampaign) => itemCampaign.id === item.campaignId)
                        ?.title ?? "Campaign generation"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {displayDate(item.createdAt)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <StateBadge value={item.status} />
                      <StateBadge value={item.reviewStatus} />
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
            {run && (
              <RunReview
                key={run.id}
                scope={scope}
                run={run}
                brand={brand}
                campaign={campaigns.find((item) => item.id === run.campaignId)}
                evidence={evidence}
                access={data.access}
                refresh={refresh}
              />
            )}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

type BrandDraft = {
  name: string;
  voice: string;
  offer: string;
  rules: string;
  audience: string;
  locale: Locale;
  disclosure: string;
};
function BrandEditor({
  scope,
  brand,
  access,
  refresh,
  onSaved,
}: {
  scope: GrowthScope;
  brand?: Brand;
  access: Access;
  refresh: Refresh;
  onSaved: (brand: Brand) => void;
}) {
  const save = useServerFn(saveGrowthBrand);
  const action = useAction(refresh);
  const [draft, setDraft] = useState<BrandDraft | null>(null);
  const draftRevision = useRef<number | undefined>(undefined);
  const values: BrandDraft = draft ?? {
    name: brand?.name ?? "",
    voice: brand?.voice ?? "",
    offer: brand?.offer ?? "",
    rules: brand?.rules.join("\n") ?? "",
    audience: brand?.audience ?? "",
    locale: brand?.locale ?? "en",
    disclosure: brand?.disclosure ?? "",
  };
  const change = <K extends keyof BrandDraft>(key: K, value: BrandDraft[K]) => {
    if (!draft) draftRevision.current = brand?.revision;
    setDraft({ ...values, [key]: value });
  };
  const disabled = !access.canWrite || !!action.pending;
  const valid =
    values.name.trim() &&
    values.voice.trim().length >= 3 &&
    values.offer.trim().length >= 3 &&
    values.audience.trim().length >= 3 &&
    (scope.productKey !== "affivon" || values.disclosure.trim());

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Fingerprint className="h-4 w-4 text-primary" />
            Brand foundation
          </CardTitle>
          {draft && <Badge variant="outline">Unsaved changes</Badge>}
        </div>
        <CardDescription>
          A reusable voice, offer and set of rules for every campaign in this brand.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (disabled || !valid) return;
            void action.execute(
              "save",
              () =>
                save({
                  data: {
                    ...scope,
                    ...(brand
                      ? { id: brand.id, expectedRevision: draftRevision.current ?? brand.revision }
                      : {}),
                    ...values,
                    rules: values.rules
                      .split("\n")
                      .map((rule) => rule.trim())
                      .filter(Boolean),
                  },
                }),
              "Brand foundation saved",
              (saved) => {
                setDraft(null);
                draftRevision.current = undefined;
                onSaved(saved);
              },
            );
          }}
        >
          <fieldset disabled={disabled} className="space-y-4">
            <Field id="brand-name" label="Brand name" required>
              <Input
                id="brand-name"
                value={values.name}
                maxLength={160}
                required
                onChange={(event) => change("name", event.target.value)}
                placeholder="Your business or brand"
              />
            </Field>
            <Field
              id="brand-voice"
              label="Voice"
              required
              help="Describe how the brand sounds, including words or tones to avoid."
            >
              <Textarea
                id="brand-voice"
                aria-describedby="brand-voice-help"
                value={values.voice}
                minLength={3}
                maxLength={6000}
                required
                rows={3}
                onChange={(event) => change("voice", event.target.value)}
                placeholder="Warm, clear and knowledgeable. Use everyday language."
              />
            </Field>
            <Field
              id="brand-offer"
              label="Offer"
              required
              help="State what is actually offered. Add changing prices and availability as evidence below."
            >
              <Textarea
                id="brand-offer"
                aria-describedby="brand-offer-help"
                value={values.offer}
                minLength={3}
                maxLength={6000}
                required
                rows={3}
                onChange={(event) => change("offer", event.target.value)}
                placeholder="What you sell, who it helps, and the value it provides."
              />
            </Field>
            <Field id="brand-audience" label="Audience" required>
              <Textarea
                id="brand-audience"
                value={values.audience}
                minLength={3}
                maxLength={3000}
                required
                rows={2}
                onChange={(event) => change("audience", event.target.value)}
                placeholder="Who this brand serves and what matters to them."
              />
            </Field>
            <Field
              id="brand-rules"
              label="Brand rules"
              help="One rule per line. Keep claims specific and supported by a trusted source."
            >
              <Textarea
                id="brand-rules"
                aria-describedby="brand-rules-help"
                value={values.rules}
                rows={4}
                onChange={(event) => change("rules", event.target.value)}
                placeholder={
                  "Do not promise guaranteed results.\nUse only current offers from our sources."
                }
              />
            </Field>
            <Field id="brand-language" label="Default output language">
              <select
                id="brand-language"
                className={selectClass}
                value={values.locale}
                onChange={(event) => change("locale", event.target.value as Locale)}
              >
                {LANGUAGES.map((language) => (
                  <option key={language.value} value={language.value}>
                    {language.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id="brand-disclosure"
              label={
                scope.productKey === "affivon" ? "Affiliate disclosure" : "Required disclosure"
              }
              required={scope.productKey === "affivon"}
              help="This wording travels with generated content. Include a translation appropriate to your selected output language."
            >
              <Textarea
                id="brand-disclosure"
                aria-describedby="brand-disclosure-help"
                value={values.disclosure}
                required={scope.productKey === "affivon"}
                maxLength={1000}
                rows={2}
                onChange={(event) => change("disclosure", event.target.value)}
                placeholder={
                  scope.productKey === "affivon"
                    ? "Explain the commercial relationship clearly."
                    : "Any wording every draft must include."
                }
              />
            </Field>
          </fieldset>
          <ErrorBlock message={action.error} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            {brand ? (
              <p className="text-xs text-muted-foreground">
                Saved {displayDate(brand.updatedAt)}
                <br />
                Revision {brand.revision}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Save once, reuse across briefs.</p>
            )}
            <Button type="submit" disabled={disabled || !valid || (!!brand && !draft)}>
              {action.pending ? <LoaderCircle className="animate-spin" /> : <Save />}
              {brand ? "Save changes" : "Save brand"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

type EvidenceDraft = {
  title: string;
  content: string;
  sourceUrl: string;
  kind: EvidenceKind;
  validUntil: string;
};
const emptyEvidence: EvidenceDraft = {
  title: "",
  content: "",
  sourceUrl: "",
  kind: "brand_fact",
  validUntil: "",
};
function EvidenceWorkspace({
  scope,
  brand,
  evidence,
  access,
  refresh,
}: {
  scope: GrowthScope;
  brand?: Brand;
  evidence: Evidence[];
  access: Access;
  refresh: Refresh;
}) {
  const save = useServerFn(saveGrowthEvidence);
  const action = useAction(refresh);
  const [draft, setDraft] = useState<EvidenceDraft>(emptyEvidence);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRevision, setEditingRevision] = useState<number | undefined>(undefined);
  const editing = evidence.find((item) => item.id === editingId);
  const disabled = !brand || !access.canWrite || !!action.pending;
  const needsExpiry = ["product_data", "affiliate_offer"].includes(draft.kind);
  const validExpiry = !draft.validUntil
    ? !needsExpiry
    : Number.isFinite(Date.parse(draft.validUntil)) && Date.parse(draft.validUntil) > Date.now();
  const valid = draft.title.trim() && draft.content.trim().length >= 3 && validExpiry;
  function edit(item: Evidence) {
    setEditingId(item.id);
    setEditingRevision(item.revision);
    setDraft({
      title: item.title,
      content: item.content,
      sourceUrl: item.sourceUrl ?? "",
      kind: item.kind,
      validUntil: item.validUntil
        ? new Date(
            Date.parse(item.validUntil) - new Date(item.validUntil).getTimezoneOffset() * 60000,
          )
            .toISOString()
            .slice(0, 16)
        : "",
    });
    action.clearError();
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4 text-primary" />
            Trusted source material
          </CardTitle>
          {(draft.title || draft.content || draft.sourceUrl || draft.validUntil || editing) && (
            <Badge variant="outline">{editing ? "Editing source" : "Unsaved source"}</Badge>
          )}
        </div>
        <CardDescription>
          Paste the facts and observations the writer can cite. Source links are references; they
          are not automatically fetched.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {scope.productKey === "syndriva" && brand && (
          <SyndrivaSourcesPanel
            tenantId={scope.tenantId}
            brandId={brand.id}
            canWrite={access.canWrite}
            onChanged={refresh}
          />
        )}
        {!brand && (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            Save a brand foundation before adding its sources.
          </p>
        )}
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (disabled || !brand || !valid) return;
            void action.execute(
              "save",
              () =>
                save({
                  data: {
                    ...scope,
                    brandId: brand.id,
                    ...(editing ? { id: editing.id, expectedRevision: editingRevision } : {}),
                    title: draft.title,
                    content: draft.content,
                    kind: draft.kind,
                    sourceUrl: draft.sourceUrl.trim() || null,
                    validUntil: draft.validUntil ? new Date(draft.validUntil).toISOString() : null,
                  },
                }),
              editing ? "Source updated" : "Source saved",
              () => {
                setDraft(emptyEvidence);
                setEditingId(null);
                setEditingRevision(undefined);
              },
            );
          }}
        >
          <fieldset disabled={disabled} className="space-y-4">
            <Field id="evidence-title" label="Source title" required>
              <Input
                id="evidence-title"
                value={draft.title}
                required
                maxLength={200}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="Product facts, current offer or campaign research"
              />
            </Field>
            <Field id="evidence-kind" label="Source type">
              <select
                id="evidence-kind"
                className={selectClass}
                value={draft.kind}
                onChange={(event) =>
                  setDraft({ ...draft, kind: event.target.value as EvidenceKind })
                }
              >
                {EVIDENCE_KINDS.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id="evidence-content"
              label="Facts or observation"
              required
              help={
                draft.kind === "competitor_ad"
                  ? "Ad content is an observation. It does not establish the competitor's sales or profit."
                  : "Use text you trust. Include enough detail to support a specific claim."
              }
            >
              <Textarea
                id="evidence-content"
                aria-describedby="evidence-content-help"
                value={draft.content}
                required
                minLength={3}
                maxLength={12000}
                rows={4}
                onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                placeholder="Paste the source material for this brand."
              />
            </Field>
            <Field
              id="evidence-url"
              label="Source link"
              help="Optional HTTP or HTTPS reference. The source title also identifies internal material."
            >
              <Input
                id="evidence-url"
                type="url"
                aria-describedby="evidence-url-help"
                value={draft.sourceUrl}
                maxLength={2000}
                onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })}
                placeholder="https://..."
              />
            </Field>
            <Field
              id="evidence-validity"
              label="Valid until"
              required={needsExpiry}
              help="Product and affiliate offers require an expiry. Enter your local time; saved dates are displayed in UTC."
            >
              <Input
                id="evidence-validity"
                aria-describedby="evidence-validity-help"
                type="datetime-local"
                value={draft.validUntil}
                required={needsExpiry}
                onChange={(event) => setDraft({ ...draft, validUntil: event.target.value })}
              />
            </Field>
          </fieldset>
          <ErrorBlock message={action.error} />
          <div className="flex flex-wrap justify-end gap-2">
            {editing && (
              <Button
                type="button"
                variant="ghost"
                disabled={!!action.pending}
                onClick={() => {
                  setEditingId(null);
                  setDraft(emptyEvidence);
                  action.clearError();
                }}
              >
                Cancel edit
              </Button>
            )}
            <Button type="submit" variant="outline" disabled={disabled || !valid}>
              {action.pending ? (
                <LoaderCircle className="animate-spin" />
              ) : editing ? (
                <Save />
              ) : (
                <Plus />
              )}
              {editing ? "Update source" : "Save source"}
            </Button>
          </div>
        </form>
        <div className="space-y-3 border-t pt-5">
          <h3 className="text-sm font-semibold">
            Saved sources{" "}
            <span className="font-normal text-muted-foreground">({evidence.length})</span>
          </h3>
          {!evidence.length ? (
            <p className="text-sm text-muted-foreground">
              Sources you save will appear here for use in campaign briefs.
            </p>
          ) : (
            evidence.map((item) => (
              <div key={item.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="break-words text-sm font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {EVIDENCE_KINDS.find((kind) => kind.value === item.kind)?.label ?? item.kind}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!access.canWrite || !!action.pending}
                    onClick={() => edit(item)}
                  >
                    Edit
                  </Button>
                </div>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                  {item.content}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {isExpired(item) ? (
                    <StateBadge value="stale" />
                  ) : (
                    <Badge variant="outline">
                      {item.validUntil ? "Dated source" : "No expiry set"}
                    </Badge>
                  )}
                  {sourceLink(item.sourceUrl) && (
                    <a
                      href={sourceLink(item.sourceUrl)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                    >
                      Source link
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Saved {displayDate(item.updatedAt)}
                  {item.validUntil && (
                    <>
                      <br />
                      Expires {displayDate(item.validUntil)}
                    </>
                  )}
                </p>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CampaignComposer({
  scope,
  brand,
  evidence,
  access,
  refresh,
  onSaved,
  campaign,
  onCancel,
}: {
  scope: GrowthScope;
  brand: Brand;
  evidence: Evidence[];
  access: Access;
  refresh: Refresh;
  onSaved: (campaign: Campaign) => void;
  campaign?: Campaign;
  onCancel: () => void;
}) {
  const save = useServerFn(saveGrowthCampaign);
  const action = useAction(refresh);
  const [title, setTitle] = useState(campaign?.title ?? "");
  const [objective, setObjective] = useState(campaign?.objective ?? "");
  const [channel, setChannel] = useState<Channel>(campaign?.channel ?? "social");
  const [locale, setLocale] = useState<Locale>(campaign?.locale ?? brand.locale);
  const [evidenceIds, setEvidenceIds] = useState<string[]>(campaign?.evidenceIds ?? []);
  const editingRevision = useRef(campaign?.revision);
  const validIds = evidenceIds.filter((id) =>
    evidence.some((item) => item.id === id && !isExpired(item)),
  );
  const disabled = !access.canWrite || !!action.pending;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plus className="h-4 w-4 text-primary" />
          {campaign ? "Edit campaign brief" : "New campaign brief"}
        </CardTitle>
        <CardDescription>Tell the writer what success should look like.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (disabled || !validIds.length) return;
            void action.execute(
              "save",
              () =>
                save({
                  data: {
                    ...scope,
                    ...(campaign
                      ? { id: campaign.id, expectedRevision: editingRevision.current }
                      : {}),
                    brandId: brand.id,
                    title,
                    objective,
                    channel,
                    locale,
                    evidenceIds: validIds,
                  },
                }),
              "Campaign brief saved",
              (saved) => {
                onSaved(saved);
                setTitle("");
                setObjective("");
                setEvidenceIds([]);
              },
            );
          }}
        >
          <fieldset className="space-y-4" disabled={disabled}>
            <Field id="campaign-title" label="Campaign name" required>
              <Input
                id="campaign-title"
                value={title}
                required
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Name this campaign"
              />
            </Field>
            <Field id="campaign-objective" label="What do you want to achieve?" required>
              <Textarea
                id="campaign-objective"
                value={objective}
                required
                minLength={5}
                maxLength={6000}
                rows={4}
                onChange={(event) => setObjective(event.target.value)}
                placeholder="Describe the audience, message and action you want people to take."
              />
            </Field>
            <Field id="campaign-channel" label="Format">
              <select
                id="campaign-channel"
                className={selectClass}
                value={channel}
                onChange={(event) => setChannel(event.target.value as Channel)}
              >
                {CHANNELS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="campaign-language" label="Output language">
              <select
                id="campaign-language"
                className={selectClass}
                value={locale}
                onChange={(event) => setLocale(event.target.value as Locale)}
              >
                {LANGUAGES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="space-y-3">
              <div>
                <Label>
                  Sources for this brief <span aria-hidden="true">*</span>
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose 1–20 current sources. Each variant must reference its evidence.
                </p>
              </div>
              {evidence.length ? (
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-2">
                  {evidence.map((item) => {
                    const expired = isExpired(item);
                    return (
                      <label
                        key={item.id}
                        className={cn(
                          "flex items-start gap-2.5 rounded-md p-2 text-sm",
                          expired ? "opacity-60" : "cursor-pointer hover:bg-muted",
                        )}
                      >
                        <Checkbox
                          checked={validIds.includes(item.id)}
                          disabled={
                            disabled ||
                            expired ||
                            (validIds.length >= 20 && !validIds.includes(item.id))
                          }
                          onCheckedChange={(checked) =>
                            setEvidenceIds((current) =>
                              checked === true
                                ? [...new Set([...current, item.id])]
                                : current.filter((id) => id !== item.id),
                            )
                          }
                          aria-label={`Use ${item.title}`}
                        />
                        <span className="min-w-0">
                          <span className="block break-words text-xs font-medium">
                            {item.title}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {expired
                              ? "Expired — update source first"
                              : item.validUntil
                                ? `Until ${displayDate(item.validUntil)}`
                                : "No expiry set"}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">
                  Add a source in Brand & sources before saving a campaign.
                </p>
              )}
            </div>
          </fieldset>
          <ErrorBlock message={action.error} />
          <Button
            type="submit"
            className="w-full"
            disabled={disabled || !title.trim() || objective.trim().length < 5 || !validIds.length}
          >
            {action.pending ? <LoaderCircle className="animate-spin" /> : <Save />}Save campaign
            brief
          </Button>
          {campaign && (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={!!action.pending}
              onClick={onCancel}
            >
              Cancel edit
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function CampaignGeneration({
  scope,
  campaign,
  brand,
  evidence,
  providers,
  access,
  refresh,
  runs,
  onGenerated,
  onReview,
  requestKeys,
  onEdit,
}: {
  scope: GrowthScope;
  campaign: Campaign;
  brand: Brand;
  evidence: Evidence[];
  providers: GrowthProviderView[];
  access: Access;
  refresh: Refresh;
  runs: Run[];
  onGenerated: (run: Run) => void;
  onReview: (id: string) => void;
  requestKeys: Map<string, string>;
  onEdit: () => void;
}) {
  const generate = useServerFn(generateGrowthCampaign);
  const action = useAction(refresh);
  const [writerId, setWriterId] = useState("");
  const [classifierId, setClassifierId] = useState("");
  const writers = providers.filter((provider) => provider.purpose === "writer");
  const classifiers = providers.filter((provider) => provider.purpose === "classifier");
  const writer = writers.find(
    (provider) => provider.id === writerId && provider.status === "ready",
  );
  const classifier = classifiers.find(
    (provider) => provider.id === classifierId && provider.status === "ready",
  );
  const missingEvidence = campaign.evidenceIds.some(
    (id) => !evidence.some((item) => item.id === id && !isExpired(item)),
  );
  const running = runs.some((run) => run.status === "running");
  const disabled = !access.canWrite || !!action.pending || running;
  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{campaign.title}</CardTitle>
            <CardDescription className="mt-1">
              Uses {brand.name}'s saved foundation and selected sources.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" disabled={disabled} onClick={onEdit}>
            Edit brief
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{campaign.objective}</p>
        <div className="flex flex-wrap gap-2">
          {campaign.evidenceIds.map((id) => (
            <Badge variant="outline" key={id} className="max-w-full whitespace-normal text-left">
              <BookOpen className="mr-1 h-3 w-3 shrink-0" />
              {evidence.find((item) => item.id === id)?.title ?? "Source unavailable"}
            </Badge>
          ))}
        </div>
        {missingEvidence && (
          <ErrorBlock
            title="Update this brief's sources"
            message="At least one selected source is expired or unavailable. Update the source before generating content."
          />
        )}
        <div className="grid gap-4 rounded-xl bg-muted/50 p-4 sm:grid-cols-2">
          <Field
            id="campaign-writer"
            label="Writer"
            required
            help="Choose the configured provider and model for this generation."
          >
            <select
              id="campaign-writer"
              className={selectClass}
              value={writerId}
              disabled={disabled}
              onChange={(event) => {
                setWriterId(event.target.value);
                requestKeys.delete(campaign.id);
              }}
            >
              <option value="">Select a writer</option>
              {writers.map((provider) => (
                <option
                  key={provider.id}
                  value={provider.id}
                  disabled={provider.status !== "ready"}
                >
                  {provider.label} · {provider.model}
                  {provider.status !== "ready" ? " (setup needed)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="campaign-classifier"
            label="Classifier (optional)"
            help="Adds configured classification to the recorded content checks."
          >
            <select
              id="campaign-classifier"
              className={selectClass}
              value={classifierId}
              disabled={disabled}
              onChange={(event) => {
                setClassifierId(event.target.value);
                requestKeys.delete(campaign.id);
              }}
            >
              <option value="">Standard checks only</option>
              {classifiers.map((provider) => (
                <option
                  key={provider.id}
                  value={provider.id}
                  disabled={provider.status !== "ready"}
                >
                  {provider.label} · {provider.model}
                  {provider.status !== "ready" ? " (setup needed)" : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {!writers.some((provider) => provider.status === "ready") && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>A writer needs to be configured</AlertTitle>
            <AlertDescription>
              Ask your workspace or platform administrator to configure an AI writer connection for
              this product and workspace.
            </AlertDescription>
          </Alert>
        )}
        <ErrorBlock title="Content generation did not finish" message={action.error} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
            Content is saved for human review. Generation uses the selected provider and may incur
            provider charges.
          </p>
          <Button
            disabled={disabled || !writer || (!!classifierId && !classifier) || missingEvidence}
            onClick={() => {
              if (!writer || disabled) return;
              const requestKey = requestKeys.get(campaign.id) ?? crypto.randomUUID();
              requestKeys.set(campaign.id, requestKey);
              void action.execute(
                "generate",
                () =>
                  generate({
                    data: {
                      ...scope,
                      campaignId: campaign.id,
                      writerBindingId: writer.id,
                      classifierBindingId: classifier?.id ?? null,
                      requestKey,
                    },
                  }),
                "Generation result saved",
                (saved) => {
                  requestKeys.delete(campaign.id);
                  onGenerated(saved);
                },
              );
            }}
          >
            {action.pending || running ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
            {running
              ? "Generation in progress"
              : action.pending
                ? "Generating content…"
                : "Generate content"}
          </Button>
        </div>
        {runs.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-semibold">Previous generations</h3>
            {runs.slice(0, 4).map((run) => (
              <button
                key={run.id}
                onClick={() => onReview(run.id)}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg p-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-xs text-muted-foreground">{displayDate(run.createdAt)}</span>
                <span className="flex items-center gap-2">
                  <StateBadge value={run.status} />
                  <ChevronRight className="h-4 w-4" />
                </span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function parseResult(value: unknown): GrowthResult | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("output" in value) ||
    !("checks" in value) ||
    !("provider" in value)
  )
    return null;
  const parsed = growthOutputSchema.safeParse(value.output);
  if (
    !parsed.success ||
    !Array.isArray(value.checks) ||
    !value.provider ||
    typeof value.provider !== "object"
  )
    return null;
  const entries: unknown[] = value.checks;
  const checks = entries.filter((check): check is GrowthCheck => {
    if (!check || typeof check !== "object") return false;
    const entry = check as Record<string, unknown>;
    return (
      typeof entry.key === "string" &&
      typeof entry.label === "string" &&
      typeof entry.status === "string" &&
      ["pass", "review", "fail"].includes(entry.status) &&
      typeof entry.detail === "string"
    );
  });
  // Never silently drop a malformed check and then offer approval.
  if (
    !checks.length ||
    checks.length !== entries.length ||
    !("providerKey" in value.provider) ||
    typeof value.provider.providerKey !== "string" ||
    !("model" in value.provider) ||
    typeof value.provider.model !== "string"
  )
    return null;
  const provider = value.provider as GrowthResult["provider"];
  return { output: parsed.data, checks, provider };
}

function RunReview({
  scope,
  run,
  brand,
  campaign,
  evidence,
  access,
  refresh,
}: {
  scope: GrowthScope;
  run: Run;
  brand?: Brand;
  campaign?: Campaign;
  evidence: Evidence[];
  access: Access;
  refresh: Refresh;
}) {
  const review = useServerFn(reviewGrowthRun);
  const handoff = useServerFn(handoffGrowthRun);
  const action = useAction(refresh);
  const [note, setNote] = useState("");
  const result = parseResult(run.result);
  const language = run.inputSnapshot.campaign.locale;
  const usedEvidence = run.inputSnapshot.evidence;
  const staleInputs =
    brand?.revision !== run.inputSnapshot.brand.revision ||
    campaign?.revision !== run.inputSnapshot.campaign.revision ||
    usedEvidence.some(
      (item) =>
        isExpired(item) ||
        evidence.find((current) => current.id === item.id)?.revision !== item.revision,
    );
  const hasHandoff = !!run.marketingCampaignId && !!run.creativeBriefId;
  const canReview =
    access.canReview &&
    run.status === "completed" &&
    run.reviewStatus === "pending" &&
    !!result &&
    !action.pending &&
    !staleInputs;
  const canApprove = canReview && !result?.checks.some((check) => check.status === "fail");
  const canHandoff =
    access.canHandoff &&
    run.status === "completed" &&
    run.reviewStatus === "approved" &&
    !!result &&
    !hasHandoff &&
    !action.pending &&
    !staleInputs;
  return (
    <div className="min-w-0 space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">{campaign?.title ?? "Campaign generation"}</CardTitle>
              <CardDescription className="mt-1">
                Generated {displayDate(run.createdAt)}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <StateBadge value={run.status} />
              <StateBadge value={run.reviewStatus} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {run.status === "running" && (
            <div className="flex items-center gap-3 rounded-lg bg-primary-soft p-4 text-sm">
              <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
              <p>
                The selected writer is working. This view checks for the saved result automatically.
              </p>
            </div>
          )}
          <ErrorBlock
            title={
              run.status === "stale" || staleInputs
                ? "This result needs to be regenerated"
                : "Generation needs attention"
            }
            message={
              run.error ||
              (run.status === "stale" || staleInputs
                ? "The brand or brief has changed, or a source has changed or expired. Review the current inputs and generate a new result before approval or handoff."
                : null)
            }
          />
          {run.status === "completed" && !result && (
            <ErrorBlock
              title="Content is unavailable"
              message="The saved result could not be read. Approval and handoff are unavailable until a valid result is generated."
            />
          )}
          {result && (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Campaign angle
                </p>
                <h3
                  className="mt-2 text-lg font-semibold"
                  dir={language === "ur" ? "rtl" : "ltr"}
                  lang={language}
                >
                  {result.output.angle}
                </h3>
                <p
                  className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground"
                  dir={language === "ur" ? "rtl" : "ltr"}
                  lang={language}
                >
                  {result.output.rationale}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-xs text-muted-foreground">
                <span>
                  Writer: {result.provider.providerKey || run.providerKey} ·{" "}
                  {result.provider.model || run.model}
                </span>
                <span>{LANGUAGES.find((item) => item.value === language)?.label}</span>
                {typeof result.provider.usage?.inputTokens === "number" && (
                  <span>
                    {result.provider.usage.inputTokens.toLocaleString("en-GB")} input tokens
                  </span>
                )}
                {typeof result.provider.usage?.outputTokens === "number" && (
                  <span>
                    {result.provider.usage.outputTokens.toLocaleString("en-GB")} output tokens
                  </span>
                )}
              </div>
              <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">Run reference</span>
                  <CopyContent text={run.id} label="Copy run ID" />
                </div>
                <code className="block select-all break-all text-xs">{run.id}</code>
                {["merqora", "affivon"].includes(scope.productKey) && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Use this ID in the product's Growth connection to retrieve the approved draft.
                    The receiving application checks its saved workspace and brand mapping; only
                    approved, current output can be imported.
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      {result && (
        <>
          <div className="space-y-4">
            {result.output.variants.map((variant, index) => (
              <Card key={`${variant.key}:${index}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-sm">
                      Variant {index + 1}
                      <span className="ml-2 font-normal text-muted-foreground">{variant.key}</span>
                    </CardTitle>
                    <CopyContent
                      text={[
                        variant.headline,
                        variant.body,
                        variant.callToAction,
                        variant.disclosure,
                        variant.hashtags.join(" "),
                      ]
                        .filter(Boolean)
                        .join("\n\n")}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div
                    className="rounded-xl border bg-background p-5"
                    dir={language === "ur" ? "rtl" : "ltr"}
                    lang={language}
                  >
                    <h3 className="break-words text-lg font-semibold">{variant.headline}</h3>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">
                      {variant.body}
                    </p>
                    <p className="mt-4 text-sm font-semibold">{variant.callToAction}</p>
                    {variant.hashtags.length > 0 && (
                      <p className="mt-3 break-words text-sm text-primary">
                        {variant.hashtags.join(" ")}
                      </p>
                    )}
                    {variant.disclosure && (
                      <p className="mt-4 whitespace-pre-wrap border-t pt-3 text-xs leading-relaxed text-muted-foreground">
                        {variant.disclosure}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      Referenced sources
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {variant.evidenceIds.map((id) => (
                        <Badge
                          key={id}
                          variant="outline"
                          className="max-w-full whitespace-normal break-words text-left"
                        >
                          {usedEvidence.find((item) => item.id === id)?.title ?? id}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <details className="rounded-xl border bg-card p-5 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold">
              Source snapshots used for this result{" "}
              <span className="font-normal text-muted-foreground">({usedEvidence.length})</span>
            </summary>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              These are the saved source versions the writer received, even if a source has since
              been edited.
            </p>
            <div className="mt-4 space-y-3">
              {usedEvidence.map((item) => (
                <div key={item.id} className="rounded-lg border p-3">
                  <h4 className="text-sm font-medium">{item.title}</h4>
                  <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
                    {item.content}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>Revision {item.revision}</span>
                    <span>Saved {displayDate(item.updatedAt)}</span>
                    {item.validUntil && <span>Valid until {displayDate(item.validUntil)}</span>}
                    {sourceLink(item.sourceUrl) && (
                      <a
                        href={sourceLink(item.sourceUrl)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                      >
                        Source reference
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
                    {item.id}
                  </p>
                </div>
              ))}
            </div>
          </details>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Review checks
              </CardTitle>
              <CardDescription>
                Checks help your review. They are not a guarantee of accuracy or compliance.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {result.checks.length ? (
                result.checks.map((check) => (
                  <div key={check.key} className="flex items-start gap-3 rounded-lg border p-3">
                    {check.status === "pass" ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    ) : (
                      <AlertCircle
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          check.status === "fail" ? "text-destructive" : "text-warning-foreground",
                        )}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{check.label}</p>
                        <StateBadge value={check.status} />
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
                        {check.detail}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No check results were recorded.</p>
              )}
              {result.output.warnings.length > 0 && (
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                  <h4 className="text-sm font-medium">Writer notes to review</h4>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed">
                    {result.output.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Palette className="h-4 w-4 text-primary" />
                Creative direction
              </CardTitle>
              <CardDescription>
                The production brief that will move into Creative Studio.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p
                className="whitespace-pre-wrap text-sm leading-relaxed"
                dir={language === "ur" ? "rtl" : "ltr"}
                lang={language}
              >
                {result.output.creativeBrief.direction}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.output.creativeBrief.assetTypes.map((type) => (
                  <Badge key={type} variant="outline" className="capitalize">
                    {type.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-base">Human review & draft handoff</CardTitle>
          <CardDescription>
            Approval applies to this saved result. Handoff creates drafts for the next stage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ErrorBlock title="Review action did not complete" message={action.error} />
          {run.reviewStatus === "pending" && run.status === "completed" && (
            <>
              <Field
                id="review-note"
                label="Review note"
                help="Record changes needed or why the content is approved."
              >
                <Textarea
                  id="review-note"
                  aria-describedby="review-note-help"
                  value={note}
                  maxLength={3000}
                  rows={3}
                  disabled={!access.canReview || !!action.pending}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="What should the team know about this decision?"
                />
              </Field>
              {!access.canReview && (
                <p className="text-xs text-muted-foreground">
                  Your workspace role does not allow review decisions.
                </p>
              )}
              {result?.checks.some((check) => check.status === "fail") && (
                <p className="text-xs text-destructive">
                  A check failed. Resolve the underlying issue and generate a new result before
                  approval.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!canApprove}
                  onClick={() =>
                    action.execute(
                      "approve",
                      () =>
                        review({
                          data: {
                            ...scope,
                            runId: run.id,
                            expectedRevision: run.revision,
                            decision: "approved",
                            note,
                          },
                        }),
                      "Content approved",
                    )
                  }
                >
                  {action.pending === "approve" ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Check />
                  )}
                  Approve this result
                </Button>
                <Button
                  variant="outline"
                  disabled={!canReview}
                  onClick={() =>
                    action.execute(
                      "reject",
                      () =>
                        review({
                          data: {
                            ...scope,
                            runId: run.id,
                            expectedRevision: run.revision,
                            decision: "rejected",
                            note,
                          },
                        }),
                      "Content rejected",
                    )
                  }
                >
                  {action.pending === "reject" ? <LoaderCircle className="animate-spin" /> : <X />}
                  Reject
                </Button>
              </div>
            </>
          )}
          {run.reviewStatus !== "pending" && (
            <div className="flex items-start gap-3 rounded-lg bg-muted/60 p-3">
              <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium capitalize">
                  {run.reviewStatus}{" "}
                  {run.reviewedAt && (
                    <span className="font-normal text-muted-foreground">
                      · {displayDate(run.reviewedAt)}
                    </span>
                  )}
                </p>
                {run.note && (
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {run.note}
                  </p>
                )}
                {run.reviewStatus === "rejected" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Update the source material or brief and generate a new result.
                  </p>
                )}
              </div>
            </div>
          )}
          {hasHandoff ? (
            <div className="space-y-3 rounded-lg border border-success/25 bg-success/5 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Campaign and Creative Studio drafts created
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/app/campaigns">
                      Open Campaigns
                      <ArrowRight />
                    </Link>
                  </Button>
                  <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
                    {run.marketingCampaignId}
                  </p>
                </div>
                <div>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/app/creative-studio">
                      Open Creative Studio
                      <ArrowRight />
                    </Link>
                  </Button>
                  <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
                    {run.creativeBriefId}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                These are saved drafts. No messages or posts have been published by this handoff.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div className="max-w-md space-y-2">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {run.reviewStatus === "approved"
                    ? "Move approved content into a campaign draft and its production brief into Creative Studio."
                    : "Once approved, create the campaign and Creative Studio drafts from this result."}
                </p>
                {!access.canHandoff && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Handoff requires an owner or administrator and Creative Studio enabled for this
                    workspace. Ask your workspace or platform administrator to arrange access.
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                disabled={!canHandoff}
                onClick={() =>
                  action.execute(
                    "handoff",
                    () =>
                      handoff({
                        data: { ...scope, runId: run.id, expectedRevision: run.revision },
                      }),
                    "Campaign and Creative Studio drafts created",
                  )
                }
              >
                {action.pending === "handoff" ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <ArrowRight />
                )}
                Create both drafts
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CopyContent({ text, label = "Copy text" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          toast.error(
            "Clipboard access is unavailable. You can select and copy the text directly.",
          );
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : label}
    </Button>
  );
}
