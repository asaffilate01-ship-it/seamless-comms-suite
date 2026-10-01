import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { servePlatformRuntime } from "@/modules/platform/service-runtime.server";

export const Route = createFileRoute("/api/platform/runtime")({
  server: { handlers: { POST: ({ request }) => servePlatformRuntime(request) } },
});
