<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Codex / ECC / Agency Agents working agreement

- This repository is Omniqora's **shared control plane and SaaS/AI Agent Factory**, not the source repository for every SaaS. VOXENTRI, Dishbee, Kindelo, Merqano and others retain their own domain logic and tenant data.
- Read [the portfolio source-audit and development-agent guide](docs/factory/PORTFOLIO-SOURCE-AUDIT.md) before changing the Factory catalogue or cross-repository connectors.
- Distinguish *development agents* (Codex, ECC skills, Agency Agents prompts) from **customer/business agents** (Omniqora Intelligence). Tool installation never grants product runtime permissions.
- Check open PRs before modifying shared functionality, especially the integrated Factory work in PR #97. Do not duplicate unfinished or separately owned modules.
- Use one feature branch and one reviewable PR per cohesive change. Preserve Lovable history; do not force-push, squash published branches or push unverified changes to main.
- Default to read-only discovery; do not assume repository mappings, MCP listings, API contracts, payment connectors, tenancy or production deployment are active without independent evidence.
- Enforce tenant/landlord/role isolation, server-side authorisation, RLS, idempotency, secret redaction, audit evidence, regional boundaries and human approvals for high-impact actions.
- Keep secrets out of committed files, agent context, PR text and CI logs. Never install third-party agent hooks or MCP servers in production without security review.
- For factory inventory changes run the portfolio-factory-audit Node regression test and the factory-portfolio-audit script with --strict on a branch containing the expanded registry.
- For application changes run the relevant Bun typecheck, build, security and focused control-plane/integration checks. State explicitly which checks ran and which require credentials or deployment.
- No source-only or catalogue-only change should be reported as a completed production launch.
