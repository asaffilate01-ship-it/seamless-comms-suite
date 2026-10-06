import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { servePublicBranding } from "@/modules/branding/public.server";

export const Route=createFileRoute("/api/public/branding")({
  server:{handlers:{GET:({request})=>servePublicBranding(request)}},
});
