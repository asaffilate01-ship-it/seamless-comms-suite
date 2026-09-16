"""Provider-neutral planning estimates. Prices are operator inputs, never live quotes."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


def number(value, name, upper=None):
    if isinstance(value, bool):
        raise ValueError(f'{name} must be numeric')
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f'{name} must be numeric') from None
    if not result.is_finite() or result < 0 or (upper is not None and result > upper):
        raise ValueError(f'{name} outside allowed range')
    return result


def money(value):
    return str(value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


def forecast(*, users, tasks_per_user_day, working_days, models, currency,
             fixed_monthly='0', tools_monthly='0', review_monthly='0',
             contingency_fraction='0', successful_fraction='1'):
    """Each model row describes calls per task, including bounded agent turns.

    expected_retry_fraction adds repeated model calls to that row. Cached tokens
    are a subset of total input tokens. Cache writes and other provider charges
    must be priced separately in tools_monthly or a separate model row.
    """
    if currency not in {'GBP', 'USD', 'EUR'}:
        raise ValueError('Use GBP, USD or EUR and convert all rates to that currency first')
    tasks = number(users, 'users') * number(tasks_per_user_day, 'tasks') * number(working_days, 'days', 31)
    success = number(successful_fraction, 'successful_fraction', 1)
    if not models:
        raise ValueError('At least one model row required')
    rows, total = [], Decimal(0)
    for row in models:
        if not isinstance(row.get('name'), str) or not row['name'].strip():
            raise ValueError('Model name required')
        calls = tasks * number(row['calls_per_task'], 'calls') * (1 + number(row.get('expected_retry_fraction', 0), 'retry', 1))
        inp = number(row['input_tokens_per_call'], 'input')
        cached = number(row.get('cached_input_tokens_per_call', 0), 'cache')
        if cached > inp:
            raise ValueError('Cached input cannot exceed total input')
        out = number(row['output_tokens_per_call'], 'output')
        cost = calls * ((inp-cached)*number(row['input_price_per_million'], 'input price')
                        + cached*number(row.get('cached_price_per_million', row['input_price_per_million']), 'cached price')
                        + out*number(row['output_price_per_million'], 'output price')) / Decimal(1000000)
        total += cost
        rows.append({'model': row['name'], 'expected_calls': str(calls), 'cost': money(cost)})
    subtotal = total + number(fixed_monthly, 'fixed') + number(tools_monthly, 'tools') + number(review_monthly, 'review')
    budget = subtotal * (1 + number(contingency_fraction, 'contingency', 1))
    completed = tasks * success
    return {'currency': currency, 'monthly_tasks': str(tasks), 'model_rows': rows,
            'model_cost': money(total), 'subtotal': money(subtotal), 'budget_with_contingency': money(budget),
            'cost_per_successful_task': money(budget/completed) if completed else None,
            'status': 'planning_estimate', 'prices': 'operator_supplied'}
