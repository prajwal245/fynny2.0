/** Pure selection rules for tables with checkboxes: one row, a shift-click range, select all. */

export type SelectState = "none" | "some" | "all";

export function toggleOne(sel: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(sel);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Shift-click: every row between the last-clicked row and this one joins the selection (in table order). */
export function selectRange(order: readonly string[], sel: ReadonlySet<string>, anchor: string | null, id: string): Set<string> {
  const a = anchor ? order.indexOf(anchor) : -1;
  const b = order.indexOf(id);
  if (a < 0 || b < 0) return toggleOne(sel, id);
  const [from, to] = a < b ? [a, b] : [b, a];
  const next = new Set(sel);
  for (let i = from; i <= to; i++) next.add(order[i]!);
  return next;
}

export function selectState(order: readonly string[], sel: ReadonlySet<string>): SelectState {
  if (!order.length) return "none";
  let n = 0;
  for (const id of order) if (sel.has(id)) n++;
  return n === 0 ? "none" : n === order.length ? "all" : "some";
}

/** Drops ids that are no longer in the table (a row was resolved, or a filter changed). */
export function prune(sel: ReadonlySet<string>, order: readonly string[]): Set<string> {
  const here = new Set(order);
  const next = new Set<string>();
  for (const id of sel) if (here.has(id)) next.add(id);
  return next.size === sel.size ? (sel as Set<string>) : next;
}
