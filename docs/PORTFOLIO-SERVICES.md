# Portfolio services

Optional cross-selling at business decision points. The shared catalogue comes from the Omniqora AI portfolio network (version 2026-09-15.1).

## Behaviour

- Compact panels show three complementary services, with an expandable catalogue and dismiss controls.
- Recommendations use only the source product, placement, country, audience and explicitly supplied owned-service list. No customer-profile or sensitive-data inference is used.
- Public destinations are allowlisted in the catalogue. Referral links contain product and placement labels only. Opening a service does not share customer, payment or authentication data.
- Pilot and enquiry-only services prepare a downloadable brief on the customer's device. This does not send an enquiry, request a quote, activate cover or subscribe the customer. Haccora UK has its own consented support-case request workflow.
- UK insurance enquiry topics adapt to food businesses, trades, events, childcare, driving instruction and fleets. Eligibility, suitability, price and cover require provider review. UK-specific insurance and accounting offers are suppressed outside GB.
- Existing purchase, checkout, support and account permissions stay in their current workflows. No new billing or shared-login integration is introduced.

## Maintenance

Update the shared lib/portfolio-network.ts and lib/portfolio-products.ts in Omniqora AI, run its portfolio/network and authentication tests, then sync the identical modules into src/lib in connected apps. Set the source and deployment country explicitly in each placement. Configure a public provider URL only after the destination and actual service availability are confirmed.

TaxNuvia retains its existing server-managed /business-services catalogue; its dashboard links there, preserving operator enable/disable controls.

## Verification

The shared engine has behavioural tests for country/audience gates, contextual priority, insurance topics, self/owned/dismissed suppression, bounded result sizes and destination validation. Its authenticated API is checked for missing credentials, forged source labels, paused workspaces and invalid placements. All edited source files parsed successfully. Run this repository's existing build and release checks before production publication.
