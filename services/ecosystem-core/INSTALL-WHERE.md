# Version 3 installation map

Read README.md for current instructions. The entrypoint is app.py. The standalone administration UI is web/index.html, served by that backend. Do not use the older version 2 admin API contract for version 3.

Create a separate private iTechLounge Ecosystem backend project/repository. Install the Python backend and worker there once. Host this backend on a persistent server, not inside a static Lovable frontend.

For Haccora, TaxNuvia, EventPlanr and each additional SaaS, copy only the React components and server connector modules required by that app. Each connector needs that app's verified auth/tenant implementation and its own central credential. Do not copy the central database into these apps or share one app key among them.

Suggested Lovable instruction for each existing app:
"Integrate the provided ecosystem React components into the verified business owner/manager dashboard. Connect them through a server-only endpoint using our existing authentication and tenant membership. Never put ecosystem keys in VITE or browser code. Add LinkedServices for business-account confirmation, BusinessServices for offers, ReferralDashboard for outgoing enquiries, and provider=true only for authorised supplier accounts. Implement subscription and membership sync from authoritative backend state. Implement a durable signed discount receiver only if this app offers ecosystem discounts. Do not simulate successful payments or applied discounts. Keep this app's own billing authoritative."

TaxNuvia firms must use their individual firm organisation IDs, not a global TaxNuvia organisation. Haccora uses sector food. EventPlanr discounts apply only to paid supplier subscriptions, not automatically to event customers.
