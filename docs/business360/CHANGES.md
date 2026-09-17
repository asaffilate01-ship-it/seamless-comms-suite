# Changes from the supplied v0.2 archive

- New `transformation/business.py` for business/department/person/stakeholder discovery, validated register links, financial KPIs, collections and improvement reports.
- New shared `BusinessPanel.tsx`, guided hierarchy selectors, business-first project creation and register schemas. The supplied company/M&A/product/technical workflows remain available.
- Engine extensions for business reports, new financial write roles, private salary filtering and PostgreSQL actor context.
- New PostgreSQL adapter and forced-RLS migration. SQLite now requires explicit local evaluation opt-in at the service entrypoint.
- New standalone WSGI identity host, provisioning/revocation/password-reset CLI, session and entitlement checks, shared React login shell and prebuilt bundle.
- Omniqora server wrapper now checks enabled tenant IDs before service calls; route title updated to Business360.
- Eleven new domain cases, ten standalone authentication cases, eleven embedded PostgreSQL policy checks, optional native database runner and a fictional example.
- Updated deployment/security/capability documentation and preserved source provenance. The bundled knowledge-core source remains byte-identical to the supplied snapshot.

This is one extension of the supplied package, not four separately merged uploads. The second shared chat's contents were not available for comparison. No separately packaged Enterprise Governance & Adoption code, live connector credentials or production deployment is included.
