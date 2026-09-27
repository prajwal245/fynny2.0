import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { toast } from "sonner";
import { CA, CACard, CAHeading, CAButton, CABadge, CAEmpty, dateIN } from "@/components/ca/portalUi";

interface Notification {
  id: string;
  title: string | null;
  message: string | null;
  severity: string | null;
  is_read: boolean | null;
  created_at: string | null;
  compliance_event_id: string | null;
}

type TabKey = "all" | "unread" | "critical" | "week";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "critical", label: "Critical" },
  { key: "week", label: "This week" },
];

const sevColor = (s?: string | null) =>
  s === "critical" ? CA.red : s === "warning" ? CA.amber : CA.teal;

const relative = (iso: string | null) => {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return dateIN(iso);
};

const weekAgo = () => Date.now() - 7 * 24 * 60 * 60 * 1000;

export default function CAAlertMonitorPage() {
  const { firmId } = useCAPortal();
  const [rows, setRows] = useState<Notification[]>([]);
  const [tab, setTab] = useState<TabKey>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!firmId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("ca_notifications")
      .select("id, title, message, severity, is_read, created_at, compliance_event_id")
      .eq("ca_firm_id", firmId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as Notification[]) ?? []);
    setLoading(false);
  }, [firmId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!firmId) return;
    const channel = supabase
      .channel(`ca-notifications-${firmId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ca_notifications", filter: `ca_firm_id=eq.${firmId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [firmId, load]);

  const filtered = useMemo(() => {
    if (tab === "unread") return rows.filter((r) => !r.is_read);
    if (tab === "critical") return rows.filter((r) => r.severity === "critical");
    if (tab === "week") return rows.filter((r) => r.created_at && new Date(r.created_at).getTime() > weekAgo());
    return rows;
  }, [rows, tab]);

  const stats = useMemo(() => {
    const thisWeek = rows.filter((r) => r.created_at && new Date(r.created_at).getTime() > weekAgo());
    return {
      week: thisWeek.length,
      unread: rows.filter((r) => !r.is_read).length,
      criticalUnread: rows.filter((r) => !r.is_read && r.severity === "critical").length,
      last: rows[0]?.created_at ?? null,
    };
  }, [rows]);

  const markOne = async (n: Notification) => {
    if (n.is_read) return;
    setRows((r) => r.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    const { error } = await supabase.from("ca_notifications").update({ is_read: true }).eq("id", n.id);
    if (error) { toast.error(error.message); void load(); }
  };

  const markAll = async () => {
    if (!firmId) return;
    const { error } = await supabase
      .from("ca_notifications").update({ is_read: true })
      .eq("ca_firm_id", firmId).eq("is_read", false);
    if (error) return toast.error(error.message);
    toast.success("All alerts marked read");
    void load();
  };

  const clearRead = async () => {
    if (!firmId) return;
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("ca_notifications").delete()
      .eq("ca_firm_id", firmId).eq("is_read", true).lt("created_at", cutoff)
      .select("id");
    if (error) return toast.error(error.message);
    toast.success(`${data?.length ?? 0} read alert${(data?.length ?? 0) === 1 ? "" : "s"} cleared`);
    void load();
  };

  const stat = (label: string, value: string | number, tone?: "red") => (
    <div>
      <div style={{ fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: CA.faint }}>
        {label}
      </div>
      <div style={{ fontFamily: CA.mono, fontSize: 20, fontWeight: 700, marginTop: 6, color: tone === "red" ? CA.red : CA.ink, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <CAHeading>Alert monitor</CAHeading>
        <div style={{ display: "flex", gap: 10 }}>
          <CAButton variant="ghost" onClick={markAll}>Mark all read</CAButton>
          <CAButton variant="danger" onClick={clearRead}>Clear read</CAButton>
        </div>
      </div>

      <CACard style={{ padding: 20, marginTop: 18, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {stat("Alerts this week", stats.week)}
        {stat("Unread", stats.unread, stats.unread > 0 ? "red" : undefined)}
        {stat("Critical unread", stats.criticalUnread, stats.criticalUnread > 0 ? "red" : undefined)}
        {stat("Last alert", relative(stats.last))}
      </CACard>

      <div style={{ display: "flex", gap: 4, marginTop: 18, borderBottom: `0.5px solid ${CA.line}` }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              fontFamily: CA.sans, fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? CA.teal : CA.muted, padding: "10px 14px",
              borderBottom: tab === t.key ? `2px solid ${CA.teal}` : "2px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
        {loading ? (
          <CACard><CAEmpty title="Loading alerts…" /></CACard>
        ) : filtered.length === 0 ? (
          <CACard><CAEmpty title="No alerts in this category." /></CACard>
        ) : (
          filtered.map((n) => (
            <CACard
              key={n.id}
              style={{ padding: 16, cursor: n.is_read ? "default" : "pointer", opacity: n.is_read ? 0.65 : 1, display: "flex", gap: 12 }}
            >
              <div onClick={() => markOne(n)} style={{ display: "flex", gap: 12, width: "100%" }}>
                <span
                  style={{
                    width: 9, height: 9, borderRadius: 999, background: sevColor(n.severity),
                    marginTop: 6, flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: CA.serif, fontSize: 15, fontWeight: 700, color: CA.ink }}>
                    {n.title ?? "Alert"}
                  </div>
                  <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted, marginTop: 4, lineHeight: 1.55 }}>
                    {n.message ?? "—"}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: CA.sans, fontSize: 11.5, color: CA.faint }}>{relative(n.created_at)}</span>
                    {n.compliance_event_id && <CABadge tone="teal">Compliance</CABadge>}
                    <CABadge tone={n.is_read ? "grey" : "amber"}>{n.is_read ? "Read" : "Unread"}</CABadge>
                  </div>
                </div>
              </div>
            </CACard>
          ))
        )}
      </div>
    </div>
  );
}
