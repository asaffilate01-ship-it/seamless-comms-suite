import { RequestFiles } from "./request-files";
import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Plus,
  Search,
  ArrowRight,
  Clock,
  CheckCircle2,
  FileText,
  Users,
  LayoutGrid,
  List,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  configurePracticeAutomation,
  listPracticeWorkspaces,
  getPracticeWorkspace,
  mutatePracticeWorkspace,
} from "./workspace.functions";
import { createPracticeClient } from "./functions";
import { addPracticeClientPortalUser } from "./client-services.functions";
import { requestTenantModule } from "@/modules/platform/module-management.functions";
import { PRACTICE_PACKS, type PracticeCommand } from "./workspace-contracts";

type Row = Record<string, any>;
const statuses = [
  "collecting",
  "processing",
  "client_action",
  "review",
  "approval",
  "submission",
  "completed",
  "cancelled",
];
const label = (s: string) => s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
const money = (n: number, c = "GBP") =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: c }).format(n / 100);
const date = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-GB") : "No deadline");
const control = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const field = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const iso = (fd: FormData, k: string) =>
  field(fd, k) ? new Date(field(fd, k) + "T12:00:00Z").toISOString() : null;

export function PracticeWorkspace() {
  const [productId, setProductId] = useState("");
  const [tab, setTab] = useState("Today");
  const [search, setSearch] = useState("");
  const [board, setBoard] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState("");
  const [pack, setPack] = useState(PRACTICE_PACKS[0]);
  const cache = useQueryClient();
  const configure = useServerFn(configurePracticeAutomation);
  const list = useServerFn(listPracticeWorkspaces),
    load = useServerFn(getPracticeWorkspace),
    change = useServerFn(mutatePracticeWorkspace),
    createClient = useServerFn(createPracticeClient),
    addPortal = useServerFn(addPracticeClientPortalUser),
    requestModule = useServerFn(requestTenantModule);
  const workspaces = useQuery({ queryKey: ["practice-workspaces"], queryFn: () => list() });
  const workspace: Row | undefined =
    workspaces.data?.find((p: Row) => p.id === productId) ?? workspaces.data?.[0];
  const scope = { tenantId: workspace?.tenant_id ?? "", tenantProductId: workspace?.id ?? "" };
  const key = ["practice-workspace", scope.tenantId, scope.tenantProductId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => load({ data: scope }),
    enabled: !!workspace,
  });
  const data = query.data;
  const writable = ["owner", "admin", "agent"].includes(workspace?.role ?? "");
  const admin = ["owner", "admin"].includes(workspace?.role ?? "");
  const mutation = useMutation({
    mutationFn: (command: PracticeCommand) => change({ data: { ...scope, command } }),
    onSuccess: () => cache.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error(e.message),
  });
  const [saving, setSaving] = useState(false);
  const jobs: Row[] = data?.jobs ?? [],
    clients: Row[] = data?.clients ?? [],
    services: Row[] = data?.services ?? [],
    requests: Row[] = data?.requests ?? [],
    phases: Row[] = data?.phases ?? [],
    times: Row[] = data?.time ?? [],
    proposals: Row[] = data?.proposals ?? [];
  const clientName = (id: string) => clients.find((c) => c.id === id)?.legal_name ?? "Client";
  const serviceName = (j: Row) => j.template_snapshot?.name ?? j.service_key;
  const open = jobs.filter((j) => !["completed", "cancelled"].includes(j.status));
  const filtered = jobs.filter(
    (j) =>
      (!clientFilter || j.client_id === clientFilter) &&
      `${clientName(j.client_id)} ${serviceName(j)} ${j.period_key}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const job = jobs.find((j) => j.id === selected);
  const blocked = (id: string) =>
    requests.filter((r) => r.engagement_id === id && r.status !== "accepted");
  const overdue = open.filter(
    (j) =>
      (j.internal_due_at || j.due_at) && Date.parse(j.internal_due_at ?? j.due_at) < Date.now(),
  );
  const pending = mutation.isPending || saving;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const f = new FormData(e.currentTarget);
    setSaving(true);
    try {
      if (dialog === "recurrence")
        await configure({
          data: {
            ...scope,
            command: {
              operation: "recurrence.save",
              clientId: field(f, "client"),
              serviceId: field(f, "service"),
              nextOn: field(f, "next"),
              internalDays: Number(field(f, "internalDays")),
              externalDays: Number(field(f, "externalDays")),
              enabled: true,
            },
          },
        });
      if (dialog === "client")
        await createClient({
          data: {
            ...scope,
            legalName: field(f, "name"),
            clientKind: field(f, "kind") as any,
            countryCode: field(f, "country").toUpperCase(),
            crmCompanyId: field(f, "crmCompany") || null,
          },
        });
      if (dialog === "portal")
        await addPortal({
          data: {
            tenantId: scope.tenantId,
            practiceClientId: field(f, "client"),
            userId: field(f, "user"),
            role: field(f, "role") as any,
          },
        });
      let command: PracticeCommand | undefined;
      if (dialog === "service")
        command = {
          operation: "service.save",
          service: {
            ...pack,
            key: field(f, "key"),
            name: field(f, "name"),
            currency: field(f, "currency"),
            baseMinor: Number(field(f, "base")),
            unitMinor: Number(field(f, "unit")),
            recurrence: field(f, "recurrence") as any,
            phases: field(f, "phases")
              .split("\n")
              .filter(Boolean)
              .map((line) => {
                const [title, minutes] = line.split("|");
                return { title: title.trim(), budgetMinutes: Number(minutes ?? 0) };
              }),
          },
        };
      if (dialog === "job")
        command = {
          operation: "job.create",
          clientId: field(f, "client"),
          serviceId: field(f, "service"),
          periodKey: field(f, "period"),
          internalDue: iso(f, "internal"),
          externalDue: iso(f, "external"),
        };
      if (dialog === "proposal")
        command = {
          operation: "proposal.create",
          clientId: field(f, "client"),
          serviceId: field(f, "service"),
          units: Number(field(f, "units")),
          catchupMinor: Number(field(f, "catchup")),
          terms: field(f, "terms"),
          expiresAt: iso(f, "expiry")!,
        };
      if (dialog === "request" && job)
        command = {
          operation: "request.create",
          jobId: job.id,
          title: field(f, "title"),
          dueAt: iso(f, "due"),
        };
      if (dialog === "time" && job)
        command = {
          operation: "time.record",
          jobId: job.id,
          minutes: Number(field(f, "minutes")),
          costRateMinor: Number(field(f, "rate")),
          description: field(f, "description"),
        };
      if (command) await mutation.mutateAsync(command);
      await cache.invalidateQueries({ queryKey: key });
      setDialog(null);
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }
  function jobCard(j: Row) {
    const missing = blocked(j.id);
    return (
      <button
        key={j.id}
        onClick={() => setSelected(j.id)}
        className="w-full rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {clientName(j.client_id)}
          </span>
          <Badge variant="outline">{j.progress}%</Badge>
        </div>
        <h3 className="mt-2 font-semibold">{serviceName(j)}</h3>
        <p className="text-xs text-muted-foreground">{j.period_key}</p>
        <div className="my-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${j.progress}%` }} />
        </div>
        <p className="text-xs">Internal: {date(j.internal_due_at)}</p>
        <p className="mt-1 text-xs text-muted-foreground">External: {date(j.due_at)}</p>
        {missing.length > 0 && (
          <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
            {missing[0].title}
            {missing.length > 1 ? ` +${missing.length - 1} more` : ""}
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          {j.assigned_user_ids.length ? "Assigned" : "Unassigned"} · {label(j.status)}
        </p>
      </button>
    );
  }
  return (
    <AppShell
      title="CRM & Practice"
      subtitle="One client workspace. Every service, deadline and next action."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => query.refetch()} aria-label="Refresh workspace">
            <RefreshCw className="h-4 w-4" />
          </Button>
          {writable && data && (
            <Button onClick={() => setDialog("job")}>
              <Plus className="mr-2 h-4 w-4" />
              New job
            </Button>
          )}
        </div>
      }
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <label className="text-xs font-medium">
          Workspace
          <select
            aria-label="Workspace"
            className={`${control} mt-1 min-w-56`}
            value={workspace?.id ?? ""}
            onChange={(e) => {
              setProductId(e.target.value);
              setSelected(null);
              setClientFilter("");
              setDialog(null);
            }}
          >
            {workspaces.data?.map((p: Row) => (
              <option value={p.id} key={p.id}>
                {p.product_key} · {p.tenant_id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <Link to={"/client-portal" as any} className="text-sm text-primary underline">
          Open my client portal
        </Link>
      </div>
      {workspaces.isPending ? (
        <p role="status">Loading workspaces…</p>
      ) : workspaces.error ? (
        <ErrorBox message={workspaces.error.message} />
      ) : !workspace ? (
        <Empty
          title="No active product workspace"
          text="Provision a tenant product in the platform console, then enable Practice."
        />
      ) : query.isPending ? (
        <p role="status">Loading client work…</p>
      ) : query.error ? (
        <div>
          <ErrorBox message={query.error.message} />
          {admin && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await requestModule({
                    data: {
                      tenantProductId: scope.tenantProductId,
                      moduleKey: "practice.core",
                      reason: "Enable CRM & Practice workspace",
                    },
                  });
                  toast.success("Module request submitted");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Request Practice add-on
            </Button>
          )}
        </div>
      ) : (
        data && (
          <>
            {data.truncated && (
              <p role="status" className="mb-3 text-amber-800">
                Showing up to 1,000 records per category. Totals reflect loaded records.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                [Users, "Active jobs", open.length],
                [Clock, "Overdue", overdue.length],
                [
                  FileText,
                  "Client requests",
                  requests.filter((r) => r.status === "outstanding").length,
                ],
                [
                  CheckCircle2,
                  "Awaiting review",
                  requests.filter((r) => r.status === "submitted").length,
                ],
              ].map(([Icon, title, value]: any) => (
                <div key={title} className="rounded-xl border bg-card p-5">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    {title}
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
                </div>
              ))}
            </div>
            <nav
              aria-label="Practice sections"
              className="my-6 flex gap-1 overflow-x-auto border-b"
            >
              {["Today", "Work", "Clients", "Services", "Proposals", "Time & costs", "Add-ons"].map(
                (t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    aria-current={t === tab ? "page" : undefined}
                    className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm ${t === tab ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground"}`}
                  >
                    {t}
                  </button>
                ),
              )}
            </nav>
            {tab === "Today" && (
              <div className="grid gap-6 lg:grid-cols-2">
                <section>
                  <Section title="Needs your attention" count={overdue.length} />
                  <div className="grid gap-3 sm:grid-cols-2">{overdue.map(jobCard)}</div>
                  {!overdue.length && (
                    <Empty
                      title="No overdue jobs"
                      text="Your internal targets and external deadlines appear here."
                    />
                  )}
                </section>
                <section>
                  <Section
                    title="Client responses to review"
                    count={requests.filter((r) => r.status === "submitted").length}
                  />
                  {requests
                    .filter((r) => r.status === "submitted")
                    .map((r) => (
                      <div key={r.id} className="mb-3 rounded-xl border bg-card p-4">
                        <p className="text-xs text-muted-foreground">{clientName(r.client_id)}</p>
                        <h3 className="font-semibold">{r.title}</h3>
                        <p className="my-3 whitespace-pre-wrap text-sm">{r.response}</p>
                        <RequestFiles requestId={r.id} canUpload={false} />
                        {writable && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={pending}
                              onClick={() =>
                                mutation.mutate({
                                  operation: "request.review",
                                  requestId: r.id,
                                  accepted: true,
                                })
                              }
                            >
                              Accept response
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onClick={() =>
                                mutation.mutate({
                                  operation: "request.review",
                                  requestId: r.id,
                                  accepted: false,
                                })
                              }
                            >
                              Request again
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  {!requests.some((r) => r.status === "submitted") && (
                    <Empty
                      title="No responses waiting"
                      text="Submitted client information appears here before work can move forward."
                    />
                  )}
                </section>
              </div>
            )}
            {tab === "Work" && (
              <>
                <div className="mb-4 flex flex-wrap gap-3">
                  <div className="relative min-w-56 flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      aria-label="Search jobs"
                      placeholder="Find client, service or period…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <select
                    aria-label="Filter by client"
                    className={control + " max-w-64"}
                    value={clientFilter}
                    onChange={(e) => setClientFilter(e.target.value)}
                  >
                    <option value="">All clients</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.legal_name}
                      </option>
                    ))}
                  </select>
                  <Button variant="outline" onClick={() => setBoard(!board)}>
                    {board ? (
                      <List className="mr-2 h-4 w-4" />
                    ) : (
                      <LayoutGrid className="mr-2 h-4 w-4" />
                    )}
                    {board ? "Table" : "Board"}
                  </Button>
                </div>
                {!filtered.length ? (
                  <Empty
                    title="No matching jobs"
                    text="Add a client and a service template, then create your first job."
                  />
                ) : board ? (
                  <div className="flex gap-4 overflow-x-auto pb-4">
                    {statuses.map((status) => (
                      <section key={status} className="w-72 shrink-0 rounded-xl bg-muted/50 p-3">
                        <Section
                          title={label(status)}
                          count={filtered.filter((j) => j.status === status).length}
                        />
                        <div className="space-y-3">
                          {filtered.filter((j) => j.status === status).map(jobCard)}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border bg-card">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-muted">
                        <tr>
                          {[
                            "Client / service",
                            "Period",
                            "Status",
                            "Internal target",
                            "External deadline",
                            "Progress",
                          ].map((t) => (
                            <th key={t} className="p-3">
                              {t}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((j) => (
                          <tr key={j.id} className="border-t">
                            <td className="p-3">
                              <button
                                className="text-left text-primary underline"
                                onClick={() => setSelected(j.id)}
                              >
                                {clientName(j.client_id)}
                                <span className="block text-xs">{serviceName(j)}</span>
                              </button>
                            </td>
                            <td className="p-3">{j.period_key}</td>
                            <td className="p-3">{label(j.status)}</td>
                            <td className="p-3">{date(j.internal_due_at)}</td>
                            <td className="p-3">{date(j.due_at)}</td>
                            <td className="p-3">{j.progress}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
            {tab === "Clients" && (
              <>
                <Section
                  title="Client workspace"
                  count={clients.length}
                  action={
                    writable ? (
                      <Button onClick={() => setDialog("client")}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add client
                      </Button>
                    ) : null
                  }
                />
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {clients.map((c) => (
                    <div key={c.id} className="rounded-xl border bg-card p-5">
                      <Badge variant="outline">{label(c.status)}</Badge>
                      <h3 className="mt-3 font-semibold">{c.legal_name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {label(c.client_kind)} · {c.country_code}
                      </p>
                      <p className="my-3 text-sm">
                        {open.filter((j) => j.client_id === c.id).length} active jobs ·{" "}
                        {
                          requests.filter((r) => r.client_id === c.id && r.status === "outstanding")
                            .length
                        }{" "}
                        outstanding requests
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setClientFilter(c.id);
                          setTab("Work");
                        }}
                      >
                        View work <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                {admin && (
                  <Button className="mt-5" variant="outline" onClick={() => setDialog("portal")}>
                    Grant client portal access
                  </Button>
                )}
              </>
            )}
            {tab === "Services" && (
              <>
                <Section
                  title="Service templates"
                  count={services.length}
                  action={
                    admin ? (
                      <Button onClick={() => setDialog("service")}>Create / update template</Button>
                    ) : null
                  }
                />
                <p className="mb-5 text-sm text-muted-foreground">
                  Versioned templates keep existing jobs unchanged. Configure recurring work per
                  client below; the scheduled worker creates each period once.
                </p>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {services.map((s) => (
                    <div key={s.id} className="rounded-xl border bg-card p-5">
                      <Badge variant="outline">
                        {s.industry} · v{s.version}
                      </Badge>
                      <h3 className="my-3 font-semibold">{s.name}</h3>
                      <p className="text-sm">
                        {money(s.base_minor, s.currency)} base + {money(s.unit_minor, s.currency)}{" "}
                        per unit
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {label(s.recurrence)} ·{" "}
                        {s.phases.reduce((n: number, p: Row) => n + p.budgetMinutes, 0)} minutes
                        budget
                      </p>
                      <ol className="mt-4 space-y-2 text-sm">
                        {s.phases.map((p: Row, i: number) => (
                          <li key={i}>
                            {i + 1}. {p.title}
                          </li>
                        ))}
                      </ol>
                      {admin && (
                        <Button
                          className="mt-4"
                          variant="outline"
                          onClick={() => {
                            setPack({
                              key: s.service_key,
                              name: s.name,
                              industry: s.industry,
                              currency: s.currency,
                              baseMinor: s.base_minor,
                              unitMinor: s.unit_minor,
                              recurrence: s.recurrence,
                              phases: s.phases,
                            });
                            setDialog("service");
                          }}
                        >
                          Edit template
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                {admin && (
                  <Button
                    className="mt-5"
                    variant="outline"
                    onClick={() => setDialog("recurrence")}
                  >
                    Schedule recurring work
                  </Button>
                )}
                <div className="mt-4 space-y-2">
                  {data?.schedules.map((s: Row) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded-lg border p-3 text-sm"
                    >
                      <span>
                        {clientName(s.client_id)} · Next {s.next_on} ·{" "}
                        {s.enabled ? "Active" : "Paused"}
                      </span>
                      {admin && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await configure({
                                data: {
                                  ...scope,
                                  command: {
                                    operation: "recurrence.save",
                                    clientId: s.client_id,
                                    serviceId: s.template_id,
                                    nextOn: s.next_on,
                                    internalDays: s.internal_days,
                                    externalDays: s.external_days,
                                    enabled: !s.enabled,
                                  },
                                },
                              });
                              await cache.invalidateQueries({ queryKey: key });
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }}
                        >
                          {s.enabled ? "Pause" : "Resume"}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                {!services.length && (
                  <Empty
                    title="Start with an industry template"
                    text="Accounting, compliance, legal, hospitality, childcare and creative workflows are ready to customise."
                  />
                )}
              </>
            )}
            {tab === "Proposals" && (
              <>
                <Section
                  title="Proposals & agreements"
                  count={proposals.length}
                  action={
                    writable ? (
                      <Button onClick={() => setDialog("proposal")}>New proposal</Button>
                    ) : null
                  }
                />
                <p className="mb-4 text-sm text-muted-foreground">
                  Prices and terms are frozen when a proposal is created. Publishing makes it
                  visible to authorised portal users; it does not send a message or collect payment.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  {proposals.map((p) => (
                    <div key={p.id} className="rounded-xl border bg-card p-5">
                      <div className="flex justify-between">
                        <span className="text-sm">{clientName(p.client_id)}</span>
                        <Badge variant="outline">
                          {p.expires_at &&
                          Date.parse(p.expires_at) < Date.now() &&
                          p.status === "issued"
                            ? "Expired"
                            : label(p.status)}
                        </Badge>
                      </div>
                      <h3 className="my-2 font-semibold">{p.service_snapshot.name}</h3>
                      <p className="text-2xl font-semibold">{money(p.total_minor, p.currency)}</p>
                      <p className="my-2 text-xs text-muted-foreground">
                        Expires {date(p.expires_at)}
                      </p>
                      <details className="my-3 text-sm">
                        <summary className="cursor-pointer">Scope and terms</summary>
                        <p className="mt-3 whitespace-pre-wrap">{p.terms}</p>
                      </details>
                      {p.status === "draft" && writable && (
                        <Button
                          disabled={pending}
                          onClick={() =>
                            mutation.mutate({ operation: "proposal.issue", proposalId: p.id })
                          }
                        >
                          Publish to portal
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            {tab === "Time & costs" && (
              <>
                <Section title="Time budgets & recorded costs" />
                <p className="mb-4 text-sm text-muted-foreground">
                  Costs use the job currency and the hourly cost entered with each time record.
                  Proposals are quoted fees, not recognised revenue.
                </p>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {jobs.map((j) => {
                    const entries = times.filter((t) => t.engagement_id === j.id);
                    return (
                      <button
                        key={j.id}
                        className="rounded-xl border bg-card p-5 text-left"
                        onClick={() => setSelected(j.id)}
                      >
                        <p className="font-semibold">{clientName(j.client_id)}</p>
                        <p className="text-sm">
                          {serviceName(j)} · {j.period_key}
                        </p>
                        <p className="mt-3">
                          {entries.reduce((n, t) => n + t.minutes, 0)} /{" "}
                          {phases
                            .filter((p) => p.engagement_id === j.id)
                            .reduce((n, p) => n + p.budget_minutes, 0)}{" "}
                          minutes
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Recorded cost:{" "}
                          {money(
                            entries.reduce(
                              (n, t) => n + Math.round((t.minutes * t.cost_rate_minor) / 60),
                              0,
                            ),
                            j.template_snapshot.currency,
                          )}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {tab === "Add-ons" && (
              <div className="max-w-3xl rounded-xl border bg-card p-6">
                <h2 className="text-xl font-semibold">
                  One Practice module, configured for each SaaS
                </h2>
                <p className="my-3 text-sm text-muted-foreground">
                  Practice is available in the product module catalogue. Landlords enable it through
                  the existing entitlement process; installation does not subscribe or charge any
                  tenant.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {PRACTICE_PACKS.map((p) => (
                    <div key={p.key} className="rounded-lg bg-muted p-4">
                      <p className="font-medium">{p.industry}</p>
                      <p className="text-sm text-muted-foreground">{p.name}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm">
                  External e-signature, payment collection and outbound messaging require provider
                  configuration. Portal acceptance is recorded separately from provider-backed
                  signing.
                </p>
              </div>
            )}
          </>
        )
      )}
      <Sheet
        open={!!job}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{job ? serviceName(job) : "Job"}</SheetTitle>
            <SheetDescription>
              {job ? `${clientName(job.client_id)} · ${job.period_key}` : ""}
            </SheetDescription>
          </SheetHeader>
          {job && (
            <div className="space-y-6 p-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  Internal target<p className="font-medium">{date(job.internal_due_at)}</p>
                </div>
                <div>
                  External deadline<p className="font-medium">{date(job.due_at)}</p>
                </div>
              </div>
              <label className="block text-sm">
                Status
                <select
                  className={control + " mt-1"}
                  value={job.status}
                  disabled={!writable || pending || ["completed", "cancelled"].includes(job.status)}
                  onChange={(e) =>
                    mutation.mutate({
                      operation: "job.status",
                      jobId: job.id,
                      status: e.target.value as any,
                      expectedVersion: job.work_version,
                    })
                  }
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {label(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Owner
                <select
                  className={control + " mt-1"}
                  value={job.assigned_user_ids[0] ?? ""}
                  disabled={!writable || pending || ["completed", "cancelled"].includes(job.status)}
                  onChange={(e) =>
                    mutation.mutate({
                      operation: "job.assign",
                      jobId: job.id,
                      userId: e.target.value || null,
                      expectedVersion: job.work_version,
                    })
                  }
                >
                  <option value="">Unassigned</option>
                  {data?.members
                    .filter((m: Row) => ["owner", "admin", "agent"].includes(m.role))
                    .map((m: Row) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.user_id === data.userId ? "You" : m.user_id.slice(0, 8)} · {m.role}
                      </option>
                    ))}
                </select>
              </label>
              <section>
                <Section title="Job phases" />
                {phases
                  .filter((p) => p.engagement_id === job.id)
                  .sort((a, b) => a.position - b.position)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 border-b py-3"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {p.position + 1}. {p.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.budget_minutes} min budget
                          {p.completed_at ? ` · Completed ${date(p.completed_at)}` : ""}
                        </p>
                      </div>
                      {!p.completed_at && writable ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending || ["completed", "cancelled"].includes(job.status)}
                          onClick={() =>
                            mutation.mutate({
                              operation: "phase.complete",
                              jobId: job.id,
                              phaseId: p.id,
                              expectedVersion: job.work_version,
                            })
                          }
                        >
                          Complete
                        </Button>
                      ) : p.completed_at ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : null}
                    </div>
                  ))}
              </section>
              <section>
                <Section title="Client requests" />
                {requests
                  .filter((r) => r.engagement_id === job.id)
                  .map((r) => (
                    <div key={r.id} className="my-2 rounded-lg border p-3 text-sm">
                      <p className="font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {label(r.status)} · {date(r.due_at)}
                      </p>
                      {r.response && <p className="mt-2 whitespace-pre-wrap">{r.response}</p>}
                      <RequestFiles
                        requestId={r.id}
                        canUpload={writable && r.status === "outstanding"}
                      />
                      {admin && r.status === "outstanding" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              await configure({
                                data: {
                                  ...scope,
                                  command: {
                                    operation: "request.chasing",
                                    requestId: r.id,
                                    enabled: !r.chase_enabled,
                                  },
                                },
                              });
                              await cache.invalidateQueries({ queryKey: key });
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }}
                        >
                          {r.chase_enabled ? "Pause reminder events" : "Enable reminder events"}
                        </Button>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.chase_count ?? 0} reminder events queued · delivery requires Connect
                        automation
                      </p>
                    </div>
                  ))}
                {writable && !["completed", "cancelled"].includes(job.status) && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDialog("request")}>
                      Request information
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDialog("time")}>
                      Record time
                    </Button>
                  </div>
                )}
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <Dialog
        open={!!dialog}
        onOpenChange={(v) => {
          if (!v && !saving) setDialog(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialog === "portal"
                ? "Grant portal access"
                : `${dialog === "service" ? "Configure" : "New"} ${dialog ?? ""}`}
            </DialogTitle>
          </DialogHeader>
          <form
            key={dialog === "service" ? pack.key : dialog}
            onSubmit={submit}
            className="space-y-4"
          >
            {["job", "proposal", "portal", "recurrence"].includes(dialog ?? "") && (
              <Field title="Client">
                <select name="client" className={control} required>
                  <option value="">Choose client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.legal_name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {["job", "proposal", "recurrence"].includes(dialog ?? "") && (
              <Field title="Service">
                <select name="service" className={control} required>
                  <option value="">Choose service</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {dialog === "client" && (
              <>
                <Field title="Link existing CRM company (optional)">
                  <select name="crmCompany" className={control}>
                    <option value="">No linked company</option>
                    {data?.crmCompanies.map((c: Row) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field title="Legal name">
                  <Input name="name" required maxLength={240} />
                </Field>
                <Field title="Client type">
                  <select name="kind" className={control}>
                    {[
                      "company",
                      "individual",
                      "sole_trader",
                      "partnership",
                      "trust",
                      "charity",
                      "other",
                    ].map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </Field>
                <Field title="Country code">
                  <Input name="country" defaultValue="GB" required minLength={2} maxLength={2} />
                </Field>
              </>
            )}
            {dialog === "portal" && (
              <>
                <Field title="Existing user ID">
                  <Input name="user" required placeholder="User UUID" />
                </Field>
                <Field title="Access">
                  <select name="role" className={control}>
                    <option value="client_viewer">Read only</option>
                    <option value="client_user">Respond to requests</option>
                    <option value="client_owner">Respond and approve proposals</option>
                  </select>
                </Field>
                <p className="text-xs text-muted-foreground">
                  The user must already have an account. This grants access; no invitation is sent.
                </p>
              </>
            )}
            {dialog === "service" && (
              <>
                <Field title="Start from an industry pack">
                  <select
                    className={control}
                    value={PRACTICE_PACKS.some((p) => p.key === pack.key) ? pack.key : ""}
                    onChange={(e) => setPack(PRACTICE_PACKS.find((p) => p.key === e.target.value)!)}
                  >
                    <option value="" disabled>
                      Custom template
                    </option>
                    {PRACTICE_PACKS.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.industry}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field title="Service key (same key updates the template)">
                  <Input
                    name="key"
                    defaultValue={pack.key}
                    required
                    pattern="[a-z][a-z0-9_-]{1,79}"
                  />
                </Field>
                <Field title="Name">
                  <Input name="name" defaultValue={pack.name} required />
                </Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field title="Currency">
                    <Input
                      name="currency"
                      defaultValue={pack.currency}
                      required
                      pattern="[A-Z]{3}"
                    />
                  </Field>
                  <Field title="Base (minor units)">
                    <Input
                      name="base"
                      type="number"
                      min="0"
                      max="100000000"
                      defaultValue={pack.baseMinor}
                      required
                    />
                  </Field>
                  <Field title="Per unit (minor)">
                    <Input
                      name="unit"
                      type="number"
                      min="0"
                      max="100000000"
                      defaultValue={pack.unitMinor}
                      required
                    />
                  </Field>
                </div>
                <Field title="Recurrence">
                  <select name="recurrence" className={control} defaultValue={pack.recurrence}>
                    {["none", "monthly", "quarterly", "annual"].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </Field>
                <Field title="Phases: one per line, Title | budget minutes">
                  <textarea
                    className={control}
                    name="phases"
                    rows={6}
                    defaultValue={pack.phases
                      .map((p) => `${p.title} | ${p.budgetMinutes}`)
                      .join("\n")}
                    required
                  />
                </Field>
                <p className="text-xs text-muted-foreground">
                  For GBP, 100 minor units = £1. Set your prices before quoting.
                </p>
              </>
            )}
            {dialog === "recurrence" && (
              <>
                <Field title="First / next period date">
                  <Input name="next" type="date" required />
                </Field>
                <Field title="Internal deadline days after period date">
                  <Input
                    name="internalDays"
                    type="number"
                    min="0"
                    max="366"
                    defaultValue="14"
                    required
                  />
                </Field>
                <Field title="External deadline days after period date">
                  <Input
                    name="externalDays"
                    type="number"
                    min="0"
                    max="366"
                    defaultValue="30"
                    required
                  />
                </Field>
                <p className="text-xs text-muted-foreground">
                  Requires the Practice worker to be scheduled. These are your configured deadlines,
                  not calculated statutory dates.
                </p>
              </>
            )}
            {dialog === "job" && (
              <>
                <Field title="Period / reference">
                  <Input name="period" required placeholder="e.g. 2026-09 or project reference" />
                </Field>
                <Field title="Internal target">
                  <Input name="internal" type="date" />
                </Field>
                <Field title="External deadline">
                  <Input name="external" type="date" />
                </Field>
              </>
            )}
            {dialog === "proposal" && (
              <>
                <Field title="Units">
                  <Input
                    name="units"
                    type="number"
                    min="0"
                    max="100000"
                    defaultValue="1"
                    required
                  />
                </Field>
                <Field title="Catch-up fee (minor units)">
                  <Input
                    name="catchup"
                    type="number"
                    min="0"
                    max="100000000"
                    defaultValue="0"
                    required
                  />
                </Field>
                <Field title="Scope, terms and tax treatment">
                  <textarea
                    className={control}
                    name="terms"
                    rows={5}
                    required
                    maxLength={20000}
                    placeholder="Specify the services, exclusions, payment terms, renewal terms and whether tax is included."
                  />
                </Field>
                <Field title="Expiry">
                  <Input name="expiry" type="date" required />
                </Field>
              </>
            )}
            {dialog === "request" && (
              <>
                <Field title="Information needed">
                  <Input name="title" required maxLength={240} />
                </Field>
                <Field title="Due date">
                  <Input name="due" type="date" />
                </Field>
              </>
            )}
            {dialog === "time" && (
              <>
                <Field title="Minutes">
                  <Input name="minutes" type="number" min="1" max="1440" required />
                </Field>
                <Field title="Hourly cost (minor units, job currency)">
                  <Input name="rate" type="number" min="0" max="10000000" required />
                </Field>
                <Field title="Description">
                  <Input name="description" required maxLength={2000} />
                </Field>
              </>
            )}
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Saving…" : "Save"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
function Section({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="font-semibold">
        {title}
        {count !== undefined && (
          <span className="ml-2 text-sm font-normal text-muted-foreground">{count}</span>
        )}
      </h2>
      {action}
    </div>
  );
}
function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm font-medium">
      <span>{title}</span>
      {children}
    </label>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center">
      <h3 className="font-medium">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
function ErrorBox({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
    >
      <AlertCircle className="h-4 w-4 shrink-0" />
      {message}
    </p>
  );
}
