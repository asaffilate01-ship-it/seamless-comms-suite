export type MetricAggregation = "sum" | "count" | "count_distinct" | "avg" | "min" | "max" | "ratio";

export type MetricDefinition = {
  key: string;
  name: string;
  description: string;
  unit: "count" | "money" | "percent" | "seconds" | "minutes" | "hours" | "days" | "score" | "custom";
  aggregation: MetricAggregation;
  eventTypes: string[];
  valuePath?: string | null;
  numeratorMetricKey?: string | null;
  denominatorMetricKey?: string | null;
  dimensions: string[];
  currencyAware?: boolean;
};

export type MetricPoint = {
  tenantId: string;
  productKey: string;
  metricKey: string;
  periodStart: string;
  periodEnd: string;
  value: number;
  currency?: string | null;
  dimensions: Record<string, string>;
  calculatedAt: string;
};

export type DashboardDefinition = {
  key: string;
  name: string;
  audience: "platform" | "landlord" | "tenant" | "location" | "team";
  widgets: Array<{
    key: string;
    kind: "kpi" | "line" | "bar" | "funnel" | "table" | "cohort" | "map";
    metricKeys: string[];
    dimensions?: string[];
    filters?: Record<string, unknown>;
  }>;
};

export const CORE_METRICS: MetricDefinition[] = [
  {
    key: "revenue.gross",
    name: "Gross revenue",
    description: "Gross value before refunds/discounts where source events provide a compatible amount.",
    unit: "money",
    aggregation: "sum",
    eventTypes: ["order.completed", "invoice.paid", "marketplace.order.completed"],
    valuePath: "amounts.grossMinor",
    dimensions: ["product", "location", "channel"],
    currencyAware: true,
  },
  {
    key: "customers.new",
    name: "New customers",
    description: "Distinct newly created CRM customer records.",
    unit: "count",
    aggregation: "count_distinct",
    eventTypes: ["crm.person.created"],
    valuePath: "personId",
    dimensions: ["product", "location", "source"],
  },
  {
    key: "jobs.completed",
    name: "Completed jobs",
    description: "Completed dispatch jobs.",
    unit: "count",
    aggregation: "count",
    eventTypes: ["dispatch.job.completed"],
    dimensions: ["product", "location", "jobType"],
  },
];

export const ANALYTICS_EVENT_TYPES = {
  metricCalculated: "analytics.metric.calculated",
  dashboardViewed: "analytics.dashboard.viewed",
  anomalyDetected: "analytics.anomaly.detected",
} as const;
