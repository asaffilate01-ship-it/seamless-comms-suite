import type { ProductBlueprint } from "./saas-factory";

export type BlueprintKey =
  | "marketplace"
  | "field_service"
  | "professional_services"
  | "compliance"
  | "hospitality"
  | "affiliate_commerce"
  | "tenders_procurement"
  | "accounting_practice"
  | "us_tax"
  | "business_advisory"
  | "compliance_service"
  | "childcare_marketplace";

export const SAAS_BLUEPRINTS: Record<BlueprintKey, ProductBlueprint> = {
  marketplace: {
    productKey: "template-marketplace",
    industry: "marketplace",
    regions: ["GB"],
    locales: ["en-GB"],
    modules: [
      "crm.core","marketplace.core","inventory.core","bookings.core","loyalty.core",
      "payments.core","connect.core","marketing.core","sales.core","journeys.core",
      "feedback.core","analytics.core","financials.core","creative.core","intelligence.core","support.core","notifications.core","search.core","support.core","notifications.core","search.core","support.core","notifications.core","search.core","documents.core",
      "automation.core","forms.core",
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
      "crm.core","connect.core","geo.core","dispatch.core","inventory.core","bookings.core",
      "payments.core","feedback.core","analytics.core","financials.core","mobile.core",
      "intelligence.core","support.core","notifications.core","search.core","documents.core","automation.core","forms.core",
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
      "crm.core","practice.core","connect.core","sales.core","marketing.core","journeys.core",
      "documents.core","bookings.core","forms.core","automation.core","analytics.core",
      "financials.core","creative.core","intelligence.core",
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
      "crm.core","compliance.core","documents.core","connect.core","forms.core","automation.core",
      "analytics.core","financials.core","intelligence.core","creative.core","support.core","notifications.core","search.core",
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
      "crm.core","ordering.core","hospitality.intelligence","inventory.core","bookings.core",
      "loyalty.core","connect.core","payments.core","marketing.core","journeys.core",
      "feedback.core","analytics.core","financials.core","creative.core","intelligence.core",
      "support.core","notifications.core","search.core","documents.core","automation.core","forms.core",
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
      "crm.core","marketplace.core","inventory.core","loyalty.core","marketing.core","sales.core",
      "journeys.core","analytics.core","financials.core","creative.core","connect.core","intelligence.core","support.core","notifications.core","search.core","documents.core","automation.core","forms.core",
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
      "crm.core","compliance.core","documents.core","sales.core","connect.core","forms.core",
      "automation.core","analytics.core","financials.core","creative.core","intelligence.core","support.core","notifications.core","search.core",
    ],
    roles: ["owner","admin","bid_manager","contributor","reviewer","finance","legal","viewer"],
    navigation: ["dashboard","opportunities","tenders","requirements","compliance","documents","workflows","contacts","analytics","financials","settings"],
    domainObjects: ["tender","buyer","opportunity","qualification","requirement","response","document","deadline","review","submission","award"],
    workflows: ["opportunity_intake","bid_no_bid","qualification","response_drafting","review","approval","submission","award_handover"],
    mobileCapabilities: ["push","documents","camera","photos","biometrics"],
  },
  accounting_practice: {
    productKey: "iq-practice-cloud",
    industry: "uk_accountancy_practice",
    regions: ["GB"],
    locales: ["en-GB"],
    modules: [
      "crm.core","practice.core","documents.core","payments.core","connect.core","bookings.core",
      "forms.core","automation.core","compliance.core","analytics.core","financials.core",
      "intelligence.core","marketing.core","sales.core","support.core","notifications.core","search.core"
    ],
    roles: ["owner","admin","partner","manager","accountant","bookkeeper","payroll","tax","reviewer","compliance","finance","viewer"],
    navigation: ["dashboard","clients","engagements","deadlines","documents","accounts","tax","vat","payroll","aml","billing","messages","analytics","settings"],
    domainObjects: ["client","engagement","deadline","document_request","signature_request","submission","time_entry","invoice","task"],
    workflows: ["client_onboarding","aml","document_collection","accounts","tax_return","vat_return","payroll","review","submission","billing","renewal"],
    mobileCapabilities: ["push","documents","camera","photos","biometrics"],
  },
  us_tax: {
    productKey: "taxcenda",
    industry: "us_tax_practice",
    regions: ["US"],
    locales: ["en-US"],
    modules: [
      "crm.core","practice.core","documents.core","payments.core","connect.core","bookings.core",
      "forms.core","automation.core","compliance.core","analytics.core","financials.core","intelligence.core","support.core","notifications.core","search.core"
    ],
    roles: ["owner","admin","preparer","reviewer","compliance","support","finance","viewer"],
    navigation: ["dashboard","clients","engagements","documents","questions","review","filings","signatures","payments","messages","analytics","settings"],
    domainObjects: ["tax_entity","engagement","document","clarification","filing","signature","payment","deadline"],
    workflows: ["onboarding","document_collection","preparation","review","client_questions","signature","efile","acknowledgement","amendment"],
    mobileCapabilities: ["push","documents","camera","photos","biometrics"],
  },
  business_advisory: {
    productKey: "business360",
    industry: "business_advisory_transformation",
    regions: ["GB","DE","AE","SA","US","PK"],
    locales: ["en-GB","de-DE","ar-AE","ar-SA","en-US","ur-PK"],
    modules: [
      "crm.core","business360.core","transactions.core","documents.core","forms.core",
      "automation.core","analytics.core","financials.core","intelligence.core","compliance.core",
      "connect.core","creative.core","support.core","notifications.core","search.core"
    ],
    roles: ["owner","admin","adviser","analyst","reviewer","finance","technical","compliance","viewer"],
    navigation: ["dashboard","companies","discovery","audit","improvements","diligence","transactions","tsa","day1","workstreams","benefits","evidence","analytics","financials","settings"],
    domainObjects: ["company","business_service","asset","workforce","cost","objective","dependency","finding","tsa","decision","plan","benefit"],
    workflows: ["discovery","diagnostic","audit","improvement","diligence","carve_out","merger","integration","day1","hundred_day","benefits_review"],
    mobileCapabilities: ["push","documents","camera","photos","biometrics"],
  },
  childcare_marketplace: {
    productKey: "kinderstars",
    industry: "childcare_agency_marketplace",
    regions: ["GB","DE"],
    locales: ["en-GB","de-DE"],
    modules: [
      "crm.core","marketplace.core","bookings.core","payments.core","connect.core",
      "compliance.core","documents.core","forms.core","automation.core",
      "notifications.core","search.core","analytics.core","intelligence.core",
      "mobile.core","support.core"
    ],
    optionalModules: [
      "reception.core","financials.core","marketing.core","sales.core","journeys.core",
      "feedback.core","loyalty.core","creative.core","geo.core"
    ],
    roles: [
      "owner","admin","agency_manager","compliance_manager","placement_coordinator",
      "finance","support","minder_manager","reviewer","viewer"
    ],
    navigation: [
      "dashboard","parents","children","minders","marketplace","bookings","placements",
      "attendance","funding","compliance","documents","messages","reception","payments",
      "marketing","feedback","analytics","financials","settings"
    ],
    domainObjects: [
      "agency","parent","guardian","child","minder","provider_profile","service_listing",
      "availability","placement","booking","attendance","funding_case","funding_claim",
      "safeguarding_case","training_record","qualification","compliance_check",
      "document","invoice","payment","commission","payout","review","dispute"
    ],
    workflows: [
      "parent_onboarding","child_onboarding","minder_onboarding","identity_and_compliance_checks",
      "matching","placement","booking","attendance","funding_validation","funding_claim",
      "payment_collection","provider_payout","incident","safeguarding","review_request",
      "renewal","inspection_readiness","ongoing_compliance"
    ],
    mobileCapabilities: [
      "push","deep_links","camera","photos","documents","qr","chat","voice",
      "gps","offline","biometrics"
    ],
    metadata: {
      marketplaceVendorType: "childminder_or_provider",
      marketplaceBuyerType: "parent_or_guardian",
      tenantType: "childcare_agency_operator",
      clientUsersAreNotTenants: true,
      providersAreNotTenantsByDefault: true,
      countryVariants: ["kinderstars-gb","kinderstars-de"]
    }
  },
  compliance_service: {
    productKey: "regulos",
    industry: "regulatory_compliance",
    regions: ["GB","DE","AE","SA","US","PK"],
    locales: ["en-GB","de-DE","ar-AE","ar-SA","en-US","ur-PK"],
    modules: [
      "crm.core","practice.core","compliance.core","documents.core","forms.core",
      "automation.core","connect.core","analytics.core","financials.core","intelligence.core","creative.core","support.core","notifications.core","search.core"
    ],
    roles: ["owner","admin","compliance_manager","consultant","reviewer","assessor","evidence_owner","client_admin","viewer"],
    navigation: ["dashboard","clients","applications","requirements","evidence","findings","actions","inspections","monitoring","correspondence","documents","analytics","settings"],
    domainObjects: ["client","assessment","application","requirement","evidence","finding","remediation","inspection","obligation","correspondence","submission"],
    workflows: ["client_onboarding","regulatory_application","evidence_collection","review","remediation","submission","inspection_readiness","ongoing_monitoring","renewal"],
    mobileCapabilities: ["push","documents","camera","photos","qr","offline","biometrics"],
  },
};

export function blueprint(key: BlueprintKey): ProductBlueprint {
  return structuredClone(SAAS_BLUEPRINTS[key]);
}
