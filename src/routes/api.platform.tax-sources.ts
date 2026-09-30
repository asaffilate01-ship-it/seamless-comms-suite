import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveTaxSourceService } from "@/modules/tax-intelligence/source-service.server";

export const Route=createFileRoute("/api/platform/tax-sources")({
  server:{handlers:{POST:({request})=>serveTaxSourceService(request)}},
});
