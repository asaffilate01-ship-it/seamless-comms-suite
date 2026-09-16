import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveBridge } from "@/modules/ecosystem/bridge.server";

export const Route = createFileRoute("/api/integrations/runs/$runId/context")({
  server: { handlers: { POST: ({ request, params }) => serveBridge(request, "context", params.runId) } },
});
