export type Deal = {
  id: string; pipeline_id: string; stage_id: string; title: string;
  status: string; amount: number | string | null; currency: string | null;
  probability_percent: number | null; expected_close_at: string | null;
  updated_at: string; person_id: string | null;
};
export type Stage = { id: string; name: string; position: number; is_closed_won: boolean; is_closed_lost: boolean };
export type Pipeline = { id: string; name: string; is_default: boolean; stages: Stage[] };
export type FollowUp = { updated_at: string; id: string; title: string; status: string; due_at: string | null; related_type: string | null; related_id: string | null };

export function forecastByCurrency(deals: Deal[]) {
  const totals = new Map<string, { currency: string; amount: number; weighted: number; count: number }>();
  for (const deal of deals.filter(d => d.status === 'open')) {
    const currency = deal.currency || 'Unspecified';
    const total = totals.get(currency) ?? { currency, amount: 0, weighted: 0, count: 0 };
    const amount = Number(deal.amount ?? 0);
    if (!Number.isFinite(amount)) continue;
    total.amount += amount;
    total.weighted += amount * Math.min(100, Math.max(0, deal.probability_percent ?? 0)) / 100;
    total.count++;
    totals.set(currency, total);
  }
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}
export function nextFollowUp(tasks: FollowUp[], dealId: string) {
  return tasks.filter(t => t.related_type === 'opportunity' && t.related_id === dealId &&
    ['open', 'in_progress'].includes(t.status) && t.due_at && Number.isFinite(Date.parse(t.due_at)))
    .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!))[0];
}
export function formatDealMoney(value: number | string, currency: string | null) {
  if (!currency || currency === 'Unspecified') return `${Number(value).toFixed(2)} (currency unspecified)`;
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value)); }
  catch { return `${currency} ${Number(value).toFixed(2)}`; }
}
