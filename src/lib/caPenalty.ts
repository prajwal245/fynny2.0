/** Late-fee / interest estimate for a missed statutory filing, in rupees. */
export function penaltyEstimate(eventType: string, dueDate: string, asOf = new Date()): number {
  const due = new Date(dueDate).getTime();
  const days = Math.floor((asOf.getTime() - due) / 86_400_000);
  if (!Number.isFinite(days) || days <= 0) return 0;
  const t = (eventType ?? "").toUpperCase();
  if (t.startsWith("GSTR") || t.startsWith("GST")) return Math.min(days * 50, 10_000); // Rs 50/day, capped
  if (t.startsWith("TDS")) {
    const months = Math.max(1, Math.ceil(days / 30));
    return Math.round(months * 0.015 * 100_000 * 100) / 100; // 1.5% per month on a Rs 1L reference base
  }
  if (t === "ITR") return 5_000;
  return days * 100;
}
