import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveConnectEvent } from "@/modules/connect/connect.server";

export const Route = createFileRoute("/api/integrations/connect/events")({
  server: { handlers: { POST: ({ request }) => serveConnectEvent(request) } },
});
