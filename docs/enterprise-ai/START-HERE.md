# Omniqora enterprise AI extension

Prepared for Amer Saleem on 15 September 2026.

This is an additive local source extension for the enterprise AI architecture, governance and adoption work. It belongs inside Omniqora first. It includes a working Python pilot register, deterministic assessment, independent review, evidence references, scoped audit records and a provider-neutral cost forecaster. It also contains the specification and integration plan for the broader module.

**Status:** 23 local unit tests passed. No changes were pushed to GitHub, applied to Supabase, connected to providers or deployed. The TypeScript file defines an integration contract only. There is no new dashboard or authenticated network service in this package. Registering a pilot does not execute an agent, enforce a runtime budget or approve production use.

## Where this goes

Recorded target: `asaffilate01-ship-it/seamless-comms-suite`. This target comes from the inspected Omniqora consolidated handover; the current remote branch was not inspected in this task.

| Package path | Intended repository path | Purpose |
| --- | --- | --- |
| `omniqora-update/services/enterprise-ai/` | `services/enterprise-ai/` | Framework-independent local Python core |
| `omniqora-update/src/modules/enterprise-ai/` | `src/modules/enterprise-ai/` | Proposed host contract; not a registered route |
| `docs/BUILD-SPECIFICATION.md` | `docs/enterprise-ai/BUILD-SPECIFICATION.md` | Target behaviour and acceptance criteria |
| `docs/INTEGRATION.md` | `docs/enterprise-ai/INTEGRATION.md` | Sequenced host work and source boundaries |

Add these files after reconciling with the latest branch. Do not replace the repository with this archive. No migration is included or required for the local demonstration. The Python service needs a server runtime; it cannot run in the React browser or a Supabase Edge Function unchanged.

## Run locally

Python 3.11 or later, standard library only:

```sh
cd omniqora-update/services/enterprise-ai
python -m unittest discover -s tests -v
python demo.py
```

The demonstration uses temporary SQLite storage and fictional evidence. It makes no network calls. Production identity must create `Actor` server-side after verification; never accept this object from a browser.

## Existing materials reviewed

- `Omniqora-Consolidated-AI-Pack.zip`: RRCI handover, host contracts and overall source precedence.
- `Omniqora-and-SaaS-File-Index.md`: integration status and recorded repository mapping.
- `AssetAI-Enterprise-Portfolio-v2.zip`: deployment handoff and portfolio evidence map. It remains a separate reference application. Its providers were not activated or retested here.

The existing RRCI module remains responsible for permission-aware knowledge retrieval and governed action proposals. This extension manages AI adoption and pilot approvals. A use-case approval must never be converted into permission to send a message, trade, export data or execute a specific external action.

See `verification/RESULTS.md` for validation and limitations, and the separate `Amer-Saleem-AI-Architect-Assessment.docx` for role suitability and interview preparation.
