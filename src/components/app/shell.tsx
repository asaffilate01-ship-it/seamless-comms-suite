import { Link, useRouterState } from "@tanstack/react-router";
import { ReactNode } from "react";
import {
  Inbox, LayoutDashboard, Users, GitBranch, Megaphone, BarChart3,
  Handshake, Settings, Search, Bell, Plus, MessageCircle, ShieldCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  badge?: string;
};
const nav: NavItem[] = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/app/inbox", label: "Inbox", icon: Inbox, badge: "12" },
  { to: "/app/cases", label: "Cases", icon: MessageCircle },
  { to: "/app/contacts", label: "Contacts", icon: Users },
  { to: "/app/workflows", label: "Workflows", icon: GitBranch },
  { to: "/app/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/app/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/app/partners", label: "Partners", icon: Handshake },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children, title, subtitle, actions }: {
  children: ReactNode; title: string; subtitle?: string; actions?: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen bg-surface-2">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <MessageCircle className="h-4 w-4" />
          </span>
          <div>
            <div className="font-display text-sm font-semibold leading-none">LoungeConnect</div>
            <div className="mt-1 text-[11px] text-sidebar-foreground/60">Beauty Studio München</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-4">
          {nav.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {"badge" in item && item.badge && (
                  <span className="rounded-full bg-sidebar-primary/20 px-2 py-0.5 text-[10px] font-medium text-sidebar-primary">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3 rounded-md bg-sidebar-accent/40 p-3">
            <ShieldCheck className="h-4 w-4 text-sidebar-primary" />
            <div className="text-xs">
              <div className="font-medium text-sidebar-accent-foreground">GDPR-compliant</div>
              <div className="text-sidebar-foreground/60">Frankfurt eu-central-1</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-background/95 px-6 backdrop-blur">
          <div className="relative hidden max-w-sm flex-1 md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search contacts, cases, templates…" className="pl-9" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive" />
            </Button>
            <Button size="sm" className="hidden sm:inline-flex">
              <Plus className="mr-1 h-4 w-4" /> New case
            </Button>
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary-soft text-primary">LM</AvatarFallback>
            </Avatar>
          </div>
        </header>

        <div className="border-b border-border bg-background px-6 py-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-2">{actions}</div>
          </div>
        </div>

        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    new: "bg-info/10 text-info border-info/20",
    qualifying: "bg-warning/10 text-warning-foreground border-warning/30",
    quoted: "bg-primary/10 text-primary border-primary/20",
    scheduled: "bg-success/10 text-success border-success/20",
    in_progress: "bg-primary/10 text-primary border-primary/20",
    waiting_customer: "bg-muted text-muted-foreground border-border",
    waiting_partner: "bg-muted text-muted-foreground border-border",
    completed: "bg-success/10 text-success border-success/20",
    closed: "bg-muted text-muted-foreground border-border",
    live: "bg-success/10 text-success border-success/20",
    draft: "bg-muted text-muted-foreground border-border",
    review: "bg-warning/10 text-warning-foreground border-warning/30",
    sent: "bg-success/10 text-success border-success/20",
  };
  const label = status.replace(/_/g, " ");
  return (
    <Badge variant="outline" className={cn("capitalize", map[status] ?? "")}>{label}</Badge>
  );
}
