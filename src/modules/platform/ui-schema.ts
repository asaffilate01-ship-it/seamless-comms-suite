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
  { key: "reception", labelKey: "nav.reception", module: "reception.core", route: "/app/reception" },
  { key: "support", labelKey: "nav.support", module: "support.core", route: "/app/support" },
  { key: "documents", labelKey: "nav.documents", module: "documents.core", route: "/app/documents" },
  { key: "search", labelKey: "nav.search", module: "search.core", route: "/app/search" },
  { key: "notifications", labelKey: "nav.notifications", module: "notifications.core", route: "/app/notifications" },
  { key: "marketing", labelKey: "nav.marketing", module: "marketing.core", route: "/app/marketing" },
  { key: "sales", labelKey: "nav.sales", module: "sales.core", route: "/app/sales" },
  { key: "journeys", labelKey: "nav.journeys", module: "journeys.core", route: "/app/journeys" },
  { key: "feedback", labelKey: "nav.feedback", module: "feedback.core", route: "/app/feedback" },
  { key: "bookings", labelKey: "nav.bookings", module: "bookings.core", route: "/app/bookings" },
  { key: "inventory", labelKey: "nav.inventory", module: "inventory.core", route: "/app/inventory" },
  { key: "loyalty", labelKey: "nav.loyalty", module: "loyalty.core", route: "/app/loyalty" },
  { key: "forms", labelKey: "nav.forms", module: "forms.core", route: "/app/forms" },
  { key: "automation", labelKey: "nav.automation", module: "automation.core", route: "/app/automation" },
  { key: "practice", labelKey: "nav.practice", module: "practice.core", route: "/app/practice" },
  { key: "accounting-ai", labelKey: "nav.accounting_ai", module: "accounting_ai.core", route: "/app/accounting-ai" },
  { key: "tax-intelligence", labelKey: "nav.tax_intelligence", module: "tax_intelligence.core", route: "/app/tax-intelligence" },
  { key: "ordering", labelKey: "nav.ordering", module: "ordering.core", route: "/app/ordering" },
  { key: "payments", labelKey: "nav.payments", module: "payments.core", route: "/app/payments" },
  { key: "hospitality", labelKey: "nav.hospitality_intelligence", module: "hospitality.intelligence", route: "/app/hospitality-intelligence" },
  { key: "business360", labelKey: "nav.business360", module: "business360.core", route: "/app/transformation" },
  { key: "transactions", labelKey: "nav.transactions", module: "transactions.core", route: "/app/transformation" },
  { key: "dispatch", labelKey: "nav.dispatch", module: "dispatch.core", route: "/app/dispatch" },
  { key: "marketplace", labelKey: "nav.marketplace", module: "marketplace.core", route: "/app/marketplace" },
  { key: "compliance", labelKey: "nav.compliance", module: "compliance.core", route: "/app/compliance" },
  { key: "creative", labelKey: "nav.creative", module: "creative.core", route: "/app/creative" },
  { key: "analytics", labelKey: "nav.analytics", module: "analytics.core", route: "/app/analytics" },
  { key: "financials", labelKey: "nav.financials", module: "financials.core", route: "/app/financials" },
  { key: "branding", labelKey: "nav.branding", route: "/app/settings/branding" },
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
