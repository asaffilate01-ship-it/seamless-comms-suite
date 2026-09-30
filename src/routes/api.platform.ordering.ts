import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveOrderingService } from "@/modules/ordering/service.server";

export const Route = createFileRoute("/api/platform/ordering")({
  server:{handlers:{POST:({request})=>serveOrderingService(request)}},
});
