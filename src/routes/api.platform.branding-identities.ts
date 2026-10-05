import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveBrandIdentityVerification } from "@/modules/branding/service.server";

export const Route=createFileRoute("/api/platform/branding-identities")({
  server:{handlers:{POST:({request})=>serveBrandIdentityVerification(request)}},
});
