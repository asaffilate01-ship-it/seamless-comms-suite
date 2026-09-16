# Standalone Business360

This wrapper serves the same React workspace and Python engine as the Omniqora add-on. There are no default accounts, passwords or enabled subscriptions. Provision pilot users locally through an operator command. The current account directory is a server-private SQLite database and is separate from the business transaction database.

## Local evaluation

Python 3.11+ is required. A prebuilt JavaScript/CSS bundle is included; Node is needed only to rebuild it. From this folder:

```bash
export BUSINESS360_ALLOW_SQLITE=1
export BUSINESS360_ORIGIN=http://127.0.0.1:8092
export BUSINESS360_AUTH_DB=var/accounts.db
export TRANSFORMATION_DB=var/business.db
export KNOWLEDGE_DB=var/knowledge.db
python3 manage.py add-user --tenant 11111111-1111-4111-8111-111111111111 --email owner@example.com --role owner
python3 manage.py set-entitlement --tenant 11111111-1111-4111-8111-111111111111 --enabled yes
python3 server.py
```

The example tenant UUID is an identifier, not a secret. Replace the email with yours. The CLI prompts for a password of at least 14 characters and confirmation. Open `http://127.0.0.1:8092`, sign in, then add the business. SQLite evaluation enforces application access checks but has no database RLS. Hosted business data must use the PostgreSQL path below.

Use `add-user` for colleagues in the same tenant, retain their returned user IDs, then assign project roles in Access. Recording someone as an employee or stakeholder never grants access. Tenant owners may create engagements; colleagues only see projects to which they have been granted access.

```bash
python3 manage.py reset-password --email owner@example.com
python3 manage.py disable-user --email departing@example.com
python3 manage.py set-entitlement --tenant 11111111-1111-4111-8111-111111111111 --enabled no
```

Password reset revokes existing sessions. Deactivation and entitlement changes take effect on subsequent authenticated requests. Automated email verification, invitation links, self-service recovery, SSO/MFA and payment activation remain production account-management work.

## Hosted configuration

1. Apply both Business360 PostgreSQL migrations and provision the dedicated application login described in `../../docs/business360/SECURITY.md`. Install `../../services/transformation/requirements-postgres.txt`.
2. Set `TRANSFORMATION_DATABASE_URL` to that dedicated login, set `BUSINESS360_ALLOW_SQLITE=0`, and use an exact HTTPS `BUSINESS360_ORIGIN`. Use verified TLS for remote PostgreSQL. Keep database credentials only in the deployment secret manager.
3. Store the auth directory and knowledge data on private persistent storage, not in a disposable container. Back up all stores together. The bundled account directory is suited to a single deployment with shared local storage; replace it with managed identity before horizontally scaling or promising enterprise login controls.
4. Serve `wsgi:application` with your approved production WSGI server behind TLS ingress. `server.py` is a loopback developer server. Configure reverse-proxy client IP handling/rate limits at the trusted ingress; the app deliberately does not trust arbitrary forwarded headers.
5. Test your actual hosted tenant/project separation, backups, session behavior, monitoring and RLS before admitting customer data. The included tests do not certify a deployment.

`.env.example` documents variables; it is not automatically loaded. Entitlements are managed by the operator; there is no checkout or billing webhook.

## Rebuild and verify

```bash
npm ci
npm run build
python3 -m unittest test_server.py -v
```

Build dependencies and licences are in `package.json`, the lockfile and `public/app.js.LEGAL.txt`. The build imports shared UI source from `../../src/modules/transformation/`; keep the two folders together. No API secrets are built into the bundle.
