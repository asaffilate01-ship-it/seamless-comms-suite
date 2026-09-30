import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { servePublicTracking } from "@/modules/platform/public-tracking.server";

export const Route=createFileRoute("/api/public/track/$token")({
 server:{handlers:{GET:({params})=>servePublicTracking(params.token)}},
});
