import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findFactoryQueueReceipt } from "./receipt-lookup.functions";
export function QueueReceiptPanel({
  tenantId,
  productKey,
}: {
  tenantId: string;
  productKey: string;
}) {
  const [value, setValue] = useState(""),
    [submitted, setSubmitted] = useState("");
  const find = useServerFn(findFactoryQueueReceipt);
  const query = useQuery({
    queryKey: ["factory-queue-receipt", tenantId, productKey, submitted],
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
          if (next === submitted) void query.refetch();
          else setSubmitted(next);
        }}
      >
        <Input
          aria-label="Queue request reference"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Request UUID"
          maxLength={36}
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={query.isFetching || value.trim().length !== 36}
        >
          Find receipt
        </Button>
      </form>
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
              These are recorded database values, not independent verification of provider execution
              or billing. Finding a receipt does not cancel, retry or release funds.
            </p>
          </>
        )}
      </div>
    </details>
  );
}
