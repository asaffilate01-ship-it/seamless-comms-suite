import { createFileRoute } from "@tanstack/react-router";
import { serveAgent } from "@/modules/dispatch/agent.service.server";
export const Route=createFileRoute("/api/platform/agent")({server:{handlers:{POST:({request})=>serveAgent(request)}}});
