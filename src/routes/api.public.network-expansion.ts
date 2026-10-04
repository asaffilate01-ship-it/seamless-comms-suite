import { createFileRoute } from "@tanstack/react-router";
import { servePublicNetworkExpansion } from "@/modules/network-expansion/public.server";
export const Route=createFileRoute("/api/public/network-expansion")({
  server:{handlers:{
    GET:({request})=>servePublicNetworkExpansion(request),
    POST:({request})=>servePublicNetworkExpansion(request),
  }}
});
