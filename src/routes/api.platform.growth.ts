import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveGrowthService } from "@/modules/growth/studio.service.server";

export const Route = createFileRoute("/api/platform/growth")({
  server: { handlers: { POST: ({ request }) => serveGrowthService(request) } },
});
