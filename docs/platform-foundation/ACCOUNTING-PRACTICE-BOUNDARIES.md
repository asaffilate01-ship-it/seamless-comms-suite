# Accounting / tax / professional-practice boundary

## Shared Omniqora responsibilities

TaxCenda, UK practice/accounting SaaS, TaxNuvia and future professional-service products should consume:

- CRM / companies / people;
- Practice Operations;
- client portal shell;
- engagement/work allocation;
- tasks and deadlines;
- document requests and controlled documents;
- e-signature request tracking;
- billing, subscriptions and collections;
- time/WIP/fee recovery;
- Connect (email/SMS/WhatsApp/voice);
- AI Reception;
- Sales and Marketing;
- Analytics/Metrics;
- Financials;
- generic AML/KYC case workflow through Compliance;
- generic submission/receipt/status records;
- RAG/GraphRAG evidence;
- AI summaries/task suggestions;
- audit trail and approvals;
- white-label/country/language packs.

## Vertical responsibilities

Keep these inside the accounting/tax product or a reviewed provider plugin:

### UK practice SaaS
- bookkeeping ledger/accounting rules;
- payroll calculation and RTI payloads;
- VAT calculations/returns;
- corporation-tax computations and CT600 forms;
- Self Assessment forms;
- statutory accounts/disclosures;
- Companies House/HMRC submission-specific validation;
- HMRC fraud-prevention headers and OAuth;
- jurisdiction-specific filing deadlines/rules.

### TaxCenda / US
- US federal/state tax computation;
- filing-status/dependent/tax-law logic;
- US tax forms/schedules;
- e-file schemas/transmission;
- preparer/reviewer tax-signoff rules;
- IRS/state-provider integration;
- depreciation/tax election logic;
- jurisdiction-specific filing/acceptance/rejection rules.

Omniqora may orchestrate and record these workflows, but must not become a universal tax calculation engine.

## Provider/plugin direction

Use plugins/adapters for:

- HMRC;
- Companies House;
- IRS/e-file provider;
- bank feeds/Open Banking;
- payroll submission providers;
- e-sign providers;
- identity/AML/KYC providers;
- accounting imports/exports (Xero, QuickBooks, Sage, etc.).

Each provider remains tenant/product/environment scoped and uses secret references rather than browser-held credentials.
