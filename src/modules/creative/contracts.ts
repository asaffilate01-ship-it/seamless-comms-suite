export type CreativeScope = {
  tenantId: string;
  productKey: string;
  tenantProductId?: string | null;
  brandKey?: string | null;
  locationId?: string | null;
  regionKey: string;
  locale: string;
};

export type BrandKit = {
  id: string;
  scope: CreativeScope;
  name: string;
  logos: string[];
  colours: string[];
  fonts: string[];
  tone: string[];
  bannedTerms: string[];
  requiredDisclaimers: string[];
  assetRefs: string[];
  approvedAt?: string | null;
  revision: number;
};

export type CreativeBrief = {
  id: string;
  scope: CreativeScope;
  campaignId?: string | null;
  objective: string;
  audience: string;
  channels: Array<"web" | "social" | "email" | "whatsapp" | "sms" | "print" | "video" | "audio" | "app">;
  assetTypes: string[];
  message: string;
  offer?: string | null;
  callToAction?: string | null;
  dueAt?: string | null;
  status: "draft" | "ready" | "generating" | "review" | "approved" | "published" | "cancelled";
};

export type CreativeAsset = {
  id: string;
  briefId: string;
  scope: CreativeScope;
  type: "copy" | "image" | "video" | "audio" | "document" | "web_asset";
  locale: string;
  channel: string;
  uri: string;
  variantKey?: string | null;
  modelRunId?: string | null;
  sourceAssetRefs: string[];
  status: "draft" | "review" | "approved" | "rejected" | "published";
  revision: number;
};

export const CREATIVE_FEATURES = {
  brandKits: "creative.brand_kits",
  briefs: "creative.briefs",
  copy: "creative.copy",
  images: "creative.images",
  video: "creative.video",
  audio: "creative.audio",
  localisation: "creative.localisation",
  approvals: "creative.approvals",
  assetLibrary: "creative.asset_library",
  variants: "creative.variants",
} as const;

export const CREATIVE_EVENT_TYPES = {
  briefCreated: "creative.brief.created",
  assetGenerated: "creative.asset.generated",
  assetReviewRequested: "creative.asset.review_requested",
  assetApproved: "creative.asset.approved",
  assetPublished: "creative.asset.published",
} as const;
