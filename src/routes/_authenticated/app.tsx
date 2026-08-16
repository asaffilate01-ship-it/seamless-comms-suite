import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Dashboard — Konnevia" },
      { name: "description", content: "The Konnevia operator dashboard: inbox, cases, workflows and analytics." },
      { property: "og:title", content: "Dashboard — Konnevia" },
      { property: "og:description", content: "The Konnevia operator dashboard." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <Outlet />,
});
