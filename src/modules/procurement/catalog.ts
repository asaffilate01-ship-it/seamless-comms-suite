import type { Pack } from "./contracts";

// Original readiness prompts, not a reproduction of any complete standard.
export const PACKS: Pack[] = [
  {
    id: "aramco-ccc-plus",
    version: "2026-09-16.1",
    title: "Aramco CCC+ cybersecurity",
    description:
      "Priority pathway for CCC+ preparation, on-site assessment and certificate evidence.",
    caution:
      "Confirm the route with Aramco or an authorised audit firm. This is a preparation checklist, not the complete SACS-210 control register. Add every applicable control before review. Core assessment milestones cannot be excluded. Only an authorised firm issues CCC+.",
    source_checked_on: "2026-09-16",
    requirements: [
      {
        key: "aramco-ccc-plus-01",
        title: "Confirmed CCC+ classification",
        category: "Scope",
        kind: "readiness",
        mandatory: true,
        applies_when:
          "Confirmed CCC+ engagement; technical controls follow the agreed classification and scope.",
        guidance:
          "Obtain written classification and CCC+ route confirmation. Resolve Network Connectivity guidance with the assessor.",
        evidence: "Classification and route confirmation",
        source_url:
          "https://www.aramco.com/en/what-we-do/suppliers/supplier-resources/cybersecurity-compliance-certificate-program",
      },
      {
        key: "aramco-ccc-plus-02",
        title: "Complete scoped control register",
        category: "Scope",
        kind: "readiness",
        mandatory: true,
        applies_when:
          "Confirmed CCC+ engagement; technical controls follow the agreed classification and scope.",
        guidance:
          "Map every applicable SACS-210 control, including all overlapping classifications, into this assessment.",
        evidence: "Assessor-reviewed coverage matrix",
        source_url:
          "https://www.aramco.com/-/media/downloads/working-with-us/ccc/sacs-210-third-party-cybersecurity-standard.pdf",
      },
      {
        key: "aramco-ccc-plus-03",
        title: "Governance and accountable owners",
        category: "Governance",
        kind: "readiness",
        mandatory: true,
        applies_when:
          "Confirmed CCC+ engagement; technical controls follow the agreed classification and scope.",
        guidance: "Assign implementation and evidence owners.",
        evidence: "Approved policies and responsibilities",
        source_url:
          "https://www.aramco.com/-/media/downloads/working-with-us/ccc/sacs-210-third-party-cybersecurity-standard.pdf",
      },
      {
        key: "aramco-ccc-plus-04",
        title: "Asset and data boundary",
        category: "Identify",
        kind: "readiness",
        mandatory: true,
        applies_when:
          "Confirmed CCC+ engagement; technical controls follow the agreed classification and scope.",
        guidance: "Document systems, locations, services and data.",
        evidence: "Current inventories and diagrams",
        source_url:
          "https://www.aramco.com/-/media/downloads/working-with-us/ccc/sacs-210-third-party-cybersecurity-standard.pdf",
      },
      {
        key: "aramco-ccc-plus-05",
        title: "Identity and privileged access",
        category: "Protect",
        kind: "readiness",
        mandatory: true,
        applies_when:
          "Confirmed CCC+ engagement; technical controls follow the agreed classification and scope.",
        guidance: "Gather access, MFA and account-review evidence.",
        evidence: "Configurations and review records",
        source_url:
          "https://www.aramco.com/-/media/downloads/working-with-us/ccc/sacs-210-third-party-cybersecurity-standard.pdf",
      },
      {
        key: "aramco-ccc-plus-06",
        title: "Endpoint, email and network protection",
        category: "Protect",
        kind: "readiness",
        mandatory: true,
        applies_when:
          "Confirmed CCC+ engagement; technical controls follow the agreed classification and scope.",
        guidance: "Evidence the safeguards applicable to your environment.",
        evidence: "Dated technical evidence",
        source_url:
          "https://www.aramco.com/-/media/downloads/working-with-us/ccc/sacs-210-third-party-cybersecurity-standard.pdf",
      },
      {
        key: "aramco-ccc-plus-07",
        title: "Vulnerability and patch handling",
        category: "Protect",
        kind: "readiness",
        mandatory: true,
        applies_when:
          "Confirmed CCC+ engagement; technical controls follow the agreed classification and scope.",
        guidance: "Track findings and remediation.",
        evidence: "Test results and closure records",
        source_url:
          "https://www.aramco.com/-/media/downloads/working-with-us/ccc/sacs-210-third-party-cybersecurity-standard.pdf",
      },
      {
        key: "aramco-ccc-plus-08",
        title: "Data protection and lifecycle",
        category: "Protect",
        kind: "readiness",
        mandatory: true,
        applies_when:
          "Confirmed CCC+ engagement; technical controls follow the agreed classification and scope.",
        guidance: "Evidence handling, encryption and disposal controls.",
        evidence: "Operating records",
        source_url:
          "https://www.aramco.com/-/media/downloads/working-with-us/ccc/sacs-210-third-party-cybersecurity-standard.pdf",
      },
      {
        key: "aramco-ccc-plus-09",
        title: "Monitoring and incident preparedness",
        category: "Detect and respond",
        kind: "readiness",
        mandatory: true,
        applies_when:
          "Confirmed CCC+ engagement; technical controls follow the agreed classification and scope.",
        guidance: "Demonstrate monitoring and incident processes.",
        evidence: "Logs and exercise evidence",
        source_url:
          "https://www.aramco.com/-/media/downloads/working-with-us/ccc/sacs-210-third-party-cybersecurity-standard.pdf",
      },
      {
        key: "aramco-ccc-plus-10",
        title: "Recovery and service continuity",
        category: "Recover",
        kind: "readiness",
        mandatory: true,
        applies_when:
          "Confirmed CCC+ engagement; technical controls follow the agreed classification and scope.",
        guidance: "Demonstrate applicable recovery arrangements.",
        evidence: "Restore and exercise results",
        source_url:
          "https://www.aramco.com/-/media/downloads/working-with-us/ccc/sacs-210-third-party-cybersecurity-standard.pdf",
      },
      {
        key: "aramco-ccc-plus-11",
        title: "Additional classification controls",
        category: "Scope",
        kind: "readiness",
        mandatory: false,
        applies_when:
          "Confirmed CCC+ engagement; technical controls follow the agreed classification and scope.",
        guidance: "Add applicable cloud, software, network, managed-service or OT controls.",
        evidence: "Mapped technical evidence",
        source_url:
          "https://www.aramco.com/-/media/downloads/working-with-us/ccc/sacs-210-third-party-cybersecurity-standard.pdf",
      },
      {
        key: "aramco-ccc-plus-12",
        title: "Authorised audit firm engagement",
        category: "Assessment",
        kind: "readiness",
        mandatory: true,
        applies_when:
          "Confirmed CCC+ engagement; technical controls follow the agreed classification and scope.",
        guidance:
          "Verify the firm against Aramco’s current authorised list and agree the assessment scope.",
        evidence: "Engagement and authorisation check",
        source_url:
          "https://www.aramco.com/en/what-we-do/suppliers/supplier-resources/cybersecurity-compliance-certificate-program",
      },
      {
        key: "aramco-ccc-plus-13",
        title: "On-site assessment preparation",
        category: "Assessment",
        kind: "readiness",
        mandatory: true,
        applies_when:
          "Confirmed CCC+ engagement; technical controls follow the agreed classification and scope.",
        guidance:
          "Arrange site access, staff availability and evidence access with the appointed assessor.",
        evidence: "Agreed on-site assessment plan",
        source_url:
          "https://www.aramco.com/en/what-we-do/suppliers/supplier-resources/cybersecurity-compliance-certificate-program",
      },
      {
        key: "aramco-ccc-plus-14",
        title: "Assessor findings and closure",
        category: "Assessment",
        kind: "readiness",
        mandatory: true,
        applies_when:
          "Confirmed CCC+ engagement; technical controls follow the agreed classification and scope.",
        guidance: "Record the actual findings; obtain assessor confirmation of the outcome.",
        evidence: "Assessor findings and closure record",
        source_url:
          "https://www.aramco.com/en/what-we-do/suppliers/supplier-resources/cybersecurity-compliance-certificate-program",
      },
      {
        key: "aramco-ccc-plus-15",
        title: "Issued CCC+ certificate and report",
        category: "Certification",
        kind: "certification",
        mandatory: true,
        applies_when:
          "Confirmed CCC+ engagement; technical controls follow the agreed classification and scope.",
        guidance:
          "Record the authorised firm’s issued CCC+ and report; preparation never counts as issuance.",
        evidence: "CCC+ certificate, report, scope, issuer and expiry",
        source_url:
          "https://www.aramco.com/en/what-we-do/suppliers/supplier-resources/cybersecurity-compliance-certificate-program",
      },
      {
        key: "aramco-ccc-plus-16",
        title: "Submission and renewal",
        category: "Maintenance",
        kind: "readiness",
        mandatory: true,
        applies_when:
          "Confirmed CCC+ engagement; technical controls follow the agreed classification and scope.",
        guidance: "Record submission and track expiry and scope changes.",
        evidence: "Submission receipt and renewal plan",
        source_url:
          "https://www.aramco.com/en/what-we-do/suppliers/supplier-resources/cybersecurity-compliance-certificate-program",
      },
    ],
  },
  {
    id: "uk-government",
    version: "2026-09-16.1",
    title: "UK government procurement",
    description:
      "Prepare a supplier record and the evidence requested by the specific UK public-sector buyer.",
    caution:
      "Choose the applicable procurement regime, including Scotland and transitional procurements. Registration does not confer universal approval. Tender requirements take precedence.",
    source_checked_on: "2026-09-16",
    requirements: [
      {
        key: "uk-government-01",
        title: "Procurement regime and tender scope",
        category: "Scope",
        kind: "readiness",
        applies_when: "Every target opportunity",
        guidance: "Identify the authority, jurisdiction, procurement date and applicable regime.",
        evidence: "Tender reference and scope decision",
        source_url:
          "https://www.gov.uk/government/publications/procurement-act-2023-guidance-documents-plan-phase/guidance-devolved-contracting-authorities-html",
      },
      {
        key: "uk-government-02",
        title: "Find a Tender supplier record",
        category: "Registration",
        kind: "registration",
        applies_when: "Where the procurement uses the central digital platform",
        guidance: "Prepare the organisation record and confirm the current sharing process.",
        evidence: "Supplier identifier and dated registration confirmation",
        source_url:
          "https://www.gov.uk/government/collections/information-and-guidance-for-suppliers",
      },
      {
        key: "uk-government-03",
        title: "Ownership and exclusion declarations",
        category: "Eligibility",
        kind: "readiness",
        applies_when: "As required by the procurement",
        guidance: "Review connected persons, exclusion questions and supporting records.",
        evidence: "Approved declarations and ownership chart",
        source_url:
          "https://www.gov.uk/government/collections/information-and-guidance-for-suppliers",
      },
      {
        key: "uk-government-04",
        title: "Financial standing and insurance",
        category: "Commercial",
        kind: "readiness",
        applies_when: "According to the tender and contract stage",
        guidance:
          "Record the requested financial evidence and insurance limits; confirm when cover must be held.",
        evidence: "Accounts, financial review and insurance evidence",
        source_url:
          "https://www.gov.uk/government/collections/information-and-guidance-for-suppliers",
      },
      {
        key: "uk-government-05",
        title: "Cyber Essentials scope",
        category: "Security",
        kind: "certification",
        applies_when: "Where the buyer requires Cyber Essentials or Plus",
        guidance:
          "Confirm the current scheme and covered systems. Record an issued certificate only after assessment.",
        evidence: "Certificate, scope and expiry date",
        source_url: "https://www.ncsc.gov.uk/cyberessentials/resources",
      },
      {
        key: "uk-government-06",
        title: "Privacy and information handling",
        category: "Data",
        kind: "readiness",
        applies_when: "Where the service processes protected or personal information",
        guidance: "Map data flows, hosting, retention and the buyer’s contractual protections.",
        evidence: "Data map and approved contractual response",
        source_url:
          "https://www.gov.uk/government/collections/information-and-guidance-for-suppliers",
      },
      {
        key: "uk-government-07",
        title: "Quality, safety and professional competence",
        category: "Delivery",
        kind: "readiness",
        applies_when: "Where specified for the service or goods",
        guidance:
          "List required standards, licences, staff qualifications and relevant experience.",
        evidence: "Scoped certificates, qualifications and references",
        source_url:
          "https://www.gov.uk/government/collections/information-and-guidance-for-suppliers",
      },
      {
        key: "uk-government-08",
        title: "Social value and environmental commitments",
        category: "Sustainability",
        kind: "readiness",
        applies_when: "Where included in the current procurement documents",
        guidance:
          "Confirm current policy applicability, requested measures and reporting obligations.",
        evidence: "Tender-specific commitments and delivery plan",
        source_url:
          "https://www.gov.uk/government/collections/information-and-guidance-for-suppliers",
      },
      {
        key: "uk-government-09",
        title: "Supply-chain and ethical requirements",
        category: "Supply chain",
        kind: "readiness",
        applies_when: "Where required by law or contract",
        guidance:
          "Review subcontractors, anti-bribery and modern-slavery obligations for this engagement.",
        evidence: "Due diligence and policy evidence",
        source_url:
          "https://www.gov.uk/government/collections/information-and-guidance-for-suppliers",
      },
      {
        key: "uk-government-10",
        title: "Tender-specific acceptance",
        category: "Buyer decision",
        kind: "buyer_decision",
        applies_when: "Every bid or framework application",
        guidance: "Record the buyer’s actual decision and its limits separately from preparation.",
        evidence: "Buyer decision notice and reference",
        source_url:
          "https://www.gov.uk/government/collections/information-and-guidance-for-suppliers",
      },
    ],
  },
  {
    id: "saudi-aramco",
    version: "2026-09-16.1",
    title: "Saudi Aramco supplier readiness",
    description:
      "Prepare registration, supplier classification, cybersecurity evidence and assessor handover.",
    caution:
      "Use the registration route for the supplier’s location and the current Aramco classification. The CCC page differs between its table and FAQ for Network Connectivity: confirm CCC/CCC+ with Aramco or an authorised assessor. This pack is not the full SACS-210 control set.",
    source_checked_on: "2026-09-16",
    requirements: [
      {
        key: "saudi-aramco-01",
        title: "Supplier location and registration route",
        category: "Scope",
        kind: "readiness",
        applies_when: "Every supplier",
        guidance: "Confirm the Aramco entity and location-specific onboarding route.",
        evidence: "Documented route and supplier scope",
        source_url: "https://www.aramco.com/en/what-we-do/suppliers/become-a-supplier",
      },
      {
        key: "saudi-aramco-02",
        title: "Entity and statutory records",
        category: "Registration",
        kind: "registration",
        applies_when: "According to the applicable regional registration checklist",
        guidance: "Collect current incorporation, ownership, tax and other requested records.",
        evidence: "Regional checklist and current records",
        source_url: "https://www.aramco.com/en/what-we-do/suppliers/become-a-supplier",
      },
      {
        key: "saudi-aramco-03",
        title: "Authorised contacts and business profile",
        category: "Registration",
        kind: "readiness",
        applies_when: "As requested during onboarding",
        guidance: "Prepare signatory authority, bank relationship and company profile evidence.",
        evidence: "Authorisation and company records",
        source_url: "https://www.aramco.com/en/what-we-do/suppliers/become-a-supplier",
      },
      {
        key: "saudi-aramco-04",
        title: "Supplier code and conduct",
        category: "Governance",
        kind: "readiness",
        applies_when: "As required by the onboarding process",
        guidance: "Arrange acknowledgement and supporting internal responsibilities.",
        evidence: "Code acknowledgement and owner",
        source_url: "https://www.aramco.com/en/what-we-do/suppliers/become-a-supplier",
      },
      {
        key: "saudi-aramco-05",
        title: "Third-party classification confirmation",
        category: "Cybersecurity",
        kind: "readiness",
        applies_when: "Aramco third-party cybersecurity assessment",
        guidance:
          "Obtain the proponent classification and confirm the applicable assessment route.",
        evidence: "Classification template and confirmation letter",
        source_url:
          "https://www.aramco.com/en/what-we-do/suppliers/supplier-resources/cybersecurity-compliance-certificate-program",
      },
      {
        key: "saudi-aramco-06",
        title: "SACS-210 control implementation",
        category: "Cybersecurity",
        kind: "readiness",
        applies_when: "Controls applicable to confirmed classification",
        guidance:
          "Add each applicable current control as a buyer-specific requirement and close evidence gaps.",
        evidence: "Scoped control register and dated evidence",
        source_url:
          "https://www.aramco.com/en/what-we-do/suppliers/supplier-resources/cybersecurity-compliance-certificate-program",
      },
      {
        key: "saudi-aramco-07",
        title: "Authorised assessor and CCC / CCC+",
        category: "Certification",
        kind: "certification",
        applies_when: "According to confirmed classification",
        guidance: "Use an authorised audit firm; record the issued certificate and its scope.",
        evidence: "Issued certificate and compliance report",
        source_url:
          "https://www.aramco.com/en/what-we-do/suppliers/supplier-resources/cybersecurity-compliance-certificate-program",
      },
      {
        key: "saudi-aramco-08",
        title: "Local content and technical qualification",
        category: "Qualification",
        kind: "readiness",
        applies_when: "Where required for the supplier category or contract",
        guidance:
          "Confirm applicable local-content, technical, quality and safety requirements with the buyer.",
        evidence: "Buyer requirements and qualification evidence",
        source_url: "https://www.aramco.com/en/what-we-do/suppliers/become-a-supplier",
      },
      {
        key: "saudi-aramco-09",
        title: "Certificate renewal and scope change",
        category: "Maintenance",
        kind: "readiness",
        applies_when: "After certification and when services change",
        guidance: "Track expiry; obtain assessor advice when the classification changes.",
        evidence: "Renewal plan and scope-change review",
        source_url:
          "https://www.aramco.com/en/what-we-do/suppliers/supplier-resources/cybersecurity-compliance-certificate-program",
      },
      {
        key: "saudi-aramco-10",
        title: "Aramco qualification decision",
        category: "Buyer decision",
        kind: "buyer_decision",
        applies_when: "When registration or qualification is decided",
        guidance:
          "Record the actual decision; registration and qualification do not promise an order.",
        evidence: "Supplier reference and buyer decision",
        source_url: "https://www.aramco.com/en/what-we-do/suppliers/become-a-supplier",
      },
    ],
  },
  {
    id: "us-federal",
    version: "2026-09-16.1",
    title: "US federal procurement",
    description: "Prepare federal supplier registration and a contract-specific compliance matrix.",
    caution:
      "Federal requirements vary by agency, solicitation, data and prime/subcontractor role. Check current FAR/DFARS clauses and deviations. CMMC, FedRAMP and export controls are conditional, not universal badges.",
    source_checked_on: "2026-09-16",
    requirements: [
      {
        key: "us-federal-01",
        title: "Agency, solicitation and supplier role",
        category: "Scope",
        kind: "readiness",
        applies_when: "Every target opportunity",
        guidance: "Identify agency, scope, prime/subcontractor role and incorporated requirements.",
        evidence: "Solicitation and clause register",
        source_url: "https://www.acquisition.gov/browse/index/far",
      },
      {
        key: "us-federal-02",
        title: "SAM registration and Unique Entity ID",
        category: "Registration",
        kind: "registration",
        applies_when: "Where federal award rules require registration",
        guidance: "Confirm active registration, entity validation and renewal obligations.",
        evidence: "Entity registration and identifier",
        source_url: "https://sam.gov/entity-registration",
      },
      {
        key: "us-federal-03",
        title: "Representations and certifications",
        category: "Eligibility",
        kind: "readiness",
        applies_when: "As required by the solicitation",
        guidance: "Have an authorised officer review the applicable representations.",
        evidence: "Dated submitted representations",
        source_url: "https://www.acquisition.gov/browse/index/far",
      },
      {
        key: "us-federal-04",
        title: "Exclusions, responsibility and eligibility",
        category: "Eligibility",
        kind: "readiness",
        applies_when: "As required by the procurement",
        guidance: "Verify exclusions, restrictions and any claimed programme eligibility.",
        evidence: "Dated checks and eligibility evidence",
        source_url: "https://sam.gov/entity-registration",
      },
      {
        key: "us-federal-05",
        title: "Federal information safeguarding",
        category: "Security",
        kind: "readiness",
        applies_when: "Where contract clauses cover federal information",
        guidance: "Classify the information and map the safeguards required by the actual clauses.",
        evidence: "Data scope and implementation evidence",
        source_url: "https://www.acquisition.gov/browse/index/far",
      },
      {
        key: "us-federal-06",
        title: "DoD cyber and CMMC assessment route",
        category: "Security",
        kind: "certification",
        applies_when: "Where applicable DoD clauses require it",
        guidance:
          "Confirm the current clause, deviation and assessment route before claiming status. Do not assume a rollout deadline.",
        evidence: "Scoped assessment record and required affirmation",
        source_url: "https://www.acq.osd.mil/dpap/dars/dfars_far_overhaul_class_deviations.html",
      },
      {
        key: "us-federal-07",
        title: "Federal cloud security status",
        category: "Cloud",
        kind: "certification",
        applies_when: "Cloud services within the current FedRAMP scope",
        guidance:
          "Confirm the offering’s own applicable status; a hosting provider’s status does not automatically cover the application.",
        evidence: "Official offering record and boundary",
        source_url: "https://www.fedramp.gov/2026/scope/",
      },
      {
        key: "us-federal-08",
        title: "Supply-chain, origin and export restrictions",
        category: "Supply chain",
        kind: "readiness",
        applies_when: "Where incorporated or legally applicable",
        guidance:
          "Review sourcing, restricted equipment, country-of-origin and export requirements.",
        evidence: "Product provenance and specialist review",
        source_url: "https://www.acquisition.gov/browse/index/far",
      },
      {
        key: "us-federal-09",
        title: "Labour, accessibility and subcontract flow-downs",
        category: "Delivery",
        kind: "readiness",
        applies_when: "Where the solicitation requires them",
        guidance: "Map the obligations applying to the workforce, deliverables and subcontractors.",
        evidence: "Clause response and subcontract matrix",
        source_url: "https://www.acquisition.gov/browse/index/far",
      },
      {
        key: "us-federal-10",
        title: "Agency award or acceptance",
        category: "Buyer decision",
        kind: "buyer_decision",
        applies_when: "When the agency issues a decision",
        guidance:
          "Record the actual procurement decision and scope. SAM registration alone is not approval.",
        evidence: "Agency decision and contract reference",
        source_url: "https://sam.gov/entity-registration",
      },
    ],
  },
  {
    id: "investment-banking",
    version: "2026-09-16.1",
    title: "Investment-bank supplier readiness",
    description:
      "Prepare for bank vendor onboarding, security questionnaires and third-party due diligence.",
    caution:
      "This pack covers supplying services to banks, not authorisation to conduct regulated investment banking. Each bank has its own due diligence and contract. ISO certificates and SOC reports support review but do not establish universal bank approval.",
    source_checked_on: "2026-09-16",
    requirements: [
      {
        key: "investment-banking-01",
        title: "Bank, service and risk classification",
        category: "Scope",
        kind: "readiness",
        applies_when: "Every bank engagement",
        guidance: "Confirm service scope, jurisdictions, access and criticality with procurement.",
        evidence: "Buyer questionnaire and service boundary",
        source_url: "https://www.goldmansachs.com/our-firm/our-vendor-program",
      },
      {
        key: "investment-banking-02",
        title: "Corporate, financial and ethical due diligence",
        category: "Governance",
        kind: "readiness",
        applies_when: "As requested by the bank",
        guidance:
          "Prepare ownership, financial, sanctions, conflicts and supplier-conduct evidence.",
        evidence: "Reviewed corporate due-diligence pack",
        source_url: "https://www.goldmansachs.com/our-firm/our-vendor-program",
      },
      {
        key: "investment-banking-03",
        title: "Information-security control response",
        category: "Security",
        kind: "readiness",
        applies_when: "For systems and information in the bank’s scope",
        guidance: "Map buyer controls to operating evidence and accountable owners.",
        evidence: "Completed control matrix",
        source_url: "https://jpmorganchase.com/supplierdiversity/oversight",
      },
      {
        key: "investment-banking-04",
        title: "Identity, access and personnel controls",
        category: "Security",
        kind: "readiness",
        applies_when: "For relevant staff and system access",
        guidance:
          "Document access reviews, onboarding, screening and training required by the bank.",
        evidence: "Access and personnel control evidence",
        source_url: "https://jpmorganchase.com/supplierdiversity/oversight",
      },
      {
        key: "investment-banking-05",
        title: "Testing, vulnerability and incident response",
        category: "Security",
        kind: "readiness",
        applies_when: "As required by the bank’s service scope",
        guidance: "Prepare test findings, remediation and incident-handling evidence.",
        evidence: "Test report and incident plan",
        source_url: "https://jpmorganchase.com/supplierdiversity/oversight",
      },
      {
        key: "investment-banking-06",
        title: "Privacy, hosting and subcontractors",
        category: "Data",
        kind: "readiness",
        applies_when: "Where bank information or delegated services are involved",
        guidance:
          "Disclose data locations and subcontractors; confirm buyer consent and protections.",
        evidence: "Data-flow and subcontractor register",
        source_url: "https://jpmorganchase.com/supplierdiversity/oversight",
      },
      {
        key: "investment-banking-07",
        title: "Continuity, recovery and exit",
        category: "Resilience",
        kind: "readiness",
        applies_when: "According to service criticality and contract",
        guidance: "Prepare tested recovery and an executable exit approach.",
        evidence: "Exercise results and exit plan",
        source_url: "https://jpmorganchase.com/supplierdiversity/oversight",
      },
      {
        key: "investment-banking-08",
        title: "Independent assurance evidence",
        category: "Assurance",
        kind: "certification",
        applies_when: "Where the buyer asks for ISO, SOC or other assurance",
        guidance:
          "Record the actual issuer, period, scope and exceptions. SOC 2 is an attestation report.",
        evidence: "Scoped certificate or assurance report",
        source_url: "https://www.goldmansachs.com/our-firm/our-vendor-program",
      },
      {
        key: "investment-banking-09",
        title: "AI service disclosure and governance",
        category: "AI",
        kind: "readiness",
        applies_when: "When providing AI-enabled services",
        guidance:
          "Confirm the bank’s AI provider requirements and document intended use and oversight.",
        evidence: "AI inventory and buyer-specific response",
        source_url: "https://www.jpmorganchase.com/about/suppliers",
      },
      {
        key: "investment-banking-10",
        title: "Bank onboarding and acceptance decision",
        category: "Buyer decision",
        kind: "buyer_decision",
        applies_when: "When the bank completes its review",
        guidance: "Record only the bank’s actual acceptance for the defined entity and service.",
        evidence: "Written acceptance and vendor reference",
        source_url: "https://www.goldmansachs.com/our-firm/our-vendor-program",
      },
    ],
  },
];
