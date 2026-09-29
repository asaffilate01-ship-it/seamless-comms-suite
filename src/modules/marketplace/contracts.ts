export type MarketplaceType =
  | "products"
  | "services"
  | "bookings"
  | "delivery"
  | "consultations"
  | "freelancer"
  | "rental"
  | "peer_to_peer"
  | "auction"
  | "b2b_sourcing";

export type MarketplaceVendor = {
  id: string;
  tenantId: string;
  name: string;
  status: "draft" | "pending_review" | "active" | "suspended" | "closed";
  countryCode: string;
  currency: string;
  commissionProfile?: string | null;
  payoutProfile?: string | null;
  metadata: Record<string, unknown>;
};

export type MarketplaceListing = {
  id: string;
  tenantId: string;
  vendorId: string;
  type: "product" | "service" | "rental" | "consultation" | "auction";
  title: string;
  description?: string | null;
  status: "draft" | "pending_review" | "active" | "paused" | "archived";
  categoryKeys: string[];
  currency: string;
  priceMinor?: number | null;
  attributes: Record<string, unknown>;
  inventoryTracked: boolean;
};

export type MarketplaceAvailability = {
  listingId: string;
  startsAt: string;
  endsAt: string;
  capacity?: number | null;
  available: boolean;
};

export type MarketplaceOrder = {
  id: string;
  tenantId: string;
  buyerRef: string;
  vendorId: string;
  status: "draft" | "pending_payment" | "paid" | "accepted" | "fulfilling" | "completed" | "cancelled" | "refunded";
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  feesMinor: number;
  totalMinor: number;
  items: Array<{
    listingId: string;
    quantity: number;
    unitPriceMinor: number;
    totalMinor: number;
  }>;
  metadata: Record<string, unknown>;
};

export type MarketplaceCommission = {
  orderId: string;
  vendorId: string;
  basisMinor: number;
  rateBps?: number | null;
  fixedMinor?: number | null;
  commissionMinor: number;
  status: "calculated" | "locked" | "settled" | "reversed";
};

export const MARKETPLACE_FEATURES = {
  vendors: "marketplace.vendors",
  listings: "marketplace.listings",
  catalogue: "marketplace.catalogue",
  inventory: "marketplace.inventory",
  availability: "marketplace.availability",
  orders: "marketplace.orders",
  bookings: "marketplace.bookings",
  commissions: "marketplace.commissions",
  payouts: "marketplace.payouts",
  reviews: "marketplace.reviews",
  disputes: "marketplace.disputes",
  auctions: "marketplace.auctions",
} as const;

export const MARKETPLACE_EVENT_TYPES = {
  vendorActivated: "marketplace.vendor.activated",
  listingPublished: "marketplace.listing.published",
  orderCreated: "marketplace.order.created",
  orderPaid: "marketplace.order.paid",
  orderAccepted: "marketplace.order.accepted",
  orderCompleted: "marketplace.order.completed",
  refundCompleted: "marketplace.refund.completed",
  reviewCreated: "marketplace.review.created",
  disputeOpened: "marketplace.dispute.opened",
} as const;
