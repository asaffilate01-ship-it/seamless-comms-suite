import catalogue from "@/modules/ecosystem/catalogue.json";

export type PortfolioProfile =
  | "general"
  | "hospitality"
  | "marketplace"
  | "field_service"
  | "automotive"
  | "professional_services"
  | "accounting_tax"
  | "compliance"
  | "fintech_remittance"
  | "telecom"
  | "recruitment"
  | "property"
  | "education"
  | "childcare"
  | "creative"
  | "company_secretarial"
  | "commerce"
  | "delivery_logistics";

export type PortfolioProduct = {
  productKey: string;
  name: string;
  profile: PortfolioProfile;
  modules: string[];
  regions: string[];
  locales: string[];
  repository?: string | null;
  connectorStatus: string;
  boundary: string;
  sourceNames: string[];
};

export const PORTFOLIO_PROFILE_MODULES: Record<PortfolioProfile,string[]> = {
  general: [
    "crm.core","connect.core","intelligence.core","documents.core","automation.core",
    "analytics.core","notifications.core","search.core","support.core"
  ],
  hospitality: [
    "crm.core","ordering.core","hospitality.intelligence","inventory.core","bookings.core",
    "loyalty.core","connect.core","reception.core","payments.core","marketing.core",
    "journeys.core","feedback.core","analytics.core","financials.core","creative.core",
    "intelligence.core","support.core","notifications.core","search.core","automation.core","forms.core"
  ],
  marketplace: [
    "crm.core","marketplace.core","inventory.core","bookings.core","payments.core","connect.core",
    "marketing.core","sales.core","journeys.core","feedback.core","analytics.core","financials.core",
    "intelligence.core","support.core","notifications.core","search.core","automation.core","forms.core"
  ],
  field_service: [
    "crm.core","connect.core","reception.core","geo.core","dispatch.core","inventory.core","bookings.core",
    "payments.core","feedback.core","analytics.core","financials.core","mobile.core","intelligence.core",
    "support.core","notifications.core","search.core","documents.core","automation.core","forms.core"
  ],
  automotive: [
    "crm.core","marketplace.core","inventory.core","connect.core","reception.core","geo.core",
    "dispatch.core","payments.core","sales.core","marketing.core","journeys.core","feedback.core",
    "analytics.core","financials.core","intelligence.core","documents.core","support.core",
    "notifications.core","search.core","automation.core","forms.core"
  ],
  professional_services: [
    "crm.core","practice.core","connect.core","reception.core","sales.core","marketing.core","journeys.core",
    "documents.core","bookings.core","forms.core","automation.core","analytics.core","financials.core",
    "creative.core","intelligence.core","support.core","notifications.core","search.core"
  ],
  accounting_tax: [
    "crm.core","practice.core","accounting_ai.core","tax_intelligence.core","documents.core","payments.core",
    "connect.core","reception.core","bookings.core","forms.core","automation.core","compliance.core",
    "analytics.core","financials.core","intelligence.core","marketing.core","sales.core",
    "support.core","notifications.core","search.core"
  ],
  compliance: [
    "crm.core","compliance.core","documents.core","connect.core","reception.core","forms.core","automation.core",
    "analytics.core","financials.core","intelligence.core","support.core","notifications.core","search.core"
  ],
  fintech_remittance: [
    "crm.core","connect.core","reception.core","payments.core","compliance.core","documents.core",
    "forms.core","automation.core","analytics.core","financials.core","intelligence.core",
    "notifications.core","search.core","support.core","marketing.core","journeys.core","feedback.core"
  ],
  telecom: [
    "crm.core","connect.core","reception.core","payments.core","compliance.core","analytics.core",
    "financials.core","intelligence.core","notifications.core","support.core","automation.core","search.core"
  ],
  recruitment: [
    "crm.core","sales.core","connect.core","reception.core","marketing.core","journeys.core","documents.core",
    "forms.core","automation.core","analytics.core","intelligence.core","support.core","notifications.core","search.core"
  ],
  property: [
    "crm.core","marketplace.core","documents.core","connect.core","reception.core","bookings.core","payments.core",
    "geo.core","sales.core","marketing.core","journeys.core","analytics.core","financials.core",
    "intelligence.core","support.core","notifications.core","search.core","automation.core","forms.core"
  ],
  education: [
    "crm.core","marketplace.core","documents.core","connect.core","reception.core","bookings.core","payments.core",
    "forms.core","automation.core","analytics.core","financials.core","intelligence.core","support.core",
    "notifications.core","search.core","marketing.core","journeys.core","feedback.core"
  ],
  childcare: [
    "crm.core","marketplace.core","childcare.core","bookings.core","payments.core","connect.core",
    "compliance.core","documents.core","forms.core","automation.core","notifications.core","search.core",
    "analytics.core","intelligence.core","geo.core","mobile.core","support.core"
  ],
  creative: [
    "crm.core","creative.core","connect.core","marketing.core","sales.core","journeys.core",
    "analytics.core","financials.core","intelligence.core","documents.core","automation.core",
    "notifications.core","search.core","support.core"
  ],
  company_secretarial: [
    "crm.core","practice.core","documents.core","connect.core","reception.core","forms.core","automation.core",
    "compliance.core","analytics.core","financials.core","intelligence.core","notifications.core","search.core","support.core"
  ],
  commerce: [
    "crm.core","marketplace.core","inventory.core","ordering.core","payments.core","connect.core","reception.core",
    "marketing.core","sales.core","journeys.core","loyalty.core","feedback.core","analytics.core",
    "financials.core","intelligence.core","creative.core","support.core","notifications.core","search.core","automation.core"
  ],
  delivery_logistics: [
    "crm.core","connect.core","reception.core","geo.core","dispatch.core","mobile.core","payments.core",
    "analytics.core","financials.core","intelligence.core","support.core","notifications.core","search.core",
    "automation.core","documents.core"
  ],
};

const PROFILE_OVERRIDES: Record<string,PortfolioProfile> = {
  dishbee:"hospitality", epos:"hospitality", mealdeck:"hospitality", threeonethree:"hospitality",
  motoresq:"field_service", recovra:"field_service", recovarable:"field_service", rettio:"field_service",
  fleetsora:"delivery_logistics", "courier-broker":"delivery_logistics", depotmesh:"delivery_logistics", loungeconnect:"delivery_logistics",
  sparesgrid:"automotive", zivvo:"automotive", autohashi:"automotive", bidlumo:"automotive",
  taxnuvia:"professional_services", lawquo:"professional_services", auvane-one:"professional_services", beratermarkt:"professional_services",
  "iq-practice-cloud":"accounting_tax", taxcenda:"accounting_tax",
  haccora:"compliance", regulos:"compliance", dokuvera:"compliance", insure360:"compliance",
  fastremit:"fintech_remittance", "zoryn-pay":"fintech_remittance",
  veyumo:"telecom",
  xpertjobs:"recruitment", leadlens:"recruitment",
  gabley:"property", "gabley-retrofit":"property", domureva:"property", "hmo-flow":"property", immoviq:"property",
  kinderstars:"childcare", kindelo:"childcare",
  lessonahead:"marketplace", ahlnikkah:"marketplace", eventplanr:"marketplace", "travel-agency-os":"marketplace",
  unipathways:"education", skillfinch:"education", ilmvero:"education", "loungetech-training":"education", stemcoach:"education", traindirekt:"education", gradlume:"education",
  voxentri:"creative",
  formationgenie:"company_secretarial", "loungetech-founders":"company_secretarial",
  zarvane:"commerce", affivon:"commerce", commerceops:"commerce", merqano:"commerce", merqora:"commerce", orvilo:"commerce",
};

const NAME_OVERRIDES: Record<string,string> = {
  motoresq:"MotoResQ / All-Road-Aid",
  "courier-broker":"Courier Connect Hub",
  kinderstars:"Kindelo legacy / KinderStars",
  unipathways:"UniPathway",
  ahlnikkah:"Ahl-Nikkah",
  sparesgrid:"SparesGrid / SparesIQ",
};

const EXTRA_PRODUCTS = [
  {product:"mealdeck",name:"MealDeck",repository:null,status:"source-adapter-required",boundary:"MealDeck owns multi-brand food ordering and venue operations; Omniqora owns shared CRM, communications, journeys, analytics, payments abstractions and automation."},
  {product:"fastremit",name:"FastRemit",repository:null,status:"source-adapter-required",boundary:"FastRemit owns remittance quotes, beneficiary, corridor and regulated transaction workflows; Omniqora supplies shared CRM, communications, payments abstraction, compliance/intelligence and lifecycle automation."},
  {product:"kindelo",name:"Kindelo",repository:null,status:"product-family-implemented",boundary:"Kindelo owns childcare placements, funding, attendance and safeguarding rules; Omniqora owns tenancy, marketplace, CRM, communications, identity, payments abstractions and shared compliance tooling."},
  {product:"sparesgrid",name:"SparesGrid / SparesIQ",repository:null,status:"gateway-contract-implemented",boundary:"SparesGrid owns vehicle/parts fitment, RFQs, suppliers and parts commerce; Omniqora owns shared CRM, communications, marketplace, dispatch, automation and intelligence services."},
  {product:"autohashi",name:"AutoHashi",repository:null,status:"connect-manifest-implemented",boundary:"AutoHashi owns Japan auction, vehicle, inspection and landed-cost logic; Omniqora owns shared CRM, communications, sales, analytics and orchestration."},
  {product:"formationgenie",name:"FormationGenie",repository:null,status:"source-adapter-required",boundary:"FormationGenie owns Companies House/company-secretarial workflows and statutory filing logic; Omniqora owns shared CRM, documents, communications, approvals, billing, automation and audit."},
] as const;

function defaultBoundary(product:string){
  return product+" remains authoritative for specialist domain rules and records; Omniqora supplies shared tenant, CRM, communications, connector, AI, workflow, analytics and operational engines through scoped APIs/events.";
}

const sourceRows=[...(catalogue as any[]),...EXTRA_PRODUCTS];
const grouped=new Map<string,any[]>();
for(const row of sourceRows){
  const list=grouped.get(row.product)??[];list.push(row);grouped.set(row.product,list);
}

export const OMNIQORA_PORTFOLIO: PortfolioProduct[]=[...grouped.entries()].map(([productKey,rows])=>{
  const profile=PROFILE_OVERRIDES[productKey]??"general";
  const first=rows[0]!;
  const regions =
    productKey==="taxcenda"?["US"]:
    productKey==="kindelo"||productKey==="kinderstars"?["GB","DE"]:
    ["GB","DE","AE","SA","US","PK"];
  const locales =
    productKey==="taxcenda"?["en-US"]:
    productKey==="kindelo"||productKey==="kinderstars"?["en-GB","de-DE"]:
    ["en-GB","de-DE","ar-AE","ar-SA","en-US","ur-PK"];
  return{
    productKey,
    name:NAME_OVERRIDES[productKey]??first.name??productKey,
    profile,
    modules:[...PORTFOLIO_PROFILE_MODULES[profile]],
    regions,
    locales,
    repository:rows.find((row)=>row.repository)?.repository??null,
    connectorStatus:rows.find((row)=>row.status!=="source-adapter-required")?.status??first.status??"source-adapter-required",
    boundary:rows.find((row)=>row.boundary)?.boundary??defaultBoundary(productKey),
    sourceNames:[...new Set(rows.map((row)=>String(row.name)))],
  };
}).sort((a,b)=>a.name.localeCompare(b.name));

export function portfolioProduct(productKey:string){
  return OMNIQORA_PORTFOLIO.find((item)=>item.productKey===productKey)??null;
}
