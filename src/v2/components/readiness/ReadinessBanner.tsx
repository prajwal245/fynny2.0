import { useEffect, useState } from "react";
import { ArrowRight, Lock } from "lucide-react";
import { V } from "../../ui";
import { getPracticeReadiness } from "@/lib/practice/practice.functions";
import { allChecks } from "@/lib/practice/readiness/model";
import { fyOf } from "./DataNeeded";

/** A slim line at the top of a review screen: how many checks are waiting for data, with the way to fix it. Shows nothing when none are. */
export default function ReadinessBanner({ clientId, month, onOpen }: { clientId: string; month: string; onOpen: () => void }) {
  const [blocked, setBlocked] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void getPracticeReadiness({ data: { business_id: clientId, month, fy: fyOf(month) } }).then((r) => { if (live) setBlocked(allChecks(r.inputs).filter((c) => c.status === "blocked").length); }).catch(() => undefined);
    return () => { live = false; };
  }, [clientId, month]);
  if (!blocked) return null;
  return (
    <button onClick={onOpen} data-testid="readiness-banner" style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", marginBottom: 16, borderRadius: 16, border: `1px solid ${V.line}`, background: V.warnBg, color: V.warnFg, font: "inherit", fontSize: 13.5, cursor: "pointer", textAlign: "left" }}>
      <Lock size={16} />
      <span><b>{blocked} check{blocked === 1 ? " is" : "s are"} waiting for data.</b> They show as blocked, never as passed, until it arrives.</span>
      <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center", fontWeight: 650 }}>See what is missing <ArrowRight size={14} /></span>
    </button>
  );
}
