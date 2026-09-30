export type EposMoney={amountMinor:number;currency:string};

export type EposTransactionFact={
  tenantId:string;
  productKey:string;
  tenantProductId:string;
  locationId:string;
  sourceTransactionRef:string;
  businessDate:string;
  occurredAt:string;
  channel:string;
  orderType?:string|null;
  gross:EposMoney;
  discounts:EposMoney;
  refunds:EposMoney;
  net:EposMoney;
  tax?:EposMoney|null;
  costOfGoods?:EposMoney|null;
  itemCount:number;
  customerRef?:string|null;
  metadata:Record<string,unknown>;
};

export type EposItemFact={
  sourceTransactionRef:string;
  itemRef:string;
  itemName:string;
  categoryRef?:string|null;
  quantity:number;
  grossMinor:number;
  discountMinor:number;
  refundMinor:number;
  netMinor:number;
  estimatedCogsMinor?:number|null;
  modifierRefs:string[];
};

export type InventoryMovementFact={
  tenantId:string;
  tenantProductId:string;
  locationId:string;
  itemRef:string;
  movementType:"purchase"|"sale"|"waste"|"adjustment"|"transfer_in"|"transfer_out"|"return";
  quantity:number;
  unit?:string|null;
  costMinor?:number|null;
  currency?:string|null;
  occurredAt:string;
  sourceRef:string;
};

export type HospitalityInsight={
  id:string;
  tenantId:string;
  locationId?:string|null;
  periodStart:string;
  periodEnd:string;
  kind:"sales"|"margin"|"discount"|"refund"|"waste"|"stock"|"menu"|"daypart"|"forecast"|"anomaly";
  title:string;
  summary:string;
  evidenceRefs:string[];
  metrics:Record<string,number|string|null>;
  modelRunId?:string|null;
  status:"draft"|"reviewed"|"dismissed";
};

export const HOSPITALITY_FEATURES={
  eposIntelligence:"hospitality.epos_intelligence",
  menuEngineering:"hospitality.menu_engineering",
  marginAnalysis:"hospitality.margin_analysis",
  discountLeakage:"hospitality.discount_leakage",
  refundAnalysis:"hospitality.refund_analysis",
  waste:"hospitality.waste",
  inventory:"hospitality.inventory",
  demandForecast:"hospitality.demand_forecast",
  dayparts:"hospitality.dayparts",
  aiInsights:"hospitality.ai_insights",
} as const;

export const HOSPITALITY_EVENT_TYPES={
  transactionRecorded:"hospitality.transaction.recorded",
  inventoryMoved:"hospitality.inventory.moved",
  wasteRecorded:"hospitality.waste.recorded",
  insightCreated:"hospitality.insight.created",
  anomalyDetected:"hospitality.anomaly.detected",
} as const;
