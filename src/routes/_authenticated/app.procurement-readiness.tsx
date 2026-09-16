import { createFileRoute } from "@tanstack/react-router";
import ProcurementWorkspace from "@/modules/procurement/ProcurementWorkspace";

export const Route = createFileRoute("/_authenticated/app/procurement-readiness")({
  head: () => ({
    meta: [
      { title: "Procurement & partner readiness — Omniqora" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProcurementWorkspace,
});
