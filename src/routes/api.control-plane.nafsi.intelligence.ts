import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveNafsiIntelligenceLive } from "@/modules/control-plane/nafsi.server";

export const Route = createFileRoute("/api/control-plane/nafsi/intelligence")({
  server: { handlers: { POST: ({ request }) => serveNafsiIntelligenceLive(request) } },
});
