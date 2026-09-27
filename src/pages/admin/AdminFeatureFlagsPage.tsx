import { useEffect, useMemo, useState } from "react";
import { Plus, Search, MoreVertical, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, PageHeader } from "./AdminDashboardPage";
import { logAdminAction } from "@/lib/adminAudit";

type Flag = {
  id: string;
  flag_name: string;
  display_name: string | null;
  enabled: boolean;
  description: string | null;
  target_segment: string;
  rollout_percentage: number;
  updated_at: string;
};

const SEGMENT_LABEL: Record<string, { label: string; bg: string; fg: string }> = {
  all:               { label:"All Users",       bg:"rgba(139,105,20,0.15)", fg:"#8B6914" },
  free_trial:        { label:"Free Trial",      bg:"rgba(139,105,20,0.15)", fg:"#8B6914" },
  starter_users:     { label:"Starter Users",   bg:"rgba(59,130,246,0.15)", fg:"#3B82F6" },
  pro_users:         { label:"Pro Users",       bg:"rgba(16,185,129,0.15)", fg:"#0F8F65" },
  enterprise_users:  { label:"Enterprise",      bg:"rgba(196,30,30,0.15)",  fg:"#C41E1E" },
  beta_users:        { label:"Beta Users",      bg:"rgba(59,130,246,0.15)", fg:"#3B82F6" },
};

export default function AdminFeatureFlagsPage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [filter, setFilter] = useState<"all"|"enabled"|"disabled"|"beta">("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Flag | "new" | null>(null);

  const load = async () => {
    const { data } = await supabase.from("feature_flags")
      .select("*").order("flag_name");
    setFlags((data as Flag[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return flags.filter((f) => {
      if (filter === "enabled" && !f.enabled) return false;
      if (filter === "disabled" && f.enabled) return false;
      if (filter === "beta" && f.target_segment !== "beta_users") return false;
      if (!s) return true;
      return [f.flag_name, f.display_name, f.description].some((v)=>(v ?? "").toLowerCase().includes(s));
    });
  }, [flags, filter, q]);

  const toggle = async (f: Flag) => {
    const next = !f.enabled;
    setFlags((arr) => arr.map((x) => x.id === f.id ? { ...x, enabled: next } : x));
    await supabase.from("feature_flags").update({ enabled: next }).eq("id", f.id);
    await logAdminAction({ action: next ? "feature_flag_enabled" : "feature_flag_disabled", target_type:"feature_flag", target_id:f.id, details:{ flag:f.flag_name } });
  };

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-4">
        <PageHeader title="Feature Flags" subtitle="Control feature rollouts and enable/disable functionality" />
        <button onClick={()=>setEditing("new")}
          className="inline-flex items-center gap-2"
          style={primaryBtn}><Plus size={16} /> Add Feature Flag</button>
      </div>

      <Card style={{ marginBottom: 24 }}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative" style={{ minWidth:240, flex:"1 1 280px" }}>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" color="hsl(var(--fyn-ink) / 0.4)" />
            <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search flags…"
              style={{ width:"100%", height:48, padding:"0 14px 0 38px", borderRadius:12,
                border:"1px solid rgba(23,18,8,0.15)", background:"#fff",
                fontFamily:"Roboto, sans-serif", fontSize:15, color:"hsl(var(--fyn-ink))", outline:"none" }} />
          </div>
          <select value={filter} onChange={(e)=>setFilter(e.target.value as any)}
            style={{ height:48, padding:"0 14px", borderRadius:12,
              border:"1px solid rgba(23,18,8,0.15)", background:"#fff",
              fontFamily:"Roboto, sans-serif", fontSize:14, color:"hsl(var(--fyn-ink))", minWidth:180 }}>
            <option value="all">All Flags</option>
            <option value="enabled">Enabled Only</option>
            <option value="disabled">Disabled Only</option>
            <option value="beta">Beta Flags</option>
          </select>
        </div>
      </Card>

      <div className="space-y-4">
        {visible.length === 0 && (
          <Card><div style={{ padding:24, textAlign:"center", fontFamily:"Roboto, sans-serif", color:"hsl(var(--fyn-ink) / 0.55)" }}>No feature flags match these filters.</div></Card>
        )}
        {visible.map((f) => (
          <FlagCard key={f.id} f={f} onToggle={()=>toggle(f)} onEdit={()=>setEditing(f)} />
        ))}
      </div>

      {editing && (
        <FlagModal
          flag={editing === "new" ? null : editing}
          onClose={()=>setEditing(null)}
          onSaved={async ()=>{ setEditing(null); await load(); }}
        />
      )}
    </div>
  );
}

function FlagCard({ f, onToggle, onEdit }: { f: Flag; onToggle: () => void; onEdit: () => void }) {
  const seg = SEGMENT_LABEL[f.target_segment] ?? SEGMENT_LABEL.all;
  return (
    <Card style={{
      padding: 24, borderLeft: `4px solid ${f.enabled ? "#1F5A46" : "rgba(23,18,8,0.2)"}`,
    }}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 style={{ fontFamily:"Raleway, sans-serif", fontWeight:600, fontSize:18, color:"hsl(var(--fyn-ink))" }}>
              {f.display_name || f.flag_name}
            </h3>
            <span style={{ display:"inline-block", padding:"4px 10px", borderRadius:6, background:seg.bg, color:seg.fg, fontFamily:"DM Sans, sans-serif", fontWeight:600, fontSize:12 }}>
              {seg.label}
            </span>
          </div>
          {f.description && (
            <p className="mt-1" style={{ fontFamily:"Roboto, sans-serif", fontSize:14, color:"hsl(var(--fyn-ink) / 0.6)" }}>
              {f.description}
            </p>
          )}
          <p className="mt-1" style={{ fontFamily:"Roboto, sans-serif", fontSize:12, color:"hsl(var(--fyn-ink) / 0.45)" }}>
            <code style={{ fontFamily:"JetBrains Mono, monospace" }}>{f.flag_name}</code> · Updated {new Date(f.updated_at).toLocaleString("en-IN")}
          </p>
        </div>

        <div className="flex items-center gap-6">
          {f.enabled && (
            <div style={{ minWidth: 200 }}>
              <div className="flex items-center justify-between mb-1" style={{ fontFamily:"DM Sans, sans-serif", fontSize:12, color:"hsl(var(--fyn-ink) / 0.6)" }}>
                <span>Rollout</span>
                <span style={{ fontWeight:700, color:"hsl(var(--fyn-ink))" }}>{f.rollout_percentage}%</span>
              </div>
              <div style={{ width:"100%", height:8, borderRadius:999, background:"rgba(23,18,8,0.08)" }}>
                <div style={{
                  width:`${f.rollout_percentage}%`, height:"100%", borderRadius:999,
                  background:"linear-gradient(90deg, #1F5A46, #0F8F65)",
                  transition:"width 0.3s ease",
                }} />
              </div>
            </div>
          )}
          <Toggle on={f.enabled} onChange={onToggle} />
          <button onClick={onEdit} style={{ background:"transparent", border:"none", cursor:"pointer", padding:6 }}>
            <MoreVertical size={20} color="hsl(var(--fyn-ink))" />
          </button>
        </div>
      </div>
    </Card>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} aria-pressed={on}
      style={{
        width:60, height:32, borderRadius:999, position:"relative", border:"none", cursor:"pointer",
        background: on ? "linear-gradient(135deg,#1F5A46,#0F8F65)" : "rgba(23,18,8,0.18)",
        transition:"background 0.25s ease",
      }}>
      <span style={{
        position:"absolute", top:4, left: on ? 32 : 4, width:24, height:24,
        borderRadius:"50%", background:"#fff",
        transition:"left 0.25s ease", boxShadow:"0 2px 4px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}

function FlagModal({ flag, onClose, onSaved }: { flag: Flag | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(flag?.flag_name ?? "");
  const [display, setDisplay] = useState(flag?.display_name ?? "");
  const [desc, setDesc] = useState(flag?.description ?? "");
  const [seg, setSeg] = useState(flag?.target_segment ?? "all");
  const [enabled, setEnabled] = useState(flag?.enabled ?? false);
  const [pct, setPct] = useState(flag?.rollout_percentage ?? 100);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const payload = {
      flag_name: name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      display_name: display.trim() || null,
      description: desc.trim() || null,
      target_segment: seg,
      enabled, rollout_percentage: enabled ? pct : 0,
    };
    if (flag) {
      await supabase.from("feature_flags").update(payload).eq("id", flag.id);
      await logAdminAction({ action:"feature_flag_updated", target_type:"feature_flag", target_id:flag.id, details:payload });
    } else {
      const { data } = await supabase.from("feature_flags").insert(payload).select("id").single();
      await logAdminAction({ action:"feature_flag_created", target_type:"feature_flag", target_id:data?.id, details:payload });
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background:"rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div onClick={(e)=>e.stopPropagation()} className="w-full max-w-[600px]" style={{
        background:"rgba(255,255,255,0.98)", backdropFilter:"blur(20px)",
        borderRadius:20, border:"1px solid rgba(139,105,20,0.2)",
        boxShadow:"0 24px 60px rgba(23,18,8,0.25)", maxHeight:"90vh", overflow:"auto",
      }}>
        <div className="flex items-center justify-between p-6" style={{ borderBottom:"1px solid rgba(23,18,8,0.08)" }}>
          <h3 style={{ fontFamily:"Oswald, sans-serif", fontWeight:700, fontSize:24, color:"hsl(var(--fyn-ink))" }}>
            {flag ? "Edit Feature Flag" : "Add Feature Flag"}
          </h3>
          <button onClick={onClose} style={{ background:"transparent", border:"none", cursor:"pointer" }}><X size={22} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label style={lbl}>Flag Name</label>
            <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="my_feature_name" disabled={!!flag}
              style={{ ...input, fontFamily:"JetBrains Mono, monospace" }} />
          </div>
          <div>
            <label style={lbl}>Display Name</label>
            <input value={display} onChange={(e)=>setDisplay(e.target.value)} placeholder="Decision Simulator" style={input} />
          </div>
          <div>
            <label style={lbl}>Description</label>
            <textarea value={desc} onChange={(e)=>setDesc(e.target.value)} rows={3} placeholder="What does this feature do?"
              style={{ ...input, height:"auto", padding:12 }} />
          </div>
          <div>
            <label style={lbl}>Target Segment</label>
            <select value={seg} onChange={(e)=>setSeg(e.target.value)} style={input}>
              <option value="all">All Users</option>
              <option value="free_trial">Free Trial Users</option>
              <option value="starter_users">Starter Users</option>
              <option value="pro_users">Pro Users</option>
              <option value="enterprise_users">Enterprise Users</option>
              <option value="beta_users">Beta Users</option>
            </select>
          </div>
          <div className="flex items-center justify-between" style={{ padding:"12px 0" }}>
            <div>
              <div style={{ fontFamily:"Raleway, sans-serif", fontWeight:600, fontSize:15, color:"hsl(var(--fyn-ink))" }}>Enabled</div>
              <div style={{ fontFamily:"Roboto, sans-serif", fontSize:12, color:"hsl(var(--fyn-ink) / 0.55)" }}>Turn this feature on for the target segment.</div>
            </div>
            <Toggle on={enabled} onChange={()=>setEnabled((e)=>!e)} />
          </div>
          {enabled && (
            <div>
              <label style={lbl}>Rollout Percentage: {pct}%</label>
              <input type="range" min={0} max={100} value={pct} onChange={(e)=>setPct(Number(e.target.value))}
                style={{ width:"100%" }} />
              <p style={{ fontFamily:"Roboto, sans-serif", fontSize:12, color:"hsl(var(--fyn-ink) / 0.55)", marginTop:6 }}>
                Gradually roll out to {pct}% of target segment.
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 p-6" style={{ borderTop:"1px solid rgba(23,18,8,0.08)" }}>
          <button onClick={onClose}
            style={{ height:44, padding:"0 22px", borderRadius:12, background:"transparent", border:"2px solid rgba(23,18,8,0.15)", color:"hsl(var(--fyn-ink))", cursor:"pointer", fontFamily:"DM Sans, sans-serif", fontWeight:600, fontSize:14 }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving || !name.trim()}
            style={{ ...primaryBtn, opacity: (saving || !name.trim()) ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save Flag"}
          </button>
        </div>
      </div>
    </div>
  );
}

const primaryBtn: React.CSSProperties = { display:"inline-flex", alignItems:"center", gap:8, height:44, padding:"0 18px", borderRadius:12, background:"linear-gradient(135deg,#C41E1E,#8B6914)", color:"#fff", border:"none", cursor:"pointer", fontFamily:"DM Sans, sans-serif", fontWeight:600, fontSize:14 };
const lbl: React.CSSProperties = { display:"block", fontFamily:"Roboto, sans-serif", fontSize:13, color:"hsl(var(--fyn-ink) / 0.7)", marginBottom:6 };
const input: React.CSSProperties = { width:"100%", height:48, padding:"0 14px", borderRadius:12, border:"1px solid rgba(23,18,8,0.15)", background:"#fff", fontFamily:"Roboto, sans-serif", fontSize:14, color:"hsl(var(--fyn-ink))", outline:"none" };
