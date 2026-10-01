import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveProvisioningWorker } from "@/modules/control-plane/provisioning-worker.server";

export const Route = createFileRoute("/api/control-plane/workers/provisioning")({
  server: { handlers: { POST: ({ request }) => serveProvisioningWorker(request) } },
});
