import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveNafsiIntelligenceShadow } from "@/modules/control-plane/nafsi.server";

export const Route = createFileRoute("/api/control-plane/nafsi/intelligence-shadow")({
  server: { handlers: { POST: ({ request }) => serveNafsiIntelligenceShadow(request) } },
});
