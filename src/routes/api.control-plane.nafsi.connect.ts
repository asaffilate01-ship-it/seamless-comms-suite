import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveNafsiConnect } from "@/modules/control-plane/nafsi.server";

export const Route = createFileRoute("/api/control-plane/nafsi/connect")({
  server: { handlers: { POST: ({ request }) => serveNafsiConnect(request) } },
});
