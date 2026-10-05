export type InventoryItem={
  id:string;
  tenantId:string;
  productKey:string;
  externalRef:string;
  sku?:string|null;
  name:string;
  unit:string;
  trackStock:boolean;
  metadata:Record<string,unknown>;
};

export type StockLocation={
  id:string;
  tenantId:string;
  tenantProductId?:string|null;
  locationId?:string|null;
  externalRef?:string|null;
  name:string;
  kind:"store"|"warehouse"|"kitchen"|"vehicle"|"virtual"|"supplier";
};

export type StockBalance={
  itemId:string;
  stockLocationId:string;
  onHand:number;
  reserved:number;
  available:number;
  reorderPoint?:number|null;
  updatedAt:string;
};

export type StockMovement={
  id:string;
  tenantId:string;
  itemId:string;
  stockLocationId:string;
  movementType:"receipt"|"sale"|"usage"|"waste"|"adjustment"|"transfer_in"|"transfer_out"|"return"|"reservation"|"release";
  quantity:number;
  sourceRef:string;
  unitCostMinor?:number|null;
  currency?:string|null;
  occurredAt:string;
  metadata:Record<string,unknown>;
};

export type StockReservation={
  id:string;
  tenantId:string;
  itemId:string;
  stockLocationId:string;
  quantity:number;
  contextType:string;
  contextId:string;
  status:"active"|"consumed"|"released"|"expired";
  expiresAt?:string|null;
  idempotencyKey:string;
};

export const INVENTORY_FEATURES={
  items:"inventory.items",
  balances:"inventory.balances",
  movements:"inventory.movements",
  reservations:"inventory.reservations",
  transfers:"inventory.transfers",
  lowStock:"inventory.low_stock",
  valuation:"inventory.valuation",
} as const;

export const INVENTORY_EVENT_TYPES={
  movementRecorded:"inventory.movement.recorded",
  reservationCreated:"inventory.reservation.created",
  reservationReleased:"inventory.reservation.released",
  reservationConsumed:"inventory.reservation.consumed",
  lowStock:"inventory.low_stock",
} as const;
