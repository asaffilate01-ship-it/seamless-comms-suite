export type GeoPoint = {
  lat: number;
  lng: number;
};

export type GeoAddress = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  countryCode: string;
};

export type GeocodeResult = {
  point: GeoPoint;
  formattedAddress: string;
  provider: string;
  confidence?: number | null;
  providerPlaceId?: string | null;
};

export type RouteStop = {
  id: string;
  point: GeoPoint;
  serviceSeconds?: number;
  windowStart?: string | null;
  windowEnd?: string | null;
  demand?: number;
};

export type RouteRequest = {
  tenantId: string;
  origin: GeoPoint;
  destination: GeoPoint;
  waypoints?: GeoPoint[];
  mode: "driving" | "walking" | "cycling" | "truck";
  departAt?: string | null;
  avoid?: Array<"tolls" | "motorways" | "ferries">;
};

export type RouteResult = {
  provider: string;
  distanceMetres: number;
  durationSeconds: number;
  encodedPolyline?: string | null;
  legs: Array<{
    distanceMetres: number;
    durationSeconds: number;
    start: GeoPoint;
    end: GeoPoint;
  }>;
};

export type OptimisationRequest = {
  tenantId: string;
  vehicles: Array<{
    id: string;
    start: GeoPoint;
    end?: GeoPoint | null;
    capacity?: number | null;
    shiftStart?: string | null;
    shiftEnd?: string | null;
    skills?: string[];
  }>;
  stops: RouteStop[];
  objective: "distance" | "duration" | "cost" | "balanced";
};

export type OptimisationResult = {
  provider: string;
  objective: string;
  routes: Array<{
    vehicleId: string;
    stopIds: string[];
    distanceMetres: number;
    durationSeconds: number;
  }>;
  unassignedStopIds: string[];
};

export interface GeoProvider {
  key: string;
  geocode(address: GeoAddress): Promise<GeocodeResult[]>;
  reverse(point: GeoPoint): Promise<GeocodeResult[]>;
  route(request: RouteRequest): Promise<RouteResult>;
  optimise?(request: OptimisationRequest): Promise<OptimisationResult>;
}

export const GEO_EVENT_TYPES = {
  geocodeCompleted: "geo.geocode.completed",
  routeCalculated: "geo.route.calculated",
  optimisationCompleted: "geo.optimisation.completed",
  geofenceEntered: "geo.geofence.entered",
  geofenceExited: "geo.geofence.exited",
  positionUpdated: "geo.position.updated",
} as const;
