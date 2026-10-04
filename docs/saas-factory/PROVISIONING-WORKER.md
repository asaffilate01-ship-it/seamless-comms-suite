# SaaS Factory provisioning worker

Omniqora exposes a secured provisioning worker at:

`POST /api/control-plane/workers/provisioning`

The worker claims queued jobs with database locking and processes up to 20 jobs per request.

## Scheduled production drain

The `.github/workflows/provisioning-worker.yml` workflow runs every five minutes and drains up to five batches per invocation.

The scheduled job is disabled until the repository/environment variable below is set:

- `PROVISIONING_WORKER_ENABLED=true`

Production environment secrets required:

- `OMNIQORA_PUBLIC_URL` — HTTPS public origin of the deployed Omniqora application.
- `CONTROL_PLANE_WORKER_SECRET` — same 32+ character server-only secret configured in the Omniqora runtime.

The workflow can also be run manually with `workflow_dispatch`; manual runs still require both secrets.

## Haccora

When Haccora is requested for a Dishbee tenant, this worker performs the product-specific provisioning adapter:

1. select GB or DE Haccora deployment;
2. create/link the service workspace;
3. generate the one-time tenant-scoped `oqcp_` control-plane credential;
4. bind Haccora back to Omniqora;
5. verify the connector;
6. complete dependent Haccora services only when their prerequisites are satisfied.

Blocked jobs remain visible in Tenant Factory and can be retried after configuration is corrected.
