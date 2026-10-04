export type RoutePoint = {
  id: string;
  latitude: number;
  longitude: number;
  serviceSeconds?: number;
};

export type ConstrainedRoutePoint = RoutePoint & {
  demand?: number;
  priority?: number;
  requiredSkills?: string[];
  windowStart?: string;
  windowEnd?: string;
};

export type RouteResource = {
  id: string;
  origin: RouteOrigin;
  capacity?: number;
  skills?: string[];
  availableFrom?: string;
  availableUntil?: string;
  averageSpeedKph?: number;
};

export type RouteOrigin = { latitude: number; longitude: number };

export type RoutePlan = {
  engine: "omniqora.native-routing.v1";
  orderedStopIds: string[];
  legsKm: number[];
  totalDistanceKm: number;
  stopCount: number;
};

export type FleetRoutePlan = {
  resourceId: string;
  orderedStopIds: string[];
  legsKm: number[];
  totalDistanceKm: number;
  totalDurationSeconds: number;
  load: number;
  capacity: number;
  scheduledCompletion: string;
};

export type FleetRoutingPlan = {
  engine: "omniqora.native-routing.v2";
  routes: FleetRoutePlan[];
  unassigned: Array<{
    stopId: string;
    reason: "capacity" | "missing_skill" | "time_window";
  }>;
  assignedStopCount: number;
  totalStopCount: number;
  totalDistanceKm: number;
};

const EARTH_RADIUS_KM = 6371;
const FAR_FUTURE = Date.parse("9999-12-31T23:59:59.999Z");
const radians = (value: number) => (value * Math.PI) / 180;

export function haversineKm(left: RouteOrigin, right: RouteOrigin) {
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(left.latitude)) *
      Math.cos(radians(right.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function validCoordinate({ latitude, longitude }: RouteOrigin) {
  return (
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function optimiseRoute(origin: RouteOrigin, stops: RoutePoint[]): RoutePlan {
  if (!validCoordinate(origin)) throw new Error("A valid route origin is required");
  if (stops.length < 1 || stops.length > 500) throw new Error("Send between 1 and 500 route stops");
  if (stops.some((stop) => !stop.id || !validCoordinate(stop)))
    throw new Error("Every route stop needs an ID and valid coordinates");
  if (new Set(stops.map((stop) => stop.id)).size !== stops.length)
    throw new Error("Route stop IDs must be unique");

  const remaining = [...stops];
  const orderedStopIds: string[] = [];
  const legsKm: number[] = [];
  let cursor = origin;

  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = haversineKm(cursor, remaining[0]);
    for (let index = 1; index < remaining.length; index += 1) {
      const distance = haversineKm(cursor, remaining[index]);
      if (
        distance < bestDistance ||
        (distance === bestDistance && remaining[index].id < remaining[bestIndex].id)
      ) {
        bestIndex = index;
        bestDistance = distance;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    orderedStopIds.push(next.id);
    legsKm.push(Number(bestDistance.toFixed(3)));
    cursor = next;
  }

  return {
    engine: "omniqora.native-routing.v1",
    orderedStopIds,
    legsKm,
    totalDistanceKm: Number(legsKm.reduce((sum, value) => sum + value, 0).toFixed(3)),
    stopCount: orderedStopIds.length,
  };
}

const finiteNonNegative = (value: number) => Number.isFinite(value) && value >= 0;

function timestamp(value: string | undefined, fallback: number, label: string) {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be an ISO date-time`);
  return parsed;
}

/**
 * Deterministic, provider-neutral batching heuristic for shadow evaluation and
 * dispatcher proposals. It never mutates dispatch authority or assignments.
 */
export function optimiseFleetRoutes(
  resources: RouteResource[],
  stops: ConstrainedRoutePoint[],
  planningTime = new Date().toISOString(),
): FleetRoutingPlan {
  if (resources.length < 1 || resources.length > 250)
    throw new Error("Send between 1 and 250 routing resources");
  if (stops.length < 1 || stops.length > 2_000)
    throw new Error("Send between 1 and 2000 route stops");
  if (new Set(resources.map((resource) => resource.id)).size !== resources.length)
    throw new Error("Routing resource IDs must be unique");
  if (new Set(stops.map((stop) => stop.id)).size !== stops.length)
    throw new Error("Route stop IDs must be unique");

  const planStart = timestamp(planningTime, Date.now(), "Planning time");
  const states = resources.map((resource) => {
    if (!resource.id || !validCoordinate(resource.origin))
      throw new Error("Every routing resource needs an ID and valid origin");
    const capacity = resource.capacity ?? Number.MAX_SAFE_INTEGER;
    const speed = resource.averageSpeedKph ?? 30;
    if (!finiteNonNegative(capacity)) throw new Error("Resource capacity cannot be negative");
    if (!Number.isFinite(speed) || speed <= 0 || speed > 200)
      throw new Error("Resource average speed must be between 0 and 200 kph");
    const availableAt = timestamp(resource.availableFrom, planStart, "Resource availability");
    const availableUntil = timestamp(resource.availableUntil, FAR_FUTURE, "Resource availability");
    if (availableUntil < availableAt)
      throw new Error("Resource availability must end after it starts");
    return {
      resource,
      capacity,
      speed,
      cursor: resource.origin,
      availableAt,
      availableUntil,
      load: 0,
      stopIds: [] as string[],
      legsKm: [] as number[],
      distanceKm: 0,
      durationSeconds: 0,
    };
  });

  const orderedStops = [...stops].sort((left, right) => {
    const priority = (right.priority ?? 0) - (left.priority ?? 0);
    if (priority) return priority;
    const leftEnd = timestamp(left.windowEnd, FAR_FUTURE, "Stop time window");
    const rightEnd = timestamp(right.windowEnd, FAR_FUTURE, "Stop time window");
    return leftEnd - rightEnd || left.id.localeCompare(right.id);
  });
  const unassigned: FleetRoutingPlan["unassigned"] = [];

  for (const stop of orderedStops) {
    if (!stop.id || !validCoordinate(stop))
      throw new Error("Every route stop needs an ID and valid coordinates");
    const demand = stop.demand ?? 1;
    const serviceSeconds = stop.serviceSeconds ?? 0;
    if (!finiteNonNegative(demand)) throw new Error("Stop demand cannot be negative");
    if (!finiteNonNegative(serviceSeconds)) throw new Error("Stop service time cannot be negative");
    const requiredSkills = new Set(stop.requiredSkills ?? []);
    const skillEligible = states.filter((state) => {
      const skills = new Set(state.resource.skills ?? []);
      return [...requiredSkills].every((skill) => skills.has(skill));
    });
    const capacityEligible = skillEligible.filter((state) => state.load + demand <= state.capacity);
    const windowStart = timestamp(stop.windowStart, planStart, "Stop time window");
    const windowEnd = timestamp(stop.windowEnd, FAR_FUTURE, "Stop time window");
    if (windowEnd < windowStart) throw new Error("Stop time window must end after it starts");

    const candidates = capacityEligible
      .map((state) => {
        const distanceKm = haversineKm(state.cursor, stop);
        const travelSeconds = Math.ceil((distanceKm / state.speed) * 3_600);
        const arrival = state.availableAt + travelSeconds * 1_000;
        const serviceStart = Math.max(arrival, windowStart);
        const completion = serviceStart + serviceSeconds * 1_000;
        return {
          state,
          distanceKm,
          completion,
          elapsedSeconds: (completion - state.availableAt) / 1_000,
        };
      })
      .filter(
        ({ state, completion }) => completion <= windowEnd && completion <= state.availableUntil,
      )
      .sort(
        (left, right) =>
          left.distanceKm - right.distanceKm ||
          left.completion - right.completion ||
          left.state.resource.id.localeCompare(right.state.resource.id),
      );

    const selected = candidates[0];
    if (!selected) {
      unassigned.push({
        stopId: stop.id,
        reason:
          skillEligible.length === 0
            ? "missing_skill"
            : capacityEligible.length === 0
              ? "capacity"
              : "time_window",
      });
      continue;
    }

    selected.state.stopIds.push(stop.id);
    selected.state.legsKm.push(Number(selected.distanceKm.toFixed(3)));
    selected.state.distanceKm += selected.distanceKm;
    selected.state.durationSeconds += selected.elapsedSeconds;
    selected.state.availableAt = selected.completion;
    selected.state.cursor = stop;
    selected.state.load += demand;
  }

  const routes = states.map((state) => ({
    resourceId: state.resource.id,
    orderedStopIds: state.stopIds,
    legsKm: state.legsKm,
    totalDistanceKm: Number(state.distanceKm.toFixed(3)),
    totalDurationSeconds: Math.round(state.durationSeconds),
    load: state.load,
    capacity: state.capacity,
    scheduledCompletion: new Date(state.availableAt).toISOString(),
  }));

  return {
    engine: "omniqora.native-routing.v2",
    routes,
    unassigned,
    assignedStopCount: routes.reduce((count, route) => count + route.orderedStopIds.length, 0),
    totalStopCount: stops.length,
    totalDistanceKm: Number(
      routes.reduce((sum, route) => sum + route.totalDistanceKm, 0).toFixed(3),
    ),
  };
}
