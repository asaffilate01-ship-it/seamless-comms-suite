import { createFileRoute } from "@tanstack/react-router";
import { AIWorkforcePanel } from "@/modules/ai-workforce/AIWorkforcePanel";

export const Route = createFileRoute("/_authenticated/app/ai-employees")({
  component: AIWorkforcePanel,
  head: () => ({
    meta: [
      { title: "AI Workforce — Omniqora" },
      { name: "description", content: "Tenant-scoped, governed AI employee configurations." },
      { name: "robots", content: "noindex" },
    ],
  }),
});
