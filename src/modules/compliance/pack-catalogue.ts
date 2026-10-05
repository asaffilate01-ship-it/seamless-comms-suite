export type CompliancePackCatalogueEntry = {
  key: string;
  name: string;
  authority: string;
  jurisdiction: string;
  kind: "regulatory_application" | "ongoing_compliance" | "certification" | "procurement";
  status: "available" | "source_review_required" | "planned";
  description: string;
};

/** Pack workflow registrations only. Requirement content is loaded from versioned, reviewed source-backed pack data. */
export const COMPLIANCE_PACK_CATALOGUE: CompliancePackCatalogueEntry[] = [
  { key:"aramco-ccc-plus",name:"Aramco CCC+ readiness",authority:"Saudi Aramco",jurisdiction:"SA",kind:"certification",status:"available",description:"Existing source-backed supplier cybersecurity readiness pack." },
  { key:"fca-authorisation",name:"FCA Authorisation",authority:"Financial Conduct Authority",jurisdiction:"GB",kind:"regulatory_application",status:"source_review_required",description:"Application preparation and evidence workflow; requirements must be versioned from current official sources before activation." },
  { key:"fca-ongoing",name:"FCA Ongoing Compliance",authority:"Financial Conduct Authority",jurisdiction:"GB",kind:"ongoing_compliance",status:"source_review_required",description:"Ongoing obligations and monitoring shell pending current-source pack review." },
  { key:"cqc-registration",name:"CQC Registration",authority:"Care Quality Commission",jurisdiction:"GB",kind:"regulatory_application",status:"source_review_required",description:"Provider/location/service registration workflow shell pending current-source pack review." },
  { key:"cqc-ongoing",name:"CQC Ongoing Assurance",authority:"Care Quality Commission",jurisdiction:"GB",kind:"ongoing_compliance",status:"source_review_required",description:"Evidence, inspection-readiness and ongoing monitoring shell pending current-source pack review." },
  { key:"ofsted-registration",name:"Ofsted Registration",authority:"Ofsted",jurisdiction:"GB",kind:"regulatory_application",status:"source_review_required",description:"Registration workflow shell pending current-source pack review." },
  { key:"ofsted-ongoing",name:"Ofsted Ongoing Readiness",authority:"Ofsted",jurisdiction:"GB",kind:"ongoing_compliance",status:"source_review_required",description:"Inspection-readiness and evidence monitoring shell pending current-source pack review." },
];