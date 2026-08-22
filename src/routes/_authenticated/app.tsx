import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Dashboard — OmniQora" },
      { name: "description", content: "The OmniQora operator dashboard: inbox, cases, workflows and analytics." },
      { property: "og:title", content: "Dashboard — OmniQora" },
      { property: "og:description", content: "The OmniQora operator dashboard." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <Outlet />,
});
