import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  servePublicFeedbackInfo,
  servePublicFeedbackSubmission,
} from "@/modules/growth/public.server";

export const Route=createFileRoute("/api/feedback/respond")({
  server:{handlers:{
    GET:({request})=>servePublicFeedbackInfo(request),
    POST:({request})=>servePublicFeedbackSubmission(request),
  }},
});
