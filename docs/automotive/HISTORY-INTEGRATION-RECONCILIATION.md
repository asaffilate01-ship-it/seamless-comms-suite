# Vehicle History & Intelligence - integration reconciliation

Source: candidate-only provider register and no-false-clear evidence evaluator.
This ports the safe, independent data-source work from legacy Omniqora Automotive PR #6
without merging its incompatible 20260926 automotive schema over the 20261003220000
Omniqora vertical core schema. That migration would redefine existing automotive_vehicles,
automotive_appraisals, automotive_evidence and automotive_passport_snapshots primary keys.

No customers, tenant bindings, provider secrets, chargeable APIs, reports or external actions
are activated. The existing /app/automotive operational workspace is preserved and now includes a read-only evidence source catalogue. No existing vehicle, appraisal, valuation or auction screens are removed.

The evidence evaluator never treats missing, stale, unlicensed, future-dated or unverified
data as proof of a clear vehicle. A verified adverse result always requires review,
including where another provider gives a negative result. Its "checked_without_flags"
state means only that the configured checked sources did not return flags; it cannot
guarantee the vehicle's complete history.

Next: rebase the remaining Vehicle Passport gateway, source API, evidence ledger,
signed webhooks and appraisals from PR #6 onto the EXISTING v3 schema; add
a tenant-scoped, entitlement-enforced server API and real provider acceptance tests.
Keep Germany FIN decoding separate from licensed history, and Japan chassis history
separate from UK VRM/MOT data. Do not capture precise vehicle geolocation.
