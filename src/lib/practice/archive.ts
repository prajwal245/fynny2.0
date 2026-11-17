/**
 * Archiving a client takes it out of the workspace and out of the month's active-client count; nothing is deleted. A client can be
 * restored by the firm for 14 days after it was archived. After that it takes FynHelp support, because restoring brings the client
 * (and its work) back into the count and the plan.
 */
export const RESTORE_DAYS = 14;
const DAY = 86_400_000;

export interface RestoreWindow {
  /** Can the firm restore it now? */
  restorable: boolean;
  /** Whole days still left, 0 on the last day, null when the archive date is not known. */
  daysLeft: number | null;
  /** When the window closes (ISO), when known. */
  until: string | null;
}

export function restoreWindow(archivedAt: string | null | undefined, now: Date = new Date()): RestoreWindow {
  const t = archivedAt ? Date.parse(archivedAt) : NaN;
  // Unknown date (archived before the time was recorded and not found in the history): offer the restore rather than lock it.
  if (!Number.isFinite(t)) return { restorable: true, daysLeft: null, until: null };
  const until = t + RESTORE_DAYS * DAY;
  const left = until - now.getTime();
  return { restorable: left > 0, daysLeft: left > 0 ? Math.floor(left / DAY) : 0, until: new Date(until).toISOString() };
}

/** "Can be restored for 9 more days" / "Can be restored today" / "Restore window ended". */
export function restoreLabel(w: RestoreWindow): string {
  if (!w.restorable) return `Archived more than ${RESTORE_DAYS} days ago. Ask FynHelp support to restore it.`;
  if (w.daysLeft === null) return "Can be restored";
  if (w.daysLeft === 0) return "Can be restored until today ends";
  return `Can be restored for ${w.daysLeft} more day${w.daysLeft === 1 ? "" : "s"}`;
}
