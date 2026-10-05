import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveScheduleWorker } from "@/modules/platform/schedule-worker.server";

export const Route=createFileRoute("/api/platform/workers/schedules")({
 server:{handlers:{POST:({request})=>serveScheduleWorker(request)}},
});
