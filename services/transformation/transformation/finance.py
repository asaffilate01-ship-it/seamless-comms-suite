"""Deterministic management finance. Decimal calculations; no LLM arithmetic."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from datetime import date
from knowledge_core.types import APIError, text, identifier, iso_date

COSTS = {"opex", "capex", "tsa", "migration"}

def number(value, name, low="0", high="1000000000000"):
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise APIError(422, f"{name}: use a decimal string, not a float")
    try:
        result = Decimal(value)
    except InvalidOperation:
        raise APIError(422, f"Invalid {name}") from None
    if not result.is_finite() or not Decimal(low) <= result <= Decimal(high):
        raise APIError(422, f"{name} is out of range")
    return result

def money(value):
    return str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

def currency(value):
    if value not in {"GBP", "EUR", "USD", "AED", "PKR"}:
        raise APIError(422, "Supported currencies: GBP, EUR, USD, AED, PKR")
    return value

def validate_entry(data, base):
    expected = {"id", "kind", "category", "amount", "currency", "period", "source_ref", "description", "fx_rate", "fx_as_of", "fx_source"}
    if set(data) - expected:
        raise APIError(422, "Unexpected financial entry fields")
    if data.get("kind") not in {"baseline", "budget", "actual", "forecast"}:
        raise APIError(422, "Invalid financial entry kind")
    if data.get("category") not in COSTS | {"revenue"}:
        raise APIError(422, "Invalid financial category")
    value = number(data.get("amount"), "amount")
    if value != value.quantize(Decimal("0.01")):
        raise APIError(422, "Amounts must have at most two decimal places")
    ccy = currency(data.get("currency"))
    period = iso_date(data.get("period"), "period")
    if not period.endswith("-01"):
        raise APIError(422, "period must be the first day of the accounting month")
    rate = number(data.get("fx_rate", "1"), "fx_rate", "0.00000001", "1000000")
    if ccy == base and rate != 1:
        raise APIError(422, "Base currency must use fx_rate=1")
    if ccy != base:
        iso_date(data.get("fx_as_of"), "fx_as_of")
        text(data.get("fx_source"), "fx_source", 500)
        if "fx_rate" not in data:
            raise APIError(422, "Foreign currency requires an explicit exchange rate")
    return {**data, "id": identifier(data.get("id"), "id"), "amount": money(value),
            "currency": ccy, "period": period, "fx_rate": str(rate),
            "source_ref": text(data.get("source_ref"), "source_ref", 500),
            "description": text(data.get("description", "Imported entry"), "description", 500)}

def base_amount(row):
    return (Decimal(row["amount"]) * Decimal(row["fx_rate"])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

def report(rows, base):
    totals = {k: {c: Decimal(0) for c in sorted(COSTS | {"revenue"})}
              for k in ("baseline", "budget", "actual", "forecast")}
    periods = {}
    for r in rows:
        amount = base_amount(r)
        totals[r["kind"]][r["category"]] += amount
        if r["kind"] == "actual":
            p = periods.setdefault(r["period"], {"revenue": Decimal(0), "cash_cost": Decimal(0), "opex": Decimal(0), "capex": Decimal(0)})
            if r["category"] == "revenue":
                p["revenue"] += amount
            else:
                p["cash_cost"] += amount
                p["capex" if r["category"] == "capex" else "opex"] += amount
    budget = sum(totals["budget"][c] for c in COSTS)
    actual = sum(totals["actual"][c] for c in COSTS)
    forecast = sum(totals["forecast"][c] for c in COSTS)
    # Forecast entries are explicitly the remaining forecast, not a second full-year total.
    return {"currency": base, "budget_cost": money(budget), "actual_cost": money(actual),
            "remaining_forecast": money(forecast), "estimate_at_completion": money(actual + forecast),
            "budget_variance_at_completion": money(budget - actual - forecast),
            "actual_revenue": money(totals["actual"]["revenue"]),
            "by_kind": {k: {c: money(v) for c, v in cs.items()} for k, cs in totals.items()},
            "periods": [{"period": p, **{k: money(v) for k, v in values.items()},
                         "net_cash": money(values["revenue"] - values["cash_cost"])} for p, values in sorted(periods.items())],
            "basis": "Management cash model. Forecast means remaining cost. Amounts use the supplied VAT basis; no tax, depreciation or accrual calculations."}

def scenario(data):
    def integer(name, default, lo, hi):
        v = data.get(name, default)
        if type(v) is not int or not lo <= v <= hi:
            raise APIError(422, f"Invalid {name}")
        return v
    months = integer("months", 24, 1, 120)
    delay = integer("delay_months", 0, 0, 120)
    initial = number(data.get("initial_cost", "0"), "initial_cost")
    saving = number(data.get("monthly_saving", "0"), "monthly_saving")
    running = number(data.get("monthly_running_cost", "0"), "monthly_running_cost")
    tsa = number(data.get("monthly_tsa_cost", "0"), "monthly_tsa_cost")
    annual = number(data.get("annual_discount_rate", "0.10"), "annual_discount_rate", "0", "1")
    monthly = (Decimal(1) + annual) ** (Decimal(1) / Decimal(12)) - 1
    cumulative = -initial
    npv = -initial
    outflows = initial
    inflows = Decimal(0)
    payback = None
    flows = []
    for m in range(1, months + 1):
        income = saving if m > delay else Decimal(0)
        cost = running + (tsa if m <= delay else Decimal(0))
        net = income - cost
        cumulative += net
        npv += net / ((1 + monthly) ** m)
        outflows += cost
        inflows += income
        flows.append({"month": m, "inflow": money(income), "outflow": money(cost), "net": money(net), "cumulative": money(cumulative)})
    # Sustained payback: do not claim payback if a later period falls negative again.
    for i, f in enumerate(flows):
        if Decimal(f["cumulative"]) >= 0 and all(Decimal(x["cumulative"]) >= 0 for x in flows[i:]):
            payback = f["month"]
            break
    return {"currency": currency(data.get("currency", "GBP")), "net_benefit": money(cumulative),
            "npv": money(npv), "payback_month": payback,
            "roi_percent": money((inflows-outflows)/outflows*100) if outflows else None,
            "tsa_delay_cost": money(tsa * min(delay, months)), "cashflows": flows,
            "assumptions": {"horizon_months": months, "delay_months": delay, "annual_discount_rate": str(annual),
                            "saving_begins_after_delay": True, "running_cost_starts_month_one": True},
            "status": "scenario_estimate"}
