import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback } from "react";
import { AppShell } from "@/components/app/shell";
import { useTenant } from "@/hooks/useTenant";
import { TransformationWorkspace } from "@/modules/transformation/TransformationWorkspace";
import { transformationRequest, type TransformationRequest } from "@/modules/transformation/transformation.functions";

export const Route = createFileRoute("/_authenticated/app/transformation")({
  head: () => ({ meta: [{ title: "Business360 — Omniqora" }, { name: "robots", content: "noindex" }] }),
  component: TransformationPage,
});

function TransformationPage() {
  const { tenantId, loading, error } = useTenant();
  const request = useServerFn(transformationRequest);
  const api = useCallback((command: string, projectId?: string, data: Record<string, unknown> = {}) => {
    if (!tenantId) return Promise.reject(new Error("Select an authorised workspace"));
    return request({ data: { tenantId, projectId, command: command as TransformationRequest["command"], data } }).then(result => JSON.parse(result.payload));
  }, [request, tenantId]);
  return <AppShell title="Business360" subtitle="Understand your business, find improvements and plan delivery">
    {loading ? <p role="status">Loading your workspace…</p> : tenantId
      ? <TransformationWorkspace key={tenantId} api={api} />
      : <p role="alert">{error ?? "No authorised workspace is available."}</p>}
  </AppShell>;
}
