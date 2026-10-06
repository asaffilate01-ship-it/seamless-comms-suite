import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveIntelligenceJobs } from "@/modules/intelligence/jobs.server";

export const Route=createFileRoute("/api/platform/intelligence-jobs")({
  server:{handlers:{POST:({request})=>serveIntelligenceJobs(request)}},
});
