import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveTenantSnapshot } from "@/modules/control-plane/control-plane.server";

export const Route = createFileRoute("/api/control-plane/tenant-snapshot")({
  server: { handlers: { POST: ({ request }) => serveTenantSnapshot(request) } },
});
