import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ClipboardList,
  Layers3,
  LoaderCircle,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { GROWTH_PRODUCTS, type GrowthScope } from "./studio.contract";
import type { GrowthSetup, GrowthSetupRequest, SaveGrowthWriterInput } from "./setup.contract";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const WRITERS = [
  { key: "ai.openai", label: "OpenAI", suffix: "OPENAI" },
  { key: "ai.anthropic", label: "Claude", suffix: "ANTHROPIC" },
  { key: "ai.gemini", label: "Gemini", suffix: "GEMINI" },
] as const;

function date(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not recorded";
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value)) + " UTC"
  );
}

type SetupActions = {
  includeCreative: boolean;
  onIncludeCreativeChange: (value: boolean) => void;
  pending: string | null;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onRequest: (note: string) => void;
  onDecision: (
    request: GrowthSetupRequest,
    decision: "approved" | "rejected",
    note: string,
  ) => void;
  onSaveWriter: (input: Omit<SaveGrowthWriterInput, keyof GrowthScope>) => void;
};

// Pure view, also used by the visual verification fixture. It has no auth bypass
// or demonstration mode in the application route.
export function GrowthSetupView({
  setup,
  initiallyOpen,
  ...actions
}: {
  setup: GrowthSetup;
  initiallyOpen: boolean;
} & SetupActions) {
  const [open, setOpen] = useState(initiallyOpen);
  const [note, setNote] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [providerKey, setProviderKey] = useState<SaveGrowthWriterInput["providerKey"]>("ai.openai");
  const [model, setModel] = useState("");
  const [maxOutputTokens, setMaxOutputTokens] = useState(2048);
  const ready = setup.providers.filter(
    (provider) => provider.purpose === "writer" && provider.status === "ready",
  );
  const writer = WRITERS.find((item) => item.key === providerKey)!;
  const secretName = `OQ_SECRET_GROWTH_${setup.tenant.id.replaceAll("-", "").toUpperCase()}_${setup.product.key.toUpperCase()}_${writer.suffix}`;
  const productName =
    GROWTH_PRODUCTS.find((item) => item.key === setup.product.key)?.name ?? setup.product.name;
  const busy = !!actions.pending;
  const waiting = setup.request?.status === "requested";
  const history = setup.history.filter((item) => item.id !== setup.request?.id);
  const missingServices = setup.services.filter((service) => !service.active);
  const readyForDrafts = setup.access.canWrite && ready.length > 0;
  const canRequest = setup.permissions.canRequest && !waiting && !busy;

  return (
    <section
      className="overflow-hidden rounded-xl border bg-card shadow-sm"
      aria-label="Growth workspace setup"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="growth-setup-content"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="rounded-xl bg-primary-soft p-2.5 text-primary">
            <Settings2 className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-semibold">Workspace setup</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              {readyForDrafts
                ? "Access and a writer are configured. Start with a brand and current sources."
                : "Activate access, choose a writer and check your product connection."}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Badge variant={readyForDrafts ? "default" : "outline"} className="hidden sm:inline-flex">
            {readyForDrafts
              ? "Ready to request drafts"
              : waiting
                ? "Activation requested"
                : "Setup needed"}
          </Badge>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </span>
      </button>

      {open && (
        <div id="growth-setup-content" className="space-y-6 border-t bg-muted/10 p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <ReadinessItem
              icon={Layers3}
              title={`${productName} access`}
              ready={setup.access.allowed}
              detail={
                setup.access.allowed
                  ? "Product and Campaigns are active"
                  : setup.access.reason || "Activation needed"
              }
            />
            <ReadinessItem
              icon={Sparkles}
              title="AI writer"
              ready={ready.length > 0}
              detail={
                ready.length
                  ? `${ready.length} configured ${ready.length === 1 ? "writer" : "writers"}; live request not yet verified here`
                  : "Save a model and add its scoped server credential"
              }
            />
            <ReadinessItem
              icon={ShieldCheck}
              title="Creative handoff"
              ready={setup.access.canHandoff}
              detail={
                setup.access.canHandoff
                  ? "Your role and Creative access allow draft handoff"
                  : "Requires Creative access and an owner or administrator"
              }
            />
          </div>

          {actions.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Setup action needs attention</AlertTitle>
              <AlertDescription className="break-words">{actions.error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-4 rounded-xl border bg-background p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Access through SaaS Factory</h3>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                A workspace owner or administrator can request access. A platform administrator
                reviews the exact product and services below.
              </p>
              {!setup.permissions.reviewAvailable && (
                <Alert>
                  <ShieldCheck className="h-4 w-4" />
                  <AlertTitle>Platform review needs an administrator</AlertTitle>
                  <AlertDescription>
                    An operator must assign an existing user as a platform administrator through the
                    platform's access-management process. You can save an activation request while
                    that is arranged.
                  </AlertDescription>
                </Alert>
              )}

              <label className="flex items-start gap-3 rounded-lg bg-muted/60 p-3 text-sm">
                <Checkbox
                  checked={actions.includeCreative}
                  disabled={busy || waiting}
                  onCheckedChange={(value) => actions.onIncludeCreativeChange(value === true)}
                  aria-label="Include Creative Studio handoff"
                />
                <span>
                  <span className="block font-medium">Include Creative Studio handoff</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    Adds Creative Studio and the services it requires to the activation request.
                  </span>
                </span>
              </label>

              <ul className="divide-y rounded-lg border" aria-label="Required services">
                {setup.services.map((service) => (
                  <li
                    key={service.key}
                    className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm"
                  >
                    <span>
                      <span className="block font-medium">{service.name}</span>
                      {service.validUntil && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Current access until {date(service.validUntil)}
                        </span>
                      )}
                    </span>
                    <Badge variant="outline" className="shrink-0">
                      {service.active ? "Active" : service.status || "Not enabled"}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Existing valid access keeps its current end date. A request does not start a
                subscription or grant access by itself.
              </p>

              {setup.blockers.length > 0 && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Before activation</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc space-y-1 pl-4">
                      {setup.blockers.map((blocker) => (
                        <li key={blocker.code}>{blocker.message}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {setup.request ? (
                <div className="space-y-3 rounded-lg border border-primary/20 bg-primary-soft/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <Clock3 className="h-4 w-4" />
                      Activation requested
                    </span>
                    <Badge variant="outline">Awaiting review</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Submitted {date(setup.request.createdAt)} ·{" "}
                    {setup.request.includeCreative ? "Campaigns and Creative handoff" : "Campaigns"}
                  </p>
                  {setup.request.note && (
                    <p className="whitespace-pre-wrap break-words text-sm">{setup.request.note}</p>
                  )}
                  {setup.permissions.canDecide && (
                    <div className="space-y-3 border-t pt-3">
                      <div className="space-y-2">
                        <Label htmlFor="growth-decision-note">Decision note</Label>
                        <Textarea
                          id="growth-decision-note"
                          value={decisionNote}
                          maxLength={1000}
                          rows={3}
                          disabled={busy}
                          onChange={(event) => setDecisionNote(event.target.value)}
                          placeholder="Explain the approval or any work needed before activation."
                        />
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Approval activates the eligible services recorded in this request. Existing
                        suspensions, expiry and external product verification are checked again
                        before anything changes.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={busy || setup.blockers.length > 0}
                          onClick={() =>
                            actions.onDecision(setup.request!, "approved", decisionNote)
                          }
                        >
                          {actions.pending === "approved" ? (
                            <LoaderCircle className="animate-spin" />
                          ) : (
                            <ShieldCheck />
                          )}
                          Approve activation
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            actions.onDecision(setup.request!, "rejected", decisionNote)
                          }
                        >
                          Decline request
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : setup.permissions.canRequest ? (
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    actions.onRequest(note);
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="growth-activation-note">
                      Activation note{" "}
                      <span className="font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <Textarea
                      id="growth-activation-note"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      maxLength={1000}
                      rows={2}
                      disabled={busy}
                      placeholder="What this workspace will use Growth for."
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={!canRequest || (setup.access.allowed && missingServices.length === 0)}
                  >
                    {actions.pending === "request" ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <ClipboardList />
                    )}
                    Request activation
                  </Button>
                </form>
              ) : (
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                  A workspace owner or administrator can submit the activation request.
                </p>
              )}

              {history.length > 0 && (
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Recent activation history ({history.length})
                  </summary>
                  <ul className="mt-3 space-y-3">
                    {history.map((request) => (
                      <li key={request.id} className="space-y-1 border-t pt-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium capitalize">{request.status}</span>
                          <span className="text-muted-foreground">
                            {date(request.decidedAt || request.createdAt)}
                          </span>
                        </div>
                        {request.decisionNote && (
                          <p className="whitespace-pre-wrap break-words text-muted-foreground">
                            {request.decisionNote}
                          </p>
                        )}
                        {request.receipt && (
                          <p className="text-muted-foreground">
                            {request.receipt.servicesActivated.length} services activated ·{" "}
                            {request.receipt.servicesPreserved.length} existing services preserved
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

            <div className="space-y-4 rounded-xl border bg-background p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Writer configuration</h3>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Choose a provider and the model available to your account. Settings apply only to{" "}
                {productName} in {setup.tenant.name}.
              </p>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  actions.onSaveWriter({ providerKey, model, maxOutputTokens });
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="growth-writer-provider">Provider</Label>
                    <select
                      id="growth-writer-provider"
                      className={selectClass}
                      value={providerKey}
                      disabled={!setup.permissions.canConfigure || busy}
                      onChange={(event) => {
                        setProviderKey(event.target.value as SaveGrowthWriterInput["providerKey"]);
                        setModel("");
                      }}
                    >
                      {WRITERS.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="growth-writer-model">Model ID</Label>
                    <Input
                      id="growth-writer-model"
                      required
                      minLength={2}
                      maxLength={161}
                      autoComplete="off"
                      value={model}
                      disabled={!setup.permissions.canConfigure || busy}
                      onChange={(event) => setModel(event.target.value)}
                      placeholder="Model ID from your provider"
                    />
                  </div>
                </div>
                <div className="max-w-xs space-y-2">
                  <Label htmlFor="growth-writer-limit">Maximum output tokens</Label>
                  <Input
                    id="growth-writer-limit"
                    type="number"
                    min={512}
                    max={4096}
                    step={1}
                    required
                    value={maxOutputTokens}
                    disabled={!setup.permissions.canConfigure || busy}
                    onChange={(event) => setMaxOutputTokens(Number(event.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Limits the length of each response, from 512 to 4,096 tokens.
                  </p>
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  disabled={!setup.permissions.canConfigure || busy || model.trim().length < 2}
                >
                  {actions.pending === "writer" ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Settings2 />
                  )}
                  Save writer settings
                </Button>
              </form>

              {setup.permissions.canConfigure && (
                <details className="rounded-lg border bg-muted/40 p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Server credential setup
                  </summary>
                  <div className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
                    <p>
                      An operator adds the provider API key to the application server's secret store
                      under this exact name:
                    </p>
                    <code className="block select-all break-all rounded bg-background p-2 text-foreground">
                      {secretName}
                    </code>
                    <p>
                      Save the writer settings, add the secret securely, then refresh. A disabled
                      connection must be reviewed by an administrator before it can be used.
                    </p>
                  </div>
                </details>
              )}

              <div className="space-y-3 border-t pt-4">
                <h4 className="text-sm font-semibold">Saved connections</h4>
                {setup.providers.length ? (
                  setup.providers.map((provider) => (
                    <div key={provider.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium">{provider.label}</span>
                        <Badge variant="outline">
                          {provider.status === "ready" ? "Ready to request" : "Setup needed"}
                        </Badge>
                      </div>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {provider.model || "No model saved"} ·{" "}
                        {provider.purpose === "writer" ? "Writer" : "Optional assessment"}
                      </p>
                      {provider.reason && (
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                          {provider.reason}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No writer has been configured for this product.
                  </p>
                )}
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Ready to request confirms configuration and credential presence. The first saved
                  generation establishes whether the provider accepts the request.
                </p>
              </div>

              {setup.product.key !== "omniqora" && (
                <div className="space-y-2 border-t pt-4">
                  <h4 className="text-sm font-semibold">{productName} connection</h4>
                  <Badge variant="outline">
                    {setup.connection.verified
                      ? "Product connection verified"
                      : "Verification required"}
                  </Badge>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {setup.connection.verified
                      ? `Last verification: ${date(setup.connection.lastVerifiedAt)}. Growth evidence and export still require a scoped adapter credential.`
                      : "The product must be bound to this workspace and verified through SaaS Factory before external product access can be activated."}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="max-w-2xl text-xs text-muted-foreground">
              Changes are scoped to this workspace and product. Activation decisions and generation
              approvals are recorded separately.
            </p>
            <Button
              variant="ghost"
              size="sm"
              disabled={actions.refreshing || busy}
              onClick={actions.onRefresh}
            >
              <RefreshCw className={cn("h-4 w-4", actions.refreshing && "animate-spin")} />
              Refresh setup
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function ReadinessItem({
  icon: Icon,
  title,
  ready,
  detail,
}: {
  icon: typeof Layers3;
  title: string;
  ready: boolean;
  detail: string;
}) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </span>
        {ready ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Ready" />
        ) : (
          <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Setup needed" />
        )}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}
