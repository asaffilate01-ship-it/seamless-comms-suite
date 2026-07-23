import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Dashboard — LoungeConnect" },
      { name: "description", content: "The LoungeConnect operator dashboard: inbox, cases, workflows and analytics." },
      { property: "og:title", content: "Dashboard — LoungeConnect" },
      { property: "og:description", content: "The LoungeConnect operator dashboard." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <Outlet />,
});
