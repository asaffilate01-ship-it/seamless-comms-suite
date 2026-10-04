import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveNafsiConnectEvents } from "@/modules/control-plane/nafsi.server";

export const Route = createFileRoute("/api/control-plane/nafsi/connect-events")({
  server: { handlers: { POST: ({ request }) => serveNafsiConnectEvents(request) } },
});
