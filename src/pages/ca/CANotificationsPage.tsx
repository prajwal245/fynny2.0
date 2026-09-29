import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { toast } from "sonner";
import { CA, CACard, CAHeading, CABadge, CAButton, dateIN, CAEmpty } from "@/components/ca/portalUi";

interface Notification {
  id: string;
  business_id: string | null;
  title: string | null;
  message: string | null;
  severity: string | null;
  is_read: boolean | null;
  created_at: string | null;
}

const sevTone = (s?: string | null) =>
  s === "critical" ? "red" : s === "warning" ? "amber" : s === "success" ? "green" : "teal";

export default function CANotificationsPage() {
  const { firmId } = useCAPortal();
  const [rows, setRows] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!firmId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("ca_notifications")
      .select("id, business_id, title, message, severity, is_read, created_at")
      .eq("ca_firm_id", firmId)
      .eq("is_demo", false)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as Notification[]) ?? []);
    setLoading(false);
  }, [firmId]);

  useEffect(() => { load(); }, [load]);

  const markOne = async (id: string) => {
    const { error } = await supabase.from("ca_notifications").update({ is_read: true }).eq("id", id);
    if (error) return toast.error(error.message);
    setRows((r) => r.map((x) => (x.id === id ? { ...x, is_read: true } : x)));
  };

  const markAll = async () => {
    if (!firmId) return;
    const { error } = await supabase
      .from("ca_notifications")
      .update({ is_read: true })
      .eq("ca_firm_id", firmId)
      .eq("is_read", false);
    if (error) return toast.error(error.message);
    toast.success("All notifications marked read");
    load();
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <CAHeading>Notifications</CAHeading>
        <CAButton variant="ghost" onClick={markAll}>Mark all as read</CAButton>
      </div>

      <CACard style={{ marginTop: 18, overflow: "hidden" }}>
        {loading ? (
          <CAEmpty title="Loading notifications…" />
        ) : rows.length === 0 ? (
          <CAEmpty title="No notifications" hint="Client alerts and reminders will appear here." />
        ) : (
          rows.map((n) => (
            <div
              key={n.id}
              style={{
                padding: "14px 18px",
                borderBottom: `0.5px solid ${CA.line}`,
                background: n.is_read ? "transparent" : CA.tealSoft,
                display: "flex", gap: 12, alignItems: "start",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontFamily: CA.sans, fontSize: 13.5, fontWeight: 600, color: CA.ink }}>{n.title ?? "Notification"}</span>
                  <CABadge tone={sevTone(n.severity) as any}>{n.severity ?? "info"}</CABadge>
                </div>
                <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted, marginTop: 4 }}>{n.message}</div>
                <div style={{ fontFamily: CA.sans, fontSize: 11.5, color: CA.faint, marginTop: 5 }}>
                  {dateIN(n.created_at)}
                  {n.business_id ? ` · client ${n.business_id.slice(0, 8)}…` : ""}
                </div>
              </div>
              {!n.is_read && (
                <CAButton variant="ghost" onClick={() => markOne(n.id)} style={{ padding: "6px 12px", fontSize: 12 }}>
                  Mark as read
                </CAButton>
              )}
            </div>
          ))
        )}
      </CACard>
    </div>
  );
}
