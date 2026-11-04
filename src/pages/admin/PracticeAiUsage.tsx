import { useEffect, useState } from "react";
import { AlertTriangle, Bot, Coins, Cpu, Gauge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "./AdminDashboardPage";
import { EmptyState } from "@/components/admin/EmptyState";

interface Overview {
  totals: { calls: number; errors: number; input_tokens: number; output_tokens: number; cost_usd: number; avg_latency_ms: number; calls_without_usage: number };
  by_day: { day: string; calls: number; errors: number; cost_usd: number }[];
  by_model: { provider: string; model: string; purpose: string; calls: number; errors: number; input_tokens: number; output_tokens: number; cost_usd: number; avg_latency_ms: number }[];
  by_firm: { ca_firm_id: string | null; firm_name: string; calls: number; errors: number; cost_usd: number }[];
}

const usd = (n: number) => `$${Number(n ?? 0).toFixed(Number(n) < 1 ? 4 : 2)}`;
const num = (n: number) => Number(n ?? 0).toLocaleString("en-IN");
const th: React.CSSProperties = { padding: "12px 16px", textAlign: "left", fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 13 };
const td: React.CSSProperties = { padding: "10px 16px", fontFamily: "Roboto, sans-serif", fontSize: 13.5 };

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card style={{ minHeight: 110 }}>
      <div className="flex items-center gap-3">{icon}<span style={{ fontSize: 13, opacity: 0.65 }}>{label}</span></div>
      <div className="mt-3" style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 30 }}>{value}</div>
    </Card>
  );
}

/** Cost and usage of the document-reading AI and OCR (the practice agents), last 30 days. */
export default function PracticeAiUsage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: d, error: e } = await (supabase.rpc as unknown as (fn: string, a: object) => Promise<{ data: Overview | null; error: { message: string } | null }>)
        .call(supabase, "admin_practice_ai_overview", { p_days: 30 });
      if (cancelled) return;
      if (e) setError(/does not exist|schema cache/i.test(e.message) ? "Run the latest database migration (20261108100000_ai_cost_tracking.sql) to turn this on." : e.message);
      else setData(d);
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) return <Card><EmptyState icon={AlertTriangle} title="Document AI usage unavailable" hint={error} /></Card>;
  if (!data) return <Card><div className="p-6" style={{ opacity: 0.6 }}>Loading…</div></Card>;
  const t = data.totals;
  if (!t.calls) return <Card><EmptyState icon={Bot} title="No document AI calls yet" hint="Reads of photos, scans and statements, and report insights, will appear here." /></Card>;
  const errRate = t.calls ? (t.errors / t.calls) * 100 : 0;
  return (
    <div>
      <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <Stat label="Calls (30d)" value={num(t.calls)} icon={<Bot size={20} color="#8B6914" />} />
        <Stat label="Est. cost (USD)" value={usd(t.cost_usd)} icon={<Coins size={20} color="#8B6914" />} />
        <Stat label="Tokens in / out" value={`${num(t.input_tokens)} / ${num(t.output_tokens)}`} icon={<Cpu size={20} color="#8B6914" />} />
        <Stat label={`Failed calls (${errRate.toFixed(1)}%)`} value={num(t.errors)} icon={<AlertTriangle size={20} color="#C41E1E" />} />
        <Stat label="Avg response" value={t.avg_latency_ms ? `${(t.avg_latency_ms / 1000).toFixed(1)}s` : "-"} icon={<Gauge size={20} color="#8B6914" />} />
      </div>
      {t.calls_without_usage > 0 && (
        <p className="mt-3" style={{ fontSize: 13, color: "#8B6914" }}>
          {num(t.calls_without_usage)} successful calls reported no token counts (older calls, or a provider that does not send them), so their cost is not included.
        </p>
      )}
      <Card style={{ padding: 0, overflow: "hidden", marginTop: 24 }}>
        <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "rgba(139,105,20,0.06)" }}>{["Provider", "Model", "Purpose", "Calls", "Failed", "Tokens in", "Tokens out", "Est. cost", "Avg"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {data.by_model.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid rgba(139,105,20,0.12)" }}>
                  <td style={td}>{r.provider}</td><td style={td}>{r.model}</td><td style={td}>{r.purpose}</td>
                  <td style={td}>{num(r.calls)}</td><td style={td}>{num(r.errors)}</td>
                  <td style={td}>{num(r.input_tokens)}</td><td style={td}>{num(r.output_tokens)}</td>
                  <td style={td}>{usd(r.cost_usd)}</td><td style={td}>{r.avg_latency_ms ? `${(r.avg_latency_ms / 1000).toFixed(1)}s` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <h4 className="mt-8 mb-3" style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 15 }}>Top firms by AI spend</h4>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "rgba(139,105,20,0.06)" }}>{["Firm", "Calls", "Failed", "Est. cost"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {data.by_firm.map((r, i) => (
                <tr key={r.ca_firm_id ?? i} style={{ borderTop: "1px solid rgba(139,105,20,0.12)" }}>
                  <td style={td}>{r.firm_name}</td><td style={td}>{num(r.calls)}</td><td style={td}>{num(r.errors)}</td><td style={td}>{usd(r.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-3" style={{ fontSize: 12.5, opacity: 0.6 }}>Costs are estimates from list prices and the token counts providers report (change rates with AI_PRICING_JSON). OCR.space is counted as calls; set OCR_SPACE_COST_USD_PER_CALL if you are on a paid plan.</p>
    </div>
  );
}
