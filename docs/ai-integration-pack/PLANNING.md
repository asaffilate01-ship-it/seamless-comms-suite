# Business planning and data definitions

Planning is a product-scoped workspace module. Deterministic calculations run on imported source records; a separate Business planning agent can explain the selected summaries and propose follow-up. When no AI provider is configured, the agent flow is an explicitly labelled scripted sample, not analysis of the figures.

The pilot supports five CSV datasets and the existing EPOS daily sales import. It does not connect automatically to banks, accounting, inventory, payroll or HR services. An accounting-data integration, detailed sales-line feed and HRIS adapter are follow-on work. There is no autonomous payroll, employment decision, purchasing or rota publication.

## Import and access

- Select the product and download the blank template in Planning. Each import accepts 1–500 rows. Monetary inputs are decimal major units; storage uses integer minor units. Supported currencies are GBP, EUR, USD and AED, kept separate with no implicit conversion.
- Matching keys update a row. Omitted rows remain. Remove erroneous or obsolete records under Source records. Imports are atomic and persist in D1.
- Owners/admins/operators can manage accounts, cash and inventory. Rota and compliance data is restricted to owners/admins, including read access. Viewers cannot write.
- Up to 10,000 planning records and 10,000 sales rows are loaded per selected product; reaching a limit displays a warning. Source-record tables show 500 matching rows and support search. Totals only describe the loaded data, not an independently verified complete company dataset.
- CSV text, labels and evidence references are untrusted data. The planning agent receives calculated summaries, not individual employee names or private staff records. A submitted agent run is shared with authorised workspace members.

## Accounts

Headers: `period_start,period_end,location,currency,account_code,account_name,category,amount`.

P&L categories: `revenue,cogs,payroll,overheads,depreciation,interest,tax`. Balance categories: `asset,liability,equity`. For a P&L use the exact reporting-period start/end. For balance accounts use the same snapshot date in both columns. Do not mix consolidated totals and branch totals or supply overlapping rollups as separate accounts.

The key is period start/end, location, currency and account code. Revenue and normal expenses are positive; reversals/contra balances can be negative. Use your consistent accounting basis and tax treatment. Map each account once. A zero category must have an explicit zero row where it does not apply. Missing categories do not become zero. Within the supplied P&L locations, all categories must exist before a net result is calculated.

Calculations:

- Gross profit = revenue − cost of goods.
- Net result = revenue − cost of goods − payroll − overheads − depreciation − interest − tax.
- Net margin = net result / revenue when revenue is non-zero.
- Balance reconciliation = assets − liabilities − equity on one selected date. Zero means arithmetic balance only, not source verification or compliance with an accounting standard.

The P&L scenario scales each category by horizon days / reporting-period days. Revenue and goods costs additionally respond to the demand-change assumption. Other daily rates remain unchanged. This simplistic model does not estimate actual tax, inflation or financing changes. No forecast balance sheet is constructed; that requires linked receivables, payables, inventory, asset, financing and equity movements. Choose a date-only period to inspect a standalone balance snapshot.

Statement definitions and the distinction between reported and estimated values follow the general explanations in [business.gov.au financial tools](https://business.gov.au/finance/financial-tools-and-templates). Accounting treatment for a specific customer still needs its source ledger and appropriate professional review.

## Sales baseline and scenarios

EPOS daily sales are imported under Intelligence. A forecast needs 28 consecutive daily rows per selected location immediately before the planning date. Include explicit zero-sales rows for closed days. Missing days block the forecast; they are not treated as zero. Current planning-day sales are excluded from the baseline to avoid treating a partial day as complete.

Each future day's baseline is the average of the four corresponding weekdays in that 28-day window, floored at zero. The scenario multiplies it by `1 + demand_change/100`. The lower/upper lines are an explicit ±15% sensitivity range; they are not statistical confidence or probability intervals.

If 42 complete history days exist, a 14-day rolling backtest uses each validation day's preceding 28 days, without future leakage. Mean absolute error is shown in currency per day. Otherwise backtest error is unknown. Forecast accuracy is not guaranteed. Holidays, promotions, weather, closures, structural changes and cross-product demand relationships are not modelled. The module does not infer SKU demand from aggregate sales.

## Cash commitments

Headers: `due_date,location,currency,reference,direction,category,amount,status`.

The key is location, currency and reference. Direction is `in` or `out`; amounts are positive. Status is `expected` or `paid`. Reimport a settled commitment as paid to exclude it from future projections. Use distinct references for partial payments rather than double-counting the original total.

The opening balance is available cash at the beginning of the planning date. Expected incoming/outgoing commitments change it day by day. A collection-delay assumption shifts incoming dates only. Overdue items fall on the first scenario day after applying the delay; this is a visible assumption, not a prediction of collection success. Paid rows are excluded because they should already be in opening cash.

Closing balance, lowest balance and first projected negative date are calculated over the chosen horizon. A period-end positive balance can still have an earlier shortfall. Imported commitments must explicitly include payroll, taxes, capital expenditure, financing and any expected new-sales receipts. Demand forecasts do not automatically create cash flows or purchasing commitments.

Guidance on documenting estimated cash movements: [business.gov.au cash-flow statements and forecasts](https://business.gov.au/finance/cash-flow/set-up-a-cash-flow-statement).

## Inventory, replenishment and expiry

Headers: `as_of,location,sku,item_name,lot,unit,on_hand,on_order,avg_daily_usage,lead_days,safety_stock,expiry_date,unit_cost,currency`.

Key: location, SKU, lot and snapshot date. Import a complete set of lots for a SKU/location with one `as_of` date. Depleted lots in that snapshot should carry zero stock. The latest snapshot on or before the plan date replaces previous snapshots analytically; dates are not added together. Stocks more than two days old are flagged, but they are not silently rolled forward.

`on_order` is a per-lot quantity, summed across lots. Repeat the same SKU daily-usage rate, lead time, safety stock, unit and currency on each of its lot rows. Conflicting values make the SKU's demand/reorder calculation unknown. Expiry date and unit cost can be blank; blank cost keeps value-at-risk unknown.

- Usable quantity excludes stock whose expiry is before the plan date. Expiry dates are treated as usable through the end of that date; confirm the business's specific stock rules before use.
- Days cover = usable on-hand / scenario daily usage. Zero usage gives unknown cover.
- Reorder review = max(0, ceiling(usage × lead days + safety stock − usable on-hand − on-order)).
- FEFO expiry risk allocates constant demand to the earliest-expiring lots first. Quantity likely to remain after each expiry is flagged; value is quantity × recorded unit cost. Units are not combined across SKUs.

The model excludes incoming delivery timing, safety-stock variability, supplier minimum quantities, spoilage, allocations and changing demand. Outstanding purchase orders can arrive too late even when the aggregate reorder quantity is zero. Confirm current stock and supplier dates before ordering. Expired stock is not recommended for sale.

## Rota coverage

Headers: `date,location,team,start,end,required_staff,scheduled_staff,staff_names,required_skills,confirmed_skills,status`.

Key: date, location, team, start and end. Times use HH:MM; an end before the start means an overnight shift. Status is `draft` or `confirmed`. Separate skills with semicolons. Requirements are the manager's reviewed headcount and skills benchmark, not an automatic inference from revenue. Scheduled headcount is supplied explicitly; names are descriptive and are not counted by the parser.

Coverage gap = scheduled − required headcount. Staff hours = elapsed shift duration × headcount, including any breaks. Required skills not listed as confirmed are flagged. Recommendations prompt managers to validate demand and consider cover, redeployment or training. They do not recommend dismissals or determine individual employee performance.

This version stores and analyses imported rotas. It does not allocate employees, check contract/leave availability, verify training credentials, enforce minimum rest, calculate overtime, publish rotas or notify staff. Before a staffing change, verify jurisdiction-specific employment rules, contracts, breaks, leave, skills and service needs.

## Training and compliance register

Headers: `reference,location,subject,requirement,category,due_date,owner,status,evidence_ref`.

Key: location and reference. Category is `training`, `staff` or `business`. Status is `open` or `complete`. Import only approved applicable requirements. Open past-due items are overdue; open items due within 30 days are flagged. A completed item without an evidence reference is marked evidence missing. “Recorded complete” means the imported row says complete and includes a reference; the document has not been authenticated or its contents checked.

This is a workflow register, not an exhaustive rules engine or legal compliance certificate. The business must identify its jurisdiction, industry obligations, approved policies and evidence requirements. Training reminders and follow-up tasks are implemented; learning content, assessments and automatic certification are not.

## Daily guidance and agent output

Use review buttons to create personal My day tasks for a forecast, cash shortfall, stock concern, rota gap or compliance requirement. The agent can propose shared internal follow-ups through existing review controls. Saved scenarios store assumptions and recalculate against current data; they are not immutable historical forecast snapshots. Actual-versus-forecast monitoring, forecast versions, probabilistic models, automatic live refresh and granular KPI target configuration remain future work.
