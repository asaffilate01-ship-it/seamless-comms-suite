import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { servePracticeWorker } from "@/modules/practice/worker.server";
export const Route=createFileRoute("/api/platform/workers/practice")({server:{handlers:{POST:({request})=>servePracticeWorker(request)}}});
