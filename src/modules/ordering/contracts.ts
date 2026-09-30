export type OrderChannel="web"|"app"|"whatsapp"|"phone"|"kiosk"|"pos"|"marketplace"|"api";
export type OrderStatus="draft"|"awaiting_confirmation"|"awaiting_payment"|"submitted"|"accepted"|"rejected"|"in_progress"|"ready"|"completed"|"cancelled"|"refunded";

export type CatalogueItem={
  externalRef:string;
  name:string;
  description?:string|null;
  categoryRef?:string|null;
  currency:string;
  priceMinor:number;
  available:boolean;
  optionGroups?:Array<{
    externalRef:string;
    name:string;
    minSelect:number;
    maxSelect:number;
    options:Array<{externalRef:string;name:string;priceDeltaMinor:number;available:boolean}>;
  }>;
  metadata?:Record<string,unknown>;
};

export type OrderLineIntent={
  itemRef:string;
  quantity:number;
  optionRefs:string[];
  notes?:string|null;
};

export type OrderIntent={
  id:string;
  tenantId:string;
  productKey:string;
  tenantProductId:string;
  locationId?:string|null;
  channel:OrderChannel;
  customerRef?:string|null;
  currency:string;
  lines:OrderLineIntent[];
  fulfilment:"collection"|"delivery"|"dine_in"|"service";
  requestedAt?:string|null;
  deliveryAddress?:Record<string,unknown>|null;
  tableRef?:string|null;
  status:OrderStatus;
  sourceOrderRef?:string|null;
  sourceRevision?:string|null;
  idempotencyKey:string;
  metadata:Record<string,unknown>;
};

export type OrderValidationReceipt={
  intentId:string;
  catalogueRevision:string;
  priceValidated:boolean;
  availabilityValidated:boolean;
  fulfilmentValidated:boolean;
  subtotalMinor:number;
  discountMinor:number;
  taxMinor:number;
  feesMinor:number;
  totalMinor:number;
  currency:string;
  warnings:string[];
  validUntil:string;
};

export type OrderAcceptanceReceipt={
  intentId:string;
  sourceOrderRef:string;
  accepted:boolean;
  paymentState:"not_required"|"pending"|"paid"|"pay_later_authorized";
  kdsAcknowledged?:boolean;
  acceptedAt?:string|null;
  rejectionReason?:string|null;
};

export interface OrderingSourceAdapter{
  getCatalogue(input:{tenantId:string;tenantProductId:string;locationId?:string|null;locale?:string|null}):Promise<{revision:string;items:CatalogueItem[]}>;
  validate(intent:OrderIntent):Promise<OrderValidationReceipt>;
  submit(intent:OrderIntent,receipt:OrderValidationReceipt):Promise<OrderAcceptanceReceipt>;
  status?(sourceOrderRef:string):Promise<{status:OrderStatus;updatedAt:string}>;
}

export const ORDERING_FEATURES={
  catalogue:"ordering.catalogue",
  cart:"ordering.cart",
  directOrders:"ordering.direct_orders",
  whatsappOrders:"ordering.whatsapp_orders",
  phoneOrders:"ordering.phone_orders",
  payments:"ordering.payments",
  sourceHandoff:"ordering.source_handoff",
  tracking:"ordering.tracking",
} as const;

export const ORDERING_EVENT_TYPES={
  intentCreated:"ordering.intent.created",
  intentValidated:"ordering.intent.validated",
  intentSubmitted:"ordering.intent.submitted",
  orderAccepted:"ordering.order.accepted",
  orderRejected:"ordering.order.rejected",
  orderStatusChanged:"ordering.order.status_changed",
  orderCompleted:"order.completed",
} as const;
