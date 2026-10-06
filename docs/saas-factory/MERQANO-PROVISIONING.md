# Merqano provisioning adapter

Omniqora now has a fail-closed product adapter for Merqano.

Required server configuration:
- MERQANO_APP_URL: deployment-approved HTTPS origin.
- MERQANO_PROVISIONING_SECRET: minimum 32-character shared provisioning secret stored only server-side.
- OMNIQORA_PUBLIC_URL: public HTTPS control-plane origin.

Flow:
1. Factory provisioning worker claims a Merqano product job.
2. Adapter requests idempotent tenant creation in Merqano.
3. Omniqora creates a one-time control-plane connector credential and stores only its SHA-256 digest.
4. Adapter sends the raw credential once to Merqano's server-side bind endpoint.
5. Merqano confirms the binding.
6. Omniqora marks product_connection connected and records the external tenant ID.

No product is marked connected if the external workspace, secret, HTTPS origin or bind confirmation is missing.
