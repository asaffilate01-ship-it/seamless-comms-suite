import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { serveMaskedVoice } from "@/modules/connect/masked-voice.server";

export const Route = createFileRoute("/api/public/twilio/masked-voice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        return serveMaskedVoice(request, supabaseAdmin);
      },
    },
  },
});
