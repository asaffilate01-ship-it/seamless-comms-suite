import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveCrmService } from "@/modules/crm/service.server";

export const Route=createFileRoute("/api/platform/crm")({
 server:{handlers:{POST:({request})=>serveCrmService(request)}}
});
