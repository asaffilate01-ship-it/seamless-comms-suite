import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity, AlertTriangle, CheckCircle2, ClipboardList, Clock3,
  FileCheck2, LockKeyhole, Plus, RefreshCcw, ShieldCheck, Sparkles, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/app/shell";
import type { AiEmployee, WorkforceProfile } from "./functions";
import {
  createAiEmployeeTask, reviseAiEmployeeTask, getAiEmployeeTaskWorkspace, preflightAiEmployeeTask,
  requestAiEmployeeAccess, reviewAiEmployeeAccess, transitionAiEmployeeTask,
  type AiEmployeeTask, type AiEmployeeAccessProposal, type AiEmployeeTaskPreflight,
  type ProposedTaskTrigger,
} from "./tasks.functions";

type Props = { tenantId: string; productKey: string; employee: AiEmployee };
const capsOf = (employee: AiEmployee): string[] => {
  const data = employee.profile as Partial<WorkforceProfile>;
  return Array.isArray(data.capabilities) ? data.capabilities : [];
};
const newTrigger = (): ProposedTaskTrigger => ({ type: "manual", value: "", enabled: false });
const safeMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export function AIWorkforceTaskPanel({ tenantId, productKey, employee }: Props) {
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [outputSpec, setOutputSpec] = useState("Evidence-backed summary with source references");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("Cite sources, identify missing evidence, and prepare a reviewable draft.");
  const [requestedCaps, setRequestedCaps] = useState<string[]>([]);
  const [trigger, setTrigger] = useState<ProposedTaskTrigger>(newTrigger());
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [editingTask, setEditingTask] = useState<AiEmployeeTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [accessBusy, setAccessBusy] = useState(false);
  const [provider, setProvider] = useState("");
  const [capability, setCapability] = useState("");
  const [accessReason, setAccessReason] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [preflight, setPreflight] = useState<AiEmployeeTaskPreflight | null>(null);

  const listFn = useServerFn(getAiEmployeeTaskWorkspace);
  const createFn = useServerFn(createAiEmployeeTask);
  const reviseFn = useServerFn(reviseAiEmployeeTask);
  const transitionFn = useServerFn(transitionAiEmployeeTask);
  const preflightFn = useServerFn(preflightAiEmployeeTask);
  const requestAccessFn = useServerFn(requestAiEmployeeAccess);
  const reviewAccessFn = useServerFn(reviewAiEmployeeAccess);
  const query = useQuery({
    queryKey: ["ai-workforce-task-board", tenantId, productKey, employee.id],
    queryFn: () => listFn({ data: { tenantId, productKey, employeeId: employee.id } }),
    enabled: !!tenantId && !!productKey && !!employee.id, retry: false,
  });
  const capabilities = useMemo(() => capsOf(employee), [employee]);
  const tasks = query.data?.tasks ?? [];
  const access = query.data?.accessProposals ?? [];
  const events = query.data?.events ?? [];
  const active = employee.status === "approved_configuration";
  const formValid = title.trim().length >= 4 && title.trim().length <= 180 &&
    objective.trim().length >= 10 && objective.trim().length <= 3000 &&
    outputSpec.trim().length >= 4 && outputSpec.trim().length <= 1000 &&
    acceptanceCriteria.trim().length >= 8 && acceptanceCriteria.trim().length <= 1800 &&
    (trigger.type === "manual" && trigger.value === "" ||
      trigger.type === "daily" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(trigger.value) ||
      trigger.type === "weekly" && /^(MON|TUE|WED|THU|FRI|SAT|SUN) ([01][0-9]|2[0-3]):[0-5][0-9]$/.test(trigger.value) ||
      trigger.type === "event" && /^[a-z0-9][a-z0-9._-]{2,119}$/.test(trigger.value));

  function resetTaskForm() {
    setEditingTask(null);
    setTitle(""); setObjective(""); setRequestedCaps([]);
    setOutputSpec("Evidence-backed summary with source references");
    setAcceptanceCriteria("Cite sources, identify missing evidence, and prepare a reviewable draft.");
    setTrigger(newTrigger());
    setRequestKey(crypto.randomUUID());
  }

  function editTask(task: AiEmployeeTask) {
    if (!["draft","returned","approved_brief"].includes(task.status)) return;
    setEditingTask(task);
    setTitle(task.title);
    setObjective(task.objective);
    setOutputSpec(task.output_spec);
    setAcceptanceCriteria(task.acceptance_criteria);
    setRequestedCaps([...task.requested_capabilities]);
    setTrigger({...task.proposed_trigger,enabled:false});
    setPreflight(null);
  }

  async function addTask() {
    if (!formValid || busy) return;
    setBusy(true);
    try {
      const details = {
        tenantId, productKey, employeeId: employee.id,
        title: title.trim(), objective: objective.trim(),
        outputSpec: outputSpec.trim(), acceptanceCriteria: acceptanceCriteria.trim(),
        requestedCapabilities: requestedCaps, proposedTrigger: trigger,
      };
      if (editingTask) {
        await reviseFn({ data: {
          ...details, taskId: editingTask.id, expectedRevision: editingTask.revision,
        } });
      } else {
        await createFn({ data: { ...details, requestKey } });
      }
      const revised = !!editingTask;
      resetTaskForm(); setPreflight(null);
      toast.success(revised
        ? "Corrected draft saved. Independent approval must be obtained again."
        : "Task brief saved, with no external AI or app execution.");
      await query.refetch();
    } catch (e) { toast.error(safeMessage(e)); }
    finally { setBusy(false); }
  }

  async function changeTask(task: AiEmployeeTask, action: "submit" | "approve" | "return" | "cancel") {
    setBusy(true);
    try {
      const note = notes[task.id]?.trim() || null;
      if (action === "return" && (!note || note.length < 12)) {
        throw new Error("Enter a clear return-for-edit reason.");
      }
      await transitionFn({ data: {
        tenantId, productKey, employeeId: employee.id, taskId: task.id,
        action, note,
      } });
      setNotes(prev => ({ ...prev, [task.id]: "" }));
      setPreflight(null);
      await query.refetch();
      toast.success(action === "approve"
        ? "Written brief approved, not executed. Worker activation is still blocked."
        : "Task brief status updated.");
    } catch (e) { toast.error(safeMessage(e)); }
    finally { setBusy(false); }
  }

  async function inspect(task: AiEmployeeTask) {
    setBusy(true);
    try {
      const result = await preflightFn({ data: {
        tenantId, productKey, employeeId: employee.id, taskId: task.id,
      } });
      setPreflight(result);
      await query.refetch();
      toast.success("Read-only readiness report prepared; no AI calls or jobs.");
    } catch (e) { toast.error(safeMessage(e)); }
    finally { setBusy(false); }
  }

  async function requestAccess() {
    setAccessBusy(true);
    try {
      if (!capabilities.includes(capability)) throw new Error("Choose a proposed employee capability.");
      await requestAccessFn({ data: {
        tenantId, productKey, employeeId: employee.id,
        providerKey: provider.trim(), capabilityKey: capability,
        rationale: accessReason.trim(),
      } });
      setProvider(""); setCapability(""); setAccessReason("");
      toast.success("Metadata-only access proposal submitted; no connector linked or granted.");
      await query.refetch();
    } catch (e) { toast.error(safeMessage(e)); }
    finally { setAccessBusy(false); }
  }

  async function reviewAccess(row: AiEmployeeAccessProposal, decision: "shortlisted_metadata" | "declined" | "revoked") {
    setAccessBusy(true);
    try {
      const note = notes[row.id]?.trim() ?? "";
      if (note.length < 12) throw new Error("Add at least 12 characters of review evidence.");
      await reviewAccessFn({ data: {
        tenantId, productKey, employeeId: employee.id, proposalId: row.id,
        decision, note,
      } });
      setNotes(prev => ({ ...prev, [row.id]: "" }));
      await query.refetch();
      toast.success("Access proposal reviewed. This is NOT a live capability grant.");
    } catch (e) { toast.error(safeMessage(e)); }
    finally { setAccessBusy(false); }
  }

  return <div className="space-y-5">
    <Card><CardContent className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <ClipboardList className="h-5 w-5"/> AI employee task desk
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Draft assignments, submit for independent review and inspect readiness. No autonomous jobs are dispatched.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCcw className="mr-2 h-4 w-4"/> Refresh tasks
        </Button>
      </div>
      {query.isError && <p className="mt-4 rounded-md border p-3 text-sm text-destructive">
        Task controls are not available. Verify Phase 4A migration and the tenant entitlement.
        {query.error instanceof Error && <span className="mt-1 block">{query.error.message}</span>}
      </p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Written briefs" value={tasks.length}/>
        <Stat label="Awaiting review" value={tasks.filter(t => t.status === "pending_review").length}/>
        <Stat label="Live AI jobs" value={0}/>
      </div>
      {!active && <p className="mt-4 flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs">
        <LockKeyhole className="h-4 w-4 shrink-0"/>
        The employee is not an approved, unpaused configuration. You may prepare drafts, but cannot submit them for independent task review.
      </p>}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <h4 className="font-semibold">{editingTask ? `Edit brief · v${editingTask.revision}` : "New work assignment"}</h4>
          {editingTask && <p className="rounded-md bg-muted/50 p-2 text-xs">
            Revising a previously approved brief resets its approval. Save, then submit again for independent review.
          </p>}
          <Entry label="Task title"><Input value={title} onChange={e=>setTitle(e.target.value)}
            maxLength={180} placeholder="e.g. Investigate weekly order cancellations"/></Entry>
          <Entry label="What should the employee investigate or prepare?">
            <Textarea value={objective} onChange={e=>setObjective(e.target.value)}
              rows={3} maxLength={3000} placeholder="Define the business question and information needed."/></Entry>
          <Entry label="Expected deliverable"><Input value={outputSpec}
            onChange={e=>setOutputSpec(e.target.value)} maxLength={1000}/></Entry>
          <Entry label="Acceptance criteria"><Textarea value={acceptanceCriteria}
            onChange={e=>setAcceptanceCriteria(e.target.value)} maxLength={1800} rows={2}/></Entry>
          <Entry label="Proposed timing (saved inactive)">
            <div className="flex flex-wrap gap-2">
              <select className="h-10 rounded-md border bg-background px-2 text-sm"
                value={trigger.type} onChange={e=>{
                  const next = e.target.value as ProposedTaskTrigger["type"];
                  setTrigger({ type:next, enabled:false, value:
                    next==="daily"?"09:00":next==="weekly"?"MON 09:00":"" });
                }}>
                <option value="manual">Manual</option>
                <option value="daily">Daily proposal</option>
                <option value="weekly">Weekly proposal</option>
                <option value="event">Event proposal</option>
              </select>
              {trigger.type !== "manual" && <Input value={trigger.value}
                placeholder={trigger.type==="event"?"crm.lead.created":"09:00"}
                onChange={e=>setTrigger({...trigger,value:e.target.value,enabled:false})}/>}
            </div>
          </Entry>
          {!!capabilities.length && <div>
            <p className="text-sm font-medium">Requested inputs (not tool grants)</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {capabilities.map(cap => <label key={cap} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
                <input type="checkbox" checked={requestedCaps.includes(cap)}
                  onChange={e=>setRequestedCaps(prev=>e.target.checked?[...prev,cap]:prev.filter(x=>x!==cap))}/>
                {cap}
              </label>)}
            </div>
          </div>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={!formValid || busy || query.isError || employee.status==="retired"}
              onClick={addTask}><Plus className="mr-2 h-4 w-4"/>
              {editingTask ? "Save corrected brief" : "Save task brief"}
            </Button>
            {editingTask && <Button variant="outline" onClick={resetTaskForm}>Cancel editing</Button>}
          </div>
          <p className="text-xs text-muted-foreground">
            All instructions are stored for review. They cannot authorize a tool, schedule, message, payment or model call.
          </p>
        </div>

        <div>
          <h4 className="font-semibold">Task review queue</h4>
          <div className="mt-3 max-h-[670px] space-y-3 overflow-y-auto pr-1">
            {tasks.map(task=><div key={task.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1"><b className="text-sm">{task.title}</b>
                  <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{task.objective}</p>
                </div>
                <StatusBadge status={task.status}/>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">Employee v{task.employee_revision || "pending"}</Badge>
                <Badge variant="outline">Brief v{task.revision}</Badge>
                <Badge variant="outline">{task.proposed_trigger.type} · inactive</Badge>
                <Badge variant="outline">{task.requested_capabilities.length} requested tools</Badge>
              </div>
              {task.status==="pending_review" && <Entry label="Review note / corrections">
                <Textarea rows={2} className="mt-2" value={notes[task.id]??""}
                  onChange={e=>setNotes({...notes,[task.id]:e.target.value})}
                  placeholder="Review evidence or explanation for returning the brief."/>
              </Entry>}
              <div className="mt-3 flex flex-wrap gap-2">
                {["draft","returned","approved_brief"].includes(task.status) && <Button size="sm"
                  variant="outline" disabled={busy || employee.status==="retired"}
                  onClick={()=>editTask(task)}>Edit brief</Button>}
                {task.status==="draft" &&
                  <Button size="sm" disabled={busy || !active}
                    onClick={()=>changeTask(task,"submit")}>Submit brief</Button>}
                {task.status==="pending_review" && <>
                  <Button size="sm" disabled={busy || !active} onClick={()=>changeTask(task,"approve")}>
                    <FileCheck2 className="mr-1 h-4 w-4"/> Approve brief
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy || !notes[task.id] || notes[task.id].trim().length<12}
                    onClick={()=>changeTask(task,"return")}>Return</Button>
                </>}
                {task.status!=="cancelled" && <Button size="sm" variant="ghost" disabled={busy}
                  onClick={()=>changeTask(task,"cancel")}>Cancel</Button>}
                <Button size="sm" variant="outline" disabled={busy}
                  onClick={()=>inspect(task)}><Activity className="mr-1 h-4 w-4"/> Check readiness</Button>
              </div>
            </div>)}
            {!tasks.length && <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              This employee has no assigned work briefs yet.
            </p>}
          </div>
        </div>
      </div>
    </CardContent></Card>

    {preflight && <Card><CardContent className="p-5">
      <h4 className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="h-5 w-5"/> Controlled execution preflight
      </h4>
      <p className="mt-2 text-sm text-muted-foreground">
        This is an evidence checklist, not task execution. It has not accessed a model or an external service.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {Object.entries(preflight.checks).map(([key,value])=>
          <div key={key} className="flex items-center gap-2 text-sm">
            {value===true || (typeof value==="number"&&value===0)
              ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success"/>
              : <AlertTriangle className="h-4 w-4 shrink-0 text-warning"/>}
            <span className="min-w-0 break-words">{key.replace(/([A-Z])/g," $1")}: {String(value)}</span>
          </div>)}
      </div>
      <div className="mt-4 rounded-md border p-3">
        <b className="text-sm">Execution blocked ({preflight.blockers.length} checks)</b>
        <div className="mt-2 flex flex-wrap gap-2">
          {preflight.blockers.map((reason,i)=><Badge key={i} variant="outline">
            <XCircle className="mr-1 h-3 w-3"/>{reason.replaceAll("_"," ")}
          </Badge>)}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Model calls: {preflight.modelCalls} · Tool calls: {preflight.toolCalls} · Queued jobs: {preflight.queuedJobs}
        </p>
      </div>
    </CardContent></Card>}

    <Card><CardContent className="p-5">
      <h3 className="flex items-center gap-2 font-semibold">
        <LockKeyhole className="h-5 w-5"/> App and connector access proposals
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        This is a review inbox only. Shortlisting is NOT an OAuth login, MCP installation, capability grant,
        source data permission, or evidence of provider health.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Entry label="Capability from employee profile">
            <select value={capability} onChange={e=>setCapability(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Choose a proposed capability</option>
              {capabilities.map(cap=><option key={cap} value={cap}>{cap}</option>)}
            </select>
          </Entry>
          <Entry label="Proposed provider identifier"><Input value={provider} maxLength={100}
            onChange={e=>setProvider(e.target.value)} placeholder="e.g. hubspot"/></Entry>
          <Entry label="Why is this access required?">
            <Textarea value={accessReason} onChange={e=>setAccessReason(e.target.value)}
              maxLength={900} rows={3} placeholder="Explain minimum required scope, business purpose and data type."/>
          </Entry>
          <Button variant="outline" onClick={requestAccess} disabled={
            accessBusy || employee.status==="retired" || !capability ||
            !/^[a-z0-9][a-z0-9._-]{1,99}$/.test(provider.trim()) || accessReason.trim().length<12
          }><Plus className="mr-2 h-4 w-4"/> Request setup review</Button>
        </div>
        <div className="space-y-3">
          {access.map(row=><div key={row.id} className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b>{row.capability_key} · {row.provider_key}</b><StatusBadge status={row.status}/>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{row.rationale}</p>
            {["requested","shortlisted_metadata"].includes(row.status) && <>
              <Textarea className="mt-3" rows={2} placeholder="Record independent review evidence."
                value={notes[row.id]??""} onChange={e=>setNotes({...notes,[row.id]:e.target.value})}/>
              <div className="mt-2 flex flex-wrap gap-2">
                {row.status==="requested" && <>
                  <Button size="sm" variant="outline" disabled={accessBusy || (notes[row.id]??"").trim().length<12}
                    onClick={()=>reviewAccess(row,"shortlisted_metadata")}>Shortlist metadata</Button>
                  <Button size="sm" variant="ghost" disabled={accessBusy || (notes[row.id]??"").trim().length<12}
                    onClick={()=>reviewAccess(row,"declined")}>Decline</Button>
                </>}
                {row.status==="shortlisted_metadata" && <Button size="sm" variant="outline"
                  disabled={accessBusy || (notes[row.id]??"").trim().length<12}
                  onClick={()=>reviewAccess(row,"revoked")}>Revoke shortlist</Button>}
              </div>
            </>}
          </div>)}
          {!access.length && <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            No connector access requests have been proposed for this employee.
          </p>}
        </div>
      </div>
    </CardContent></Card>

    <Card><CardContent className="p-5">
      <h4 className="flex items-center gap-2 font-semibold">
        <Clock3 className="h-5 w-5"/> Evidence timeline
      </h4>
      <div className="mt-3 space-y-2">
        {events.slice(0,12).map(event=><div key={event.id} className="flex flex-wrap justify-between gap-2 border-b py-2 text-xs">
          <span>{event.event_type.replaceAll("_"," ")} · {event.task_id.slice(0,8)}</span>
          <span className="text-muted-foreground">{new Date(event.created_at).toLocaleString()}</span>
        </div>)}
        {!events.length && <p className="text-xs text-muted-foreground">No task events recorded.</p>}
      </div>
    </CardContent></Card>
  </div>;
}

function Stat({label,value}:{label:string;value:number}) {
  return <div className="rounded-lg border p-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
  </div>;
}
function Entry({label,children}:{label:string;children:React.ReactNode}) {
  return <label className="block space-y-2 text-sm font-medium"><span>{label}</span>{children}</label>;
}
