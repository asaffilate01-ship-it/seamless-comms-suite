export type CaseSummary = {
  id: string; title: string; status: string; priority: string;
  assignee: string | null; created_at: string; updated_at: string;
};
export type Queue = 'active' | 'all' | 'urgent' | 'unassigned' | 'waiting' | 'closed';
export function canSubmit(role: string | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'agent';
}
export function normaliseTitle(title: string): string {
  const value = title.trim().replace(/\s+/g, ' ');
  if (value.length < 2 || value.length > 160) throw new Error('Enter a summary between 2 and 160 characters.');
  return value;
}
export function selectQueue<T extends CaseSummary>(rows: T[], queue: Queue, search = ''): T[] {
  const q = search.trim().toLowerCase();
  return rows.filter(row => {
    if (q && !`${row.title} ${row.id}`.toLowerCase().includes(q)) return false;
    if (queue === 'all') return true;
    if (queue === 'closed') return row.status === 'closed';
    if (row.status === 'closed') return false;
    if (queue === 'urgent') return row.priority === 'urgent' || row.status === 'escalated';
    if (queue === 'unassigned') return !row.assignee;
    if (queue === 'waiting') return row.status === 'waiting_customer';
    return true;
  });
}
/** Transparent operational rules, never an AI decision or an SLA breach claim. */
export function attentionReasons(row: CaseSummary, now: number): string[] {
  if (row.status === 'closed') return [];
  const reasons: string[] = [];
  if (row.priority === 'urgent') reasons.push('Marked urgent by staff');
  if (row.status === 'escalated') reasons.push('Escalated for review');
  if (!row.assignee) reasons.push('No case owner assigned');
  const updated = Date.parse(row.updated_at);
  if (Number.isFinite(updated) && now - updated >= 72 * 60 * 60 * 1000) reasons.push('No recorded update for 72 hours');
  return reasons;
}
