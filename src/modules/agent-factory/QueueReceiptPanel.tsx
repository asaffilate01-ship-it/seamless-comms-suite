import { parseReferenceFile, referenceFileLimit, requestReference } from "./reference-file";
import { QueueReferenceActions } from "./QueueReferenceActions";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findFactoryQueueReceipt } from "./receipt-lookup.functions";
const time = (value: string | null) =>
  value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "Not recorded";
export function QueueReceiptPanel({
  tenantId,
  productKey,
}: {
  tenantId: string;
  productKey: string;
}) {
  const [value, setValue] = useState(""),
    [submitted, setSubmitted] = useState("");
  const [importNotice, setImportNotice] = useState("");
  const importVersion = useRef(0);
  const referenceInput = useRef<HTMLInputElement>(null);
  const [lookupGeneration, setLookupGeneration] = useState(0);
  const find = useServerFn(findFactoryQueueReceipt);
  const query = useQuery({
    queryKey: ["factory-queue-receipt", tenantId, productKey, submitted, lookupGeneration],
    enabled: !!submitted,
    queryFn: () => find({ data: { tenantId, productKey, requestId: submitted } }),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const result =
    !query.isFetching && !query.error && value.trim() === submitted ? query.data : undefined;
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Find an earlier queue request
      </summary>
      <p className="my-2 text-xs text-muted-foreground">
        Paste a saved request reference after reloading or reopening this workspace. This lookup
        never submits or retries a task.
      </p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const next = value.trim();
          if (!requestReference.safeParse(next).success) return;
          if (next === submitted) void query.refetch();
          else setSubmitted(next);
        }}
      >
        <Input
          ref={referenceInput}
          aria-label="Queue request reference"
          value={value}
          onChange={(e) => {
            importVersion.current++;
            setImportNotice("");
            setValue(e.target.value);
          }}
          placeholder="Request UUID"
          maxLength={36}
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={query.isFetching || !requestReference.safeParse(value.trim()).success}
        >
          Find receipt
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            importVersion.current++;
            setLookupGeneration((generation) => generation + 1);
            setValue("");
            setSubmitted("");
            setImportNotice(
              "Lookup cleared. This does not cancel a task or delete a downloaded file.",
            );
            referenceInput.current?.focus();
          }}
        >
          Clear lookup
        </Button>
      </form>
      <label className="mt-3 block space-y-1 text-xs">
        <span>Open a saved reference file</span>
        <Input
          type="file"
          accept=".txt,text/plain"
          aria-label="Saved queue reference file"
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            const version = ++importVersion.current;
            setImportNotice("");
            if (!file) return;
            setValue("");
            setSubmitted("");
            try {
              if (file.size > referenceFileLimit)
                throw new Error("Reference file is too large (maximum 8 KB).");
              const text = await file.text();
              if (version !== importVersion.current) return;
              const reference = parseReferenceFile(text, { tenantId, productKey });
              setValue(reference);
              setImportNotice(
                "Reference loaded. Choose Find receipt to check current access and task status.",
              );
            } catch (error) {
              if (version === importVersion.current)
                setImportNotice(
                  error instanceof Error ? error.message : "Reference file could not be read.",
                );
            }
          }}
        />
        <span className="text-muted-foreground">
          Read locally, up to 8 KB. Importing does not submit or retry a task.
        </span>
      </label>
      <p role="status" className="mt-2 text-xs">
        {importNotice}
      </p>
      <div className="mt-3 space-y-2 text-sm" aria-live="polite">
        {query.isFetching && <p>Checking the request…</p>}
        {query.error && value.trim() === submitted && (
          <p role="alert">
            Receipt lookup unavailable. Check the reference and your workspace access, then try
            again.
          </p>
        )}
        {result && !result.found && (
          <p>
            No accessible receipt was found in this workspace. The request may still be processing
            or belong to another user. This does not prove that no task was created; check run
            history before submitting again.
          </p>
        )}
        {result?.found && (
          <>
            <p>
              Request reference: <code className="select-all break-all">{submitted}</code>
            </p>
            <QueueReferenceActions
              key={tenantId + productKey + submitted}
              tenantId={tenantId}
              productKey={productKey}
              requestId={submitted}
            />
            <p>
              Recorded run: <code className="break-all">{result.run.id}</code>
            </p>
            <p>
              Run status: <strong>{result.run.status.replaceAll("_", " ")}</strong> · Budget status:{" "}
              <strong>{result.reservation.status}</strong>
            </p>
            <p>
              Original reservation: {result.reservation.currency}{" "}
              {(result.reservation.reserved_minor / 100).toFixed(2)} · Recorded actual cost:{" "}
              {result.reservation.actual_minor === null
                ? "Not settled"
                : `${result.reservation.currency} ${(result.reservation.actual_minor / 100).toFixed(2)}`}
            </p>
            <p className="text-xs text-muted-foreground">
              Run last updated: {time(result.run.updated_at)}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              Refresh task evidence
            </Button>
            <section aria-label="Recorded worker jobs" className="space-y-2 rounded-lg border p-3">
              <h4 className="font-medium">Recorded worker jobs</h4>
              {result.jobs.length === 0 ? (
                <p>No worker job records are visible for this run.</p>
              ) : (
                <ul className="space-y-2">
                  {result.jobs.map((job) => (
                    <li key={job.id} className="rounded bg-muted/40 p-2">
                      <p>
                        {job.status.replaceAll("_", " ")} · Recorded attempts: {job.attempts}
                      </p>
                      <p className="text-xs">
                        Started: {time(job.started_at)} · Completed: {time(job.completed_at)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Updated: {time(job.updated_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {result.jobsTruncated && (
                <p className="text-xs">Showing the five newest worker jobs.</p>
              )}
              <p className="text-xs text-muted-foreground">
                A queued job does not confirm a connected worker. Processing status is not a live
                heartbeat.
              </p>
            </section>
            <section aria-label="Recorded agent steps" className="space-y-2 rounded-lg border p-3">
              <h4 className="font-medium">Recorded agent steps</h4>
              {result.steps.length === 0 ? (
                <p>No step records are visible for this run.</p>
              ) : (
                <ol className="space-y-2">
                  {result.steps.map((step) => (
                    <li key={step.step_no} className="rounded bg-muted/40 p-2">
                      <p>
                        Step {step.step_no}: {step.step_type} · {step.status}
                      </p>
                      <p className="text-xs text-muted-foreground">{time(step.created_at)}</p>
                    </li>
                  ))}
                </ol>
              )}
              {result.stepsTruncated && (
                <p className="text-xs">Showing the first 64 recorded steps.</p>
              )}
            </section>
            <p className="text-xs text-muted-foreground">
              These are recorded database values, not independent verification of provider execution
              or billing. Finding a receipt does not cancel, retry or release funds.
            </p>
          </>
        )}
      </div>
    </details>
  );
}
