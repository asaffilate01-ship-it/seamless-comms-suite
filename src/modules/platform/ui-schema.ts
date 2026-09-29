export type NavigationItem = {
  key: string;
  labelKey: string;
  icon?: string;
  route?: string;
  module?: string;
  children?: NavigationItem[];
};

export type DashboardWidget = {
  key: string;
  kind: "kpi" | "chart" | "table" | "list" | "map" | "tasks" | "activity" | "ai_brief" | "custom";
  titleKey: string;
  module?: string;
  metricKeys?: string[];
  config?: Record<string, unknown>;
};

export type ProductUiSchema = {
  productKey: string;
  version: string;
  navigation: NavigationItem[];
  dashboards: Record<string, DashboardWidget[]>;
  terminology?: Record<string, string>;
  featureRoutes?: Record<string, string>;
};

export const DEFAULT_PLATFORM_NAVIGATION: NavigationItem[] = [
  { key: "dashboard", labelKey: "nav.dashboard", route: "/app" },
  { key: "crm", labelKey: "nav.crm", module: "crm.core", route: "/app/crm" },
  { key: "messages", labelKey: "nav.messages", module: "connect.core", route: "/app/inbox" },
  { key: "marketing", labelKey: "nav.marketing", module: "marketing.core", route: "/app/marketing" },
  { key: "sales", labelKey: "nav.sales", module: "sales.core", route: "/app/sales" },
  { key: "journeys", labelKey: "nav.journeys", module: "journeys.core", route: "/app/journeys" },
  { key: "feedback", labelKey: "nav.feedback", module: "feedback.core", route: "/app/feedback" },
  { key: "dispatch", labelKey: "nav.dispatch", module: "dispatch.core", route: "/app/dispatch" },
  { key: "marketplace", labelKey: "nav.marketplace", module: "marketplace.core", route: "/app/marketplace" },
  { key: "compliance", labelKey: "nav.compliance", module: "compliance.core", route: "/app/compliance" },
  { key: "creative", labelKey: "nav.creative", module: "creative.core", route: "/app/creative" },
  { key: "analytics", labelKey: "nav.analytics", module: "analytics.core", route: "/app/analytics" },
  { key: "financials", labelKey: "nav.financials", module: "financials.core", route: "/app/financials" },
  { key: "settings", labelKey: "nav.settings", route: "/app/settings" },
];

export function visibleNavigation(
  schema: ProductUiSchema,
  enabledModules: Set<string>,
): NavigationItem[] {
  const filter = (items: NavigationItem[]): NavigationItem[] =>
    items
      .filter((item) => !item.module || enabledModules.has(item.module))
      .map((item) => ({
        ...item,
        children: item.children ? filter(item.children) : undefined,
      }));

  return filter(schema.navigation);
}

export function platformUiSchema(productKey: string): ProductUiSchema {
  return {
    productKey,
    version: "1",
    navigation: DEFAULT_PLATFORM_NAVIGATION,
    dashboards: {
      default: [
        { key: "kpis", kind: "kpi", titleKey: "dashboard.kpis", metricKeys: ["revenue.gross","customers.new","jobs.completed"] },
        { key: "activity", kind: "activity", titleKey: "dashboard.activity" },
        { key: "tasks", kind: "tasks", titleKey: "dashboard.tasks" },
        { key: "ai-brief", kind: "ai_brief", titleKey: "dashboard.ai_brief", module: "intelligence.core" },
      ],
    },
  };
}
