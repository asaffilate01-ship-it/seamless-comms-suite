import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { receiveAutomotiveWebhook } from "@/modules/automotive/api.server";

export const Route = createFileRoute("/api/automotive/v1/webhooks/$connectionId")({
  server: {
    handlers: {
      POST: ({ request, params }) => receiveAutomotiveWebhook(request, params.connectionId),
    },
  },
});
