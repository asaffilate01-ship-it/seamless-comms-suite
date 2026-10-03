import {createFileRoute} from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {serveIntelligenceService} from "@/modules/intelligence/service.server";
export const Route=createFileRoute("/api/platform/intelligence")({server:{handlers:{POST:({request})=>serveIntelligenceService(request)}}});
