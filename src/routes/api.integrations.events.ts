import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveBridge } from "@/modules/ecosystem/bridge.server";

export const Route = createFileRoute("/api/integrations/events")({
  server: { handlers: { POST: ({ request }) => serveBridge(request, "events") } },
});
