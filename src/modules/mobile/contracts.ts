export type MobileCapability =
  | "push"
  | "deep_links"
  | "camera"
  | "photos"
  | "documents"
  | "barcode"
  | "qr"
  | "gps"
  | "background_gps"
  | "maps"
  | "chat"
  | "voice"
  | "offline"
  | "biometrics"
  | "passkeys"
  | "payments";

export type MobileAppProfile = {
  key: string;
  productKey: string;
  tenantId?: string | null;
  brandKey?: string | null;
  displayName: string;
  bundleId: string;
  androidPackage: string;
  locales: string[];
  regionKeys: string[];
  capabilities: MobileCapability[];
  modules: string[];
  theme: {
    logoUrl?: string | null;
    iconUrl?: string | null;
    splashUrl?: string | null;
    primaryColour?: string | null;
  };
};

export type AgentRole =
  | "courier"
  | "food_delivery"
  | "recovery"
  | "field_engineer"
  | "parts_delivery"
  | "home_service"
  | "inspector"
  | "collector"
  | "driver";

export type AgentAppProfile = MobileAppProfile & {
  agentRoles: AgentRole[];
  jobTypes: string[];
  offlineJobCache: boolean;
  requireBackgroundLocation: boolean;
};

export const MOBILE_EVENT_TYPES = {
  deviceRegistered: "mobile.device.registered",
  pushDelivered: "mobile.push.delivered",
  pushOpened: "mobile.push.opened",
  locationPermissionChanged: "mobile.location_permission.changed",
  appVersionSeen: "mobile.app_version.seen",
} as const;
