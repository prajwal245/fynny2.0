/**
 * What FynHelp handled this month, in plain numbers a partner can check: share matched automatically, decisions left, and an estimate
 * of hours saved with its assumption shown. Nothing is made up: with no bank lines it says so.
 */
import { useEffect, useState } from "react";
import { getPracticeValue } from "@/lib/practice/practice.functions";
import type { ValueSummary } from "@/lib/practice/value";
import { Card, V } from "../ui";

export function ValueCard({ period, businessId }: { period: string; businessId?: string }) {
  const [v, setV] = useState<ValueSummary | null | "error">(null);
  useEffect(() => {
    let live = true;
    setV(null);
    getPracticeValue({ data: { period, ...(businessId ? { business_id: businessId } : {}) } })
      .then((r) => live && setV(r))
      .catch(() => live && setV("error"));
    return () => {
      live = false;
    };
  }, [period, businessId]);

  if (v === null || v === "error" || v.autoPct === null) return null;
  const stat = (label: string, value: string, hint?: string) => (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontSize: 11.5, letterSpacing: ".08em", textTransform: "uppercase", color: V.muted, fontWeight: 600 }}>{label}</div>
      <div className="num" style={{ fontSize: 26, fontWeight: 600, color: V.ink, letterSpacing: "-0.02em" }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: V.muted }}>{hint}</div>}
    </div>
  );
  return (
    <Card data-testid="value-card" style={{ marginBottom: 18 }}>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>What FynHelp handled in {period}</div>
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
        {stat("Matched automatically", `${v.autoPct}%`, `${v.autoMatched} of ${v.workLines} bank lines`)}
        {stat("Left for a person", String(v.decisionsLeft), v.decisionsLeft === 1 ? "decision" : "decisions")}
        {v.setAside > 0 && stat("Set aside", String(v.setAside), "transfers and reversals")}
        {stat("Hours saved (estimate)", String(v.hoursSaved), `at ${v.secondsPerLine} seconds a line by hand`)}
      </div>
    </Card>
  );
}
