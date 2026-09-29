/**
 * Additive dashboard card — live task counts for the firm, each deep-linking
 * into the Tasks board with the matching tab pre-selected.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { CA, CACard } from "@/components/ca/portalUi";

interface Counts { open: number; overdue: number; breached: number; today: number }

export function CATasksSummaryCard() {
  const { firmId } = useCAPortal();
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    if (!firmId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("ca_tasks")
        .select("status, due_date, sla_hours, created_at")
        .eq("ca_firm_id", firmId)
        .neq("status", "done")
        .limit(1000);
      if (cancelled) return;
      const rows = (data ?? []) as { status: string; due_date: string | null; sla_hours: number | null; created_at: string }[];
      const today = new Date().toISOString().slice(0, 10);
      setCounts({
        open: rows.length,
        overdue: rows.filter((r) => r.due_date && r.due_date < today).length,
        breached: rows.filter((r) => r.sla_hours && Date.now() - new Date(r.created_at).getTime() > r.sla_hours * 3_600_000).length,
        today: rows.filter((r) => r.due_date === today).length,
      });
    })();
    return () => { cancelled = true; };
  }, [firmId]);

  const tiles: { label: string; value: number; tab: string; tone: string }[] = [
    { label: "Open", value: counts?.open ?? 0, tab: "all", tone: CA.ink },
    { label: "Overdue", value: counts?.overdue ?? 0, tab: "overdue", tone: counts?.overdue ? CA.red : CA.ink },
    { label: "SLA breached", value: counts?.breached ?? 0, tab: "overdue", tone: counts?.breached ? CA.red : CA.ink },
    { label: "Due today", value: counts?.today ?? 0, tab: "today", tone: CA.ink },
  ];

  return (
    <CACard style={{ padding: 18, marginTop: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div style={{ fontFamily: CA.serif, fontSize: 15, fontWeight: 700, color: CA.ink }}>Tasks</div>
        <Link to="/ca/tasks" style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.teal, textDecoration: "none", fontWeight: 600 }}>
          Open board →
        </Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {tiles.map((t) => (
          <Link
            key={t.label}
            to="/ca/tasks"
            search={{ tab: t.tab as "all" | "mine" | "overdue" | "today" }}
            style={{
              textDecoration: "none", padding: "12px 14px", borderRadius: 10,
              border: `0.5px solid ${CA.line}`, background: "#fff", display: "block",
            }}
          >
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: CA.faint, fontFamily: CA.sans }}>
              {t.label}
            </div>
            <div style={{ fontFamily: CA.mono, fontSize: 22, fontWeight: 700, color: t.tone, marginTop: 4 }}>
              {counts ? t.value : "—"}
            </div>
          </Link>
        ))}
      </div>
    </CACard>
  );
}
