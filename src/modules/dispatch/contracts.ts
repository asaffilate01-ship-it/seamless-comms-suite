import type { GeoPoint } from "@/modules/geo/contracts";

export type DispatchJobStatus =
  | "draft"
  | "unassigned"
  | "offered"
  | "assigned"
  | "accepted"
  | "en_route"
  | "arrived"
  | "in_progress"
  | "en_route_pickup"
  | "arrived_pickup"
  | "collected"
  | "en_route_dropoff"
  | "arrived_dropoff"
  | "completed"
  | "failed"
  | "cancelled";

export type DispatchStop = {
  id: string;
  kind: "pickup" | "dropoff" | "service" | "return";
  point: GeoPoint;
  address?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  instructions?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  serviceSeconds?: number;
};

export type DispatchJob = {
  id: string;
  tenantId: string;
  productKey: string;
  locationId?: string | null;
  jobType: string;
  status: DispatchJobStatus;
  priority: "low" | "normal" | "high" | "urgent";
  stops: DispatchStop[];
  requiredSkills: string[];
  requiredVehicleTypes: string[];
  capacityDemand?: number | null;
  scheduledAt?: string | null;
  assignedAgentId?: string | null;
  assignedVehicleId?: string | null;
  externalRef?: string | null;
  metadata: Record<string, unknown>;
};

export type DispatchAgent = {
  id: string;
  tenantId: string;
  name: string;
  status: "offline" | "available" | "busy" | "break" | "suspended";
  skills: string[];
  currentPosition?: GeoPoint | null;
  vehicleId?: string | null;
  shiftEndsAt?: string | null;
  capacityAvailable?: number | null;
};

export type FleetVehicle = {
  id: string;
  tenantId: string;
  registration?: string | null;
  type: string;
  capacity?: number | null;
  status: "available" | "assigned" | "maintenance" | "inactive";
  odometer?: number | null;
  metadata: Record<string, unknown>;
};

export type DispatchAssignmentProposal = {
  jobId: string;
  agentId: string;
  vehicleId?: string | null;
  score: number;
  reasons: string[];
  etaSeconds?: number | null;
  distanceMetres?: number | null;
  status: "proposal";
};

export type ProofOfDelivery = {
  jobId: string;
  completedAt: string;
  method: Array<"photo" | "signature" | "pin" | "barcode" | "gps" | "note">;
  evidenceRefs: string[];
  recipientName?: string | null;
  note?: string | null;
};

export const DISPATCH_FEATURES = {
  jobs: "dispatch.jobs",
  autoAssign: "dispatch.auto_assign",
  manualAssign: "dispatch.manual_assign",
  liveTracking: "dispatch.live_tracking",
  routeOptimisation: "dispatch.route_optimisation",
  fleet: "dispatch.fleet",
  shifts: "dispatch.shifts",
  pod: "dispatch.pod",
  wallet: "dispatch.wallet",
  maintenance: "dispatch.maintenance",
} as const;

export const DISPATCH_EVENT_TYPES = {
  jobCreated: "dispatch.job.created",
  jobOffered: "dispatch.job.offered",
  jobAssigned: "dispatch.job.assigned",
  jobAccepted: "dispatch.job.accepted",
  jobStatusChanged: "dispatch.job.status_changed",
  jobCompleted: "dispatch.job.completed",
  jobFailed: "dispatch.job.failed",
  agentPositionUpdated: "dispatch.agent.position_updated",
  agentAvailabilityChanged: "dispatch.agent.availability_changed",
  podRecorded: "dispatch.pod.recorded",
} as const;


export type DispatchShift = {
  id: string;
  tenantId: string;
  tenantProductId: string;
  agentId: string;
  startsAt: string;
  endsAt: string;
  clockedInAt?: string | null;
  clockedOutAt?: string | null;
  status: "scheduled" | "active" | "completed" | "missed" | "cancelled";
  attendanceStatus: "expected" | "present" | "late" | "absent" | "excused";
  breakMinutes: number;
};

export type DispatchWalletEntry = {
  id: string;
  agentId: string;
  jobId?: string | null;
  kind: "credit" | "debit" | "adjustment";
  category: string;
  amountMinor: number;
  currency: string;
  status: "pending" | "posted" | "reversed";
  occurredAt: string;
};

export type VehicleMaintenanceRecord = {
  id: string;
  vehicleId: string;
  maintenanceKind: string;
  title: string;
  dueAt?: string | null;
  dueOdometer?: number | null;
  completedAt?: string | null;
  status: "scheduled" | "due" | "overdue" | "in_progress" | "completed" | "cancelled";
  costMinor?: number | null;
  currency?: string | null;
};

export type DriverBehaviourEvent = {
  id: string;
  agentId: string;
  vehicleId?: string | null;
  jobId?: string | null;
  kind: "speeding" | "harsh_acceleration" | "harsh_braking" | "harsh_cornering" | "excessive_idle" | "route_deviation" | "other";
  severity: "info" | "low" | "medium" | "high" | "critical";
  value?: number | null;
  threshold?: number | null;
  point?: GeoPoint | null;
  observedAt: string;
};

export type DispatchGeofence = {
  id: string;
  name: string;
  kind: "circle" | "polygon";
  shape: Record<string, unknown>;
  active: boolean;
  eventRules: Array<"enter" | "exit" | "dwell">;
};

export type FleetUtilisationDaily = {
  day: string;
  vehicleId: string;
  availableMinutes: number;
  assignedMinutes: number;
  movingMinutes: number;
  idleMinutes: number;
  jobsAssigned: number;
  jobsCompleted: number;
  distanceMetres: number;
  utilisationPct: number;
};
