import { useRevenueAlerts } from "../DataSource";
import { ACCENT } from "../_primitives";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

export default function RevenueAlertsSection() {
  const { data, isLoading } = useRevenueAlerts();
  const qc = useQueryClient();
  const rows = (data ?? [])
    .filter((r: any) => r.is_active)
    .sort((a: any, b: any) => {
      const order: Record<string, number> = { critical: 1, warning: 2, info: 3, opportunity: 4 };
      return (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
    });

  if (isLoading) return <div className="h-40 bg-slate-50 animate-pulse rounded-md" />;
  if (rows.length === 0) return null;

  const ack = async (id: string) => {
    const { error } = await (supabase as any).from("revenue_alerts").update({ acknowledged_at: new Date().toISOString(), is_active: false }).eq("id", id);
    if (error) { toast({ title: "Could not acknowledge", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["intel", "revenue_alerts"] });
  };

  return (
    <div className="space-y-3">
      <h2 className="font-serif text-xl text-fyn-ink font-semibold pt-2">Revenue Alerts</h2>
      {rows.map((r: any) => {
        const isPositive = r.severity === "opportunity" || r.severity === "info";
        const border = isPositive ? ACCENT.green : ACCENT.red;
        const bg = isPositive ? "rgba(16,185,129,0.06)" : "rgba(169,56,56,0.06)";
        return (
          <div key={r.id} className="rounded-md p-4 flex items-start justify-between gap-4" style={{ background: bg, borderLeft: `3px solid ${border}`, border: `1px solid ${isPositive ? "rgba(16,185,129,0.18)" : "rgba(169,56,56,0.18)"}`, borderLeftWidth: 3 }}>
            <div className="flex-1">
              <p className="text-sm font-semibold text-fyn-ink">{r.title}</p>
              {r.description && <p className="text-xs text-[#3D3530] mt-1">{r.description}</p>}
              {r.recommended_action && <p className="text-xs text-[rgba(23,18,8,0.62)] mt-1 italic">→ {r.recommended_action}</p>}
            </div>
            <button onClick={() => ack(r.id)} className="text-[11px] font-medium px-3 py-1.5 rounded text-white hover:opacity-90 flex-shrink-0" style={{ background: ACCENT.ink }}>Acknowledge</button>
          </div>
        );
      })}
    </div>
  );
}
