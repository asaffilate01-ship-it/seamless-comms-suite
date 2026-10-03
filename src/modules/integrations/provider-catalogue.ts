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
  {key:"foodics",name:"Foodics",family:"pos",capabilities:["pos","orders","catalogue","inventory","payments"],status:"evaluate"},
  {key:"dines",name:"Dines",family:"pos",capabilities:["pos","orders","catalogue","kds","payments"],status:"evaluate"},
  {key:"toast",name:"Toast",family:"pos",capabilities:["pos","orders","catalogue","kds"],status:"evaluate"},
  {key:"square",name:"Square",family:"pos",capabilities:["pos","orders","catalogue","payments"],status:"evaluate"},
  {key:"sumup",name:"SumUp",family:"pos",capabilities:["pos","orders","payments"],status:"evaluate"},
  {key:"lightspeed",name:"Lightspeed",family:"pos",capabilities:["pos","orders","catalogue","inventory"],status:"evaluate"},
  {key:"epos_now",name:"Epos Now",family:"pos",capabilities:["pos","orders","catalogue","inventory"],status:"evaluate"},
  {key:"grafterr",name:"Grafterr",family:"pos",capabilities:["pos","orders","qr","kiosk"],status:"evaluate"},
  {key:"uber_direct",name:"Uber Direct",family:"delivery",capabilities:["quote","create","cancel","tracking"],status:"planned",approvalRequired:true},
  {key:"deliveroo_express",name:"Deliveroo Express",family:"delivery",capabilities:["quote","create","cancel","tracking"],status:"planned",approvalRequired:true},
  {key:"just_eat_go",name:"Just Eat Go",family:"delivery",capabilities:["quote","create","cancel","tracking"],status:"planned",approvalRequired:true},
  {key:"stuart",name:"Stuart",family:"delivery",capabilities:["quote","create","cancel","tracking"],status:"planned",approvalRequired:true},
];

export function integrationProvider(key:string){
  return DISHBEE_PLUS_PROVIDER_CATALOGUE.find(provider=>provider.key===key);
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
