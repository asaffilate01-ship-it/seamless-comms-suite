export type PracticeClientKind="individual"|"sole_trader"|"partnership"|"company"|"trust"|"charity"|"other";

export type PracticeClient={
  id:string;
  tenantId:string;
  crmPersonId?:string|null;
  crmCompanyId?:string|null;
  legalName:string;
  kind:PracticeClientKind;
  countryCode:string;
  status:"prospect"|"onboarding"|"active"|"dormant"|"closed";
  primaryContactRef?:string|null;
  ownerUserId?:string|null;
  metadata:Record<string,unknown>;
};

export type PracticeEngagement={
  id:string;
  tenantId:string;
  clientId:string;
  serviceKey:string;
  periodKey?:string|null;
  status:"draft"|"collecting"|"processing"|"client_action"|"review"|"approval"|"submission"|"completed"|"cancelled";
  assignedUserIds:string[];
  reviewerUserIds:string[];
  dueAt?:string|null;
  progress:number;
  metadata:Record<string,unknown>;
};

export type PracticeDeadline={
  id:string;
  tenantId:string;
  clientId:string;
  engagementId?:string|null;
  kind:string;
  title:string;
  dueAt:string;
  status:"open"|"in_progress"|"filed"|"completed"|"missed"|"not_applicable";
  source:"manual"|"regulator"|"provider"|"workflow"|"import";
  externalRef?:string|null;
};

export type DocumentRequest={
  id:string;
  tenantId:string;
  clientId:string;
  engagementId?:string|null;
  title:string;
  description?:string|null;
  documentTypes:string[];
  dueAt?:string|null;
  status:"draft"|"sent"|"part_received"|"fulfilled"|"cancelled";
};

export type SignatureRequest={
  id:string;
  tenantId:string;
  clientId:string;
  engagementId?:string|null;
  documentRef:string;
  signerRefs:string[];
  status:"draft"|"sent"|"viewed"|"signed"|"declined"|"expired";
  consentVersion?:string|null;
  provider?:string|null;
  providerRef?:string|null;
};

export type PracticeTimeEntry={
  id:string;
  tenantId:string;
  clientId:string;
  engagementId?:string|null;
  userId:string;
  startedAt:string;
  endedAt?:string|null;
  minutes:number;
  billable:boolean;
  rateMinor?:number|null;
  currency?:string|null;
  description?:string|null;
};

export type SubmissionRecord={
  id:string;
  tenantId:string;
  clientId:string;
  engagementId?:string|null;
  jurisdiction:string;
  authority:string;
  submissionType:string;
  periodKey?:string|null;
  status:"draft"|"review"|"approved"|"queued"|"submitted"|"accepted"|"rejected"|"withdrawn"|"superseded";
  provider?:string|null;
  providerRef?:string|null;
  submittedAt?:string|null;
  receiptRef?:string|null;
  revision:number;
};

export const PRACTICE_FEATURES={
  clients:"practice.clients",
  engagements:"practice.engagements",
  deadlines:"practice.deadlines",
  documentRequests:"practice.document_requests",
  signatures:"practice.signatures",
  tasks:"practice.tasks",
  timeWip:"practice.time_wip",
  fees:"practice.fees",
  clientPortal:"practice.client_portal",
  submissions:"practice.submissions",
  amlBridge:"practice.aml_bridge",
} as const;

export const PRACTICE_EVENT_TYPES={
  clientCreated:"practice.client.created",
  engagementCreated:"practice.engagement.created",
  engagementStatusChanged:"practice.engagement.status_changed",
  deadlineDue:"practice.deadline.due",
  deadlineCompleted:"practice.deadline.completed",
  documentRequested:"practice.document.requested",
  documentReceived:"practice.document.received",
  signatureCompleted:"practice.signature.completed",
  submissionQueued:"practice.submission.queued",
  submissionAccepted:"practice.submission.accepted",
  submissionRejected:"practice.submission.rejected",
  timeRecorded:"practice.time.recorded",
} as const;
