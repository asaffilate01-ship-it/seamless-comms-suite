import { createFileRoute } from "@tanstack/react-router";
import { PracticeWorkspace } from "@/modules/practice/workspace";
export const Route = createFileRoute("/_authenticated/app/practice")({
  head: () => ({
    meta: [{ title: "CRM & Practice — Omniqora" }, { name: "robots", content: "noindex" }],
  }),
  component: PracticeWorkspace,
});
