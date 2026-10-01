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

export type PortfolioArchitectureRole =
  | "landlord"
  | "marketplace_landlord"
  | "product_variant"
  | "tenant"
  | "shared_engine"
  | "shared_module"
  | "external_source"
  | "review_required";

export type PortfolioSourceStrategy =
  | "separate_repo"
  | "omniqora_native"
  | "merge_sources"
  | "tenant_configuration"
  | "shared_module"
  | "external_connector";

export type PortfolioMigrationStage =
  | "inventoried"
  | "repo_audit"
  | "canonical_selected"
  | "adapter_required"
  | "adapter_ready"
  | "shadow_sync"
  | "dual_read"
  | "cutover_ready"
  | "migrated"
  | "retired";

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
  sourceRepositories: string[];
  architectureRole: PortfolioArchitectureRole;
  parentProductKey?: string | null;
  sourceStrategy: PortfolioSourceStrategy;
  migrationStage: PortfolioMigrationStage;
  registerInFactory: boolean;
  needsReview: boolean;
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
  unipathways:"education", unipathway:"education", educloud:"education", skillfinch:"education", ilmvero:"education", "loungetech-training":"education", stemcoach:"education", traindirekt:"education", gradlume:"education",
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
  {product:"mealdeck",name:"MealDeck",repository:"asaffilate01-ship-it/pixel-perfect-71",status:"source-adapter-required",boundary:"MealDeck owns multi-brand ordering, group ordering, venue/KDS coordination and customer experience; it runs as an operator tenant on Dishbee shared hospitality services."},
  {product:"fastremit",name:"FastRemit",repository:"asaffilate01-ship-it/screen-shot-magic-526",status:"source-adapter-required",boundary:"FastRemit owns remittance corridors, beneficiaries, quotes, regulated transfer workflows and payout rails; Omniqora supplies shared CRM, communications, compliance/intelligence and lifecycle automation."},
  {product:"kindelo",name:"Kindelo",repository:"asaffilate01-ship-it/kinderstars-childcare-saas",status:"product-family-implemented",boundary:"Kindelo owns childcare placements, funding, attendance and safeguarding rules; Omniqora owns tenancy, marketplace, CRM, communications, identity, payments abstractions and shared compliance tooling."},
  {product:"sparesgrid",name:"SparesGrid / SparesIQ",repository:null,status:"gateway-contract-implemented",boundary:"SparesGrid owns VIN/fitment, parts RFQs, supplier catalogue and parts commerce; Omniqora owns shared CRM, communications, marketplace, dispatch, automation and intelligence services."},
  {product:"autohashi",name:"AutoHashi",repository:"asaffilate01-ship-it/nazli",status:"connect-manifest-implemented",boundary:"AutoHashi owns Japan auction, vehicle, inspection and landed-cost logic; Omniqora owns shared CRM, communications, sales, analytics and orchestration."},
  {product:"formationgenie",name:"FormationGenie",repository:"asaffilate01-ship-it/formation-genie-magic",status:"source-adapter-required",boundary:"FormationGenie owns Companies House/company-secretarial workflows and statutory filing logic; Omniqora owns shared CRM, documents, communications, approvals, billing, automation and audit."},
  {product:"unipathway",name:"UniPathway",repository:"asaffilate01-ship-it/ascent-education-cloud",status:"source-adapter-required",boundary:"UniPathway owns accredited-centre education, cohorts, teaching, assessment, progression and residential-week workflows; Omniqora supplies shared tenancy, communications, CRM, payments, documents, automation and analytics."},
  {product:"orvilo",name:"Orvilo",repository:"asaffilate01-ship-it/webtemplates",status:"canonical-source-selected",boundary:"Orvilo owns website/template editing, publishing and domain/site lifecycle; Omniqora supplies tenant provisioning, billing, identity, AI/creative, CRM and communications."},
  {product:"orvilo",name:"Orvilo legacy A",repository:"asaffilate01-ship-it/launchpad-ai-87",status:"legacy-source",boundary:"Legacy Orvilo/BrandSpark source retained for feature comparison only."},
  {product:"orvilo",name:"Orvilo legacy X",repository:"asaffilate01-ship-it/pixel-perfect-clone-ceddafea",status:"legacy-source",boundary:"Legacy Orvilo source retained for feature comparison only."},
  {product:"xpertjobs",name:"StellenXpert source",repository:"asaffilate01-ship-it/semantic-hire-flow",status:"regional-source",boundary:"German XpertJobs source/brand to be folded into the XpertJobs landlord family."},
  {product:"onyn",name:"OnýnGo Pakistan source",repository:"asaffilate01-ship-it/onynapp-pakistan",status:"regional-source",boundary:"Pakistan source/variant to be consolidated under the OnýnGo product family."},
  {product:"sparesgrid",name:"Partsynex prototype",repository:"partsynex.amersaleem.chatgpt.site",status:"site-prototype",boundary:"Second SparesGrid/Partsynex prototype retained as a source reference, not a second landlord."},
  {product:"bondedos",name:"BondedOS",repository:"france-bonded-warehouse.amersaleem.chatgpt.site",status:"site-prototype",boundary:"Bonded warehousing vertical to be built Omniqora-native unless later repo audit proves separate source code is required."},
  {product:"clinoveya",name:"Clinoveya",repository:"clinoveya.amersaleem.chatgpt.site",status:"site-prototype",boundary:"Clinic/health vertical prototype; build on shared Omniqora core with vertical clinical workflow isolated from generic CRM."},
  {product:"omniqora-ai",name:"Omniqora AI",repository:"omniqora-ai.amersaleem.chatgpt.site",status:"site-prototype",boundary:"Shared intelligence surface; fold into intelligence.core rather than maintain a separate SaaS core."},
  {product:"veyumo",name:"Veyumo",repository:"veyumo.amersaleem.chatgpt.site",status:"mobile-bridge-source-integrated",boundary:"Telecom/MVNO vertical; Omniqora owns shared tenant, CRM, communications, billing orchestration, support and analytics."},
  {product:"visa-sponsor",name:"Visa Sponsor Intelligence",repository:"sponsor-intelligence-uk.amersaleem.chatgpt.site",status:"site-prototype",boundary:"Sponsor intelligence is an XpertJobs/recruitment add-on rather than a second recruitment platform."},
  {product:"regulos",name:"RegulaOS",repository:"regulaos.amersaleem.chatgpt.site",status:"site-prototype",boundary:"Regulatory compliance landlord consuming Omniqora compliance, documents, CRM, communications and intelligence."},
  {product:"promo-studio",name:"Promo Studio",repository:"promo-studio-kalethon.amersaleem.chatgpt.site",status:"site-prototype",boundary:"Reusable creative/promotion capability; fold into Voxentri/creative.core rather than Kalethon-only code."},
  {product:"sofellea",name:"Sofellea",repository:"sofellea-home.amersaleem.chatgpt.site",status:"site-prototype",boundary:"Commerce/brand prototype suited to the Merqano commerce landlord unless audit reveals specialist vertical logic."},
  {product:"auvane-one",name:"Auvane One",repository:"private-lifestyle-concierge.amersaleem.chatgpt.site",status:"site-prototype",boundary:"Professional concierge vertical consuming shared CRM, bookings, payments, communications and marketplace services."},
  {product:"oddsentia-fx",name:"OddsEntia FX",repository:"oddsentia-fx.amersaleem.chatgpt.site",status:"site-prototype",boundary:"Financial analytics vertical; keep specialist market/risk logic vertical and use Omniqora for shared platform services."},
  {product:"finmatch-ai",name:"FinMatch AI",repository:"finmatch-ai.amersaleem.chatgpt.site",status:"site-prototype",boundary:"Finance matching/intelligence vertical using shared CRM, marketplace, documents, workflows and intelligence."},
  {product:"accounts-ai",name:"Accounts AI",repository:"taxnuvia-accounts.amersaleem.chatgpt.site",status:"site-prototype",boundary:"Shared accounting intelligence add-on for IQ Practice Cloud, TaxNuvia and TaxCenda; not a separate landlord core."},
  {product:"athlyvo",name:"Athlyvo",repository:"athlora-sports.amersaleem.chatgpt.site",status:"site-prototype",boundary:"Sports vertical prototype consuming shared Omniqora identity, CRM, marketplace, communications and analytics."},
  {product:"oddsentia-sports",name:"OddsEntia Sports",repository:"arblens-uk.amersaleem.chatgpt.site",status:"site-prototype",boundary:"Sports analytics vertical; keep specialist sports/odds models vertical."},
  {product:"affivon",name:"Affivon",repository:"affiliate-commerce-os.amersaleem.chatgpt.site",status:"site-prototype",boundary:"Affiliate commerce landlord using Omniqora marketplace, CRM, marketing, journeys, analytics and financials."},
  {product:"tendryva",name:"Tendryva",repository:"tenderos.amersaleem.chatgpt.site",status:"site-prototype",boundary:"Tender/procurement landlord using shared CRM, documents, compliance, workflows, communications and intelligence."},
  {product:"gabley-retrofit",name:"Gabley Retrofit",repository:"gabley-retrofit.amersaleem.chatgpt.site",status:"site-prototype",boundary:"Retrofit product variant/add-on on the Gabley property family."},
  {product:"empfangiq",name:"EmpfangIQ",repository:"empfangiq-dashboard.amersaleem.chatgpt.site",status:"site-prototype",boundary:"Shared receptionist/phone-order surface; fold into reception.core and Connect."},
  {product:"apnepaas",name:"ApnePaas",repository:"asaffilate01-ship-it/voxavelle",status:"source-adapter-required",boundary:"Calling vertical for UK-to-Pakistan calling, bundles and routing; shared CRM, payments, communications, support and analytics remain Omniqora services."},
  {product:"meyzaar",name:"Meyzaar",repository:"asaffilate01-ship-it/fashion-ux-advisor",status:"source-adapter-required",boundary:"Commerce brand tenant under Merqano."},
  {product:"kalethon",name:"Kalethon",repository:"asaffilate01-ship-it/fashion-preview-hub",status:"source-adapter-required",boundary:"Commerce brand tenant under Merqano."},
  {product:"alstero",name:"Alstero",repository:"asaffilate01-ship-it/commerce-compass",status:"source-adapter-required",boundary:"Commerce brand tenant under Merqano."},
  {product:"dulcis",name:"Dulcis",repository:"asaffilate01-ship-it/pixel-perfect-show-373",status:"source-adapter-required",boundary:"Food/commerce brand tenant; keep brand UI/content, not a separate SaaS core."},
  {product:"taxlounge",name:"TaxLounge",repository:"asaffilate01-ship-it/taxlounge-launchpad",status:"source-adapter-required",boundary:"Operating accountancy practice tenant on IQ Practice Cloud."},
  {product:"qatnov",name:"Qatnov",repository:"asaffilate01-ship-it/remix-of-uzbekistan-delivery-hub",status:"source-adapter-required",boundary:"Regional logistics operator tenant on FleetSora."},
  {product:"cafe1-st-albans",name:"Cafe 1 St Albans",repository:"asaffilate01-ship-it/cafe1-connect-dash",status:"source-adapter-required",boundary:"Cafe 1 operating tenant on Dishbee; St Albans is a location/brand deployment, not an independent SaaS core."},
  {product:"cafe1-luton",name:"Cafe 1 Luton",repository:"asaffilate01-ship-it/cafe-1-luton",status:"source-adapter-required",boundary:"Cafe 1 operating tenant on Dishbee; Luton locations remain under the same tenant hierarchy."},
  {product:"stylesync",name:"StyleSync",repository:"asaffilate01-ship-it/halo-suite-hub",status:"source-adapter-required",boundary:"Salon/beauty SaaS landlord; German branding can inherit the same vertical core."},
  {product:"schonova",name:"Schonova",repository:"asaffilate01-ship-it/delightful-dash-suite",status:"regional-source",boundary:"German branded product variant on StyleSync core."},
  {product:"immoviq",name:"Immoviq",repository:"asaffilate01-ship-it/pixel-perfect-clone-67104",status:"regional-source",boundary:"German property product variant on Gabley core."},
  {product:"kalethon-teams",name:"Kalethon Teams",repository:"asaffilate01-ship-it/pixel-perfect-render-6809",status:"source-adapter-required",boundary:"B2B/team apparel variant under the Kalethon/Merqano commerce hierarchy."},
  {product:"virtual-lab",name:"Virtual Lab",repository:"asaffilate01-ship-it/pixel-perfect-replica-20502337",status:"source-adapter-required",boundary:"Shared education lab add-on for UniPathway, EduCloud and TrainDirekt."}
] as const;

function defaultBoundary(product:string){
  return product+" remains authoritative for specialist domain rules and records; Omniqora supplies shared tenant, CRM, communications, connector, AI, workflow, analytics and operational engines through scoped APIs/events.";
}

const CANONICAL_KEY_ALIASES:Record<string,string>={
  kinderstars:"kindelo",
  unipathways:"unipathway",
  tenderos:"tendryva",
  "courier-broker":"courier-connect",
  "zoryn-pay":"zoryn-pay"
};

const ARCHITECTURE_OVERRIDES:Record<string,Partial<PortfolioProduct>>={
  dishbee:{architectureRole:"landlord",sourceStrategy:"separate_repo",migrationStage:"adapter_required",registerInFactory:true,needsReview:false},
  mealdeck:{architectureRole:"tenant",parentProductKey:"dishbee",sourceStrategy:"tenant_configuration",migrationStage:"repo_audit",registerInFactory:false,needsReview:false},
  merqano:{architectureRole:"marketplace_landlord",sourceStrategy:"separate_repo",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  dulcis:{architectureRole:"tenant",parentProductKey:"merqano",sourceStrategy:"tenant_configuration",migrationStage:"repo_audit",registerInFactory:false,needsReview:false},
  meyzaar:{architectureRole:"tenant",parentProductKey:"merqano",sourceStrategy:"tenant_configuration",migrationStage:"repo_audit",registerInFactory:false,needsReview:false},
  zarvane:{architectureRole:"tenant",parentProductKey:"merqano",sourceStrategy:"tenant_configuration",migrationStage:"repo_audit",registerInFactory:false,needsReview:false},
  kalethon:{architectureRole:"tenant",parentProductKey:"merqano",sourceStrategy:"tenant_configuration",migrationStage:"repo_audit",registerInFactory:false,needsReview:false},
  alstero:{architectureRole:"tenant",parentProductKey:"merqano",sourceStrategy:"tenant_configuration",migrationStage:"repo_audit",registerInFactory:false,needsReview:false},
  taxlounge:{architectureRole:"tenant",parentProductKey:"iq-practice-cloud",sourceStrategy:"tenant_configuration",migrationStage:"repo_audit",registerInFactory:false,needsReview:false},
  qatnov:{architectureRole:"tenant",parentProductKey:"fleetsora",sourceStrategy:"tenant_configuration",migrationStage:"repo_audit",registerInFactory:false,needsReview:false},
  "cafe1-st-albans":{architectureRole:"tenant",parentProductKey:"dishbee",sourceStrategy:"tenant_configuration",migrationStage:"repo_audit",registerInFactory:false,needsReview:false},
  "cafe1-luton":{architectureRole:"tenant",parentProductKey:"dishbee",sourceStrategy:"tenant_configuration",migrationStage:"repo_audit",registerInFactory:false,needsReview:false},
  stylesync:{architectureRole:"landlord",sourceStrategy:"separate_repo",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  schonova:{architectureRole:"product_variant",parentProductKey:"stylesync",sourceStrategy:"merge_sources",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  immoviq:{architectureRole:"product_variant",parentProductKey:"gabley",sourceStrategy:"merge_sources",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  "kalethon-teams":{architectureRole:"tenant",parentProductKey:"merqano",sourceStrategy:"tenant_configuration",migrationStage:"repo_audit",registerInFactory:false,needsReview:true},

  kindelo:{architectureRole:"marketplace_landlord",sourceStrategy:"merge_sources",migrationStage:"canonical_selected",registerInFactory:true,needsReview:false},
  haccora:{architectureRole:"landlord",sourceStrategy:"merge_sources",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  eventplanr:{architectureRole:"marketplace_landlord",sourceStrategy:"merge_sources",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  xpertjobs:{architectureRole:"landlord",sourceStrategy:"merge_sources",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  zivvo:{architectureRole:"marketplace_landlord",sourceStrategy:"merge_sources",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  onyn:{architectureRole:"landlord",sourceStrategy:"merge_sources",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  orvilo:{architectureRole:"landlord",sourceStrategy:"merge_sources",migrationStage:"canonical_selected",registerInFactory:true,needsReview:false},
  unipathway:{architectureRole:"landlord",sourceStrategy:"separate_repo",migrationStage:"canonical_selected",registerInFactory:true,needsReview:false},
  educloud:{architectureRole:"landlord",sourceStrategy:"separate_repo",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  traindirekt:{architectureRole:"landlord",sourceStrategy:"separate_repo",migrationStage:"repo_audit",registerInFactory:true,needsReview:true},

  sparesgrid:{architectureRole:"marketplace_landlord",sourceStrategy:"omniqora_native",migrationStage:"adapter_ready",registerInFactory:true,needsReview:false},
  autohashi:{architectureRole:"marketplace_landlord",sourceStrategy:"separate_repo",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  taxnuvia:{architectureRole:"marketplace_landlord",sourceStrategy:"separate_repo",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  lawquo:{architectureRole:"marketplace_landlord",sourceStrategy:"separate_repo",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  lessonahead:{architectureRole:"marketplace_landlord",sourceStrategy:"separate_repo",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  ahlnikkah:{architectureRole:"marketplace_landlord",sourceStrategy:"separate_repo",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  affivon:{architectureRole:"marketplace_landlord",sourceStrategy:"omniqora_native",migrationStage:"inventoried",registerInFactory:true,needsReview:false},

  fastremit:{architectureRole:"landlord",sourceStrategy:"separate_repo",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  veyumo:{architectureRole:"landlord",sourceStrategy:"omniqora_native",migrationStage:"adapter_ready",registerInFactory:true,needsReview:false},
  formationgenie:{architectureRole:"landlord",sourceStrategy:"separate_repo",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  regulos:{architectureRole:"landlord",sourceStrategy:"omniqora_native",migrationStage:"inventoried",registerInFactory:true,needsReview:false},
  tendryva:{architectureRole:"landlord",sourceStrategy:"omniqora_native",migrationStage:"inventoried",registerInFactory:true,needsReview:false},
  "iq-practice-cloud":{architectureRole:"landlord",sourceStrategy:"separate_repo",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  taxcenda:{architectureRole:"landlord",sourceStrategy:"separate_repo",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  fleetsora:{architectureRole:"landlord",sourceStrategy:"separate_repo",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  "courier-connect":{architectureRole:"landlord",sourceStrategy:"separate_repo",migrationStage:"adapter_ready",registerInFactory:true,needsReview:false},
  motoresq:{architectureRole:"landlord",sourceStrategy:"separate_repo",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  gabley:{architectureRole:"marketplace_landlord",sourceStrategy:"separate_repo",migrationStage:"repo_audit",registerInFactory:true,needsReview:false},
  "gabley-retrofit":{architectureRole:"product_variant",parentProductKey:"gabley",sourceStrategy:"omniqora_native",migrationStage:"inventoried",registerInFactory:true,needsReview:false},

  voxentri:{architectureRole:"shared_engine",sourceStrategy:"separate_repo",migrationStage:"repo_audit",registerInFactory:false,needsReview:false},
  "zoryn-rewards":{architectureRole:"shared_engine",sourceStrategy:"separate_repo",migrationStage:"repo_audit",registerInFactory:false,needsReview:false},
  dokuvera:{architectureRole:"shared_engine",sourceStrategy:"separate_repo",migrationStage:"repo_audit",registerInFactory:false,needsReview:false},
  leadlens:{architectureRole:"shared_module",parentProductKey:"omniqora",sourceStrategy:"shared_module",migrationStage:"repo_audit",registerInFactory:false,needsReview:false},
  "omniqora-ai":{architectureRole:"shared_module",parentProductKey:"omniqora",sourceStrategy:"shared_module",migrationStage:"inventoried",registerInFactory:false,needsReview:false},
  empfangiq:{architectureRole:"shared_module",parentProductKey:"omniqora",sourceStrategy:"shared_module",migrationStage:"inventoried",registerInFactory:false,needsReview:false},
  "promo-studio":{architectureRole:"shared_module",parentProductKey:"voxentri",sourceStrategy:"shared_module",migrationStage:"inventoried",registerInFactory:false,needsReview:false},
  "accounts-ai":{architectureRole:"shared_module",parentProductKey:"iq-practice-cloud",sourceStrategy:"shared_module",migrationStage:"inventoried",registerInFactory:false,needsReview:false},
  epos:{architectureRole:"shared_module",parentProductKey:"dishbee",sourceStrategy:"shared_module",migrationStage:"repo_audit",registerInFactory:false,needsReview:false},
  capacitor:{architectureRole:"shared_module",parentProductKey:"omniqora",sourceStrategy:"shared_module",migrationStage:"repo_audit",registerInFactory:false,needsReview:false},
  "visa-sponsor":{architectureRole:"shared_module",parentProductKey:"xpertjobs",sourceStrategy:"shared_module",migrationStage:"inventoried",registerInFactory:false,needsReview:false},
  "virtual-lab":{architectureRole:"shared_module",parentProductKey:"unipathway",sourceStrategy:"shared_module",migrationStage:"repo_audit",registerInFactory:false,needsReview:false},

  bondedos:{architectureRole:"landlord",sourceStrategy:"omniqora_native",migrationStage:"inventoried",registerInFactory:true,needsReview:true},
  clinoveya:{architectureRole:"landlord",sourceStrategy:"omniqora_native",migrationStage:"inventoried",registerInFactory:true,needsReview:true},
  sofellea:{architectureRole:"tenant",parentProductKey:"merqano",sourceStrategy:"tenant_configuration",migrationStage:"inventoried",registerInFactory:false,needsReview:true},
  "auvane-one":{architectureRole:"landlord",sourceStrategy:"omniqora_native",migrationStage:"inventoried",registerInFactory:true,needsReview:false},
  "oddsentia-fx":{architectureRole:"landlord",sourceStrategy:"omniqora_native",migrationStage:"inventoried",registerInFactory:true,needsReview:true},
  "finmatch-ai":{architectureRole:"landlord",sourceStrategy:"omniqora_native",migrationStage:"inventoried",registerInFactory:true,needsReview:true},
  athlyvo:{architectureRole:"landlord",sourceStrategy:"omniqora_native",migrationStage:"inventoried",registerInFactory:true,needsReview:true},
  "oddsentia-sports":{architectureRole:"landlord",sourceStrategy:"omniqora_native",migrationStage:"inventoried",registerInFactory:true,needsReview:true},
  apnepaas:{architectureRole:"landlord",sourceStrategy:"separate_repo",migrationStage:"repo_audit",registerInFactory:true,needsReview:false}
};

const sourceRows=[...(catalogue as any[]),...EXTRA_PRODUCTS];
const grouped=new Map<string,any[]>();
for(const row of sourceRows){
  const raw=String(row.product);
  const product=CANONICAL_KEY_ALIASES[raw]??raw;
  const list=grouped.get(product)??[];list.push({...row,sourceProductKey:raw,product});grouped.set(product,list);
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
  const override=ARCHITECTURE_OVERRIDES[productKey]??{};
  const sourceRepositories=[...new Set(rows.map((row)=>row.repository).filter(Boolean).map(String))];
  const preferredRepository=
    productKey==="orvilo"?"asaffilate01-ship-it/webtemplates":
    productKey==="kindelo"?"asaffilate01-ship-it/kinderstars-childcare-saas":
    override.repository??rows.find((row)=>String(row.status??"").includes("canonical"))?.repository??
    rows.find((row)=>String(row.status??"").includes("implemented"))?.repository??
    rows.find((row)=>row.repository)?.repository??null;
  return{
    productKey,
    name:NAME_OVERRIDES[productKey]??first.name??productKey,
    profile,
    modules:[...PORTFOLIO_PROFILE_MODULES[profile]],
    regions,
    locales,
    repository:preferredRepository,
    connectorStatus:rows.find((row)=>row.status!=="source-adapter-required")?.status??first.status??"source-adapter-required",
    boundary:override.boundary??rows.find((row)=>row.boundary)?.boundary??defaultBoundary(productKey),
    sourceNames:[...new Set(rows.map((row)=>String(row.name)))],
    sourceRepositories,
    architectureRole:override.architectureRole??"review_required",
    parentProductKey:override.parentProductKey??null,
    sourceStrategy:override.sourceStrategy??(sourceRepositories.length?"separate_repo":"omniqora_native"),
    migrationStage:override.migrationStage??"inventoried",
    registerInFactory:override.registerInFactory??true,
    needsReview:override.needsReview??true,
  };
}).sort((a,b)=>a.name.localeCompare(b.name));

export function portfolioProduct(productKey:string){
  return OMNIQORA_PORTFOLIO.find((item)=>item.productKey===productKey)??null;
}
