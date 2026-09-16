import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveBridge } from "@/modules/ecosystem/bridge.server";

export const Route = createFileRoute("/api/integrations/haccora/$connectionId")({
  server: { handlers: { POST: ({ request, params }) => serveBridge(request, "haccora", params.connectionId) } },
});
