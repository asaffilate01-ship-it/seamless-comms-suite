import { createFileRoute } from "@tanstack/react-router";
import { serveWebIntelWorker } from "@/modules/web-intelligence/worker.server";

export const Route = createFileRoute("/api/platform/web-intelligence/worker")({
  server: { handlers: {
    POST: ({ request }) => serveWebIntelWorker(request),
  } },
});
