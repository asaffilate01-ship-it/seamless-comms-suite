import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/shell";
import { Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/cases")({
  component: () => <Outlet />,
});
