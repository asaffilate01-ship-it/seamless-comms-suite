import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/hooks/useTenant";
import { getTenantControlPlane } from "@/lib/control-plane.functions";
import {
  Building2, Globe2, KeyRound, MessageCircle, ShieldCheck,
  Bot, GitBranch, Settings2, ArrowUpRight, AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/settings")({
  component: Settings,
  head: () => ({ meta: [{ title: "Settings — Omniqora" }, { name: "robots", content: "noindex" }] }),
});

const settingsAreas = [
  {
    title: "Workspace, products and branding",
    description: "Manage organisation, tenant, products, services, locations, branding and verified domains.",
    to: "/app/tenant-factory",
    icon: Building2,
  },
  {
    title: "WhatsApp and messaging",
    description: "Configure real channels, sender numbers, conversations, approved templates and provider setup.",
    to: "/app/whatsapp",
    icon: MessageCircle,
  },
  {
    title: "Roles and access control",
    description: "Manage product-scoped teams and resource access policies. Changes are enforced by the server.",
    to: "/app/access-control",
    icon: ShieldCheck,
  },
  {
    title: "Identity and customer portals",
    description: "Manage identity policies and portal invitations for authorised product workspaces.",
    to: "/app/identity",
    icon: KeyRound,
  },
  {
    title: "AI permissions and approvals",
    description: "Review use cases, model policy, agent runs, budgets and action proposals.",
    to: "/app/intelligence",
    icon: Bot,
  },
  {
    title: "Integrations and service health",
    description: "Check configured connectors and service readiness before using external providers.",
    to: "/app/connector-hub",
    icon: GitBranch,
  },
  {
    title: "Compliance and regulatory monitoring",
    description: "Review supported compliance records and regulatory monitoring workflows.",
    to: "/app/regulatory-monitoring",
    icon: ShieldCheck,
  },
] as const;

function Settings() {
  const current = useTenant();
  const tenantId = current.tenantId ?? "";
  const lookup = useServerFn(getTenantControlPlane);
  const workspace = useQuery({
    queryKey: ["settings-workspace", tenantId],
    enabled: !!tenantId && !current.loading,
    retry: false,
    queryFn: () => lookup({ data: { tenantId } }),
  });
  const detail = workspace.data;

  return (
    <AppShell title="Settings" subtitle="Your real workspace configuration, access policies and integrations">
      <div className="mx-auto max-w-6xl space-y-6">
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Current workspace</h2>
              </div>
              {detail?.tenant.status && <Badge variant="outline">{detail.tenant.status}</Badge>}
            </div>
            {current.loading || workspace.isPending && !!tenantId ? (
              <p role="status" className="mt-4 text-sm text-muted-foreground">Loading tenant configuration…</p>
            ) : current.error || workspace.error ? (
              <p role="alert" className="mt-4 flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {current.error ?? (workspace.error instanceof Error ? workspace.error.message : "Configuration unavailable")}
              </p>
            ) : !detail ? (
              <p role="status" className="mt-4 text-sm text-muted-foreground">
                No configured workspace is available. Sign in with an authorised account.
              </p>
            ) : (
              <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div><p className="text-xs text-muted-foreground">Tenant</p><p className="mt-1 font-medium">{detail.tenant.name}</p></div>
                <div><p className="text-xs text-muted-foreground">Organisation</p><p className="mt-1 font-medium">{detail.organisation?.name ?? "Not linked"}</p></div>
                <div><p className="text-xs text-muted-foreground">Your role</p><p className="mt-1 font-medium capitalize">{current.role ?? "Unavailable"}</p></div>
                <div><p className="text-xs text-muted-foreground">Country and currency</p><p className="mt-1 font-medium">{detail.tenant.country_code} · {detail.tenant.currency}</p></div>
                <div><p className="text-xs text-muted-foreground">Active products / services</p><p className="mt-1 font-medium">{detail.products.filter(p => p.status === "active").length} / {detail.services.filter(s => s.status === "active").length}</p></div>
                <div><p className="text-xs text-muted-foreground">Domains registered</p><p className="mt-1 flex items-center gap-2 font-medium"><Globe2 className="h-4 w-4" />{detail.domains.length}</p></div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {settingsAreas.map(({ title, description, to, icon: Icon }) => (
            <Card key={to} className="transition-colors hover:border-primary/40">
              <CardContent className="flex h-full flex-col p-5">
                <Icon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{description}</p>
                <Link to={to} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                  Open configuration <ArrowUpRight className="h-4 w-4" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Settings are managed by the connected, permission-checked workspaces. No example phone numbers,
          simulated live statuses or unsaved switches are displayed here.
        </p>
      </div>
    </AppShell>
  );
}
