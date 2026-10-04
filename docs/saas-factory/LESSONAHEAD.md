# LessonAhead in the Omniqora SaaS Factory

LessonAhead is an external product in the **Marketplace + Operations** class. It remains a separate application and Supabase project; it is not moved into the Omniqora monolith.

## System ownership

| Data or capability                                        | System of record      |
| --------------------------------------------------------- | --------------------- |
| Learner identity and profile                              | LessonAhead           |
| Lessons, availability and Learning Passport               | LessonAhead           |
| Instructor evidence and verification decisions            | LessonAhead           |
| Parent permissions and consent                            | LessonAhead           |
| Product catalogue, plans, add-ons and tenant entitlements | Omniqora              |
| WhatsApp provider delivery and channel health             | Omniqora Connect      |
| AI execution, evidence and approval policy                | Omniqora Intelligence |
| Aggregate cross-product analytics                         | Omniqora Analytics    |

Direct cross-database joins, plaintext secrets and automatic safety or verification decisions are forbidden. LessonAhead uses a scoped `oqcp_` product credential and must match both `productKey=lessonahead` and the external tenant ID.

## Runtime contracts

- `POST /api/verticals/lessonahead/runtime` returns the bound tenant, product, entitlements, branding and domains.
- `POST /api/platform/intelligence` accepts bounded Intelligence Plus runs when the connection has the correct capabilities and entitlement.
- Omniqora Connect owns Meta/Twilio delivery. LessonAhead keeps only scoped channel/thread references and consented content needed for its workspace.

## Commercial catalogue

- Independent: £5.99/month or £59.90/year; 60-day trial.
- School: £14.99/month or £149.90/year; 60-day trial; three instructors included.
- Masked calls: £14.99/month including 200 connected minutes, then 6p/minute; recording off.
- WhatsApp AI and Intelligence Plus are registered as preview/draft add-ons. Their prices remain unset until a commercial decision is made.

## AI guardrails

The default WhatsApp mode is `draft_only`. FAQ auto-replies require an approved policy, explicit consent assertion and high confidence. Payments, refunds, complaints, safety, instructor verification, emergencies and test-pass predictions always require human review. All write actions proposed by Intelligence Plus require approval.
