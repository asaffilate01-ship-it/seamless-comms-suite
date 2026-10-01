export type CommunicationChannel = "whatsapp" | "sms" | "email" | "voice" | "push";

export type CommunicationScope = {
  tenantId: string;
  productKey: string;
  tenantProductId?: string | null;
  locationId?: string | null;
  departmentId?: string | null;
};

export type SendMessageRequest = {
  scope: CommunicationScope;
  channel: Exclude<CommunicationChannel, "voice">;
  recipient: string;
  templateKey?: string | null;
  locale?: string | null;
  body?: string | null;
  metadata?: Record<string, unknown>;
  idempotencyKey: string;
};

export type MaskedCallRequest = {
  scope: CommunicationScope;
  caller: string;
  recipient: string;
  contextType?: string | null;
  contextId?: string | null;
  expiresAt: string;
  recordingPolicy: "disabled" | "provider_default" | "tenant_policy";
  metadata?: Record<string, unknown>;
  idempotencyKey: string;
};

export type MaskedCallSession = {
  id: string;
  provider: string;
  proxyNumber: string;
  status: "reserved" | "active" | "completed" | "expired" | "failed";
  startedAt?: string | null;
  endedAt?: string | null;
};

export interface CommunicationsProvider {
  key: string;
  capabilities: CommunicationChannel[];
  send?(request: SendMessageRequest): Promise<{ providerMessageId: string; status: string }>;
  createMaskedCall?(request: MaskedCallRequest): Promise<MaskedCallSession>;
  endMaskedCall?(sessionId: string): Promise<void>;
}

export const COMMUNICATION_EVENT_TYPES = {
  messageQueued: "connect.message.queued",
  messageDelivered: "connect.message.delivered",
  messageFailed: "connect.message.failed",
  callMaskReserved: "connect.call_mask.reserved",
  callStarted: "connect.call.started",
  callCompleted: "connect.call.completed",
  callFailed: "connect.call.failed",
} as const;
