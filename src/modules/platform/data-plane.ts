export type DataRoute = {
  tenantId: string;
  productKey: string;
  routingMode: "shared" | "regional" | "dedicated" | "external";
  dataRegion: string;
  connectionRef?: string | null;
  status: "active" | "degraded" | "disabled";
  config?: Record<string, unknown>;
};

export function assertUsableDataRoute(route: DataRoute) {
  if (route.status !== "active") throw new Error("Data route is not active");
  if ((route.routingMode === "dedicated" || route.routingMode === "external") && !route.connectionRef) {
    throw new Error("Data route requires a connection reference");
  }
  return route;
}
