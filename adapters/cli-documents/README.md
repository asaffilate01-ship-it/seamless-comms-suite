# Product backend client for CLI-Anything documents

A dependency-free Node server client for the API in `services/cli-automation`. Import `createDocumentClient` from `client.mjs`. This is server-only code: never bundle a service credential or this Node module into the browser.

Supply a fixed operator-configured HTTPS origin as `endpoint`, and `getBearer({signal})`, which obtains a fresh source-user credential accepted by the host's actual verifier. It must not issue landlord credentials in place of a tenant user's permissions. The service derives tenant/product/actor from verified credentials; the client sends no identity selectors. Do not accept endpoint URLs or bearer values from document content or model output. Product servers must authenticate users, enforce source-record permissions and map approved facts before calling the client.

Methods:

- `submit({requestId, document:{title, paragraphs}})` returns the stable job ID. The source backend owns a durable request ID; unchanged retries reuse it. A timeout is an uncertain outcome, not proof the request failed. There are no automatic retries.
- `list({before?, limit?})` returns scoped metadata and the next cursor.
- `status(jobId)` returns a validated lifecycle state and completed artifact checksum.
- `history(jobId, {after?, limit?})` returns a bounded audit page.
- `download(jobId)` fetches fresh completed status, downloads the ODT bytes and verifies SHA-256 before returning them. This proves byte agreement with the service, not document accuracy or approval. It cannot authorise publication or regulatory decisions.
- `remove(jobId)` clears a non-running job's content idempotently.

The client disallows endpoint credentials, paths, query strings and fragments, uses `redirect: error`, omits cookies, and does not log tokens or provider error bodies. Each HTTP request has one timeout covering credential resolution, fetch and streamed response reading (10 seconds by default, configurable 10–30,000 ms). `download` makes two separately bounded requests. Response reads are capped at 100 KB for JSON and 2 MB for documents. Inputs, job identity, response types, statuses and cursors are checked; malformed responses fail closed. Errors use `DocumentClientError.code`, never a raw server error message.

`testOnlyAllowLoopbackHttp` permits only explicit `http://127.0.0.1` test origins. Leave it false in production. HTTPS origin restriction is not an SSRF defence for user-controlled URLs: endpoint remains trusted operator configuration. DNS/egress policy and TLS trust remain deployment responsibilities.

## HTTP host

`services/cli-automation/wsgi_app.py` exports `create_app(service_factory=..., verify_bearer=...)`, a mountable WSGI application. Supply a new configured `Service` for every request thread and a real bearer verifier. The wrapper closes the connection even on failures, caps bodies before reading, requires POST Content-Length, rejects Transfer-Encoding and malformed/ambiguous lengths, and supplies exact response Content-Length.

Mount it using the organisation's chosen production WSGI server, behind TLS, source authentication, request rate limits and header/body read deadlines. The wrapper does not supply a production server, process supervisor, source token verifier, permissions, worker scheduler or deployment credentials. The upstream reverse proxy must reject duplicate headers: WSGI cannot recover duplicates that the HTTP parser combined or discarded. It must not permit request smuggling or buffering beyond the declared request-size cap.

No service is auto-started or connected to the 88 catalogue products. Each product still needs its authenticated server call site, approved data mapping, document UI, entitlement and deployed worker. This package does not alter source apps, activate tenants, generate model instructions, execute arbitrary CLI commands or expose worker operations to HTTP.

## Verification

Run `node --test adapters/cli-documents/*.test.mjs` and `python3 -m unittest discover -s services/cli-automation/tests -v` from the repository root.

The HTTP test starts a temporary Python WSGI server bound only to 127.0.0.1, with synthetic credentials, two synthetic tenants and a fixture document backend. It exercises the real client, HTTP parsing, API, SQLite jobs, pagination, auth denial and checksum-verified downloads. It does not verify real JWTs, production infrastructure, visual document layout or live product data. `http_fixture.py` is strictly a test fixture, never a deployment launcher. The separate opt-in Python E2E still validates actual CLI-Anything generation when the reviewed executable is installed.
