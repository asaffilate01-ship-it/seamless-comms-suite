export type ChildcareChildStatus="active"|"inactive"|"archived";
export type ChildcarePlacementStatus="proposed"|"active"|"paused"|"ended"|"cancelled";
export type ChildcareFundingStatus="draft"|"checking"|"eligible"|"ineligible"|"approved"|"active"|"closed";
export type ChildcareClaimStatus="draft"|"submitted"|"accepted"|"part_paid"|"paid"|"rejected"|"cancelled";

export type ChildcareChild={
  id:string;
  tenantId:string;
  tenantProductId:string;
  externalRef?:string|null;
  firstName:string;
  lastName?:string|null;
  dateOfBirth:string;
  status:ChildcareChildStatus;
  metadata:Record<string,unknown>;
};

export type ChildcareGuardianLink={
  id:string;
  tenantId:string;
  childId:string;
  crmPersonId:string;
  relationship:string;
  isPrimary:boolean;
  canBook:boolean;
  canViewFunding:boolean;
  canManageChild:boolean;
};

export type ChildcareProviderProfile={
  id:string;
  tenantId:string;
  tenantProductId:string;
  vendorId:string;
  providerType:"childminder"|"nursery"|"care_agency"|"other";
  regulatorRef?:string|null;
  registrationRef?:string|null;
  serviceAgeGroups:string[];
  maxChildren?:number|null;
  languages:string[];
  status:"draft"|"onboarding"|"review"|"active"|"suspended"|"closed";
  metadata:Record<string,unknown>;
};

export type ChildcarePlacement={
  id:string;
  tenantId:string;
  tenantProductId:string;
  childId:string;
  vendorId:string;
  listingId?:string|null;
  bookingId?:string|null;
  startsOn:string;
  endsOn?:string|null;
  fundedHoursPerWeek?:number|null;
  privateHoursPerWeek?:number|null;
  status:ChildcarePlacementStatus;
  metadata:Record<string,unknown>;
};

export type ChildcareAttendance={
  id:string;
  tenantId:string;
  placementId:string;
  attendanceDate:string;
  checkInAt?:string|null;
  checkOutAt?:string|null;
  attendedMinutes?:number|null;
  absenceReason?:string|null;
  confirmedByGuardianAt?:string|null;
  confirmedByProviderAt?:string|null;
  metadata:Record<string,unknown>;
};

export type ChildcareFundingCase={
  id:string;
  tenantId:string;
  tenantProductId:string;
  childId:string;
  guardianCrmPersonId:string;
  fundingType:string;
  authority?:string|null;
  eligibilityRef?:string|null;
  approvedHoursPerWeek?:number|null;
  hourlyRateMinor?:number|null;
  currency:string;
  startsOn?:string|null;
  endsOn?:string|null;
  status:ChildcareFundingStatus;
  metadata:Record<string,unknown>;
};

export type ChildcareFundingClaim={
  id:string;
  tenantId:string;
  fundingCaseId:string;
  periodStart:string;
  periodEnd:string;
  claimedMinutes:number;
  claimedMinor:number;
  paidMinor:number;
  currency:string;
  status:ChildcareClaimStatus;
  externalRef?:string|null;
  metadata:Record<string,unknown>;
};

export type ChildcareTrainingRecord={
  id:string;
  tenantId:string;
  vendorId:string;
  trainingKey:string;
  title:string;
  issuer?:string|null;
  completedOn?:string|null;
  expiresOn?:string|null;
  documentId?:string|null;
  status:"declared"|"evidence_uploaded"|"verified"|"expired"|"rejected";
  metadata:Record<string,unknown>;
};

export const CHILDCARE_FEATURES={
  children:"childcare.children",
  guardians:"childcare.guardians",
  providers:"childcare.providers",
  placements:"childcare.placements",
  attendance:"childcare.attendance",
  funding:"childcare.funding",
  training:"childcare.training",
  matching:"childcare.matching",
  safeguardingBridge:"childcare.safeguarding_bridge",
} as const;

export const CHILDCARE_EVENT_TYPES={
  childCreated:"childcare.child.created",
  providerLinked:"childcare.provider.linked",
  placementStarted:"childcare.placement.started",
  placementEnded:"childcare.placement.ended",
  attendanceRecorded:"childcare.attendance.recorded",
  fundingApproved:"childcare.funding.approved",
  fundingClaimSubmitted:"childcare.funding.claim.submitted",
  trainingVerified:"childcare.training.verified",
} as const;
