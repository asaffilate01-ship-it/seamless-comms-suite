import { createFileRoute } from "@tanstack/react-router";
import { GrowthWorkspace } from "@/modules/growth/GrowthWorkspace";

export const Route = createFileRoute("/_authenticated/app/growth")({
  component: GrowthWorkspace,
  head: () => ({
    meta: [
      { title: "Omniqora Growth | Brand, campaigns and review" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
