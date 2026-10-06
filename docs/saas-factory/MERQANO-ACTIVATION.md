# Merqano first-tenant activation

The SaaS Factory now includes launch blueprints for Alstero, Kalëthon, Dulcis and Meyzaar.

Alstero differs from the premium-retail tenants: its blueprint makes MarktPass a required shared service because regulated professional/medical product release must fail closed where compliance gating applies.

Factory activation readiness checks:
1. tenant_products Merqano state is active;
2. Merqano product_connection is connected and has an external tenant ID;
3. the Merqano base URL is HTTPS;
4. the control-plane handshake was verified within the previous 24 hours;
5. if a primary domain is configured, DNS must be verified and SSL active.

Omniqora AI, Marketing and Merqora marketplace growth can be optional entitlements. A blueprint may make any of them required later.

Hosted activation is not implied by source readiness. The deployment must still apply migrations, configure server secrets, run the provisioning worker and observe a successful handshake.
