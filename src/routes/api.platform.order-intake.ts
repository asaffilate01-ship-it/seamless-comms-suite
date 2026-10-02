import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveOrderIntakeService } from "@/modules/connect/order-intake.service.server";
export const Route=createFileRoute("/api/platform/order-intake")({server:{handlers:{POST:({request})=>serveOrderIntakeService(request)}}});
