import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveAutomotiveSourceApi } from "@/modules/automotive/source-api.server";

export const Route = createFileRoute("/api/automotive/v1/gateway/$connectionId")({
  server:{handlers:{POST:({request,params})=>serveAutomotiveSourceApi(request,params.connectionId)}},
});
