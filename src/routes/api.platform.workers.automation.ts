import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveAutomationWorker } from "@/modules/automation/runner.server";

export const Route=createFileRoute("/api/platform/workers/automation")({
  server:{handlers:{POST:({request})=>serveAutomationWorker(request)}},
});
