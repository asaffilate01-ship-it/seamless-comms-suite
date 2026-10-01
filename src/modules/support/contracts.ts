export type SupportTicketStatus="new"|"open"|"waiting_customer"|"waiting_internal"|"escalated"|"resolved"|"closed";

export type SupportQueue={
  id:string;tenantId:string;tenantProductId?:string|null;name:string;
  emailAlias?:string|null;defaultPriority:"low"|"normal"|"high"|"urgent";
  active:boolean;metadata:Record<string,unknown>;
};

export type SlaPolicy={
  id:string;tenantId:string;name:string;priority:"low"|"normal"|"high"|"urgent";
  firstResponseMinutes:number;resolutionMinutes:number;
  businessHoursKey?:string|null;active:boolean;
};

export type SupportTicketMeta={
  caseId:string;tenantId:string;tenantProductId?:string|null;queueId?:string|null;
  category?:string|null;channel:"whatsapp"|"sms"|"email"|"voice"|"web"|"app"|"api"|"internal";
  customerRef?:string|null;firstResponseDueAt?:string|null;resolutionDueAt?:string|null;
  firstRespondedAt?:string|null;resolvedAt?:string|null;slaBreached:boolean;
  tags:string[];sourceProductKey?:string|null;externalRef?:string|null;
};

export type SupportSatisfaction={
  caseId:string;tenantId:string;score:number;comment?:string|null;receivedAt:string;
};

export const SUPPORT_FEATURES={
  tickets:"support.tickets",queues:"support.queues",sla:"support.sla",
  assignment:"support.assignment",escalation:"support.escalation",knowledge:"support.knowledge",
  satisfaction:"support.satisfaction",aiAssist:"support.ai_assist",
} as const;

export const SUPPORT_EVENT_TYPES={
  ticketCreated:"support.ticket.created",assigned:"support.ticket.assigned",
  firstResponse:"support.ticket.first_response",escalated:"support.ticket.escalated",
  resolved:"support.ticket.resolved",slaBreached:"support.sla.breached",
  satisfactionReceived:"support.satisfaction.received",
} as const;
