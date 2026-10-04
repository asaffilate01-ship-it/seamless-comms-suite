import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveTenantSnapshot } from "@/modules/control-plane/control-plane.server";

export const Route = createFileRoute("/api/verticals/lessonahead/runtime")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let externalTenantId: string | undefined;
        try {
          const input = (await request.clone().json()) as { externalTenantId?: unknown };
          if (typeof input.externalTenantId === "string") externalTenantId = input.externalTenantId;
        } catch {
          // The generic snapshot contract will report malformed input consistently.
        }
        const scopedRequest = new Request(request.url, {
          method: "POST",
          headers: request.headers,
          body: JSON.stringify({ productKey: "lessonahead", externalTenantId }),
        });
        return serveTenantSnapshot(scopedRequest);
      },
    },
  },
});
