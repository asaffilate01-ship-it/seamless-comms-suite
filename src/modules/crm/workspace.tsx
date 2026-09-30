import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { listPracticeWorkspaces } from "@/modules/practice/workspace.functions";
import {
  listCrmPeople,
  listCrmCompanies,
  listCrmLeads,
  listCrmTasks,
  listCrmOpportunities,
  saveCrmPerson,
  saveCrmCompany,
  saveCrmLead,
  saveCrmTask,
  getCrmTimeline,
} from "./functions";
import { toast } from "sonner";
type Row = Record<string, any>;
const control = "w-full rounded-lg border bg-background p-2 text-sm";
export function CrmWorkspace() {
  const [product, setProduct] = useState(""),
    [tab, setTab] = useState("People"),
    [search, setSearch] = useState(""),
    [edit, setEdit] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Row | null>(null);
  const list = useServerFn(listPracticeWorkspaces),
    peopleFn = useServerFn(listCrmPeople),
    companiesFn = useServerFn(listCrmCompanies),
    leadsFn = useServerFn(listCrmLeads),
    tasksFn = useServerFn(listCrmTasks),
    opportunitiesFn = useServerFn(listCrmOpportunities),
    personSave = useServerFn(saveCrmPerson),
    companySave = useServerFn(saveCrmCompany),
    leadSave = useServerFn(saveCrmLead),
    taskSave = useServerFn(saveCrmTask),
    timelineFn = useServerFn(getCrmTimeline);
  const workspaces = useQuery({ queryKey: ["practice-workspaces"], queryFn: () => list() });
  const workspace = workspaces.data?.find((w: Row) => w.id === product) ?? workspaces.data?.[0];
  const scope = { tenantId: workspace?.tenant_id ?? "", tenantProductId: workspace?.id ?? "" },
    cache = useQueryClient();
  const key = ["crm-workspace", scope.tenantId, scope.tenantProductId];
  const query = useQuery({
    queryKey: key,
    enabled: !!workspace,
    queryFn: async () => {
      const [people, companies, leads, tasks, opportunities] = await Promise.all([
        peopleFn({ data: scope }),
        companiesFn({ data: scope }),
        leadsFn({ data: scope }),
        tasksFn({ data: scope }),
        opportunitiesFn({ data: scope }),
      ]);
      return {
        People: people,
        Companies: companies,
        Leads: leads,
        Tasks: tasks,
        Opportunities: opportunities,
      };
    },
  });
  const timeline = useQuery({
    queryKey: ["crm-timeline", scope.tenantId, selected?.id, selected?.kind],
    enabled: !!selected,
    queryFn: () =>
      timelineFn({
        data: {
          ...scope,
          ...(selected?.kind === "People"
            ? { personId: selected.id }
            : { companyId: selected!.id }),
        },
      }),
  });
  const writable = ["owner", "admin", "agent"].includes(workspace?.role ?? "");
  const rows: Row[] = (query.data?.[tab as keyof typeof query.data] ?? []) as Row[];
  const filtered = rows.filter((r) =>
    [r.display_name, r.name, r.title, r.email, r.phone_e164]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const f = new FormData(e.currentTarget),
      v = (k: string) => String(f.get(k) ?? "");
    try {
      const common = {
        ...scope,
        ...(edit?.id ? { id: edit.id } : {}),
        sourceProductKey: edit?.source_product_key ?? null,
        externalRef: edit?.external_ref ?? null,
      };
      if (tab === "People")
        await personSave({
          data: {
            ...common,
            displayName: v("name"),
            firstName: edit?.first_name ?? null,
            lastName: edit?.last_name ?? null,
            locale: edit?.locale ?? null,
            whatsappContactId: edit?.whatsapp_contact_id ?? null,
            email: v("email") || null,
            phoneE164: v("phone") || null,
            companyId: v("company") || null,
            lifecycleStage: v("status") as any,
            marketingConsent: edit?.marketing_consent ?? false,
            metadata: edit?.metadata ?? {},
          },
        });
      if (tab === "Companies")
        await companySave({
          data: {
            ...common,
            name: v("name"),
            legalName: edit?.legal_name ?? null,
            website: v("website") || null,
            industry: v("industry") || null,
            status: v("status") as any,
            metadata: edit?.metadata ?? {},
          },
        });
      if (tab === "Leads")
        await leadSave({
          data: {
            ...common,
            title: v("name"),
            personId: v("person") || null,
            companyId: v("company") || null,
            source: v("source") || null,
            status: v("status") as any,
            score: edit?.score ?? null,
            metadata: edit?.metadata ?? {},
          },
        });
      if (tab === "Tasks")
        await taskSave({
          data: {
            ...common,
            title: v("name"),
            description: v("description"),
            status: v("status") as any,
            priority: v("priority") as any,
            dueAt: v("due") ? new Date(v("due") + "T12:00:00Z").toISOString() : null,
            assigneeUserId: edit?.assignee_user_id ?? null,
            relatedType: edit?.related_type ?? null,
            relatedId: edit?.related_id ?? null,
            metadata: edit?.metadata ?? {},
          },
        });
      await cache.invalidateQueries({ queryKey: key });
      setEdit(null);
      toast.success("Saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell
      title="CRM · Customer 360"
      subtitle="Relationships, sales activity and client work in one suite."
      actions={
        <Link to={"/app/practice" as any}>
          <Button variant="outline">Open Practice</Button>
        </Link>
      }
    >
      <label className="mb-5 block max-w-sm text-sm">
        Workspace
        <select
          className={control + " mt-1"}
          value={workspace?.id ?? ""}
          onChange={(e) => {
            setProduct(e.target.value);
            setSelected(null);
            setEdit(null);
          }}
        >
          {workspaces.data?.map((w: Row) => (
            <option key={w.id} value={w.id}>
              {w.product_key} · {w.tenant_id.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      {workspaces.error || query.error ? (
        <p role="alert" className="rounded-lg border p-4">
          {(workspaces.error ?? query.error)?.message}
        </p>
      ) : workspaces.isPending || (query.isPending && !!workspace) ? (
        <p role="status">Loading CRM…</p>
      ) : !workspace ? (
        <p>Provision an active product workspace and enable crm.core to begin.</p>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-2">
            {["People", "Companies", "Leads", "Opportunities", "Tasks"].map((t) => (
              <Button
                key={t}
                variant={t === tab ? "default" : "outline"}
                onClick={() => {
                  setTab(t);
                  setSearch("");
                }}
              >
                {t} ({query.data?.[t as keyof typeof query.data]?.length ?? 0})
              </Button>
            ))}
          </div>
          <div className="mb-4 flex gap-3">
            <Input
              aria-label="Search CRM"
              placeholder="Search name, company or contact…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {writable && tab !== "Opportunities" && (
              <Button onClick={() => setEdit({})}>
                Add{" "}
                {tab === "People"
                  ? "person"
                  : tab === "Companies"
                    ? "company"
                    : tab === "Leads"
                      ? "lead"
                      : "task"}
              </Button>
            )}
          </div>
          {rows.length === 500 && (
            <p className="mb-3 text-sm">Showing the latest 500 records in this category.</p>
          )}
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-4">Name</th>
                  <th className="p-4">Details</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-4 font-medium">{r.display_name ?? r.name ?? r.title}</td>
                    <td className="p-4 text-muted-foreground">
                      {r.email ??
                        r.industry ??
                        r.description ??
                        r.source ??
                        (r.amount != null ? `${r.currency ?? ""} ${r.amount}` : "—")}
                    </td>
                    <td className="p-4">{r.lifecycle_stage ?? r.status}</td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        {writable && tab !== "Opportunities" && (
                          <Button size="sm" variant="outline" onClick={() => setEdit(r)}>
                            Edit
                          </Button>
                        )}
                        {["People", "Companies"].includes(tab) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelected({ ...r, kind: tab })}
                          >
                            Timeline
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && (
              <p className="p-10 text-center text-muted-foreground">
                No matching {tab.toLowerCase()}.
              </p>
            )}
          </div>
        </>
      )}
      <Dialog
        open={!!edit}
        onOpenChange={(v) => {
          if (!v && !busy) setEdit(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {edit?.id ? "Edit" : "Add"} {tab === "People" ? "person" : tab.toLowerCase()}
            </DialogTitle>
          </DialogHeader>
          {edit && (
            <form className="space-y-3" onSubmit={save}>
              <label className="block text-sm">
                Name / title
                <Input
                  name="name"
                  required
                  maxLength={200}
                  defaultValue={edit.display_name ?? edit.name ?? edit.title ?? ""}
                />
              </label>
              {tab === "People" && (
                <>
                  <label className="block text-sm">
                    Email
                    <Input name="email" type="email" defaultValue={edit.email ?? ""} />
                  </label>
                  <label className="block text-sm">
                    Phone (international format)
                    <Input name="phone" placeholder="+447…" defaultValue={edit.phone_e164 ?? ""} />
                  </label>
                </>
              )}
              {["People", "Leads"].includes(tab) && (
                <label className="block text-sm">
                  Company
                  <select name="company" className={control} defaultValue={edit.company_id ?? ""}>
                    <option value="">No company</option>
                    {query.data?.Companies.map((c: Row) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {tab === "Companies" && (
                <>
                  <label className="block text-sm">
                    Website
                    <Input name="website" type="url" defaultValue={edit.website ?? ""} />
                  </label>
                  <label className="block text-sm">
                    Industry
                    <Input name="industry" defaultValue={edit.industry ?? ""} />
                  </label>
                </>
              )}
              {tab === "Leads" && (
                <>
                  <label className="block text-sm">
                    Contact
                    <select name="person" className={control} defaultValue={edit.person_id ?? ""}>
                      <option value="">No contact</option>
                      {query.data?.People.map((p: Row) => (
                        <option key={p.id} value={p.id}>
                          {p.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    Source
                    <Input name="source" defaultValue={edit.source ?? ""} />
                  </label>
                </>
              )}
              {tab === "Tasks" && (
                <>
                  <label className="block text-sm">
                    Description
                    <Input name="description" defaultValue={edit.description ?? ""} />
                  </label>
                  <label className="block text-sm">
                    Due date
                    <Input type="date" name="due" defaultValue={edit.due_at?.slice(0, 10) ?? ""} />
                  </label>
                  <label className="block text-sm">
                    Priority
                    <select
                      name="priority"
                      className={control}
                      defaultValue={edit.priority ?? "normal"}
                    >
                      {["low", "normal", "high", "urgent"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <label className="block text-sm">
                Status
                <select
                  name="status"
                  className={control}
                  defaultValue={
                    edit.lifecycle_stage ??
                    edit.status ??
                    (tab === "People"
                      ? "contact"
                      : tab === "Companies"
                        ? "active"
                        : tab === "Leads"
                          ? "new"
                          : "open")
                  }
                >
                  {(tab === "People"
                    ? [
                        "subscriber",
                        "lead",
                        "contact",
                        "prospect",
                        "customer",
                        "former_customer",
                        "partner",
                        "supplier",
                      ]
                    : tab === "Companies"
                      ? ["active", "inactive", "prospect", "customer", "partner", "supplier"]
                      : tab === "Leads"
                        ? ["new", "working", "qualified", "unqualified", "converted", "closed"]
                        : ["open", "in_progress", "completed", "cancelled"]
                  ).map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.display_name ?? selected?.name} · Timeline</DialogTitle>
          </DialogHeader>
          {timeline.isPending ? (
            <p>Loading…</p>
          ) : timeline.error ? (
            <p role="alert">{timeline.error.message}</p>
          ) : timeline.data?.length ? (
            timeline.data.map((a: Row) => (
              <div key={a.id} className="border-b py-3">
                <p className="font-medium">{a.summary}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(a.occurred_at).toLocaleString("en-GB")}
                </p>
              </div>
            ))
          ) : (
            <p>No activity yet.</p>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
