import { createFileRoute } from "@tanstack/react-router";
import { servePublicTracking } from "@/modules/platform/public-tracking.server";
export const Route=createFileRoute("/api/public/track/$token")({server:{handlers:{GET:({params})=>servePublicTracking(params.token)}}});
