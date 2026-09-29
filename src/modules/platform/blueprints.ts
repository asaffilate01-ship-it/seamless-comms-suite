import type { ProductBlueprint } from "./saas-factory";

export type BlueprintKey =
  | "marketplace"
  | "field_service"
  | "professional_services"
  | "compliance"
  | "hospitality"
  | "affiliate_commerce"
  | "tenders_procurement";

export const SAAS_BLUEPRINTS: Record<BlueprintKey, ProductBlueprint> = {
  marketplace: {
    productKey: "template-marketplace",
    industry: "marketplace",
    regions: ["GB"],
    locales: ["en-GB"],
    modules: [
      "crm.core","marketplace.core","payments.core","connect.core","marketing.core",
      "sales.core","journeys.core","feedback.core","analytics.core","financials.core",
      "creative.core","intelligence.core",
    ],
    roles: ["owner","admin","vendor_admin","vendor_staff","support","finance","viewer"],
    navigation: ["dashboard","vendors","catalogue","orders","customers","messages","marketing","analytics","financials","settings"],
    domainObjects: ["vendor","listing","catalogue","inventory","order","booking","commission","payout","review","dispute"],
    workflows: ["vendor_onboarding","listing_review","order_fulfilment","refund","payout","review_recovery"],
    mobileCapabilities: ["push","deep_links","camera","photos","documents","qr","chat","biometrics"],
  },
  field_service: {
    productKey: "template-field-service",
    industry: "field_service",
    regions: ["GB"],
    locales: ["en-GB"],
    modules: [
      "crm.core","connect.core","geo.core","dispatch.core","payments.core","feedback.core",
      "analytics.core","financials.core","mobile.core","intelligence.core",
    ],
    roles: ["owner","admin","dispatcher","agent","finance","support","viewer"],
    navigation: ["dashboard","jobs","dispatch","map","agents","fleet","customers","messages","analytics","financials","settings"],
    domainObjects: ["job","agent","vehicle","stop","schedule","pod","wallet","maintenance"],
    workflows: ["job_intake","assignment","arrival","service","completion","exception","return"],
    mobileCapabilities: ["push","deep_links","camera","photos","documents","barcode","qr","gps","background_gps","maps","chat","voice","offline","biometrics"],
  },
  professional_services: {
    productKey: "template-professional-services",
    industry: "professional_services",
    regions: ["GB"],
    locales: ["en-GB"],
    modules: [
      "crm.core","connect.core","sales.core","marketing.core","journeys.core","documents.core",
      "analytics.core","financials.core","creative.core","intelligence.core",
    ],
    roles: ["owner","admin","professional","sales","support","finance","viewer"],
    navigation: ["dashboard","clients","leads","pipeline","work","documents","messages","marketing","analytics","financials","settings"],
    domainObjects: ["client","engagement","matter","document","quote","invoice","task"],
    workflows: ["lead_to_client","onboarding","engagement","review","billing","renewal"],
    mobileCapabilities: ["push","documents","camera","chat","biometrics"],
  },
  compliance: {
    productKey: "template-compliance",
    industry: "compliance",
    regions: ["GB"],
    locales: ["en-GB"],
    modules: [
      "crm.core","compliance.core","documents.core","connect.core","analytics.core",
      "financials.core","intelligence.core","creative.core",
    ],
    roles: ["owner","admin","compliance_manager","reviewer","assessor","evidence_owner","viewer"],
    navigation: ["dashboard","applications","requirements","evidence","findings","actions","inspections","monitoring","documents","analytics","settings"],
    domainObjects: ["assessment","requirement","evidence","finding","remediation","review","inspection","correspondence","renewal"],
    workflows: ["intake","applicability","evidence_collection","review","remediation","submission","inspection_readiness","ongoing_monitoring"],
    mobileCapabilities: ["push","camera","photos","documents","qr","offline","biometrics"],
  },
  hospitality: {
    productKey: "template-hospitality",
    industry: "hospitality",
    regions: ["GB"],
    locales: ["en-GB"],
    modules: [
      "crm.core","connect.core","payments.core","marketing.core","journeys.core",
      "feedback.core","analytics.core","financials.core","creative.core","intelligence.core",
    ],
    roles: ["owner","admin","manager","staff","kitchen","finance","support","viewer"],
    navigation: ["dashboard","orders","customers","menu","operations","messages","marketing","feedback","analytics","financials","settings"],
    domainObjects: ["menu","item","modifier","order","booking","recipe","inventory","supplier","customer"],
    workflows: ["order","booking","complaint","loyalty","review_request","stock_alert"],
    mobileCapabilities: ["push","camera","photos","qr","chat","biometrics"],
  },
  affiliate_commerce: {
    productKey: "affivon",
    industry: "affiliate_commerce",
    regions: ["GB","DE","US","AE"],
    locales: ["en-GB","de-DE","en-US","ar-AE"],
    modules: [
      "crm.core","marketplace.core","marketing.core","sales.core","journeys.core",
      "analytics.core","financials.core","creative.core","connect.core","intelligence.core",
    ],
    roles: ["owner","admin","publisher","content","commercial","finance","viewer"],
    navigation: ["dashboard","sites","catalogue","offers","content","campaigns","partners","analytics","financials","creative","settings"],
    domainObjects: ["site","merchant","programme","offer","product_feed","link","content","campaign","conversion","commission"],
    workflows: ["merchant_onboarding","feed_sync","content_generation","campaign_launch","conversion_reconciliation","commission_review"],
    mobileCapabilities: ["push","camera","photos","documents","deep_links"],
  },
  tenders_procurement: {
    productKey: "tendryva",
    industry: "tenders_procurement",
    regions: ["GB","DE","AE","SA"],
    locales: ["en-GB","de-DE","ar-AE","ar-SA"],
    modules: [
      "crm.core","compliance.core","documents.core","sales.core","connect.core",
      "analytics.core","financials.core","creative.core","intelligence.core",
    ],
    roles: ["owner","admin","bid_manager","contributor","reviewer","finance","legal","viewer"],
    navigation: ["dashboard","opportunities","tenders","requirements","compliance","documents","workflows","contacts","analytics","financials","settings"],
    domainObjects: ["tender","buyer","opportunity","qualification","requirement","response","document","deadline","review","submission","award"],
    workflows: ["opportunity_intake","bid_no_bid","qualification","response_drafting","review","approval","submission","award_handover"],
    mobileCapabilities: ["push","documents","camera","photos","biometrics"],
  },
};

export function blueprint(key: BlueprintKey): ProductBlueprint {
  return structuredClone(SAAS_BLUEPRINTS[key]);
}
