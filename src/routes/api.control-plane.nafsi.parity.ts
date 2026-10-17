import { createFileRoute } from "@tanstack/react-router";
import { serveNafsiParity } from "@/modules/control-plane/nafsi.server";

export const Route = createFileRoute("/api/control-plane/nafsi/parity")({
  server: { handlers: { POST: ({ request }) => serveNafsiParity(request) } },
});
