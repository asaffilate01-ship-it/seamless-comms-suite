import {createFileRoute} from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {serveIntelligence} from "@/modules/analytics/intelligence.service.server";

export const Route=createFileRoute("/api/platform/intelligence")({
  server:{handlers:{POST:({request})=>serveIntelligence(request)}},
});
