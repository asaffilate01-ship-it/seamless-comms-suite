import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { GrowthScope } from "./studio.contract";
import { GrowthSetupView } from "./GrowthSetupView";
import {
  decideGrowthSetup,
  getGrowthSetup,
  requestGrowthSetup,
  saveGrowthWriter,
} from "./setup.functions";

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The setup action could not be completed. Refresh to check its saved status.";
}

export function GrowthSetupPanel({
  scope,
  initiallyOpen,
  onChanged,
}: {
  scope: GrowthScope;
  initiallyOpen: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [includeCreative, setIncludeCreative] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const requestKey = useRef<string | null>(null);
  const requestPayload = useRef<string | null>(null);
  const load = useServerFn(getGrowthSetup);
  const requestSetup = useServerFn(requestGrowthSetup);
  const decideSetup = useServerFn(decideGrowthSetup);
  const saveWriter = useServerFn(saveGrowthWriter);
  const query = useQuery({
    queryKey: ["growth-setup", scope.tenantId, scope.productKey, includeCreative],
    queryFn: () => load({ data: { ...scope, includeCreative } }),
    retry: false,
  });
  useEffect(() => {
    if (query.data?.request) setIncludeCreative(query.data.request.includeCreative);
  }, [query.data?.request?.id, query.data?.request?.includeCreative]);

  async function refresh() {
    await Promise.all([query.refetch(), onChanged()]);
  }

  async function perform(key: string, action: () => Promise<unknown>, success: string) {
    if (busy.current) return;
    busy.current = true;
    setPending(key);
    setError(null);
    try {
      await action();
      await refresh();
      toast.success(success);
    } catch (cause) {
      // A lost response may follow a committed request. Read back before retry.
      await refresh().catch(() => undefined);
      setError(message(cause));
    } finally {
      busy.current = false;
      setPending(null);
    }
  }

  if (query.isPending)
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-5" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span className="text-sm">Checking workspace setup…</span>
        </CardContent>
      </Card>
    );
  if (!query.data || query.isError)
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Setup status is unavailable</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{message(query.error)}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetching}
            onClick={() => query.refetch()}
          >
            <RefreshCw className={cn("h-4 w-4", query.isFetching && "animate-spin")} /> Check again
          </Button>
        </AlertDescription>
      </Alert>
    );

  return (
    <GrowthSetupView
      key={`${scope.tenantId}:${scope.productKey}`}
      setup={query.data}
      initiallyOpen={initiallyOpen}
      includeCreative={includeCreative}
      onIncludeCreativeChange={setIncludeCreative}
      pending={pending}
      error={error}
      refreshing={query.isFetching}
      onRefresh={() => {
        void refresh();
      }}
      onRequest={(note) => {
        const payload = JSON.stringify({ ...scope, includeCreative, note });
        if (requestPayload.current !== payload || !requestKey.current) {
          requestKey.current = crypto.randomUUID();
          requestPayload.current = payload;
        }
        const key = requestKey.current;
        void perform(
          "request",
          () => requestSetup({ data: { ...scope, includeCreative, note, requestKey: key } }),
          "Activation request saved.",
        );
      }}
      onDecision={(request, decision, note) => {
        void perform(
          decision,
          () =>
            decideSetup({
              data: {
                ...scope,
                requestId: request.id,
                expectedRevision: request.revision,
                decision,
                note,
              },
            }),
          decision === "approved"
            ? "Activation decision saved. Access has been refreshed."
            : "Request declined. The decision is recorded.",
        );
      }}
      onSaveWriter={(input) => {
        void perform(
          "writer",
          () => saveWriter({ data: { ...scope, ...input } }),
          "Writer settings saved. Readiness has been checked.",
        );
      }}
    />
  );
}
