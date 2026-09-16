import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/app/shell";
import { listComplianceWorkspaces, complianceOperation } from "@/modules/rrci/functions";
import type { HostAccess } from "@/modules/rrci/contracts";
import { procurementRequest, type ProcurementRequest } from "./functions";
import { PACKS } from "./catalog";
import { effectiveStatus, STATUS_LABELS, summarise } from "./readiness";
import type { Pack, Requirement, RequirementEdit, Snapshot } from "./contracts";
import "./procurement.css";

const control = "pr-input";
function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Unable to complete the request.";
}
function SafeLink({ href, children }: { href: string; children: React.ReactNode }) {
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" || url.username || url.password) return <span>{children}</span>;
  } catch {
    return <span>{children}</span>;
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="pr-link">
      {children}
      <ArrowUpRight size={14} />
    </a>
  );
}
function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="pr-field">
      <span>{label}</span>
      <input className={control} {...props} />
    </label>
  );
}

export default function ProcurementWorkspace() {
  const list = useServerFn(listComplianceWorkspaces);
  const query = useQuery({ queryKey: ["procurement-workspaces"], queryFn: () => list() });
  const [chosen, setChosen] = useState("");
  const workspaces = query.data ?? [];
  const access = workspaces.find((w) => w.workspace === chosen) ?? workspaces[0];
  return (
    <AppShell
      title="Procurement & partner readiness"
      subtitle="Prepare the evidence. Show your scope. Keep qualifications current."
    >
      <div className="pr-workspace">
        <section className="pr-hero">
          <div>
            <span className="pr-eyebrow">OMNIQORA · SUPPLIER ASSURANCE</span>
            <h2>Be prepared for your next contract.</h2>
            <p>
              Build a company dossier for public procurement, Aramco and bank partnerships. Bring
              requirements, evidence and accountable reviews together.
            </p>
          </div>
          <ShieldCheck size={52} />
        </section>
        {query.isPending && <p role="status">Loading your authorised workspaces…</p>}
        {query.error && (
          <p role="alert" className="pr-error">
            {errorText(query.error)}{" "}
            <button className="pr-link" onClick={() => void query.refetch()}>
              Retry
            </button>
          </p>
        )}
        {access ? (
          <>
            <label className="pr-field pr-workspace-picker">
              <span>Compliance workspace</span>
              <select
                className={control}
                value={access.workspace}
                onChange={(e) => setChosen(e.target.value)}
              >
                {workspaces.map((w) => (
                  <option key={w.workspace} value={w.workspace}>
                    {w.name} · {w.environment}
                  </option>
                ))}
              </select>
            </label>
            <AssessmentWorkspace key={`${access.subject}:${access.workspace}`} access={access} />
          </>
        ) : (
          <>
            <section className="pr-panel">
              <h3>Enable your readiness workspace</h3>
              <p>
                Your administrator can activate the compliance add-on and assign access. The
                requirement packs below are available to preview.
              </p>
            </section>
            <PackGallery selected="aramco-ccc-plus" onSelect={() => {}} preview />
          </>
        )}
        <p className="pr-footnote">
          Internal readiness reviews support supplier preparation. Certification, registration,
          buyer acceptance and contract awards are separate decisions by the relevant organisations.
          Starter packs must be checked against the current contract and official requirements.
        </p>
      </div>
    </AppShell>
  );
}

function PackGallery({
  selected,
  onSelect,
  preview = false,
}: {
  selected: string;
  onSelect: (pack: string) => void;
  preview?: boolean;
}) {
  return (
    <section aria-label="Readiness packs" className="pr-packs">
      {PACKS.map((pack) => (
        <button
          type="button"
          key={pack.id}
          className={`pr-pack ${selected === pack.id ? "pr-pack-selected" : ""} ${pack.id === "aramco-ccc-plus" ? "pr-priority" : ""}`}
          onClick={() => onSelect(pack.id)}
          aria-pressed={!preview && selected === pack.id}
          disabled={preview}
        >
          <span className="pr-eyebrow">
            {pack.id === "aramco-ccc-plus"
              ? "PRIORITY · CCC+"
              : `${pack.requirements.length} READINESS AREAS`}
          </span>
          <h3>{pack.title}</h3>
          <p>{pack.description}</p>
        </button>
      ))}
    </section>
  );
}

function AssessmentWorkspace({ access }: { access: HostAccess }) {
  const call = useServerFn(procurementRequest);
  const cache = useQueryClient();
  const [assessmentId, setAssessmentId] = useState("");
  const [packId, setPackId] = useState("aramco-ccc-plus");
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [notice, setNotice] = useState("");
  const key = ["procurement", access.subject, access.workspace, assessmentId];
  const snapshot = useQuery({
    queryKey: key,
    queryFn: async () =>
      JSON.parse(
        (
          await call({
            data: {
              operation: "snapshot",
              workspace: access.workspace,
              ...(assessmentId ? { assessment: assessmentId } : {}),
            },
          })
        ).payload,
      ) as Snapshot,
  });
  const mutation = useMutation({
    mutationFn: async (data: ProcurementRequest) => JSON.parse((await call({ data })).payload),
    onSuccess: async () => {
      await cache.invalidateQueries({
        queryKey: ["procurement", access.subject, access.workspace],
      });
    },
  });
  const assessments = snapshot.data?.assessments ?? [];
  const assessment = assessments.find((a) => a.id === assessmentId);
  const items = snapshot.data?.requirements ?? [];
  const pack = PACKS.find((p) => p.id === (assessment?.pack_id ?? packId))!;
  const stats = summarise(items);
  const canWrite = access.permissions.includes("write");
  const canReview = access.permissions.includes("approve");
  async function run(data: ProcurementRequest) {
    setNotice("");
    await mutation.mutateAsync(data);
    setNotice("Saved.");
  }
  async function download() {
    setNotice("");
    try {
      const payload = await mutation.mutateAsync({
        operation: "export",
        workspace: access.workspace,
        assessment: assessmentId,
      });
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `Omniqora-Supplier-Dossier-${assessmentId.slice(0, 8)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setNotice(
        "Dossier downloaded. Private evidence links, notes and staff details are excluded.",
      );
    } catch {
      /* Mutation error is displayed below. */
    }
  }
  const visible = items
    .filter((item) => {
      const state = effectiveStatus(item);
      const matchesText = `${item.template.title} ${item.template.category} ${item.owner_name}`
        .toLowerCase()
        .includes(search.toLowerCase());
      return (
        matchesText &&
        (filter === "all" ||
          (filter === "gaps" && !["reviewed", "not_applicable"].includes(state)) ||
          (filter === "review" && state === "evidence_ready") ||
          (filter === "expired" && state === "expired"))
      );
    })
    .sort((a, b) => a.template.key.localeCompare(b.template.key));
  return (
    <>
      <div className="pr-toolbar">
        <label className="pr-field pr-grow">
          <span>Assessment</span>
          <select
            className={control}
            disabled={mutation.isPending}
            value={assessmentId}
            onChange={(e) => {
              setAssessmentId(e.target.value);
              setCreating(false);
              setNotice("");
              mutation.reset();
            }}
          >
            <option value="">Select an assessment</option>
            {assessments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.legal_entity}
              </option>
            ))}
          </select>
        </label>
        {canWrite && (
          <button
            className="pr-button"
            onClick={() => {
              setCreating(!creating);
              setAssessmentId("");
            }}
            disabled={mutation.isPending}
          >
            <Plus size={17} />
            New assessment
          </button>
        )}
      </div>
      {snapshot.isPending && <p role="status">Loading readiness records…</p>}
      {(snapshot.error || mutation.error) && (
        <p role="alert" className="pr-error">
          {errorText(snapshot.error ?? mutation.error)}{" "}
          <button
            className="pr-link"
            onClick={() => {
              mutation.reset();
              void snapshot.refetch();
            }}
          >
            Reload
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="pr-success">
          {notice}
        </p>
      )}
      {!assessment && !snapshot.error && (
        <>
          <PackGallery
            selected={packId}
            onSelect={(id) => {
              setPackId(id);
              if (canWrite) setCreating(true);
            }}
          />
          <div className="pr-callout">
            <strong>{PACKS.find((p) => p.id === packId)?.title}</strong>
            <p>{PACKS.find((p) => p.id === packId)?.caution}</p>
          </div>
          {creating && canWrite && (
            <CreateAssessment
              key={packId}
              pack={PACKS.find((p) => p.id === packId)!}
              busy={mutation.isPending}
              onCreate={async (fields) => {
                const result = await mutation.mutateAsync({
                  operation: "create",
                  workspace: access.workspace,
                  pack: packId,
                  ...fields,
                });
                setAssessmentId(result.id);
                setCreating(false);
              }}
            />
          )}
        </>
      )}
      {assessment && (
        <>
          <section className="pr-panel">
            <div className="pr-section-heading">
              <div>
                <span className="pr-eyebrow">
                  {pack.title} · {assessment.pack_version}
                </span>
                <h2>{assessment.legal_entity}</h2>
                <p>
                  {assessment.buyer} · {assessment.country}
                </p>
              </div>
              <button
                className="pr-button pr-secondary"
                disabled={mutation.isPending || snapshot.isFetching}
                onClick={() => void download()}
              >
                <ArrowDownToLine size={17} />
                Export dossier
              </button>
            </div>
            <p className="pr-scope">{assessment.scope}</p>
            <p className="pr-footnote">{pack.caution}</p>
            <p className="pr-footnote">
              Pack sources checked {pack.source_checked_on}. Review source changes and add the
              buyer’s current detailed requirements.
            </p>
          </section>
          <section className="pr-stats" aria-label="Readiness progress">
            <Stat
              icon={CheckCircle2}
              value={`${stats.reviewed}/${stats.applicable}`}
              label="Internally reviewed"
            />
            <Stat
              icon={ClipboardCheck}
              value={stats.applicable - stats.reviewed}
              label="Open requirements"
            />
            <Stat icon={CalendarClock} value={stats.expired} label="Expired evidence" />
            <Stat icon={Building2} value={stats.renewal} label="Renew within 30 days" />
          </section>
          <div className="pr-progress">
            <div className="pr-section-heading">
              <span>{stats.percent}% of applicable checklist items internally reviewed</span>
              <span>
                {stats.excluded} excluded · {stats.overdue} overdue
              </span>
            </div>
            <progress
              max="100"
              value={stats.percent}
              aria-label="Internal checklist review progress"
            />
            <small>Checklist progress is not a certification or a probability of approval.</small>
          </div>
          {assessment.pack_id === "aramco-ccc-plus" && (
            <section className="pr-callout pr-ccc">
              <ShieldCheck size={26} />
              <div>
                <strong>CCC+ assessment gates</strong>
                <p>
                  Confirm scope → map all applicable controls → prepare operating evidence →
                  authorised on-site assessment → close findings → record issued CCC+ → submit and
                  maintain.
                </p>
                <p>
                  Core milestones cannot be marked not applicable. The certificate item requires
                  issuer, reference, evidence and expiry before internal review.
                </p>
              </div>
            </section>
          )}
          <div className="pr-toolbar">
            <Field
              label="Search requirements or owners"
              placeholder="Search this assessment"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="pr-field">
              <span>Show</span>
              <select
                className={control}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All requirements</option>
                <option value="gaps">Open gaps</option>
                <option value="review">Awaiting review</option>
                <option value="expired">Expired evidence</option>
              </select>
            </label>
          </div>
          <div className="pr-requirements">
            {visible.map((item) => (
              <RequirementCard
                key={`${item.id}:${item.version}`}
                item={item}
                canWrite={canWrite}
                canReview={canReview}
                busy={mutation.isPending}
                onSave={(changes) =>
                  run({
                    operation: "save",
                    workspace: access.workspace,
                    id: item.id,
                    version: item.version,
                    changes,
                  })
                }
                onReview={(decision, reason) =>
                  run({
                    operation: "review",
                    workspace: access.workspace,
                    id: item.id,
                    version: item.version,
                    decision,
                    reason,
                  })
                }
              />
            ))}
          </div>
          {!visible.length && <p className="pr-panel">No requirements match this view.</p>}
          {canWrite && (
            <AddRequirement
              busy={mutation.isPending}
              onAdd={(template) =>
                run({
                  operation: "add",
                  workspace: access.workspace,
                  assessment: assessmentId,
                  template,
                })
              }
            />
          )}
          <KnowledgeHelp key={assessmentId} workspace={access.workspace} />
          {access.permissions.includes("audit") && (
            <details className="pr-panel">
              <summary>Recent audit history · latest 100 events</summary>
              <ol className="pr-audit">
                {snapshot.data?.audit.map((event) => (
                  <li key={event.id}>
                    <strong>{event.action.replaceAll(".", " ")}</strong>
                    <span>{new Date(event.created_at).toLocaleString()}</span>
                    <small>Actor: {event.actor}</small>
                    <details>
                      <summary>Review details</summary>
                      <pre>{JSON.stringify(event.detail, null, 2)}</pre>
                    </details>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </>
  );
}
function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof ShieldCheck;
  value: string | number;
  label: string;
}) {
  return (
    <div>
      <Icon size={20} />
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
function CreateAssessment({
  pack,
  busy,
  onCreate,
}: {
  pack: Pack;
  busy: boolean;
  onCreate: (fields: {
    name: string;
    entity: string;
    buyer: string;
    country: string;
    scope: string;
  }) => Promise<void>;
}) {
  return (
    <form
      className="pr-panel"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void onCreate({
          name: String(f.get("name")),
          entity: String(f.get("entity")),
          buyer: String(f.get("buyer")),
          country: String(f.get("country")),
          scope: String(f.get("scope")),
        }).catch(() => {});
      }}
    >
      <h3>Start · {pack.title}</h3>
      <fieldset disabled={busy} className="pr-form-grid">
        <Field
          label="Assessment name"
          name="name"
          minLength={3}
          maxLength={160}
          required
          placeholder="IT services supplier qualification"
        />
        <Field
          label="Legal entity"
          name="entity"
          minLength={2}
          maxLength={200}
          required
          placeholder="Registered company name"
        />
        <Field
          label="Target buyer"
          name="buyer"
          minLength={2}
          maxLength={200}
          required
          defaultValue={pack.id.includes("aramco") ? "Saudi Aramco" : ""}
        />
        <Field
          label="Supplier country / jurisdiction"
          name="country"
          minLength={2}
          maxLength={100}
          required
          placeholder="United Kingdom"
        />
        <label className="pr-field pr-wide">
          <span>Service and assessment scope</span>
          <textarea
            className={control}
            name="scope"
            required
            minLength={10}
            maxLength={2000}
            placeholder="Describe the services, sites, systems, data and contract covered. Include the tender reference if known."
          />
        </label>
        <button className="pr-button" type="submit">
          Create assessment
        </button>
      </fieldset>
    </form>
  );
}
function RequirementCard({
  item,
  canWrite,
  canReview,
  busy,
  onSave,
  onReview,
}: {
  item: Requirement;
  canWrite: boolean;
  canReview: boolean;
  busy: boolean;
  onSave: (changes: RequirementEdit) => Promise<void>;
  onReview: (
    decision: "reviewed" | "not_applicable" | "in_progress",
    reason: string,
  ) => Promise<void>;
}) {
  const state = effectiveStatus(item);
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  return (
    <article className="pr-requirement">
      <div className="pr-section-heading">
        <div>
          <span className="pr-eyebrow">
            {item.template.category}
            {item.template.mandatory ? " · REQUIRED MILESTONE" : ""}
          </span>
          <h3>{item.template.title}</h3>
        </div>
        <span className={`pr-status pr-status-${state}`}>{STATUS_LABELS[state]}</span>
      </div>
      <p>{item.template.guidance}</p>
      <details className="pr-guidance">
        <summary>Scope, evidence and source</summary>
        <p>
          <strong>Applies:</strong> {item.template.applies_when}
        </p>
        <p>
          <strong>Prepare:</strong> {item.template.evidence}
        </p>
        <SafeLink href={item.template.source_url}>Official or buyer source</SafeLink>
      </details>
      <div className="pr-meta">
        <span>Owner: {item.owner_name || "Unassigned"}</span>
        {item.due_date && <span>Due: {item.due_date}</span>}
        {item.valid_until && <span>Evidence expires: {item.valid_until}</span>}
      </div>
      {item.evidence_title && (
        <div className="pr-evidence">
          <SafeLink href={item.evidence_url}>{item.evidence_title}</SafeLink>
          {item.issuer && (
            <small>
              Reported issuer / buyer: {item.issuer} · {item.reference}
            </small>
          )}
        </div>
      )}
      {item.notes && <p className="pr-notes">{item.notes}</p>}
      {item.review_reason && (
        <p className="pr-review-note">
          <strong>Internal review:</strong> {item.review_reason}
        </p>
      )}
      <div className="pr-actions">
        {canWrite && (
          <button
            className="pr-button pr-secondary"
            disabled={busy}
            onClick={() => setEditing(!editing)}
          >
            {editing ? "Close editor" : "Update evidence & action"}
          </button>
        )}
        {canReview && (
          <button
            className="pr-button pr-secondary"
            disabled={busy}
            onClick={() => setReviewing(!reviewing)}
          >
            {reviewing ? "Close review" : "Review requirement"}
          </button>
        )}
      </div>
      {editing && (
        <form
          className="pr-editor"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const text = (k: string) => String(f.get(k) ?? "");
            void onSave({
              status: text("status") as RequirementEdit["status"],
              owner_name: text("owner_name"),
              due_date: text("due_date") || null,
              evidence_title: text("evidence_title"),
              evidence_url: text("evidence_url"),
              issuer: text("issuer"),
              reference: text("reference"),
              valid_until: text("valid_until") || null,
              notes: text("notes"),
            }).catch(() => {});
          }}
        >
          <fieldset disabled={busy} className="pr-form-grid">
            <label className="pr-field">
              <span>Working status</span>
              <select
                className={control}
                name="status"
                defaultValue={
                  ["not_started", "in_progress", "evidence_ready"].includes(item.status)
                    ? item.status
                    : "in_progress"
                }
              >
                <option value="not_started">Not started</option>
                <option value="in_progress">In progress</option>
                <option value="evidence_ready">Submit evidence for review</option>
              </select>
            </label>
            <Field
              label="Action owner"
              name="owner_name"
              maxLength={120}
              defaultValue={item.owner_name}
            />
            <Field
              label="Action due date"
              name="due_date"
              type="date"
              defaultValue={item.due_date ?? ""}
            />
            <Field
              label="Evidence title"
              name="evidence_title"
              maxLength={200}
              defaultValue={item.evidence_title}
            />
            <Field
              label="Secure evidence link"
              name="evidence_url"
              type="url"
              placeholder="https://your-secure-vault/..."
              maxLength={1500}
              defaultValue={item.evidence_url}
            />
            <Field
              label="Actual issuer / buyer (if applicable)"
              name="issuer"
              maxLength={200}
              defaultValue={item.issuer}
            />
            <Field
              label="Certificate / registration / decision reference"
              name="reference"
              maxLength={200}
              defaultValue={item.reference}
            />
            <Field
              label="Evidence valid until"
              name="valid_until"
              type="date"
              defaultValue={item.valid_until ?? ""}
            />
            <label className="pr-field pr-wide">
              <span>Gaps, next action and internal notes</span>
              <textarea
                className={control}
                name="notes"
                maxLength={4000}
                defaultValue={item.notes}
              />
            </label>
            <p className="pr-footnote pr-wide">
              Link to an access-controlled evidence repository. Changing this record resets its
              internal review. Evidence links are not fetched automatically.
            </p>
            <button className="pr-button" type="submit">
              Save evidence
            </button>
          </fieldset>
        </form>
      )}
      {reviewing && (
        <form
          className="pr-editor"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void onReview(
              String(f.get("decision")) as "reviewed" | "not_applicable" | "in_progress",
              String(f.get("reason")),
            ).catch(() => {});
          }}
        >
          <fieldset disabled={busy} className="pr-form-grid">
            <label className="pr-field">
              <span>Review decision</span>
              <select className={control} name="decision">
                <option value="in_progress">Request further work</option>
                <option
                  value="reviewed"
                  disabled={item.status !== "evidence_ready" || state === "expired"}
                >
                  Evidence internally reviewed
                </option>
                {!item.template.mandatory && (
                  <option value="not_applicable">Not applicable to this scope</option>
                )}
              </select>
            </label>
            <label className="pr-field pr-wide">
              <span>Reason and evidence checked</span>
              <textarea
                className={control}
                name="reason"
                minLength={10}
                maxLength={2000}
                required
                placeholder="Explain the decision, evidence checked and any scope limitations."
              />
            </label>
            <p className="pr-footnote pr-wide">
              This is an internal review. It cannot issue a certificate or record a buyer decision
              that has not occurred.
            </p>
            <button className="pr-button" type="submit">
              Save review
            </button>
          </fieldset>
        </form>
      )}
    </article>
  );
}
function AddRequirement({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (template: Extract<ProcurementRequest, { operation: "add" }>["template"]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details className="pr-panel" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Add a buyer-specific requirement or SACS-210 control</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          const text = (key: string) => String(f.get(key));
          void onAdd({
            title: text("title"),
            kind: text("kind") as Requirement["template"]["kind"],
            applies_when: text("applies_when"),
            guidance: text("guidance"),
            evidence: text("evidence"),
            source_url: text("source_url"),
          })
            .then(() => {
              form.reset();
              setOpen(false);
            })
            .catch(() => {});
        }}
      >
        <fieldset className="pr-form-grid" disabled={busy}>
          <Field
            label="Control reference and title"
            name="title"
            minLength={3}
            maxLength={200}
            required
          />
          <label className="pr-field">
            <span>Requirement type</span>
            <select className={control} name="kind">
              <option value="readiness">Readiness evidence</option>
              <option value="registration">Registration</option>
              <option value="certification">Certificate / assurance</option>
              <option value="buyer_decision">Buyer decision</option>
            </select>
          </label>
          <Field
            label="When this applies"
            name="applies_when"
            minLength={3}
            maxLength={1000}
            required
          />
          <Field
            label="Required evidence"
            name="evidence"
            minLength={3}
            maxLength={1000}
            required
          />
          <Field
            label="Official or private buyer source URL"
            name="source_url"
            type="url"
            maxLength={1500}
            required
          />
          <label className="pr-field pr-wide">
            <span>Requirement and next action</span>
            <textarea className={control} name="guidance" minLength={3} maxLength={2000} required />
          </label>
          <button className="pr-button" type="submit">
            <Plus size={16} />
            Add requirement
          </button>
        </fieldset>
      </form>
    </details>
  );
}
function KnowledgeHelp({ workspace }: { workspace: string }) {
  const ask = useServerFn(complianceOperation);
  const [question, setQuestion] = useState("");
  const query = useMutation({
    mutationFn: async () =>
      JSON.parse(
        (
          await ask({
            data: {
              workspace,
              operation: "query",
              payload: { question: question.trim(), mode: "hybrid", top_k: 5 },
            },
          })
        ).payload,
      ) as Record<string, unknown>,
  });
  return (
    <details className="pr-panel">
      <summary>Ask connected knowledge for supporting evidence</summary>
      <p>
        Search the approved information already connected to this compliance workspace. Evidence
        links in this checklist are not automatically ingested. Answers are drafts and cannot change
        review or certification status.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          query.mutate();
        }}
      >
        <label className="pr-field">
          <span>Question</span>
          <textarea
            className={control}
            required
            maxLength={2000}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Which approved records support our access-control response?"
          />
        </label>
        <button className="pr-button" disabled={query.isPending || !question.trim()}>
          {query.isPending ? "Searching…" : "Ask with evidence"}
        </button>
      </form>
      {query.error && (
        <p role="alert" className="pr-error">
          {errorText(query.error)}
        </p>
      )}
      {query.data && (
        <div aria-live="polite">
          <p className="pr-notes">
            {typeof query.data.answer === "string"
              ? query.data.answer
              : "Review the returned sources below."}
          </p>
          <details>
            <summary>Sources and review details</summary>
            <pre className="pr-json">{JSON.stringify(query.data, null, 2)}</pre>
          </details>
        </div>
      )}
    </details>
  );
}
