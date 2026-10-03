import {createFileRoute} from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {serveBusinessIntelligenceSummary} from "@/modules/analytics/business-intelligence.service.server";

export const Route=createFileRoute("/api/platform/business-intelligence")({
  server:{handlers:{POST:({request})=>serveBusinessIntelligenceSummary(request)}},
});
