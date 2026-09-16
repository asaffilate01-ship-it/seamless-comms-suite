import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveBridge } from "@/modules/ecosystem/bridge.server";

export const Route = createFileRoute("/api/integrations/runs/$runId")({
  server: { handlers: { GET: ({ request, params }) => serveBridge(request, "result", params.runId) } },
});
