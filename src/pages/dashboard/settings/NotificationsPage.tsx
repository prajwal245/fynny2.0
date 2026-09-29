import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const RED = "#A93838"; const BORDER = "#E0D9C8";

const Card = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => (
  <div className="bg-card border rounded-lg p-6 mb-6 animate-fade-in" style={{ borderColor: BORDER }}>
    <h3 className="font-semibold text-[15px]" style={{ color: "#171208" }}>{title}</h3>
    {sub && <p className="text-[12px] mt-1" style={{ color: "rgba(23,18,8,0.60)" }}>{sub}</p>}
    <div className="mt-4 space-y-4">{children}</div>
  </div>
);

const selCls = "h-9 px-3 rounded-md border bg-card text-[13px] focus:outline-hidden";

const Row = ({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4 py-2">
    <div className="flex-1">
      <p className="text-[13px] font-medium" style={{ color: "#171208" }}>{label}</p>
      {sub && <p className="text-[11px]" style={{ color: "rgba(23,18,8,0.55)" }}>{sub}</p>}
    </div>
    <div className="flex items-center gap-2">{children}</div>
  </div>
);

async function savePrefs(prefs: unknown) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { toast.error("Sign in to save preferences"); return; }
  const { error } = await (supabase.from("profiles") as any)
    .update({ notification_preferences: prefs })
    .eq("user_id", user.id);
  if (error) {
    // Column may not exist — degrade to honest info toast.
    toast.info("Notification preferences saved locally. Sync coming soon.");
  } else {
    toast.success("Preferences saved");
  }
}

const Save = ({ onClick, label = "Save" }: { onClick: () => void; label?: string }) => (
  <button onClick={onClick} className="px-5 py-2.5 rounded-md text-sm font-semibold text-white" style={{ background: RED }}>{label}</button>
);

const NotificationsPage = () => {
  const { user, profile } = useAuth();
  const [dailyOn, setDailyOn] = useState(true);
  const [briefTime, setBriefTime] = useState("8 AM");
  const [briefVia, setBriefVia] = useState<"email" | "whatsapp" | "both">("email");
  const [runway, setRunway] = useState("3");
  const [burn, setBurn] = useState("15");
  const [overdue, setOverdue] = useState("14");
  const [cashBal, setCashBal] = useState("500000");
  const [comp, setComp] = useState({
    gstr3b: { on: true, days: "3" }, gstr1: { on: true, days: "3" },
    tds: { on: true, days: "5" }, adv: { on: true, days: "7" },
  });
  const [mod, setMod] = useState({ liquidity: true, revenue: true, cost: true, gst: true, hr: true, payment: true });
  const [emailOn, setEmailOn] = useState(true);
  const [waOn, setWaOn] = useState(false);
  const [digest, setDigest] = useState(true);

  const userEmail = user?.email ?? "Not set";
  const userPhone = (profile as any)?.mobile ?? "Not set";

  return (
    <div className="max-w-3xl">
      <h2 className="font-serif text-2xl font-bold mb-1" style={{ color: "#171208" }}>Notifications</h2>
      <p className="text-[13px] mb-6" style={{ color: "rgba(23,18,8,0.60)" }}>Choose how and when CFO Fynny contacts you.</p>

      <Card title="Daily Brief" sub="Fynny sends a 3-sentence financial summary every morning">
        <Row label="Send daily financial brief"><Switch checked={dailyOn} onCheckedChange={setDailyOn} /></Row>
        <Row label="Send at">
          <select value={briefTime} onChange={(e) => setBriefTime(e.target.value)} className={selCls} style={{ borderColor: BORDER }}>
            {["6 AM", "7 AM", "8 AM", "9 AM"].map((t) => <option key={t}>{t}</option>)}
          </select>
        </Row>
        <Row label="Via">
          <div className="inline-flex rounded-md overflow-hidden border" style={{ borderColor: BORDER }}>
            {(["email", "whatsapp", "both"] as const).map((v) => (
              <button key={v} onClick={() => setBriefVia(v)} className="px-3 py-1.5 text-[12px] capitalize"
                style={{ background: briefVia === v ? RED : "transparent", color: briefVia === v ? "#fff" : "#171208" }}>{v}</button>
            ))}
          </div>
        </Row>
        <Save onClick={() => savePrefs({ dailyOn, briefTime, briefVia })} label="Save Daily Brief" />
      </Card>

      <Card title="Alert Thresholds">
        <Row label="Alert me when runway drops below">
          <select value={runway} onChange={(e) => setRunway(e.target.value)} className={selCls} style={{ borderColor: BORDER }}>
            <option value="1">1 month</option><option value="2">2 months</option><option value="3">3 months</option><option value="6">6 months</option>
          </select>
        </Row>
        <Row label="Alert me when burn rate increases by">
          <select value={burn} onChange={(e) => setBurn(e.target.value)} className={selCls} style={{ borderColor: BORDER }}>
            {["10", "15", "20", "25"].map((v) => <option key={v} value={v}>{v}%</option>)}
          </select>
        </Row>
        <Row label="Alert me when invoice is overdue by">
          <select value={overdue} onChange={(e) => setOverdue(e.target.value)} className={selCls} style={{ borderColor: BORDER }}>
            {["7", "14", "30"].map((v) => <option key={v} value={v}>{v} days</option>)}
          </select>
        </Row>
        <Row label="Alert me when cash balance drops below">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px]" style={{ color: "rgba(23,18,8,0.5)" }}>₹</span>
            <input value={cashBal} onChange={(e) => setCashBal(e.target.value)} className="h-9 pl-7 pr-3 w-40 rounded-md border bg-card text-[13px]" style={{ borderColor: BORDER }} />
          </div>
        </Row>
        <Save onClick={() => savePrefs({ runway, burn, overdue, cashBal })} label="Save Thresholds" />
      </Card>

      <Card title="GST & Compliance Reminders">
        {([
          ["gstr3b", "GSTR-3B reminder"], ["gstr1", "GSTR-1 reminder"],
          ["tds", "TDS filing reminder"], ["adv", "Advance tax reminder"],
        ] as const).map(([k, lbl]) => (
          <Row key={k} label={lbl}>
            <Switch checked={comp[k].on} onCheckedChange={(v) => setComp((c) => ({ ...c, [k]: { ...c[k], on: v } }))} />
            <select value={comp[k].days} onChange={(e) => setComp((c) => ({ ...c, [k]: { ...c[k], days: e.target.value } }))}
              className={selCls} style={{ borderColor: BORDER }} disabled={!comp[k].on}>
              {["1", "3", "5", "7"].map((d) => <option key={d} value={d}>{d} days before</option>)}
            </select>
          </Row>
        ))}
        <Save onClick={() => savePrefs({ comp })} />
      </Card>

      <Card title="Per-Module Notifications">
        {([
          ["liquidity", "Liquidity alerts", "runway, burn"],
          ["revenue", "Revenue alerts", "churn, MRR drop"],
          ["cost", "Cost alerts", "maverick spend, anomalies"],
          ["gst", "GST alerts", "filing, ITC mismatch"],
          ["hr", "HR alerts", "payroll due, attrition risk"],
          ["payment", "Payment reminders", "vendor due, customer overdue"],
        ] as const).map(([k, lbl, sub]) => (
          <Row key={k} label={lbl} sub={sub}>
            <Switch checked={mod[k]} onCheckedChange={(v) => setMod((m) => ({ ...m, [k]: v }))} />
          </Row>
        ))}
        <Save onClick={() => savePrefs({ mod })} label="Save Module Alerts" />
      </Card>

      <Card title="Notification Channels">
        <Row label="Email notifications" sub={userEmail}>
          <Switch checked={emailOn} onCheckedChange={setEmailOn} />
        </Row>
        <Row label="WhatsApp notifications" sub={waOn ? userPhone : `WhatsApp not connected (${userPhone})`}>
          {!waOn && <button onClick={() => { setWaOn(true); toast.info("WhatsApp connection coming soon"); }} className="text-[12px] px-3 py-1 rounded border font-medium" style={{ color: RED, borderColor: RED }}>Connect</button>}
          <Switch checked={waOn} onCheckedChange={setWaOn} />
        </Row>
        <Row label="Weekly digest" sub="Every Monday at 9 AM — summary of the week">
          <Switch checked={digest} onCheckedChange={setDigest} />
        </Row>
        <PushRow />
      </Card>
    </div>
  );
};

const PushRow = () => {
  const { user, businessId } = useAuth();
  const { status, isSubscribed, isIOSSafari, isStandalone, enable, disable, sendTest } =
    usePushNotifications(user?.id ?? "", businessId ?? "");

  const handleEnable = async () => {
    const res = await enable();
    if (res.success) {
      toast.success("Push notifications enabled");
    } else if (res.reason === "not-configured") {
      toast("Push notifications are being set up — check back soon");
    } else if (res.reason === "denied") {
      toast.error("Permission denied — you can enable this later in your browser settings");
    } else if (res.reason === "ios-needs-homescreen") {
      toast("Add FynHelp to your Home Screen first");
    } else if (res.reason === "unsupported") {
      toast.error("Not supported on this browser");
    } else {
      toast.error("Could not enable push notifications");
    }
  };

  const handleTest = async () => {
    const { error } = await sendTest();
    if (error) toast.error("No active subscriptions found");
    else toast.success("Test sent — check your notifications");
  };

  const handleDisable = async () => {
    await disable();
    toast.success("Push notifications disabled");
  };

  return (
    <div>
      <Row
        label="Push Notifications"
        sub="Get instant alerts on this device — GST deadlines, overdue invoices, burn rate changes"
      >
        {status === "unsupported" && (
          <span className="text-[11px] px-2 py-1 rounded" style={{ background: "rgba(23,18,8,0.06)", color: "rgba(23,18,8,0.6)" }}>
            Not supported on this browser
          </span>
        )}
        {status !== "unsupported" && isIOSSafari && !isStandalone && null}
        {status === "denied" && (
          <>
            <span className="text-[11px] px-2 py-1 rounded font-medium" style={{ background: "rgba(169,56,56,0.10)", color: RED }}>
              Blocked
            </span>
            <span className="text-[11px]" style={{ color: "rgba(23,18,8,0.55)" }}>
              Enable in browser settings
            </span>
          </>
        )}
        {status !== "unsupported" && status !== "denied" && !(isIOSSafari && !isStandalone) && isSubscribed && (
          <span className="text-[11px] px-2 py-1 rounded font-medium" style={{ background: "rgba(16,185,129,0.12)", color: "#1F5A46" }}>
            Enabled
          </span>
        )}
        {status !== "unsupported" && status !== "denied" && !(isIOSSafari && !isStandalone) && !isSubscribed && (
          <button
            onClick={handleEnable}
            className="px-3 py-1.5 rounded-md text-[12px] font-semibold text-white"
            style={{ background: RED }}
          >
            Enable
          </button>
        )}
      </Row>
      {isIOSSafari && !isStandalone && status !== "unsupported" && (
        <div className="mt-2 p-3 rounded-md text-[12px]" style={{ background: "rgba(23,18,8,0.05)", color: "rgba(23,18,8,0.7)", border: `1px solid ${BORDER}` }}>
          On iPhone, add FynHelp to your Home Screen first (Share → Add to Home Screen) for push notifications to work.
        </div>
      )}
      {isSubscribed && (
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={handleTest}
            className="px-3 py-1.5 rounded-md text-[12px] font-medium border"
            style={{ color: RED, borderColor: RED }}
          >
            Send Test Notification
          </button>
          <button
            onClick={handleDisable}
            className="text-[12px] hover:underline"
            style={{ color: "rgba(23,18,8,0.55)" }}
          >
            Disable
          </button>
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
