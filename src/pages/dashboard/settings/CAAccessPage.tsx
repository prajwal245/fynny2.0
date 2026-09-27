import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const RED = "#A93838"; const BORDER = "#E0D9C8";

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-card border rounded-lg p-6 mb-6 animate-fade-in" style={{ borderColor: BORDER }}>
    <h3 className="font-semibold text-[15px]" style={{ color: "#171208" }}>{title}</h3>
    <div className="mt-4 space-y-4">{children}</div>
  </div>
);

const inpCls = "w-full h-10 px-3 rounded-md border bg-card text-[14px] focus:outline-hidden focus:ring-2 focus:ring-[#A93838]/30";

const moduleOpts = ["Liquidity", "Revenue", "Cost", "GST & Tax", "Governance"];

type Access = { id: string; ca_name: string | null; ca_firm: string | null; ca_email: string; access_level: string | null; expiry_date: string | null; status: string };

/** ca_access_requests stores extra invite details inside `message` as JSON. */
const parseMeta = (message: unknown): Record<string, any> => {
  if (typeof message !== "string") return {};
  try { return JSON.parse(message) ?? {}; } catch { return {}; }
};

const CAAccessPage = () => {
  const { businessId } = useAuth();
  const [cas, setCas] = useState<Access[]>([]);
  const [auditLog, setAuditLog] = useState<{ action: string; module: string; ca: string; dt: string }[]>([]);
  const [name, setName] = useState(""); const [firm, setFirm] = useState(""); const [email, setEmail] = useState("");
  const [level, setLevel] = useState<"full" | "limited">("full");
  const [limited, setLimited] = useState<string[]>([]);
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiry, setExpiry] = useState("");
  const [canExport, setCanExport] = useState(true);
  const [canViewHr, setCanViewHr] = useState(false);
  const [sending, setSending] = useState(false);

  const refresh = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !businessId) { setCas([]); return; }
    const { data } = await (supabase.from("ca_access_requests") as any)
      .select("id, target_email, access_level, status, message, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });
    setCas(((data as any[]) ?? []).map((r) => {
      const meta = parseMeta(r.message);
      return {
        id: r.id,
        ca_name: meta.name ?? null,
        ca_firm: meta.firm ?? null,
        ca_email: r.target_email ?? "—",
        access_level: r.access_level ?? null,
        expiry_date: meta.expiry ?? null,
        status: r.status ?? "pending",
      } satisfies Access;
    }));

    const { data: logs } = await (supabase.from("admin_audit_logs") as any)
      .select("action, target_type, details, created_at")
      .eq("target_id", businessId)
      .order("created_at", { ascending: false })
      .limit(20);
    setAuditLog(((logs as any[]) ?? []).map((l) => ({
      action: l.action ?? "",
      module: l.target_type ?? "—",
      ca: l.details?.actor_name ?? l.details?.actor_email ?? "—",
      dt: new Date(l.created_at).toLocaleString(),
    })));
  };

  useEffect(() => { refresh(); }, [businessId]);

  const handleSend = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast.error("Invalid CA email"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Please sign in"); return; }
    if (!businessId) { toast.error("Complete your business profile first"); return; }
    setSending(true);
    const { error } = await (supabase.from("ca_access_requests") as any).insert({
      business_id: businessId,
      target_email: email,
      access_level: level,
      status: "pending",
      message: JSON.stringify({
        name, firm,
        modules: level === "limited" ? limited : null,
        expiry: hasExpiry ? expiry : null,
        can_export: canExport,
        can_view_hr: canViewHr,
      }),
    });
    if (error) {
      // Fallback to early_access_requests
      const { error: eaErr } = await (supabase.from("early_access_requests") as any).insert({
        email,
        module: "ca_invite",
        user_id: user.id,
        details: { name, firm, level, limited, hasExpiry, expiry, canExport, canViewHr },
      });
      if (eaErr) toast.error(eaErr.message);
      else toast.success("CA invite sent to " + email);
    } else {
      toast.success("CA invite sent to " + email);
    }
    setSending(false);
    setName(""); setFirm(""); setEmail(""); setLevel("full"); setLimited([]); setHasExpiry(false); setExpiry("");
    refresh();
  };

  return (
    <div className="max-w-3xl">
      <h2 className="font-serif text-2xl font-bold mb-1" style={{ color: "#171208" }}>CA Access</h2>
      <p className="text-[13px] mb-6" style={{ color: "rgba(23,18,8,0.60)" }}>Grant your Chartered Accountant scoped, auditable access.</p>

      <Card title="Current CA Access">
        {cas.length === 0 ? (
          <div className="text-center py-8 text-[13px]" style={{ color: "rgba(23,18,8,0.5)" }}>
            No CA connected yet
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "rgba(23,18,8,0.5)" }}>
              <th className="py-2">CA</th><th>Firm</th><th>Email</th><th>Access</th><th>Expiry</th><th>Status</th></tr></thead>
            <tbody>
              {cas.map((c) => (
                <tr key={c.id} className="border-t" style={{ borderColor: BORDER }}>
                  <td className="py-3 font-medium">{c.ca_name ?? "—"}</td>
                  <td>{c.ca_firm ?? "—"}</td>
                  <td>{c.ca_email}</td>
                  <td>{c.access_level ?? "—"}</td>
                  <td>{c.expiry_date ?? "No expiry"}</td>
                  <td><span className="text-[11px] px-2 py-1 rounded" style={{ background: "rgba(139,105,20,0.15)", color: "#8B6914" }}>{c.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Add CA Access">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-[13px] font-medium mb-1.5">CA name</label><input value={name} onChange={(e) => setName(e.target.value)} className={inpCls} style={{ borderColor: BORDER }} /></div>
          <div><label className="block text-[13px] font-medium mb-1.5">CA firm name</label><input value={firm} onChange={(e) => setFirm(e.target.value)} className={inpCls} style={{ borderColor: BORDER }} /></div>
        </div>
        <div><label className="block text-[13px] font-medium mb-1.5">CA email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inpCls} style={{ borderColor: BORDER }} /></div>

        <div>
          <p className="text-[13px] font-medium mb-2">Access level</p>
          <label className="flex items-center gap-2 mb-2 text-[13px]">
            <input type="radio" checked={level === "full"} onChange={() => setLevel("full")} /> Full Read Access (all modules)
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="radio" checked={level === "limited"} onChange={() => setLevel("limited")} /> Limited Access (select modules)
          </label>
          {level === "limited" && (
            <div className="mt-2 ml-6 flex flex-wrap gap-3">
              {moduleOpts.map((m) => (
                <label key={m} className="flex items-center gap-1.5 text-[12px]">
                  <input type="checkbox" checked={limited.includes(m)} onChange={(e) =>
                    setLimited((p) => e.target.checked ? [...p, m] : p.filter((x) => x !== m))} /> {m}
                </label>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-[13px] font-medium mb-2">Access expiry</p>
          <div className="flex items-center gap-3">
            <Switch checked={hasExpiry} onCheckedChange={setHasExpiry} />
            <span className="text-[13px]">{hasExpiry ? "Set expiry date" : "No expiry"}</span>
            {hasExpiry && <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="h-9 px-3 border rounded-md text-[13px]" style={{ borderColor: BORDER }} />}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[13px]">Can export reports</span>
          <Switch checked={canExport} onCheckedChange={setCanExport} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[13px]">Can view employee data</span>
          <Switch checked={canViewHr} onCheckedChange={setCanViewHr} />
        </div>

        <button onClick={handleSend} disabled={sending} className="px-5 py-2.5 rounded-md text-sm font-semibold text-white disabled:opacity-60" style={{ background: RED }}>
          {sending ? "Sending…" : "Send CA Invite"}
        </button>
      </Card>

      <Card title="Audit Log">
        <p className="text-[12px] mb-2" style={{ color: "rgba(23,18,8,0.55)" }}>Shows what your CA has been accessing</p>
        {auditLog.length === 0 ? (
          <p className="text-[13px] text-center py-6" style={{ color: "rgba(23,18,8,0.5)" }}>No CA access activity yet.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "rgba(23,18,8,0.5)" }}>
              <th className="py-2">Action</th><th>Module</th><th>CA Name</th><th>Date & Time</th></tr></thead>
            <tbody>
              {auditLog.map((a, i) => (
                <tr key={i} className="border-t" style={{ borderColor: BORDER }}>
                  <td className="py-3">{a.action}</td><td>{a.module}</td><td>{a.ca}</td><td className="font-mono text-[12px]">{a.dt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

export default CAAccessPage;
