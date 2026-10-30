import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getFactoryRunHistory,
  getFactoryRunDetail,
  cancelFactoryQueuedRun,
} from "./run-history.functions";

const guidance: Record<string, string> = {
  queued: "Waiting for a worker. A queued record does not establish that a worker is connected.",
  running: "The worker reports this task as running. Refresh to check for new evidence.",
  waiting_review: "Human review is required. Review the task in AI Control before taking action.",
  completed: "The worker reports completion. Review its output before relying on it.",
  failed: "The worker reports failure. Inspect the worker logs before starting another task.",
  cancelled: "The task is recorded as cancelled.",
  stale: "The task needs operator investigation. Check worker and usage records before retrying.",
};
const date = (value: string) =>
  Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "Time unavailable";

export function RunHistoryPanel({
  tenantId,
  productKey,
  refreshVersion,
  onChanged,
}: {
  tenantId: string;
  productKey: string;
  refreshVersion: number;
  onChanged: () => Promise<unknown>;
}) {
  const [page, setPage] = useState(0),
    [selected, setSelected] = useState<string | null>(null),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false);
  const listFn = useServerFn(getFactoryRunHistory),
    detailFn = useServerFn(getFactoryRunDetail),
    cancelFn = useServerFn(cancelFactoryQueuedRun);
  const common = { retry: false as const, staleTime: 0, gcTime: 0 };
  const history = useQuery({
    ...common,
    queryKey: ["factory-run-history", tenantId, productKey, page, refreshVersion],
    queryFn: () => listFn({ data: { tenantId, productKey, page } }),
  });
  const detail = useQuery({
    ...common,
    queryKey: ["factory-run-detail", tenantId, productKey, selected, refreshVersion],
    enabled: !!selected,
    queryFn: () => detailFn({ data: { tenantId, productKey, runId: selected! } }),
  });
  async function refresh() {
    setConfirm(false);
    await Promise.all([history.refetch(), ...(selected ? [detail.refetch()] : [])]);
  }
  async function cancel() {
    if (!selected || !confirm) return;
    setBusy(true);
    try {
      await cancelFn({ data: { tenantId, productKey, runId: selected } });
      toast.success("Queued task cancelled and reserved budget released");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cancellation unavailable");
    } finally {
      setConfirm(false);
      await refresh();
      setBusy(false);
      try {
        await onChanged();
      } catch {
        toast.error("Task status refreshed; the budget summary could not refresh.");
      }
    }
  }
  const evidence = !detail.isFetching && !detail.error ? detail.data : undefined;
  return (
    <section aria-label="Agent run history" className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Agent run history</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || history.isFetching || detail.isFetching}
          onClick={refresh}
        >
          Refresh runs
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Recorded task status and step metadata. Worker availability, output accuracy and live
        connections require separate verification.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2" aria-live="polite">
          {history.isFetching ? (
            <p>Loading run history…</p>
          ) : history.error ? (
            <p role="alert">Run history unavailable. Refresh to check access and connection.</p>
          ) : (
            <>
              {history.data?.runs.length === 0 && <p>No runs on this page.</p>}
              {history.data?.runs.map((run) => (
                <button
                  type="button"
                  key={run.id}
                  disabled={busy}
                  aria-pressed={selected === run.id}
                  onClick={() => {
                    setSelected(run.id);
                    setConfirm(false);
                  }}
                  className={
                    "w-full rounded-lg border p-3 text-left hover:bg-muted/50 " +
                    (selected === run.id ? "border-primary" : "")
                  }
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <strong>{run.profile}</strong>
                    <Badge variant="outline">{run.status.replaceAll("_", " ")}</Badge>
                  </div>
                  <p className="mt-1 text-xs">{date(run.created_at)}</p>
                  <p className="break-all text-xs text-muted-foreground">{run.id}</p>
                </button>
              ))}
            </>
          )}
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page === 0 || history.isFetching || busy}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-xs">Page {page + 1}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                !history.data?.hasMore ||
                !!history.error ||
                history.isFetching ||
                busy ||
                page >= 10000
              }
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            20 runs per page. New tasks can shift page boundaries.
          </p>
        </div>
        <div className="space-y-3" aria-live="polite">
          {!selected ? (
            <p>Select a run to inspect its steps.</p>
          ) : detail.isFetching ? (
            <p>Loading run evidence…</p>
          ) : detail.error ? (
            <p role="alert">Run evidence unavailable. Refresh to check access and connection.</p>
          ) : (
            evidence && (
              <>
                <h4 className="font-medium">Recorded execution</h4>
                <p className="text-sm">
                  {guidance[evidence.run.status] ??
                    "Unknown status. Ask an operator to inspect this task."}
                </p>
                <p className="text-xs">Last updated: {date(evidence.run.updated_at)}</p>
                {evidence.steps.length === 0 ? (
                  <p className="text-sm">No step records are visible.</p>
                ) : (
                  <ol className="space-y-2">
                    {evidence.steps.map((step) => (
                      <li key={step.step_no} className="rounded-lg bg-muted/40 p-2 text-sm">
                        Step {step.step_no}: {step.step_type} · {step.status}
                        <p className="text-xs text-muted-foreground">{date(step.created_at)}</p>
                      </li>
                    ))}
                  </ol>
                )}
                {evidence.truncated && <p>Only the first 64 step records are shown.</p>}
                {evidence.canCancel && (
                  <div className="space-y-2">
                    {confirm ? (
                      <>
                        <p className="text-sm">
                          Cancel this queued task? The server will refuse if processing has started.
                        </p>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={busy}
                          onClick={cancel}
                        >
                          Confirm cancellation
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => setConfirm(false)}
                        >
                          Keep task
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => setConfirm(true)}
                      >
                        Cancel queued task
                      </Button>
                    )}
                  </div>
                )}
              </>
            )
          )}
        </div>
      </div>
    </section>
  );
}
