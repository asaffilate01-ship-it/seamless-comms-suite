# AI Bookkeeping & Tax Intelligence

This is a shared Omniqora add-on for professional/accounting landlords such as TaxCenda and IQ Practice Cloud.

## Commercial model

An accounting-practice tenant can enable the add-on per practice client as:

- included in the practice package;
- free/no separate client charge;
- fixed monthly/annual resale fee;
- usage-priced;
- custom commercial terms.

The practice remains the service provider to its client. Omniqora records the client-level feature grant and charging mode; it does not make the client a separate platform tenant unless the practice explicitly chooses that architecture.

## Bookkeeping automation

### Opening file

The client/practice can upload or scan:

- prior accounts;
- opening trial balance;
- fixed asset register;
- bank/credit-card statements;
- aged receivables/payables;
- prior journals/supporting schedules;
- existing chart of accounts.

The opening file establishes the starting accounting position. AI may extract and map it, but the accountant approves the opening balances/framework before posting.

### Ongoing file

Sources include:

- mobile receipt/invoice camera;
- office scanner;
- PDF/image upload;
- CSV;
- email/import;
- bank feed/open banking;
- accounting-system import.

Every source is retained as evidence through Omniqora Documents.

### Extraction and classification

The extraction pipeline proposes:

- date;
- supplier/customer;
- description/reference;
- gross/net/tax;
- currency;
- nominal account;
- tax code;
- income/expense;
- capital vs revenue;
- asset candidate;
- private/non-business treatment;
- journal lines;
- duplicate candidates;
- confidence and evidence references.

AI never posts directly to the ledger.

### Review queue

Anything below policy confidence or with material ambiguity becomes a review item, including:

- capital vs revenue;
- uncertain nominal code;
- uncertain VAT/sales-tax treatment;
- missing/contradictory dates or amounts;
- duplicate invoices/receipts;
- unmatched statement entries;
- possible personal expenditure;
- accounting-policy questions.

The client can answer simple factual questions; accountant-only decisions remain role-controlled.

### Posting

Approved proposals become balanced double-entry journals through a deterministic posting function. Debits must equal credits and account/client/tenant scope must match.

### Trial balance and accounts

Once transactions are posted:

1. generate the trial balance;
2. maintain/update the fixed asset register;
3. compare against opening TB/prior accounts;
4. surface reconciliation/consistency exceptions;
5. prepare an accounts-preparation pack;
6. accountant reviews adjustments/disclosures;
7. the vertical accounting SaaS renders the jurisdiction/framework-specific statutory accounts and filing forms.

This aims to remove most manual bookkeeping/data entry, not the professional responsibility for accounts/tax sign-off.

## Tax Intelligence

Tax Intelligence receives the reviewed accounting facts and a defined tax issue. It retrieves current authoritative sources and proposes legally supportable treatments/reliefs.

### Source hierarchy

UK examples:
1. legislation and effective-date version;
2. binding court/tribunal authority where applicable;
3. other relevant case law;
4. HMRC published rulings/guidance/manuals;
5. reviewed secondary sources.

US examples:
1. Internal Revenue Code / Treasury Regulations;
2. binding precedent for the relevant court/jurisdiction;
3. IRS authoritative rulings/procedures and Internal Revenue Bulletins;
4. Tax Court/federal opinions as appropriate;
5. forms/instructions/publications and reviewed secondary material.

Every research run records exact source IDs, checked dates, effective dates and contrary authority.

### Objective

The optimisation objective is:

**lowest lawful tax supported by the client's actual facts, evidence and current authority.**

It must not:
- invent deductions or evidence;
- hide or re-characterise receipts contrary to facts;
- backdate;
- recommend sham transactions;
- ignore contrary authority;
- present an unreviewed AI conclusion as filing advice.

Material/aggressive/uncertain positions require accountant/tax-specialist review before they can become an approved tax position or feed a return/computation.

## Vertical boundary

Omniqora provides intake, evidence, extraction, bookkeeping staging/ledger, trial balance, asset register, research sources, grounded research and reviewed position records.

The accounting SaaS continues to own:
- statutory accounts presentation;
- UK VAT/CT600/SA forms and computations;
- payroll/RTI;
- HMRC filing;
- US forms/schedules and e-file;
- state/federal computation rules;
- preparer/reviewer filing sign-off.
