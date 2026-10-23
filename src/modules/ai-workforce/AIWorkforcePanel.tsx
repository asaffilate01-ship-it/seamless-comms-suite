import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Bot, Cable, CheckCircle2,
  ClipboardList, Clock3, FileText, LockKeyhole, Pause, Play, Plus,
  RefreshCw, Rocket, Save, ShieldCheck, Users, Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, StatusBadge } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTenant } from "@/hooks/useTenant";
import { getTenantControlPlane } from "@/lib/control-plane.functions";
import { agentsForProduct, agentForProduct, type AgentBlueprint } from "@/modules/agent-factory/catalogue";
import {
  createAiEmployeeDraft, getAiWorkforceWorkspace, previewAiEmployee,
  saveAiEmployeeProfile, transitionAiEmployee,
  type AiEmployee, type WorkforceProfile, type WorkforceStatus,
} from "./functions";
import { AIWorkforceTaskPanel } from "./AIWorkforceTaskPanel";
import { AIWorkforceTeamsPanel } from "./AIWorkforceTeamsPanel";

const steps = [
  "Create", "Role", "Tasks", "Business context", "Connected apps",
  "Instructions", "Workflow", "Safe preview", "Review", "Manage",
] as const;
const checkNames: Record<string, string> = {
  goal_present: "Defined goal",
  tasks_present: "Assigned responsibilities",
  instructions_recorded: "Written instructions",
  independent_review: "Independent approval",
  live_connectors_verified: "Live connector clearance",
  worker_execution_verified: "Verified execution worker",
};

type Draft = {
  blueprintKey: string;
  displayName: string;
  roleTitle: string;
  goal: string;
  tasksText: string;
  businessContext: string;
  instructions: string;
  sopRefsText: string;
  selectedCapabilities: string[];
  triggerType: WorkforceProfile["trigger"]["type"];
  triggerValue: string;
};
function blankDraft(blueprint?: AgentBlueprint): Draft {
  return {
    blueprintKey: blueprint?.key ?? "custom.ai-employee",
    displayName: "",
    roleTitle: blueprint?.name ?? "AI Operations Assistant",
    goal: blueprint?.suggestedGoal ?? "",
    tasksText: blueprint?.purpose ?? "",
    businessContext: "",
    instructions: blueprint?.humanReview ?? "Prepare drafts and require approval before external actions.",
    sopRefsText: "",
    selectedCapabilities: [],
    triggerType: "manual",
    triggerValue: "",
  };
}
function draftFromEmployee(e: AiEmployee, blueprint?: AgentBlueprint): Draft {
  const p = e.profile as Partial<WorkforceProfile>;
  return {
    ...blankDraft(blueprint),
    blueprintKey: e.blueprint_key,
    displayName: e.display_name,
    roleTitle: e.role_title,
    goal: p.goal ?? "",
    tasksText: p.tasks?.join("\n") ?? "",
    businessContext: p.businessContext ?? "",
    instructions: p.instructions ?? "",
    sopRefsText: p.sopRefs?.join("\n") ?? "",
    selectedCapabilities: p.capabilities ?? [],
    triggerType: p.trigger?.type ?? "manual",
    triggerValue: p.trigger?.value ?? "",
  };
}
function splitLines(text: string): string[] {
  return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}
function statusText(status: WorkforceStatus) {
  const labels: Record<WorkforceStatus, string> = {
    draft: "Draft",
    pending_review: "Awaiting independent review",
    approved_configuration: "Configuration approved — not executing",
    paused: "Paused — no execution",
    retired: "Retired",
  };
  return labels[status];
}

export function AIWorkforcePanel() {
  const tenant = useTenant();
  const tenantId = tenant.tenantId ?? "";
  const getTenantFn = useServerFn(getTenantControlPlane);
  const getFn = useServerFn(getAiWorkforceWorkspace);
  const createFn = useServerFn(createAiEmployeeDraft);
  const saveFn = useServerFn(saveAiEmployeeProfile);
  const transitionFn = useServerFn(transitionAiEmployee);
  const previewFn = useServerFn(previewAiEmployee);
  const tenantQuery = useQuery({
    queryKey: ["ai-workforce-products", tenantId],
    queryFn: () => getTenantFn({ data: { tenantId } }),
    enabled: !!tenantId, retry: false,
  });
  const products = (tenantQuery.data?.products ?? [])
    .filter((p: { product_key: string; status: string }) => p.status === "active")
    .map((p: { product_key: string }) => p.product_key);
  const [productKey, setProductKey] = useState("");
  useEffect(() => {
    if (products.length && !products.includes(productKey)) setProductKey(products[0]);
  }, [products.join("|"), productKey]);
  const workspace = useQuery({
    queryKey: ["ai-workforce", tenantId, productKey],
    queryFn: () => getFn({ data: { tenantId, productKey } }),
    enabled: !!tenantId && !!productKey, retry: false,
  });
  const blueprints = useMemo(() => productKey ? agentsForProduct(productKey) : [], [productKey]);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const employees = workspace.data?.employees ?? [];
  const selected = employees.find(e => e.id === employeeId) ?? null;
  const latestPreview = workspace.data?.previews.find(p => p.employee_id === employeeId);
  const lastEvents = (workspace.data?.events ?? []).filter(e => e.employee_id === employeeId).slice(0, 8);
  const lastRuns = (workspace.data?.runs ?? []).filter(r => r.ai_employee_id === employeeId).slice(0, 6);
  const blueprint = agentForProduct(productKey, draft.blueprintKey);
  const writable = !!workspace.data?.enabled && !!workspace.data?.productActive;
  const canEdit = !selected || selected.status !== "retired";
  const tasksReady = splitLines(draft.tasksText);
  const readyToSave = draft.displayName.trim().length >= 3 &&
    draft.roleTitle.trim().length >= 3 &&
    draft.goal.trim().length >= 10 && draft.goal.trim().length <= 1500 &&
    tasksReady.length > 0 && tasksReady.length <= 20 &&
    tasksReady.every(task => task.length >= 4 && task.length <= 350) &&
    draft.businessContext.length <= 6000 && draft.instructions.length <= 6000 &&
    splitLines(draft.sopRefsText).every(ref => ref.length >= 3 && ref.length <= 300) &&
    (draft.triggerType !== "event" || /^[a-z0-9][a-z0-9._-]{2,119}$/.test(draft.triggerValue));
  const configuredCount = employees.filter(e => e.status === "approved_configuration").length;
  const pendingCount = employees.filter(e => e.status === "pending_review").length;

  function change(patch: Partial<Draft>) {
    setDraft(current => ({ ...current, ...patch }));
    setDirty(true);
  }
  function beginNew(item?: AgentBlueprint) {
    setEmployeeId(null);
    setDraft(blankDraft(item));
    setDirty(true);
    setStep(0);
    setWizardOpen(true);
    setReviewNote("");
  }
  function beginEdit(e: AiEmployee) {
    setEmployeeId(e.id);
    setDraft(draftFromEmployee(e, agentForProduct(e.product_key, e.blueprint_key)));
    setDirty(false);
    setStep(0);
    setWizardOpen(true);
    setReviewNote("");
  }
  function switchProduct(key: string) {
    setProductKey(key);
    setEmployeeId(null);
    setWizardOpen(false);
    setStep(0);
  }
  function profileData(): WorkforceProfile {
    return {
      goal: draft.goal.trim(),
      tasks: splitLines(draft.tasksText),
      businessContext: draft.businessContext,
      instructions: draft.instructions,
      sopRefs: splitLines(draft.sopRefsText),
      capabilities: draft.selectedCapabilities,
      trigger: { type: draft.triggerType, value: draft.triggerValue, enabled: false },
    };
  }
  async function persist(): Promise<string> {
    if (!writable || !productKey) throw new Error("Activate the AI Workforce add-on for this tenant/product first.");
    if (!readyToSave) throw new Error("Complete the name, role, goal and at least one valid task before saving.");
    if (selected?.status === "retired") throw new Error("A retired employee is read-only.");
    let id = employeeId;
    if (!id) {
      id = await createFn({ data: {
        tenantId, productKey, blueprintKey: draft.blueprintKey,
        displayName: draft.displayName.trim(), roleTitle: draft.roleTitle.trim(),
      } });
      setEmployeeId(id);
    }
    if (dirty || !selected) {
      await saveFn({ data: {
        tenantId, productKey, employeeId: id,
        displayName: draft.displayName.trim(), roleTitle: draft.roleTitle.trim(),
        profile: profileData(),
      } });
      setDirty(false);
    }
    await workspace.refetch();
    return id;
  }
  async function withBusy(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); }
    catch (err) { toast.error(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  async function saveDraft() {
    await withBusy(async () => {
      await persist();
      toast.success("Versioned draft saved. No model or connector was invoked.");
    });
  }
  async function runPreview() {
    await withBusy(async () => {
      const id = await persist();
      const result = await previewFn({ data: { tenantId, productKey, employeeId: id } });
      toast.success("Configuration preview recorded; no AI execution or outgoing actions.");
      await workspace.refetch();
      if (result.result.canExecute) throw new Error("Unexpected executable preview returned");
    });
  }
  async function transition(action: "submit" | "approve" | "reject" | "pause" | "resume" | "retire") {
    if (!employeeId) return;
    await withBusy(async () => {
      if (dirty) throw new Error("Save your current edits before changing approval status.");
      await transitionFn({ data: {
        tenantId, productKey, employeeId, action, note: reviewNote.trim() || null,
      } });
      await workspace.refetch();
      setReviewNote("");
      toast.success(action === "approve"
        ? "Configuration approved. Live employee execution is still disabled."
        : "Employee status updated.");
    });
  }

  return (
    <AppShell title="Omniqora AI Workforce"
      subtitle="Hire, train, review and supervise AI employee configurations in the SaaS Factory. Live execution is gated."
      actions={<Button size="sm" variant="outline" onClick={() => workspace.refetch()} disabled={!productKey || workspace.isFetching}>
        <RefreshCw className="mr-2 h-4 w-4" /> Refresh
      </Button>}>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium" htmlFor="workforce-product">SaaS product</label>
        <select id="workforce-product" value={productKey} onChange={e => switchProduct(e.target.value)}
          className="h-10 max-w-full rounded-md border bg-background px-3 text-sm">
          {products.map((key: string) => <option key={key} value={key}>{key}</option>)}
        </select>
        <Badge variant="outline"><LockKeyhole className="mr-1 h-3 w-3" /> Tenant scoped</Badge>
        <Badge variant="outline"><ShieldCheck className="mr-1 h-3 w-3" /> Execution disabled</Badge>
      </div>

      {!tenant.loading && !productKey && <Card><CardContent className="p-6 text-sm">
        No active SaaS product is linked to this tenant. Set up a product in Tenant Factory first.
      </CardContent></Card>}
      {workspace.isError && <Card><CardContent className="flex gap-3 p-5 text-sm">
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
        <div><b>Workforce data is not available.</b>
          <p className="mt-1 text-muted-foreground">Check the Phase 3 migration, tenant permissions and staging environment before use.</p>
          <p className="mt-2">{workspace.error instanceof Error ? workspace.error.message : "Unable to load workspace."}</p>
        </div>
      </CardContent></Card>}

      {productKey && !workspace.isError && <>
        {!writable && !workspace.isLoading && <Card><CardContent className="flex flex-wrap items-center gap-3 p-5">
          <LockKeyhole className="h-5 w-5 text-warning" />
          <div className="min-w-0 flex-1">
            <b>AI Workforce is not activated for this tenant.</b>
            <p className="text-sm text-muted-foreground">
              Enable the manual, beta Omniqora AI Workforce entitlement in Tenant Factory before creating drafts.
              No existing tenant is activated automatically.
            </p>
          </div>
        </CardContent></Card>}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric icon={Users} label="AI employees" value={employees.length} />
          <Metric icon={ClipboardList} label="Pending reviews" value={pendingCount} />
          <Metric icon={ShieldCheck} label="Approved configs" value={configuredCount} />
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[340px_1fr]">
          <div className="space-y-4">
            <Card><CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">Your AI team</h2>
                <Button size="sm" onClick={() => beginNew()} disabled={!writable}>
                  <Plus className="mr-1 h-4 w-4" /> Hire AI employee
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Every member belongs to this tenant and product.</p>
              <div className="mt-4 space-y-2">
                {employees.map(e => <button key={e.id} type="button" onClick={() => beginEdit(e)}
                  className={"w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/60 " +
                    (employeeId === e.id ? "border-primary bg-primary/5" : "")}>
                  <span className="flex items-center gap-2">
                    <span className="rounded-lg bg-primary/10 p-2"><Bot className="h-4 w-4 text-primary" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{e.display_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{e.role_title}</span>
                    </span>
                  </span>
                  <span className="mt-2 block text-xs text-muted-foreground">
                    {statusText(e.status)} · v{e.revision}
                  </span>
                </button>)}
                {!employees.length && <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No employees have been configured yet.
                </div>}
              </div>
            </CardContent></Card>

            <Card><CardContent className="p-4">
              <h3 className="font-semibold">Employee blueprints</h3>
              <p className="mt-1 text-xs text-muted-foreground">Inherited from the existing AI Agent Factory; not live connections.</p>
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                {blueprints.map(item => <button type="button" key={item.key} disabled={!writable}
                  onClick={() => beginNew(item)}
                  className="block w-full rounded-md border p-3 text-left hover:bg-muted/60 disabled:opacity-50">
                  <span className="block text-sm font-medium">{item.name}</span>
                  <span className="mt-1 block text-xs capitalize text-muted-foreground">
                    {item.department.replace(/_/g, " ")} · {item.risk} · {item.mode.replace(/_/g, " ")}
                  </span>
                </button>)}
              </div>
            </CardContent></Card>
          </div>

          <div className="min-w-0 space-y-5">
            {!wizardOpen ? <Card><CardContent className="flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="rounded-2xl bg-primary/10 p-5"><Bot className="h-10 w-10 text-primary" /></div>
              <h2 className="font-display text-2xl font-semibold">Build your first AI employee</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                Start with a role, write its responsibilities, capture business context, request app access,
                and send the configuration for independent approval.
              </p>
              <Button disabled={!writable} onClick={() => beginNew()}>
                <Plus className="mr-2 h-4 w-4" /> Start 10-step setup
              </Button>
            </CardContent></Card> : <>
              <Card><CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div><h2 className="text-lg font-semibold">AI employee setup</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Step {step + 1} of 10 · {steps[step]}</p>
                  </div>
                  <Badge variant="outline">{selected ? statusText(selected.status) : "Unsaved draft"}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-10 gap-1.5" aria-label="Onboarding progress">
                  {steps.map((title, i) => <button type="button" key={title}
                    title={title} aria-label={"Step " + (i + 1) + ": " + title}
                    onClick={() => setStep(i)}
                    className={"h-2 rounded-full transition-colors " + (i <= step ? "bg-primary" : "bg-muted")}/>)}
                </div>
                <h3 className="mt-6 text-xl font-semibold">{steps[step]}</h3>
                <div className="mt-4 min-h-52 space-y-4">
                  {step === 0 && <div className="space-y-3">
                    <Field label="Employee name"><Input value={draft.displayName}
                      placeholder="e.g. Morgan — Sales Assistant" onChange={e => change({ displayName: e.target.value })}/></Field>
                    <p className="text-sm text-muted-foreground">
                      This is a named, versioned employee configuration, not a separate OpenAI Dot account.
                      Fill in the role, goal and tasks before saving your first version.
                    </p>
                  </div>}

                  {step === 1 && <div className="space-y-4">
                    <Field label="Blueprint"><select value={draft.blueprintKey} disabled={!!selected}
                      onChange={e => {
                        const item = agentForProduct(productKey, e.target.value);
                        change({
                          blueprintKey: e.target.value,
                          roleTitle: item?.name ?? "AI Operations Assistant",
                          goal: item?.suggestedGoal ?? draft.goal,
                          tasksText: item?.purpose ?? draft.tasksText,
                          instructions: item?.humanReview ?? draft.instructions,
                          selectedCapabilities: [],
                        });
                      }} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                      <option value="custom.ai-employee">Custom employee</option>
                      {blueprints.map(b => <option key={b.key} value={b.key}>{b.name}</option>)}
                    </select></Field>
                    <Field label="Job title"><Input value={draft.roleTitle} onChange={e => change({ roleTitle: e.target.value })}/></Field>
                    <p className="text-xs text-muted-foreground">
                      Role blueprints are reusable across tenants; selecting one does not grant any app permissions.
                    </p>
                  </div>}

                  {step === 2 && <div className="space-y-3">
                    <Field label="Primary goal"><Textarea rows={3} value={draft.goal}
                      placeholder="Describe the business result this employee should prepare."
                      onChange={e => change({ goal: e.target.value })}/></Field>
                    <Field label="Responsibilities (one per line)"><Textarea rows={6} value={draft.tasksText}
                      placeholder={"Review incoming enquiries\nDraft a weekly performance report"}
                      onChange={e => change({ tasksText: e.target.value })}/></Field>
                  </div>}

                  {step === 3 && <div className="space-y-3">
                    <Field label="Business context"><Textarea rows={7} value={draft.businessContext}
                      placeholder="Company, products, customer audience, policies, success metrics and operating regions."
                      onChange={e => change({ businessContext: e.target.value })}/></Field>
                    <p className="flex items-start gap-2 text-xs text-muted-foreground">
                      <LockKeyhole className="mt-0.5 h-3 w-3 shrink-0" />
                      Do not paste passwords, API keys, patient records or children’s personal details. Approved RAG sources will connect separately.
                    </p>
                  </div>}

                  {step === 4 && <div className="space-y-4">
                    <div className="rounded-lg border p-3 text-sm">
                      <p className="flex items-center gap-2 font-medium"><Cable className="h-4 w-4" /> Requested tool capabilities</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Selection is a request only. No OAuth, MCP, account or permission becomes connected.
                      </p>
                      <div className="mt-3 space-y-2">
                        {(blueprint?.requiredCapabilities ?? []).map(key => <label key={key}
                          className="flex cursor-pointer items-center gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
                          <input type="checkbox" checked={draft.selectedCapabilities.includes(key)}
                            onChange={e => change({ selectedCapabilities: e.target.checked
                              ? [...draft.selectedCapabilities, key]
                              : draft.selectedCapabilities.filter(value => value !== key) })}/>
                          <span>{key}</span><Badge variant="outline" className="ml-auto">Requested</Badge>
                        </label>)}
                        {!(blueprint?.requiredCapabilities.length) &&
                          <p className="text-xs text-muted-foreground">
                            Custom employees have no approved tool capability by default.
                          </p>}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Provider bindings visible in this product: {workspace.data?.providers.length ?? 0}.
                      A binding is not an employee-level verified tool grant.
                    </p>
                  </div>}

                  {step === 5 && <div className="space-y-3">
                    <Field label="Instructions and safeguards"><Textarea rows={6} value={draft.instructions}
                      placeholder="Expected output, escalation rules, approval boundaries and prohibited actions."
                      onChange={e => change({ instructions: e.target.value })}/></Field>
                    <Field label="SOP references (one per line)"><Textarea rows={3} value={draft.sopRefsText}
                      placeholder={"SOP-001: Customer enquiries\nPOL-002: Data classification"}
                      onChange={e => change({ sopRefsText: e.target.value })}/></Field>
                    <p className="text-xs text-muted-foreground">Documents remain references here; they are not automatically retrieved or granted to a model.</p>
                  </div>}

                  {step === 6 && <div className="space-y-3">
                    <Field label="Proposed workflow trigger"><select value={draft.triggerType}
                      onChange={e => change({ triggerType: e.target.value as Draft["triggerType"], triggerValue: "" })}
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                      <option value="manual">Manual assignment</option>
                      <option value="daily">Daily schedule (proposal)</option>
                      <option value="weekly">Weekly schedule (proposal)</option>
                      <option value="event">Business event (proposal)</option>
                    </select></Field>
                    {draft.triggerType !== "manual" && <Field label="Trigger setting">
                      <Input value={draft.triggerValue} placeholder={draft.triggerType === "event"
                        ? "crm.lead.created" : draft.triggerType === "daily" ? "09:00" : "MON 09:00"}
                        onChange={e => change({ triggerValue: e.target.value })}/>
                    </Field>}
                    <div className="flex items-start gap-3 rounded-lg border p-4 text-sm">
                      <Clock3 className="h-5 w-5 shrink-0 text-muted-foreground"/>
                      <div><b>Saved disabled by design</b>
                        <p className="mt-1 text-xs text-muted-foreground">
                          No scheduler or event subscriber is activated. Future releases need independent
                          connector, tenant, worker and spend verification before real runs.
                        </p>
                      </div>
                    </div>
                  </div>}

                  {step === 7 && <div className="space-y-4">
                    <div className="rounded-lg border p-4">
                      <p className="flex items-center gap-2 font-medium"><Workflow className="h-4 w-4" />
                        Controlled configuration preview</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Saves a revision, checks completeness and governance status, and records a preview.
                        It does not contact an AI model, read a business app, run a schedule or create an AI job.
                      </p>
                      <Button className="mt-4" disabled={!writable || busy || !canEdit || !readyToSave}
                        onClick={runPreview}><Play className="mr-2 h-4 w-4"/> Save and preview</Button>
                    </div>
                    {latestPreview && <PreviewChecks preview={latestPreview.result} revision={latestPreview.revision}/>}
                  </div>}

                  {step === 8 && <div className="space-y-4">
                    <ReviewSummary draft={draft} />
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" disabled={!writable || busy || !canEdit || !readyToSave} onClick={saveDraft}>
                        <Save className="mr-2 h-4 w-4"/> Save version
                      </Button>
                      <Button disabled={!writable || busy || dirty || !selected || selected.status !== "draft"}
                        onClick={() => transition("submit")}>
                        <ShieldCheck className="mr-2 h-4 w-4"/> Submit for independent review
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      A different tenant administrator must approve the configuration. Existing Agent Factory
                      use-case approval and execution gates remain separate.
                    </p>
                  </div>}

                  {step === 9 && <div className="space-y-4">
                    <div className="rounded-lg border p-4 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Rocket className="h-5 w-5" />
                        <b>{selected ? statusText(selected.status) : "Save an employee first"}</b>
                      </div>
                      <p className="mt-2 text-muted-foreground">
                        Approval means the configuration is ready for a controlled future pilot.
                        It does not activate autonomous AI, app access, communications or triggers.
                      </p>
                      {selected && <p className="mt-2 text-xs">Revision {selected.revision} · {selected.blueprint_key}</p>}
                    </div>
                    <Field label="Review or pause reason"><Textarea rows={3} value={reviewNote}
                      onChange={e => setReviewNote(e.target.value)}
                      placeholder="Approval evidence, amendments required, or reason for pausing."/></Field>
                    <div className="flex flex-wrap gap-2">
                      {selected?.status === "pending_review" && <>
                        <Button disabled={busy || dirty} onClick={() => transition("approve")}>
                          <ShieldCheck className="mr-2 h-4 w-4"/> Approve configuration
                        </Button>
                        <Button variant="outline" disabled={busy || dirty || reviewNote.trim().length < 12}
                          onClick={() => transition("reject")}>Return for edits</Button>
                      </>}
                      {selected?.status === "approved_configuration" && <Button variant="outline"
                        disabled={busy} onClick={() => transition("pause")}>
                        <Pause className="mr-2 h-4 w-4"/> Pause
                      </Button>}
                      {selected?.status === "paused" && <Button variant="outline"
                        disabled={busy} onClick={() => transition("resume")}>
                        <Play className="mr-2 h-4 w-4"/> Resume configuration
                      </Button>}
                      {selected && selected.status !== "retired" && <Button variant="outline"
                        disabled={busy} onClick={() => transition("retire")}>Retire</Button>}
                    </div>
                    {selected?.status === "pending_review" &&
                      <p className="text-xs text-muted-foreground">
                        Creators and last editors cannot approve their own configuration; the database enforces this.
                      </p>}
                  </div>}
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <Button variant="outline" disabled={step === 0} onClick={() => setStep(n => Math.max(0, n - 1))}>
                    <ArrowLeft className="mr-1 h-4 w-4" /> Back
                  </Button>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" onClick={() => setWizardOpen(false)}>Close</Button>
                    {step !== 7 && step !== 8 && step !== 9 && <Button variant="outline"
                      disabled={!writable || busy || !canEdit || !readyToSave} onClick={saveDraft}>
                      <Save className="mr-2 h-4 w-4" /> Save
                    </Button>}
                    {step < 9 && <Button onClick={() => setStep(n => Math.min(9, n + 1))}>
                      Next <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>}
                  </div>
                </div>
              </CardContent></Card>

              {selected && <div className="grid gap-4 lg:grid-cols-2">
                <Card><CardContent className="p-4">
                  <h3 className="flex items-center gap-2 font-semibold"><ClipboardList className="h-4 w-4"/> Audit history</h3>
                  <div className="mt-3 space-y-2">
                    {lastEvents.map(event => <div key={event.id} className="flex justify-between gap-3 border-b py-2 text-xs">
                      <span>{event.event_key.replace(/_/g, " ")} · v{event.revision}</span>
                      <span className="text-muted-foreground">{new Date(event.created_at).toLocaleString()}</span>
                    </div>)}
                    {!lastEvents.length && <p className="text-xs text-muted-foreground">No recorded changes.</p>}
                  </div>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <h3 className="flex items-center gap-2 font-semibold"><Clock3 className="h-4 w-4"/> Execution monitor</h3>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Runs are read from the canonical Omniqora AI ledger, not a separate employee queue.
                  </p>
                  <div className="mt-3 space-y-2">
                    {lastRuns.map(run => <div key={run.id} className="flex justify-between gap-2 text-xs">
                      <span className="truncate">{run.goal}</span><StatusBadge status={run.status}/>
                    </div>)}
                    {!lastRuns.length && <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                      No AI execution runs for this employee. Phase 3 deliberately cannot execute models.
                    </p>}
                  </div>
                </CardContent></Card>
              </div>}
              {selected && step === 9 && <AIWorkforceTaskPanel
                key={selected.id}
                tenantId={tenantId}
                productKey={productKey}
                employee={selected}
              />}
            </>}
          </div>
        </div>
        {writable && <div className="mt-6">
          <AIWorkforceTeamsPanel
            tenantId={tenantId}
            productKey={productKey}
            employees={employees}
            writable={writable}
          />
        </div>}
      </>}
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2 text-sm font-medium">
    <span>{label}</span>{children}
  </label>;
}
function Metric({ icon: Icon, label, value }: {
  icon: typeof Bot; label: string; value: number;
}) {
  return <Card><CardContent className="flex items-center gap-3 p-4">
    <div className="rounded-xl bg-muted p-3"><Icon className="h-5 w-5 text-primary"/></div>
    <div><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-semibold">{value}</p></div>
  </CardContent></Card>;
}
function PreviewChecks({ preview, revision }: {
  preview: { checks: Array<{ key: string; passed: boolean }>; canExecute: false; modelCalls: 0; toolCalls: 0 };
  revision: number;
}) {
  return <div className="rounded-lg border p-4">
    <p className="font-semibold">Recorded preview · revision {revision}</p>
    <p className="mt-1 text-xs text-muted-foreground">Model calls: {preview.modelCalls} · Tool calls: {preview.toolCalls} · Execution: blocked</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {preview.checks.map(check => <div key={check.key} className="flex items-center gap-2 text-xs">
        {check.passed ? <CheckCircle2 className="h-4 w-4 text-success"/> :
          <AlertTriangle className="h-4 w-4 text-warning"/>}
        {checkNames[check.key] ?? check.key}
      </div>)}
    </div>
  </div>;
}
function ReviewSummary({ draft }: { draft: Draft }) {
  return <div className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
    <div><p className="text-xs text-muted-foreground">Employee</p><b>{draft.displayName || "Unnamed"}</b></div>
    <div><p className="text-xs text-muted-foreground">Role</p><b>{draft.roleTitle}</b></div>
    <div><p className="text-xs text-muted-foreground">Responsibilities</p><b>{splitLines(draft.tasksText).length} tasks</b></div>
    <div><p className="text-xs text-muted-foreground">Proposed capabilities</p><b>{draft.selectedCapabilities.length}, none granted</b></div>
    <div><p className="text-xs text-muted-foreground">Workflow</p><b>{draft.triggerType}, disabled</b></div>
    <div><p className="text-xs text-muted-foreground">Knowledge/SOP refs</p><b>{splitLines(draft.sopRefsText).length} references</b></div>
    <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Primary goal</p>
      <p>{draft.goal || "Not yet entered"}</p></div>
  </div>;
}
