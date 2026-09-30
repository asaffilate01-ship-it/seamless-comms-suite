import { createFileRoute } from "@tanstack/react-router";
import { CrmWorkspace } from "@/modules/crm/workspace";
export const Route = createFileRoute("/_authenticated/app/crm")({
  head: () => ({ meta: [{ title: "CRM — Omniqora" }, { name: "robots", content: "noindex" }] }),
  component: CrmWorkspace,
});
