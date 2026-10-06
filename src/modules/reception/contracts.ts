export type ReceptionRequestKind="message"|"order"|"booking";
export type ReceptionChannel="phone"|"whatsapp"|"web"|"app"|"manual"|"api";
export type ReceptionStatus="new"|"queued"|"accepted"|"confirmed"|"delivered"|"failed"|"handled"|"cancelled";

export type ReceptionSettings={
  tenantId:string;
  tenantProductId:string;
  locationId?:string|null;
  enabled:boolean;
  instructions:string;
  businessHours:Record<string,unknown>;
  escalationUserId?:string|null;
  escalationPhone?:string|null;
  defaultLocale?:string|null;
  allowAiDrafting:boolean;
  allowOrderIntake:boolean;
  allowBookingIntake:boolean;
  config:Record<string,unknown>;
};

export type ReceptionRequest={
  id:string;
  tenantId:string;
  tenantProductId:string;
  locationId?:string|null;
  kind:ReceptionRequestKind;
  channel:ReceptionChannel;
  crmPersonId?:string|null;
  callerNumber?:string|null;
  customerName:string;
  contact?:string|null;
  summary:string;
  status:ReceptionStatus;
  sourceRef?:string|null;
  orderingIntentId?:string|null;
  bookingId?:string|null;
  humanHandlerId?:string|null;
  preferredHandlerId?:string|null;
  handoffNote?:string|null;
  receipt:Record<string,unknown>;
  externalKey:string;
  revision:number;
};

export const RECEPTION_FEATURES={
  intake:"reception.intake",
  callerLookup:"reception.caller_lookup",
  aiDrafting:"reception.ai_drafting",
  orderIntake:"reception.order_intake",
  bookingIntake:"reception.booking_intake",
  handoff:"reception.handoff",
  escalation:"reception.escalation",
  businessHours:"reception.business_hours",
} as const;

export const RECEPTION_EVENT_TYPES={
  received:"reception.received",
  queued:"reception.queued",
  accepted:"reception.accepted",
  confirmed:"reception.confirmed",
  delivered:"reception.delivered",
  failed:"reception.failed",
  handled:"reception.handled",
  escalated:"reception.escalated",
} as const;
