import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveAutomationActionWorker } from "@/modules/automation/action-worker.server";

export const Route=createFileRoute("/api/platform/workers/automation-actions")({
  server:{handlers:{POST:({request})=>serveAutomationActionWorker(request)}},
});
