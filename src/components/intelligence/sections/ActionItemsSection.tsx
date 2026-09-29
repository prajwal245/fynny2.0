import { useActionItems } from "../DataSource";
import { IntelCard, Badge, BadgeTone, ACCENT } from "../_primitives";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

const categoryTone: Record<string, BadgeTone> = {
  gst: "red",
  collection: "gold",
  payment: "gold",
  ca_task: "gray",
  reconciliation: "gray",
  compliance: "red",
};

export default function ActionItemsSection() {
  const { data, isLoading } = useActionItems();
  const qc = useQueryClient();
  const rows = (data ?? [])
    .filter((r: any) => r.status === "pending")
    .sort((a: any, b: any) => {
      const order: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4 };
      return (order[a.priority] ?? 9) - (order[b.priority] ?? 9);
    })
    .slice(0, 7);

  const markDone = async (id: string) => {
    const { error } = await (supabase as any).from("action_items").update({ status: "completed" }).eq("id", id);
    if (error) {
      toast({ title: "Could not update", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["intel", "action_items"] });
  };

  if (isLoading) return <div className="h-40 bg-slate-50 animate-pulse rounded-md" />;

  return (
    <IntelCard title="Action Items" sub={`${rows.length} pending · prioritised by urgency`}>
      {rows.length === 0 ? (
        <p className="text-sm text-[rgba(23,18,8,0.62)] py-4 text-center">All caught up.</p>
      ) : (
        <ul className="divide-y divide-[rgba(23,18,8,0.06)]">
          {rows.map((r: any) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <Badge tone={categoryTone[r.category] ?? "gray"}>{r.category.replace("_", " ")}</Badge>
              <p className="flex-1 text-sm text-fyn-ink">{r.title}</p>
              <span className="text-xs text-[rgba(23,18,8,0.62)] font-mono">{r.due_date ? new Date(r.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}</span>
              <button onClick={() => markDone(r.id)} className="text-[11px] font-medium px-2.5 py-1 rounded text-white hover:opacity-90" style={{ background: ACCENT.red }}>Mark Done</button>
            </li>
          ))}
        </ul>
      )}
    </IntelCard>
  );
}
