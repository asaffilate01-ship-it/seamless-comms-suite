import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { servePaymentsService } from "@/modules/payments/service.server";

export const Route=createFileRoute("/api/platform/payments")({
  server:{handlers:{POST:({request})=>servePaymentsService(request)}},
});
