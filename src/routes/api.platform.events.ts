import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { servePlatformEvent } from "@/modules/platform/events.server";

export const Route = createFileRoute("/api/platform/events")({
  server: {
    handlers: {
      POST: ({ request }) => servePlatformEvent(request),
    },
  },
});
