import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveReceptionService } from "@/modules/reception/service.server";

export const Route=createFileRoute("/api/platform/reception")({
  server:{handlers:{POST:({request})=>serveReceptionService(request)}},
});
