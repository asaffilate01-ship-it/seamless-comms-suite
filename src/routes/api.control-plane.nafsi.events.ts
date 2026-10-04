import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveNafsiEvents } from "@/modules/control-plane/nafsi.server";

export const Route = createFileRoute("/api/control-plane/nafsi/events")({
  server: { handlers: { POST: ({ request }) => serveNafsiEvents(request) } },
});
