# Integration with the existing Omniqora suite

## Preserve the existing source boundaries

The consolidated handover records target `asaffilate01-ship-it/seamless-comms-suite` and a historical main snapshot `0d49bc85c4309c3b1160d0a10c15fe3e4aaa69c0`. This task inspected the saved handover, not the current remote branch. First inspect the current branch and applicable AGENTS.md; reconcile concurrent work and preserve Lovable's connected history.

Do not copy the AssetAI frontend over Omniqora. AssetAI is a separate reference application with a different host. Its AWS, Databricks and Snowflake assets may inform sandbox connectors after review. Their deployment instructions and tests are historical evidence, not proof of current activation.

## Suggested implementation sequence

1. Add the local module in a feature branch. Run its 23 tests. Review policy assumptions and evidence semantics with the product owner.
2. Inspect Omniqora's current identity, tenant membership, module entitlement and routing conventions. The earlier RRCI update includes a paired tenant-helper and draft migration; reconcile these before adding more permissions. Do not execute that migration blindly.
3. Add module entitlement and roles through the trusted provisioning layer. Reuse host tenant IDs. Decide whether Enterprise AI is a separate entitlement or included with RRCI; keep billing rules out of the Python core.
4. Implement authenticated server operations for use-case CRUD, assessment, evidence and approvals. Bind credentials to a workspace and resolve all actor fields from the host. Recheck access after long operations. Validate schemas and errors. Do not expose `Actor`, internal tokens or arbitrary database paths to clients.
5. Replace local SQLite storage with an approved persistent host backend before shared deployment. Keep compound tenant/workspace keys, transactions, optimistic revision checks and independent approval. Add historical versions and permission-checked evidence references. Review migrations in an isolated test database first.
6. Add `/app/enterprise-ai` and the screens in the specification. Display local/demo/connected state accurately. Build the register and review flow before expanding dashboards. Follow the current project's router rather than imposing React Router.
7. Connect RRCI through existing verified host interfaces. Use-case approval is separate from RRCI approval for a specific external action. Do not let an AI reviewer confer human approval. Use durable queued notifications after commit; messages remain subject to user/product authorisation.
8. Connect cost scenarios to authenticated runtime usage. Recompute forecasts server-side from approved model/rate/scenario versions. Do not accept the browser's claimed token count as authoritative provider billing evidence. Implement reservation/reconciliation before claiming hard budget limits.
9. Connect use-case suspension to the real executor. A SQLite status update is not a kill switch. Recheck current grants before side effects and handle in-flight work explicitly.
10. Run host/browser/database tests and a sandbox provider demonstration. Capture receipts, negative permission results, actual latency, usage and human-review outcomes. Only then propose pilot activation.

## Provider boundaries

| Component | Intended responsibility | Integration status in this extension |
| --- | --- | --- |
| AWS Bedrock | Approved model inference and configured content safeguards | Not connected |
| Bedrock AgentCore | Optional managed agent runtime, identity, policy and observability | Design option, no resources provisioned |
| Databricks Unity Catalog | Governed data/AI assets and lineage where the customer uses Databricks | Metadata/permission adapter to implement |
| Snowflake | Governed analytical data, usage analysis or an existing enterprise ledger | Adapter and schema mapping to implement |
| RRCI | Authorised evidence retrieval and per-action governance | Existing source reference; host integration to reconcile |
| Omniqora | Accounts, tenants, entitlements, workspace and cross-product orchestration | New module host wiring to implement |

Use the customer's current platforms where appropriate. Do not require both Databricks and Snowflake for a small pilot. For a newly designed AWS agent runtime, assess AgentCore and current service availability before adopting older Bedrock Agents examples. Existing AssetAI code requires its own dependency and API review.

## Evidence to capture for the portfolio

Keep separate folders for design, local tests, sandbox validation, pilot outcomes and production operations. For each claim, retain artifact/version, your personal responsibility, date, environment, actual observation and limitation. Demonstrate one denied request and one handled failure, not just successful screenshots.

An honest statement today is that this package adds locally tested governance utilities to an Omniqora development handover. It does not prove enterprise employment experience, live Bedrock/Databricks/Snowflake operation or an organisation-wide AI rollout.
