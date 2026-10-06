export type LoyaltyProgramme={
  id:string;tenantId:string;tenantProductId?:string|null;name:string;
  currency:"points"|"stamps"|"credit";earnRule:Record<string,unknown>;
  expiryDays?:number|null;active:boolean;metadata:Record<string,unknown>;
};

export type LoyaltyAccount={
  id:string;tenantId:string;programmeId:string;customerRef:string;
  tierKey?:string|null;balance:number;lifetimeEarned:number;lifetimeRedeemed:number;
  status:"active"|"paused"|"closed";updatedAt:string;
};

export type LoyaltyLedgerEntry={
  id:string;tenantId:string;programmeId:string;accountId:string;
  entryType:"earn"|"redeem"|"adjust"|"expire"|"reverse";
  quantity:number;sourceRef:string;reason?:string|null;occurredAt:string;
};

export type LoyaltyReward={
  id:string;tenantId:string;programmeId:string;name:string;
  rewardType:"discount"|"credit"|"free_item"|"voucher"|"perk";
  cost:number;value:Record<string,unknown>;active:boolean;
};

export const LOYALTY_FEATURES={
  programmes:"loyalty.programmes",accounts:"loyalty.accounts",ledger:"loyalty.ledger",
  tiers:"loyalty.tiers",rewards:"loyalty.rewards",vouchers:"loyalty.vouchers",
  referrals:"loyalty.referrals",personalisation:"loyalty.personalisation",
} as const;

export const LOYALTY_EVENT_TYPES={
  earned:"loyalty.earned",redeemed:"loyalty.redeemed",expired:"loyalty.expired",
  tierChanged:"loyalty.tier_changed",rewardIssued:"loyalty.reward.issued",
} as const;
