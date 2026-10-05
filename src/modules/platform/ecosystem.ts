export type EcosystemConnectorRequirement={
  key:string;
  required:boolean;
  purpose:string;
};

export type EcosystemProductWiring={
  productKey:string;
  verticalOwns:string[];
  omniqoraOwns:string[];
  requiredConnectors:EcosystemConnectorRequirement[];
  optionalConnectors:EcosystemConnectorRequirement[];
  publishes:string[];
  consumes:string[];
};

const shared=[
  "tenant/identity/RBAC/RLS",
  "CRM/Customer 360",
  "Connector Hub",
  "Comms Hub",
  "events/webhooks/audit",
  "analytics/AI/automation",
] as const;

export const ECOSYSTEM_WIRING:EcosystemProductWiring[]=[
  {
    productKey:"dishbee",
    verticalOwns:["restaurants","menus","recipes","tables","KDS","EPOS transactional source","kitchen operations","restaurant marketplace adapters"],
    omniqoraOwns:[...shared,"optional AI receptionist","growth/feedback","customer intelligence"],
    requiredConnectors:[],
    optionalConnectors:[
      {key:"communications.meta-whatsapp",required:false,purpose:"WhatsApp ordering/support"},
      {key:"communications.twilio",required:false,purpose:"phone/SMS assisted ordering"},
      {key:"payments.adyen",required:false,purpose:"online/split payments"},
      {key:"payments.sumup",required:false,purpose:"POS/payment links"},
    ],
    publishes:["dishbee.order.created","dishbee.order.updated","dishbee.customer.updated","dishbee.menu.updated"],
    consumes:["crm.customer.updated","connect.message.received","ordering.intent.created","feedback.requested"],
  },
  {
    productKey:"mealdeck",
    verticalOwns:["consumer storefront","brand aggregation","single-cart multi-brand ordering","brand/KDS routing","completion gate"],
    omniqoraOwns:[...shared,"ordering orchestration","payments/splits","loyalty","delivery orchestration","customer tracking"],
    requiredConnectors:[{key:"payments.adyen",required:true,purpose:"split payments across participating companies"}],
    optionalConnectors:[
      {key:"delivery.uber-direct",required:false,purpose:"last-mile delivery"},
      {key:"delivery.deliveroo-express",required:false,purpose:"last-mile delivery"},
      {key:"delivery.just-eat-go",required:false,purpose:"last-mile delivery"},
      {key:"delivery.stuart",required:false,purpose:"last-mile delivery"},
      {key:"communications.meta-whatsapp",required:false,purpose:"WhatsApp ordering"},
    ],
    publishes:["mealdeck.order.created","mealdeck.order.brand_status_changed","mealdeck.order.ready"],
    consumes:["dispatch.job.updated","payments.intent.captured","loyalty.account.updated"],
  },
  {
    productKey:"kindelo",
    verticalOwns:["children","guardians","childcare placements","attendance","funding","training","country childcare rules","agency workflows"],
    omniqoraOwns:[...shared,"marketplace","bookings","payments","documents/forms","geo/provider search","support","mobile"],
    requiredConnectors:[],
    optionalConnectors:[{key:"payments.adyen",required:false,purpose:"parent/provider payments"}],
    publishes:["childcare.provider.updated","childcare.placement.updated","childcare.attendance.recorded","childcare.funding.updated"],
    consumes:["marketplace.order.updated","booking.updated","payments.intent.captured","feedback.received"],
  },
  {
    productKey:"formationgenie",
    verticalOwns:["company formation workflow","company-secretarial records","PSC/director verification workflow","statutory filing rules"],
    omniqoraOwns:[...shared,"practice operations","documents/e-sign","forms","payments","notifications","compliance intelligence"],
    requiredConnectors:[{key:"registry.companies-house",required:true,purpose:"company lookup, filing status and submissions"}],
    optionalConnectors:[{key:"esign.provider",required:false,purpose:"signature requests"}],
    publishes:["formation.company.created","formation.filing.due","formation.filing.completed"],
    consumes:["registry.company.updated","documents.signature.completed","payments.intent.captured"],
  },
  {
    productKey:"iq-practice-cloud",
    verticalOwns:["UK accounting/tax statutory workflow","accounts production","payroll/tax filing domain logic"],
    omniqoraOwns:[...shared,"practice operations","AI bookkeeping/accounts prep","Tax Intelligence","documents","payments","client portal"],
    requiredConnectors:[],
    optionalConnectors:[
      {key:"tax.hmrc",required:false,purpose:"HMRC obligations/submissions"},
      {key:"banking.open-banking",required:false,purpose:"bank feeds"},
      {key:"accounting.xero",required:false,purpose:"accounting import/export"},
      {key:"accounting.quickbooks",required:false,purpose:"accounting import/export"},
      {key:"accounting.sage",required:false,purpose:"accounting import/export"},
    ],
    publishes:["practice.client.updated","accounting.document.ingested","accounts.review.required"],
    consumes:["tax.authority.updated","documents.uploaded","payments.intent.captured"],
  },
  {
    productKey:"taxcenda",
    verticalOwns:["US tax practice workflow","US return preparation/filing domain logic"],
    omniqoraOwns:[...shared,"practice operations","AI bookkeeping/accounts prep","Tax Intelligence","documents","payments","client portal"],
    requiredConnectors:[],
    optionalConnectors:[
      {key:"tax.us-efile",required:false,purpose:"US e-file submission"},
      {key:"tax.irs-authority",required:false,purpose:"IRS authority research"},
      {key:"tax.us-tax-court",required:false,purpose:"US Tax Court research"},
    ],
    publishes:["practice.client.updated","tax.return.review_required","tax.filing.updated"],
    consumes:["tax.authority.updated","documents.uploaded","payments.intent.captured"],
  },
  {
    productKey:"fastremit",
    verticalOwns:["remittance quotes/transfers","recipient rails","KYC/AML case workflow","corridor rules","FX presentation"],
    omniqoraOwns:[...shared,"payments orchestration","documents/forms","notifications","support","compliance/AI","analytics"],
    requiredConnectors:[
      {key:"banking.clearbank",required:true,purpose:"UK banking/payment rail"},
      {key:"remittance.thunes",required:true,purpose:"cross-border payout rail"},
    ],
    optionalConnectors:[],
    publishes:["remittance.quote.created","remittance.transfer.created","remittance.transfer.updated"],
    consumes:["payments.provider_event","compliance.case.updated","notifications.delivery.updated"],
  },
  {
    productKey:"courier-connect-hub",
    verticalOwns:["carrier sourcing rules","quote normalization","carrier-specific operational workflow"],
    omniqoraOwns:[...shared,"geo","dispatch/fleet","universal Agent","customer tracking","payments","support"],
    requiredConnectors:[],
    optionalConnectors:[
      {key:"delivery.gophr",required:false,purpose:"courier jobs/quotes"},
      {key:"delivery.stuart",required:false,purpose:"courier jobs/quotes"},
      {key:"delivery.lalamove",required:false,purpose:"courier jobs/quotes"},
      {key:"delivery.shiply",required:false,purpose:"transport marketplace"},
      {key:"delivery.anyvan",required:false,purpose:"transport marketplace"},
      {key:"delivery.uship",required:false,purpose:"transport marketplace"},
      {key:"delivery.cx",required:false,purpose:"carrier exchange"},
    ],
    publishes:["courier.quote.updated","courier.job.created","courier.job.updated"],
    consumes:["dispatch.job.updated","geo.route.calculated","payments.intent.captured"],
  },
  {
    productKey:"all-road-aid",
    verticalOwns:["breakdown/recovery case","vehicle incident details","recovery/garage workflow"],
    omniqoraOwns:[...shared,"geo","dispatch/fleet","universal Agent","marketplace","payments","customer tracking","support"],
    requiredConnectors:[],
    optionalConnectors:[],
    publishes:["recovery.case.created","recovery.case.updated"],
    consumes:["dispatch.job.updated","geo.position.updated","payments.intent.captured"],
  },
  {
    productKey:"sparesgrid",
    verticalOwns:["vehicle/VIN/part fitment","RFQ/supplier workflow","parts catalogue rules","supplier-specific integrations"],
    omniqoraOwns:[...shared,"marketplace","inventory","payments","search","documents","AI matching","analytics"],
    requiredConnectors:[],
    optionalConnectors:[
      {key:"commerce.ebay",required:false,purpose:"parts marketplace"},
      {key:"commerce.amazon",required:false,purpose:"parts marketplace"},
    ],
    publishes:["parts.rfq.created","parts.quote.updated","parts.order.updated"],
    consumes:["marketplace.order.updated","inventory.balance.updated","crm.customer.updated"],
  },
  {
    productKey:"zivvo",
    verticalOwns:["UK vehicle listings","vehicle-specific workflow","dealer/seller rules"],
    omniqoraOwns:[...shared,"marketplace","payments","documents","search","automotive intelligence"],
    requiredConnectors:[],
    optionalConnectors:[{key:"vehicle.uk-data",required:false,purpose:"UK vehicle data"}],
    publishes:["vehicle.listing.created","vehicle.listing.updated"],
    consumes:["marketplace.order.updated","vehicle.intelligence.updated"],
  },
  {
    productKey:"autohashi",
    verticalOwns:["Japanese auction workflow","bidding","landed-cost workflow","import status"],
    omniqoraOwns:[...shared,"marketplace","payments","documents","search","automotive intelligence"],
    requiredConnectors:[],
    optionalConnectors:[{key:"vehicle.jp-auctions",required:false,purpose:"Japanese auction feeds"}],
    publishes:["auction.vehicle.updated","auction.bid.updated","import.shipment.updated"],
    consumes:["vehicle.intelligence.updated","payments.intent.captured"],
  },
  {
    productKey:"haccora",
    verticalOwns:["compliance vertical workflows","inspection/checklist templates","vertical regulatory packs"],
    omniqoraOwns:[...shared,"Compliance engine","documents/evidence","AI knowledge","analytics","notifications"],
    requiredConnectors:[],
    optionalConnectors:[],
    publishes:["compliance.assessment.updated","compliance.evidence.updated"],
    consumes:["regulation.source.updated","documents.uploaded"],
  },
  {
    productKey:"taxnuvia",
    verticalOwns:["accountant directory/profile/referral vertical workflow"],
    omniqoraOwns:[...shared,"marketplace/CRM","sales","bookings","payments","reviews"],
    requiredConnectors:[],
    optionalConnectors:[],
    publishes:["professional.profile.updated","referral.created"],
    consumes:["crm.lead.updated","booking.updated","feedback.received"],
  },
  {
    productKey:"lawquo",
    verticalOwns:["legal triage questions","matter/legal-service taxonomy","legal-provider workflow"],
    omniqoraOwns:[...shared,"marketplace","bookings","payments","documents/forms","support","AI triage governance"],
    requiredConnectors:[],
    optionalConnectors:[],
    publishes:["legal.triage.completed","legal.referral.created"],
    consumes:["marketplace.vendor.updated","booking.updated","payments.intent.captured"],
  },
  {
    productKey:"ahl-nikkah",
    verticalOwns:["marriage profile/matching rules","safety/moderation domain workflow"],
    omniqoraOwns:[...shared,"marketplace","payments","forms/documents","notifications","support","AI assistance"],
    requiredConnectors:[],
    optionalConnectors:[],
    publishes:["match.profile.updated","match.request.updated"],
    consumes:["marketplace.vendor.updated","payments.intent.captured","support.case.updated"],
  },
  {
    productKey:"lessonahead",
    verticalOwns:["driving instructor/learner workflow","lesson domain rules"],
    omniqoraOwns:[...shared,"marketplace","bookings","payments","geo","mobile","notifications","analytics"],
    requiredConnectors:[],
    optionalConnectors:[],
    publishes:["lesson.booking.updated","instructor.availability.updated"],
    consumes:["booking.updated","payments.intent.captured","geo.route.calculated"],
  },
  {
    productKey:"veyumo",
    verticalOwns:["mobile plans/lines","SIM/eSIM activation","telecom product rules","Gigs supplier workflow"],
    omniqoraOwns:[...shared,"payments/billing references","rewards","support","notifications","eligibility/account linking"],
    requiredConnectors:[{key:"telecom.gigs",required:true,purpose:"mobile core supplier"}],
    optionalConnectors:[{key:"payments.adyen",required:false,purpose:"external billing subject to supplier approval"}],
    publishes:["mobile.line.updated","mobile.plan.updated","mobile.usage.updated"],
    consumes:["payments.provider_event","loyalty.account.updated","support.case.updated"],
  },
];

export function ecosystemWiring(productKey:string){
  return ECOSYSTEM_WIRING.find((item)=>item.productKey===productKey)??null;
}
