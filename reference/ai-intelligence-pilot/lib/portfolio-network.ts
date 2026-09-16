import { portfolioProducts } from "./portfolio-products";

export const networkVersion = "2026-09-15.1";
export const placements = [
  "dashboard",
  "billing",
  "people",
  "purchasing",
  "assets",
  "sales",
  "documents",
  "completed",
  "renewal",
] as const;
export type Placement = (typeof placements)[number];
export type Audience = "business" | "consumer";
export type Offer = {
  id: string;
  name: string;
  category: string;
  description: string;
  descriptionDe: string;
  placements: readonly Placement[];
  countries?: string[];
  audiences: Audience[];
  url?: string;
  stage: "Explore provider" | "Enquiry only" | "Pilot";
  insuranceTypes?: string[];
};
const allBusiness: readonly Placement[] = ["dashboard", "billing", "completed"];
export const portfolioOffers: Offer[] = [
  {
    id: "taxnuvia",
    name: "TaxNuvia · Find an accountant",
    category: "Finance",
    description:
      "Prepare a brief for bookkeeping, payroll, VAT or annual accounts and find an accountant.",
    descriptionDe:
      "Buchhaltung und Steuerberatung für Ihr britisches Unternehmen anfragen.",
    placements: [...allBusiness, "renewal"],
    countries: ["GB"],
    audiences: ["business"],
    url: "https://taxnuvia.co.uk",
    stage: "Explore provider",
  },
  {
    id: "insure360",
    name: "Insure360",
    category: "Insurance",
    description:
      "Prepare a business insurance enquiry around your activities, premises, equipment and renewal date.",
    descriptionDe: "Eine Anfrage zu betrieblichen Versicherungen vorbereiten.",
    placements: [...allBusiness, "assets", "people", "renewal", "documents"],
    countries: ["GB"],
    audiences: ["business"],
    stage: "Enquiry only",
    insuranceTypes: [
      "Public liability",
      "Employers’ liability",
      "Professional indemnity",
      "Cyber",
      "Property and contents",
    ],
  },
  {
    id: "veyumo",
    name: "Veyumo",
    category: "Connectivity",
    description:
      "Explore mobile connectivity for your team, business devices or personal use.",
    descriptionDe:
      "Mobilfunk für Ihr Team, geschäftliche Geräte oder privat entdecken.",
    placements: [...allBusiness, "people", "assets", "renewal"],
    audiences: ["business", "consumer"],
    stage: "Pilot",
  },
  {
    id: "omniqora-intelligence",
    name: "Omniqora AI & Intelligence",
    category: "Intelligence",
    description:
      "Explore sales analysis, document review and approval-based assistants for your workflows.",
    descriptionDe:
      "Umsatzanalysen, Dokumentenprüfung und Assistenz mit Freigaben erkunden.",
    placements: [...allBusiness, "sales", "documents", "purchasing"],
    audiences: ["business"],
    stage: "Pilot",
  },
  {
    id: "xpertjobs",
    name: "XpertJobs",
    category: "People",
    description:
      "Explore recruitment tools for your next hire and manage employer enquiries.",
    descriptionDe:
      "Recruiting und Arbeitgeberanfragen für Ihre nächste Einstellung organisieren.",
    placements: ["dashboard", "people", "completed"],
    audiences: ["business"],
    url: "https://xpertjobs.lovable.app",
    stage: "Explore provider",
  },
  {
    id: "suppliers",
    name: "Suppliers & Zarvane Foods",
    category: "Supplies",
    description:
      "Prepare a sourcing brief for ingredients, packaging, equipment or business supplies.",
    descriptionDe:
      "Eine Anfrage für Zutaten, Verpackung, Ausstattung oder Betriebsbedarf vorbereiten.",
    placements: ["dashboard", "purchasing", "assets", "completed"],
    audiences: ["business"],
    stage: "Enquiry only",
  },
  {
    id: "haccora",
    name: "Haccora",
    category: "Operations",
    description:
      "Explore food safety routines, temperature records, staff training and inspection evidence.",
    descriptionDe:
      "Lebensmittelsicherheit, Temperaturprotokolle und Schulungsnachweise organisieren.",
    placements: ["dashboard", "documents", "people", "completed"],
    countries: ["GB"],
    audiences: ["business"],
    url: "https://haccora.co.uk",
    stage: "Explore provider",
  },
  {
    id: "craftvaro",
    name: "Craftvaro",
    category: "Property",
    description:
      "Explore trade services, maintenance jobs and project coordination.",
    descriptionDe:
      "Handwerksleistungen, Wartungsaufträge und Bauprojekte koordinieren.",
    placements: ["dashboard", "assets", "purchasing", "completed"],
    countries: ["GB"],
    audiences: ["business", "consumer"],
    url: "https://jobflow-tradehub.lovable.app",
    stage: "Explore provider",
  },
  {
    id: "eventplanr",
    name: "EventPlanr",
    category: "Events",
    description:
      "Prepare an event brief and explore venues, catering and supplier coordination.",
    descriptionDe:
      "Veranstaltungen, Locations, Catering und Dienstleister planen.",
    placements: ["dashboard", "sales", "completed"],
    audiences: ["business", "consumer"],
    stage: "Enquiry only",
  },
  {
    id: "dishbee",
    name: "Dishbee",
    category: "Commerce",
    description: "Explore EPOS, online ordering and restaurant operations.",
    descriptionDe:
      "Kassensysteme, Onlinebestellungen und Restaurantabläufe erkunden.",
    placements: ["dashboard", "sales", "purchasing", "completed"],
    audiences: ["business"],
    stage: "Enquiry only",
  },
  {
    id: "omniqora",
    name: "Omniqora",
    category: "Communications",
    description:
      "Explore a shared customer inbox, support cases and follow-up workflows.",
    descriptionDe:
      "Kundengespräche, Supportfälle und Nachfassprozesse gemeinsam bearbeiten.",
    placements: ["dashboard", "sales", "people", "completed"],
    audiences: ["business"],
    url: "https://omniqora.itechlounge.co.uk",
    stage: "Explore provider",
  },
  {
    id: "zoryn-pay",
    name: "Zoryn Pay",
    category: "Payments",
    description:
      "Explore payment onboarding and reconciliation for your business.",
    descriptionDe:
      "Zahlungsabwicklung und Abstimmung für Ihr Unternehmen erkunden.",
    placements: [...allBusiness, "sales"],
    audiences: ["business"],
    stage: "Enquiry only",
  },
  {
    id: "zoryn-rewards",
    name: "Zoryn Rewards",
    category: "Retention",
    description:
      "Explore a loyalty programme to encourage repeat customer visits.",
    descriptionDe:
      "Kunden mit einem Treueprogramm zu weiteren Besuchen einladen.",
    placements: ["dashboard", "sales", "completed"],
    audiences: ["business"],
    stage: "Enquiry only",
  },
  {
    id: "traindirekt",
    name: "TrainDirekt",
    category: "Learning",
    description:
      "Prepare a training brief for staff development, attendance and evidence.",
    descriptionDe:
      "Weiterbildung, Teilnahme und Schulungsnachweise für Ihr Team planen.",
    placements: ["dashboard", "people", "documents", "completed"],
    audiences: ["business"],
    stage: "Enquiry only",
  },
  {
    id: "orvilo",
    name: "Orvilo",
    category: "Websites",
    description: "Explore a website or booking page for your business.",
    descriptionDe:
      "Eine Website oder Buchungsseite für Ihr Unternehmen erkunden.",
    placements: ["dashboard", "sales", "completed"],
    audiences: ["business"],
    stage: "Enquiry only",
  },
  {
    id: "voxentri",
    name: "Voxentri",
    category: "Marketing",
    description:
      "Prepare multilingual campaign content for your products and services.",
    descriptionDe:
      "Mehrsprachige Werbeinhalte für Ihre Produkte und Leistungen vorbereiten.",
    placements: ["dashboard", "sales", "completed"],
    audiences: ["business"],
    stage: "Enquiry only",
  },
  {
    id: "dokuvera",
    name: "Dokuvera",
    category: "Documents",
    description:
      "Explore controlled documents, revisions and project evidence packs.",
    descriptionDe:
      "Dokumente, Versionen und Projektnachweise strukturiert verwalten.",
    placements: ["dashboard", "documents", "assets", "completed"],
    audiences: ["business"],
    stage: "Enquiry only",
  },
  {
    id: "cirqiva",
    name: "Cirqiva",
    category: "Waste",
    description:
      "Prepare a waste collection brief and compare collection requirements.",
    descriptionDe: "Abfallentsorgung und Anforderungen an die Abholung planen.",
    placements: ["dashboard", "purchasing", "assets", "completed"],
    audiences: ["business"],
    stage: "Enquiry only",
  },
  {
    id: "leadlens",
    name: "LeadLens",
    category: "Growth",
    description: "Explore business opportunity discovery and qualification.",
    descriptionDe: "Geschäftschancen entdecken und qualifizieren.",
    placements: ["dashboard", "sales", "completed"],
    audiences: ["business"],
    stage: "Enquiry only",
  },
  {
    id: "regulos",
    name: "RegulaOS",
    category: "Governance",
    description:
      "Explore regulatory change monitoring and assigned review tasks.",
    descriptionDe:
      "Regulatorische Änderungen verfolgen und Prüfaufgaben zuweisen.",
    placements: ["dashboard", "documents", "renewal", "completed"],
    audiences: ["business"],
    stage: "Pilot",
  },
  {
    id: "fleetsora",
    name: "Fleetsora",
    category: "Fleet",
    description:
      "Explore fleet records, rider coordination and vehicle operations.",
    descriptionDe: "Fuhrpark, Fahrer und Fahrzeugabläufe koordinieren.",
    placements: ["dashboard", "assets", "people", "completed"],
    audiences: ["business"],
    stage: "Enquiry only",
  },
];

const sectorOffers: Record<string, string[]> = {
  "Food & hospitality": [
    "suppliers",
    "insure360",
    "taxnuvia",
    "dishbee",
    "haccora",
    "xpertjobs",
    "zoryn-rewards",
    "eventplanr",
    "cirqiva",
  ],
  "Property & construction": [
    "insure360",
    "taxnuvia",
    "dokuvera",
    "craftvaro",
    "suppliers",
    "cirqiva",
    "xpertjobs",
    "veyumo",
  ],
  Communications: [
    "omniqora-intelligence",
    "veyumo",
    "taxnuvia",
    "insure360",
    "xpertjobs",
    "orvilo",
  ],
  "Professional services": [
    "omniqora-intelligence",
    "insure360",
    "omniqora",
    "taxnuvia",
    "xpertjobs",
    "leadlens",
    "regulos",
  ],
  Marketplaces: [
    "insure360",
    "taxnuvia",
    "zoryn-pay",
    "omniqora",
    "xpertjobs",
    "zoryn-rewards",
    "veyumo",
  ],
  "Family & care": [
    "taxnuvia",
    "insure360",
    "traindirekt",
    "xpertjobs",
    "omniqora",
    "veyumo",
  ],
  Commerce: [
    "suppliers",
    "taxnuvia",
    "zoryn-rewards",
    "zoryn-pay",
    "insure360",
    "voxentri",
    "omniqora-intelligence",
  ],
  "Education & careers": [
    "taxnuvia",
    "insure360",
    "veyumo",
    "traindirekt",
    "omniqora",
    "orvilo",
  ],
  "Creative & websites": [
    "voxentri",
    "orvilo",
    "taxnuvia",
    "insure360",
    "leadlens",
    "omniqora-intelligence",
  ],
  "Payments & rewards": [
    "taxnuvia",
    "insure360",
    "omniqora-intelligence",
    "zoryn-rewards",
    "zoryn-pay",
    "omniqora",
  ],
  "Transport & logistics": [
    "insure360",
    "fleetsora",
    "veyumo",
    "taxnuvia",
    "xpertjobs",
    "omniqora-intelligence",
  ],
};
const relationships: Record<string, string[]> = {
  haccora: [
    "taxnuvia",
    "insure360",
    "suppliers",
    "omniqora-intelligence",
    "dishbee",
    "xpertjobs",
    "veyumo",
  ],
  dishbee: ["haccora", "suppliers", "zoryn-rewards", "taxnuvia", "insure360"],
  taxnuvia: [
    "omniqora-intelligence",
    "insure360",
    "xpertjobs",
    "omniqora",
    "veyumo",
    "regulos",
  ],
  craftvaro: [
    "insure360",
    "taxnuvia",
    "suppliers",
    "dokuvera",
    "cirqiva",
    "veyumo",
    "xpertjobs",
  ],
  eventplanr: [
    "insure360",
    "suppliers",
    "taxnuvia",
    "haccora",
    "xpertjobs",
    "veyumo",
    "zoryn-pay",
  ],
  kinderstars: ["taxnuvia", "insure360", "traindirekt", "veyumo", "orvilo"],
  lessonahead: ["insure360", "veyumo", "taxnuvia", "orvilo", "omniqora"],
  xpertjobs: [
    "veyumo",
    "taxnuvia",
    "insure360",
    "traindirekt",
    "omniqora-intelligence",
  ],
  insure360: [
    "taxnuvia",
    "omniqora",
    "omniqora-intelligence",
    "veyumo",
    "xpertjobs",
    "regulos",
  ],
  veyumo: [
    "insure360",
    "omniqora",
    "taxnuvia",
    "omniqora-intelligence",
    "zoryn-rewards",
  ],
  "zoryn-pay": [
    "taxnuvia",
    "zoryn-rewards",
    "insure360",
    "omniqora-intelligence",
  ],
  "zoryn-rewards": [
    "zoryn-pay",
    "omniqora-intelligence",
    "voxentri",
    "taxnuvia",
    "insure360",
  ],
  premisora: ["dokuvera", "insure360", "craftvaro", "taxnuvia", "cirqiva"],
  cirqiva: ["insure360", "fleetsora", "taxnuvia", "veyumo", "dokuvera"],
  ahlnikkah: ["eventplanr", "veyumo"],
  "all-road-aid": ["insure360", "fleetsora", "veyumo", "taxnuvia"],
};
const intent: Record<Placement, string[]> = {
  dashboard: [],
  billing: ["taxnuvia", "insure360", "zoryn-pay", "veyumo"],
  people: ["xpertjobs", "traindirekt", "veyumo"],
  purchasing: ["suppliers", "cirqiva", "dishbee"],
  assets: ["insure360", "craftvaro", "dokuvera", "fleetsora", "veyumo"],
  sales: [
    "omniqora-intelligence",
    "zoryn-rewards",
    "voxentri",
    "leadlens",
    "omniqora",
    "eventplanr",
    "orvilo",
  ],
  documents: [
    "dokuvera",
    "regulos",
    "insure360",
    "omniqora-intelligence",
    "haccora",
  ],
  completed: [],
  renewal: ["insure360", "veyumo", "taxnuvia"],
};
export type RecommendationContext = {
  source: string;
  country: string;
  audience: Audience;
  placement: Placement;
  owned?: string[];
  dismissed?: string[];
  limit?: number;
};
export type Recommendation = Offer & {
  score: number;
  reason: string;
  reasonDe: string;
};
export function recommendations(
  context: RecommendationContext,
): Recommendation[] {
  const source = portfolioProducts.find((p) => p.slug === context.source);
  if (
    !source ||
    source.scope !== "confirmed" ||
    !placements.includes(context.placement) ||
    !/^[A-Z]{2}$/.test(context.country) ||
    !["business", "consumer"].includes(context.audience)
  )
    return [];
  const direct = relationships[source.slug] || [];
  const sector = sectorOffers[source.sector] || [];
  // Consumer suggestions use explicit product relationships only. No profile, health or financial inference.
  const candidates =
    context.audience === "consumer"
      ? direct
      : [
          ...new Set([
            ...direct,
            ...sector,
            "omniqora-intelligence",
            "veyumo",
            "orvilo",
          ]),
        ];
  const blocked = new Set([
    context.source,
    ...(context.source === "zarvane" ? ["suppliers"] : []),
    ...(context.owned || []),
    ...(context.dismissed || []),
  ]);
  const ranked = portfolioOffers
    .filter(
      (o) =>
        candidates.includes(o.id) &&
        !blocked.has(o.id) &&
        o.audiences.includes(context.audience) &&
        o.placements.includes(context.placement) &&
        (!o.countries || o.countries.includes(context.country)),
    )
    .map((o) => {
      const priority = intent[context.placement].indexOf(o.id),
        specific = direct.indexOf(o.id),
        sectorIndex = sector.indexOf(o.id);
      const score =
        (priority < 0 ? 0 : 100 - priority * 4) +
        (specific < 0 ? 0 : 70 - specific * 3) +
        (sectorIndex < 0 ? 0 : 25 - sectorIndex);
      return {
        ...o,
        ...(o.id === "insure360"
          ? { insuranceTypes: insuranceTopics(source.slug, source.sector) }
          : {}),
        score,
        reason:
          priority >= 0
            ? `Relevant to your ${context.placement} workflow.`
            : `A complementary service for ${source.name} businesses.`,
        reasonDe:
          priority >= 0
            ? "Passend zu diesem Arbeitsbereich."
            : `Eine ergänzende Leistung für Unternehmen bei ${source.name}.`,
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const rawLimit = context.limit ?? 3;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(12, Math.max(0, Math.floor(rawLimit)))
    : 3;
  const categories = new Set<string>();
  return ranked
    .filter((o) => {
      if (categories.has(o.category)) return false;
      categories.add(o.category);
      return true;
    })
    .slice(0, limit);
}
export function insuranceTopics(source: string, sector: string): string[] {
  if (source === "amityos")
    return ["Care provider liability", "Employers’ liability", "Professional indemnity", "Business equipment"];
  if (source === "zivvo")
    return ["Motor trade enquiry", "Stock and premises", "Public liability", "Employers’ liability"];
  if (source === "lessonahead")
    return [
      "Driving instructor vehicle cover",
      "Professional indemnity",
      "Public liability",
      "Business equipment",
    ];
  if (source === "kinderstars")
    return [
      "Childminder or nursery liability",
      "Professional indemnity",
      "Employers’ liability",
      "Business contents",
    ];
  if (source === "eventplanr")
    return [
      "Event liability",
      "Cancellation enquiry",
      "Hired equipment",
      "Employers’ liability",
    ];
  if (sector === "Food & hospitality")
    return [
      "Public and product liability",
      "Employers’ liability",
      "Equipment and stock",
      "Business interruption",
    ];
  if (sector === "Property & construction")
    return [
      "Trades public liability",
      "Contract works",
      "Tools and plant",
      "Professional indemnity",
      "Property owners",
    ];
  if (sector === "Transport & logistics")
    return [
      "Commercial motor or fleet",
      "Hire and reward enquiry",
      "Goods in transit",
      "Public liability",
    ];
  if (sector === "Professional services" || sector === "Creative & websites")
    return [
      "Professional indemnity",
      "Cyber",
      "Office contents",
      "Employers’ liability",
    ];
  return [
    "Public liability",
    "Employers’ liability",
    "Cyber",
    "Property and contents",
  ];
}
export function offerDestination(
  offer: Offer,
  source: string,
  placement: Placement,
): string | null {
  if (
    !portfolioProducts.some(
      (p) => p.slug === source && p.scope === "confirmed",
    ) ||
    !placements.includes(placement) ||
    !offer.url
  )
    return null;
  // Resolve from the shipped catalogue; caller-supplied URLs are never accepted.
  const approved = portfolioOffers.find((o) => o.id === offer.id);
  if (!approved?.url || approved.stage !== "Explore provider") return null;
  const url = new URL(approved.url);
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const accountantReferralSources = [
    "haccora",
    "kinderstars",
    "lessonahead",
    "craftvaro",
    "eventplanr",
    "xpertjobs",
    "omniqora",
    "veyumo",
    "insure360",
    "zoryn-pay",
    "zoryn-rewards",
  ];
  if (offer.id === "taxnuvia" && accountantReferralSources.includes(source))
    url.pathname = "/from/" + source;
  url.searchParams.set("utm_source", source);
  url.searchParams.set("utm_medium", "portfolio");
  url.searchParams.set("utm_campaign", placement);
  return url.toString();
}
