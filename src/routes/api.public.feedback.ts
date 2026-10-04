import {createFileRoute} from "@tanstack/react-router";
import {servePublicFeedback} from "@/modules/reconciliation/public.server";

export const Route=createFileRoute("/api/public/feedback")({
 server:{handlers:{POST:({request})=>servePublicFeedback(request)}}
});
