import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { MessageCircle, Send, Lock } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card } from "./AdminDashboardPage";
import { supabase } from "@/integrations/supabase/client";
import { LiveBadge } from "@/components/admin/LiveBadge";
import { useRealtime } from "@/hooks/useRealtime";
import { EmptyCard } from "@/components/intelligence/EmptyCard";


const fmtINR = (n: number) =>
  n >= 10000000 ? `₹${(n / 10000000).toFixed(1)}Cr`
  : n >= 100000 ? `₹${(n / 100000).toFixed(1)}L`
  : n >= 1000 ? `₹${(n / 1000).toFixed(1)}K`
  : `₹${n}`;

type Status = "excellent" | "good" | "neutral" | "warning";
const statusColors: Record<Status, { bg: string; border: string; text: string }> = {
  excellent: { bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.3)", text: "#0F7B4F" },
  good:      { bg: "rgba(139,105,20,0.12)", border: "rgba(139,105,20,0.3)", text: "#8B6914" },
  neutral:   { bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.3)", text: "#3B82F6" },
  warning:   { bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.3)", text: "#B45309" },
};

const strategic = [
  { label: "Runway" },
  { label: "Burn Rate" },
  { label: "Lifetime Value" },
  { label: "CAC" },
  { label: "LTV : CAC" },
  { label: "Gross Margin" },
];


type Query = {
  id: string; user: string; type: string;
  priority: "urgent" | "high" | "medium" | "low";
  subject: string; message: string; timestamp: string; status: string;
};

const PRIORITY_STYLE: Record<Query["priority"], { bg: string; fg: string }> = {
  urgent: { bg: "rgba(196,30,30,0.15)", fg: "#C41E1E" },
  high:   { bg: "rgba(251,191,36,0.18)", fg: "#B45309" },
  medium: { bg: "rgba(59,130,246,0.15)", fg: "#1D4ED8" },
  low:    { bg: "rgba(23,18,8,0.08)",   fg: "rgba(23,18,8,0.6)" },
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export default function AdminCeoViewPage() {
  const nav = useNavigate();
  const [selectedQuery, setSelectedQuery] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [customerQueries, setCustomerQueries] = useState<Query[]>([]);
  const [aiCostThisMonth, setAiCostThisMonth] = useState<number | null>(null);

  const fetchSupportFeed = useCallback(async () => {
    const { data: tickets } = await supabase
      .from("support_tickets")
      .select("id, subject, description, priority, status, category, created_at, business_id")
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(8);

    let bizMap: Record<string, string> = {};
    const bizIds = Array.from(new Set((tickets ?? []).map((t: any) => t.business_id).filter(Boolean)));
    if (bizIds.length) {
      const { data: bizs } = await supabase.from("businesses").select("id,business_name").in("id", bizIds);
      bizMap = Object.fromEntries((bizs ?? []).map((b: any) => [b.id, b.business_name]));
    }

    setCustomerQueries(((tickets ?? []) as any[]).map((t) => ({
      id: t.id,
      user: bizMap[t.business_id] ?? "User",
      type: t.category ?? "query",
      priority: (["urgent", "high", "medium", "low"].includes(t.priority) ? t.priority : "medium") as Query["priority"],
      subject: t.subject ?? "(no subject)",
      message: t.description ?? "",
      timestamp: timeAgo(t.created_at),
      status: t.status,
    })));
  }, []);

  const fetchAiCost = useCallback(async () => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const { data: aiLogs } = await supabase
      .from("ai_usage_logs")
      .select("cost_usd")
      .gte("created_at", monthStart);
    const total = (aiLogs ?? []).reduce((sum: number, log: any) => sum + Number(log.cost_usd ?? 0), 0);
    setAiCostThisMonth(total);
  }, []);

  useEffect(() => { fetchSupportFeed(); fetchAiCost(); }, [fetchSupportFeed, fetchAiCost]);

  const liveStatus = useRealtime(
    "ceo_support_feed",
    [{ table: "support_tickets", event: "*" }],
    () => { fetchSupportFeed(); },
  );

  const handleSend = (id: string) => {
    if (!replyText.trim()) return;
    nav(`/admin/support/${id}`);
    setReplyText("");
    setSelectedQuery(null);
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
        <PageHeader title="CEO Strategic View" subtitle="High-level platform intelligence & customer pulse" />
        <div className="flex items-center gap-2 mt-2">
          <LiveBadge status={liveStatus} />
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{
              background: "linear-gradient(135deg, rgba(196,30,30,0.12), rgba(139,105,20,0.12))",
              border: "1px solid rgba(139,105,20,0.35)",
              fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 11,
              color: "#8B6914", letterSpacing: 0.6,
            }}>
            <Lock size={12} /> SUPER ADMIN ONLY
          </span>
        </div>
      </div>

      {/* Strategic metrics — honest empty states, awaiting live wiring */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        {strategic.map((s) => (
          <EmptyCard key={s.label} title={s.label} hint="Computed from live financial data once connected." />
        ))}
        <div className="p-4 rounded-xl" style={{ background: statusColors.neutral.bg, border: `1px solid ${statusColors.neutral.border}` }}>
          <div style={{ fontFamily: "Roboto, sans-serif", fontSize: 11, color: "hsl(var(--fyn-ink) / 0.65)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
            AI Cost (This Month)
          </div>
          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: statusColors.neutral.text }}>
            {aiCostThisMonth === null ? "…" : `$${aiCostThisMonth.toFixed(2)}`}
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <EmptyCard title="Monthly Targets vs Actuals" hint="Set targets in Settings to track performance here." />
        </Card>
        <Card>
          <EmptyCard title="6-Month Cash Flow Projection" hint="Connect your bank accounts to generate a real cash flow forecast." />
        </Card>
      </div>


      <h3 className="mt-10 mb-4" style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 20, color: "hsl(var(--fyn-ink))" }}>
        Customer Support Feed
      </h3>
      <Card style={{ padding: 0 }}>
        <div className="grid lg:grid-cols-3" style={{ minHeight: 480 }}>
          {/* Query list */}
          <div className="lg:col-span-2 p-5 space-y-3" style={{ borderRight: "1px solid rgba(23,18,8,0.08)" }}>
            {customerQueries.length === 0 && (
              <div className="p-8 text-center" style={{ fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.5)" }}>
                No open tickets right now.
              </div>
            )}
            {customerQueries.map((q) => {
              const isSel = selectedQuery === q.id;
              const ps = PRIORITY_STYLE[q.priority];
              return (
                <div key={q.id} onClick={() => setSelectedQuery(q.id)}
                  className="p-4 rounded-xl cursor-pointer transition-all"
                  style={{
                    background: isSel ? "rgba(139,105,20,0.1)" : "rgba(255,255,255,0.6)",
                    border: `1px solid ${isSel ? "rgba(139,105,20,0.35)" : "rgba(23,18,8,0.1)"}`,
                  }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span style={{ background: ps.bg, color: ps.fg, padding: "2px 8px", borderRadius: 4, fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: 0.4 }}>
                        {q.priority.toUpperCase()}
                      </span>
                      <span style={{ background: "rgba(23,18,8,0.06)", color: "hsl(var(--fyn-ink) / 0.7)", padding: "2px 8px", borderRadius: 4, fontFamily: "Roboto, sans-serif", fontSize: 11, textTransform: "capitalize" }}>
                        {q.type}
                      </span>
                    </div>
                    <span style={{ fontFamily: "Roboto, sans-serif", fontSize: 11, color: "hsl(var(--fyn-ink) / 0.5)" }}>{q.timestamp}</span>
                  </div>
                  <div style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 15, color: "hsl(var(--fyn-ink))", marginBottom: 4 }}>
                    {q.subject}
                  </div>
                  <div style={{ fontFamily: "Roboto, sans-serif", fontSize: 12, color: "hsl(var(--fyn-gold))", marginBottom: 6, fontWeight: 500 }}>
                    {q.user}
                  </div>
                  <div style={{ fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.7)", lineHeight: 1.5 }}>
                    {q.message}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reply */}
          <div className="p-5">
            {selectedQuery ? (
              <div>
                <h4 style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 15, color: "hsl(var(--fyn-ink))", marginBottom: 12 }}>
                  Quick Reply
                </h4>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your response..."
                  rows={8}
                  className="w-full rounded-lg px-3 py-2.5 mb-3 resize-none"
                  style={{ border: "1px solid rgba(23,18,8,0.15)", fontFamily: "Roboto, sans-serif", fontSize: 13, lineHeight: 1.5, background: "#fff" }}
                />
                <button
                  onClick={() => handleSend(selectedQuery)}
                  disabled={!replyText.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg"
                  style={{
                    background: replyText.trim() ? "linear-gradient(135deg,#C41E1E 0%,#8B6914 100%)" : "rgba(23,18,8,0.1)",
                    color: replyText.trim() ? "#fff" : "rgba(23,18,8,0.4)",
                    border: "none", cursor: replyText.trim() ? "pointer" : "not-allowed",
                    fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 14,
                  }}
                >
                  <Send size={16} /> Open Ticket to Reply
                </button>
                <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(23,18,8,0.1)" }}>
                  <button
                    onClick={() => toast.info("Escalated to support team")}
                    className="w-full py-2 rounded-lg"
                    style={{
                      background: "transparent", border: "1px solid rgba(196,30,30,0.3)",
                      color: "#C41E1E", fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer",
                    }}
                  >
                    Escalate to Team
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 rounded-xl text-center" style={{ background: "rgba(23,18,8,0.03)", border: "1px solid rgba(23,18,8,0.08)" }}>
                <MessageCircle size={48} color="hsl(var(--fyn-ink) / 0.3)" style={{ margin: "0 auto 16px" }} />
                <p style={{ fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.5)" }}>
                  Select a query to reply
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

const cardTitle: React.CSSProperties = {
  fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 18, color: "hsl(var(--fyn-ink))", marginBottom: 16,
};
