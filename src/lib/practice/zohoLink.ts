/** Small pure helpers behind the Zoho Books setup screen, kept apart so each rule can be tested. */

const NOISE = new Set(["pvt", "private", "ltd", "limited", "llp", "co", "company", "and", "the", "inc", "opc", "associates", "&"]);
const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !NOISE.has(t));

/** How alike two business names are, 0 to 1, ignoring "Pvt Ltd" style endings. */
export function nameLikeness(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / (ta.size + tb.size - hit);
}

/**
 * The Zoho organisation that is clearly this client, or null. Only a confident, unambiguous
 * match is suggested; the person still sees and confirms it, so a wrong guess cannot link.
 */
export function suggestOrganisation<T extends { id: string; name: string }>(clientName: string, orgs: T[]): T | null {
  const scored = orgs.map((o) => ({ o, s: nameLikeness(clientName, o.name) })).sort((x, y) => y.s - x.s);
  const best = scored[0];
  if (!best || best.s < 0.5) return null;
  if (scored[1] && scored[1].s >= best.s - 0.1) return null;
  return best.o;
}

export interface MonthOption {
  value: string;
  label: string;
}

/** The last `count` months, newest first. The current month is offered but marked as still running. */
export function monthOptions(now: Date, count = 18): MonthOption[] {
  const out: MonthOption[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
    out.push({ value, label: i === 0 ? `${label} (so far)` : label });
  }
  return out;
}

export const defaultMonth = (now: Date) => monthOptions(now, 2)[1]!.value;

export interface OwedInvoice {
  number: string;
  customer: string;
  balance: number;
  dueDate: string | null;
}

export function owedSummary(invoices: OwedInvoice[], today: string) {
  const overdue = invoices.filter((i) => i.dueDate && i.dueDate < today);
  const sum = (l: OwedInvoice[]) => Math.round(l.reduce((s, i) => s + i.balance, 0) * 100) / 100;
  const byCustomer = new Map<string, number>();
  for (const i of invoices) byCustomer.set(i.customer, (byCustomer.get(i.customer) ?? 0) + i.balance);
  const top = [...byCustomer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([customer, balance]) => ({ customer, balance: Math.round(balance * 100) / 100 }));
  return { count: invoices.length, total: sum(invoices), overdueCount: overdue.length, overdueTotal: sum(overdue), top };
}

/** 0 connect, 1 link a client, 2 pull a month, 3 done. */
export function setupStage(s: { connected: boolean; links: { last_synced_at: string | null }[] }): 0 | 1 | 2 | 3 {
  if (!s.connected) return 0;
  if (!s.links.length) return 1;
  return s.links.some((l) => l.last_synced_at) ? 3 : 2;
}
