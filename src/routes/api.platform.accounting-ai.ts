import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveAccountingAiService } from "@/modules/accounting-ai/service.server";

export const Route=createFileRoute("/api/platform/accounting-ai")({
  server:{handlers:{POST:({request})=>serveAccountingAiService(request)}},
});
