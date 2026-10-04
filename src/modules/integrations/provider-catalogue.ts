export type IntegrationProviderFamily =
  | "marketplace"
  | "marketplace_middleware"
  | "pos"
  | "delivery"
  | "payments"
  | "identity"
  | "erp"
  | "itsm"
  | "data"
  | "communications"
  | "automotive_auction"
  | "other";

export type IntegrationProviderStatus =
  | "evaluate"
  | "planned"
  | "sandbox"
  | "certifying"
  | "approved"
  | "live"
  | "paused"
  | "retired";

export type IntegrationRouteRole =
  | "direct"
  | "bridge"
  | "source"
  | "destination"
  | "fallback";

export interface IntegrationProviderDefinition {
  key:string;
  name:string;
  family:IntegrationProviderFamily;
  capabilities:readonly string[];
  status:IntegrationProviderStatus;
  approvalRequired?:boolean;
  optionalBridge?:boolean;
}

export const DISHBEE_PLUS_PROVIDER_CATALOGUE:readonly IntegrationProviderDefinition[]=[
  {key:"uber_eats",name:"Uber Eats",family:"marketplace",capabilities:["orders","menu","availability","store","status","settlement"],status:"planned",approvalRequired:true},
  {key:"deliveroo",name:"Deliveroo",family:"marketplace",capabilities:["orders","menu","availability","site","status","rider_events","settlement"],status:"planned",approvalRequired:true},
  {key:"just_eat",name:"Just Eat",family:"marketplace",capabilities:["orders","menu","availability","store","status","settlement"],status:"planned",approvalRequired:true},
  {key:"deliverect",name:"Deliverect",family:"marketplace_middleware",capabilities:["orders","menu","availability","status","mapping"],status:"planned",optionalBridge:true},
  {key:"otter",name:"Otter",family:"marketplace_middleware",capabilities:["orders","menu","availability","status","mapping"],status:"planned",optionalBridge:true},
  {key:"urbanpiper",name:"UrbanPiper",family:"marketplace_middleware",capabilities:["orders","menu","availability","status","mapping"],status:"planned",optionalBridge:true},
  {key:"sumup",name:"SumUp",family:"payments",capabilities:["card_payments","terminal","checkout"],status:"planned",approvalRequired:true},
  {key:"uber_direct",name:"Uber Direct",family:"delivery",capabilities:["quote","create","cancel","tracking"],status:"planned",approvalRequired:true},
  {key:"deliveroo_express",name:"Deliveroo Express",family:"delivery",capabilities:["quote","create","cancel","tracking"],status:"planned",approvalRequired:true},
  {key:"just_eat_go",name:"Just Eat Go",family:"delivery",capabilities:["quote","create","cancel","tracking"],status:"planned",approvalRequired:true},
  {key:"stuart",name:"Stuart",family:"delivery",capabilities:["quote","create","cancel","tracking"],status:"planned",approvalRequired:true},
];

export const AUTOHASHI_AUCTION_PROVIDER_CATALOGUE:readonly IntegrationProviderDefinition[]=[
  {
    key:"vehicle.japan.thecarapi",
    name:"TheCarApi Japan",
    family:"automotive_auction",
    capabilities:["inventory.read","lot.detail","images.read","price_history.read","vin_history.read"],
    status:"evaluate",
    approvalRequired:true,
  },
  {
    key:"vehicle.japan.carstack",
    name:"CarStack Japan",
    family:"automotive_auction",
    capabilities:["inventory.read","lot.detail","images.read","makes.read","filters.read"],
    status:"evaluate",
    approvalRequired:true,
  },
  {
    key:"vehicle.japan.agent",
    name:"Japan Auction Execution Partner",
    family:"automotive_auction",
    capabilities:["bid.submit","bid.status","result.read","invoice.read","transport.status","export.status","documents.read"],
    status:"planned",
    approvalRequired:true,
  },
  {
    key:"vehicle.japan.aucnet",
    name:"AUCNET authorised integration",
    family:"automotive_auction",
    capabilities:["inventory.read","lot.detail","images.read","history.read","result.read","bid.submit","bid.status"],
    status:"planned",
    approvalRequired:true,
  },
  {
    key:"vehicle.japan.iauc",
    name:"i-AUC authorised integration",
    family:"automotive_auction",
    capabilities:["inventory.read","lot.detail","images.read","history.read","result.read","bid.submit","bid.status"],
    status:"planned",
    approvalRequired:true,
  },
  {
    key:"vehicle.japan.uss",
    name:"USS authorised integration",
    family:"automotive_auction",
    capabilities:["inventory.read","lot.detail","inspection.read","history.read","result.read","bid.submit","bid.status"],
    status:"planned",
    approvalRequired:true,
  },
];

export const INTEGRATION_PROVIDER_CATALOGUE:readonly IntegrationProviderDefinition[]=[
  ...DISHBEE_PLUS_PROVIDER_CATALOGUE,
  ...AUTOHASHI_AUCTION_PROVIDER_CATALOGUE,
];

export function integrationProvider(key:string){
  return INTEGRATION_PROVIDER_CATALOGUE.find(provider=>provider.key===key);
}

export function providerHasCapability(key:string,capability:string){
  return integrationProvider(key)?.capabilities.includes(capability)??false;
}

export function isAuctionExecutionProvider(key:string){
  return providerHasCapability(key,"bid.submit");
}

export function canEnableProvider(status:IntegrationProviderStatus){
  return status==="approved"||status==="live";
}

export function routePreference(role:IntegrationRouteRole){
  switch(role){
    case "direct":return 10;
    case "destination":return 20;
    case "source":return 30;
    case "bridge":return 50;
    case "fallback":return 90;
  }
}
