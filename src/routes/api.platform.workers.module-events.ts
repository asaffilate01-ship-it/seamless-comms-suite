import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveModuleEventWorker } from "@/modules/platform/module-worker.server";

export const Route=createFileRoute("/api/platform/workers/module-events")({
 server:{handlers:{POST:({request})=>serveModuleEventWorker(request)}},
});