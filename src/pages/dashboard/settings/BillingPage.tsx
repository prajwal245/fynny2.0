import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { Lock } from "lucide-react";

const RED = "#A93838"; const BORDER = "#E0D9C8"; const GOLD = "#8B6914";


const Card = ({ title, danger, children }: { title: string; danger?: boolean; children: React.ReactNode }) => (
  <div className="bg-card border rounded-lg p-6 mb-6 animate-fade-in"
    style={{ borderColor: danger ? RED : BORDER }}>
    <h3 className="font-semibold text-[15px]" style={{ color: danger ? RED : "#171208" }}>{title}</h3>
    <div className="mt-4 space-y-4">{children}</div>
  </div>
);

const inpCls = "w-full h-10 px-3 rounded-md border bg-card text-[14px] focus:outline-hidden";

const Metric = ({ label, used, total, pct }: { label: string; used: string; total: string; pct: number }) => (
  <div className="p-4 rounded-md border" style={{ borderColor: BORDER }}>
    <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: "rgba(23,18,8,0.55)" }}>{label}</p>
    <p className="text-[16px] font-bold mt-1 font-mono" style={{ color: "#171208" }}>{used} <span className="text-[12px] font-normal" style={{ color: "rgba(23,18,8,0.5)" }}>/ {total}</span></p>
    <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "#F3EBD9" }}>
      <div className="h-full" style={{ width: `${pct}%`, background: RED }} />
    </div>
  </div>
);

const BillingPage = () => {
  const { businessId, user } = useAuth();
  const { canAccessBilling, role, loading: roleLoading } = useUserRole();
  const trial = useTrialStatus();
  const [promo, setPromo] = useState("");

  const [showCancel, setShowCancel] = useState(false);
  const [aiQueries, setAiQueries] = useState<number | null>(null);
  const [teamCount, setTeamCount] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      if (user?.id) {
        const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const { count } = await (supabase.from("ai_usage_logs") as any)
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("created_at", start);
        setAiQueries(count ?? 0);
      }
      if (businessId) {
        const { count } = await (supabase.from("profiles") as any)
          .select("user_id", { count: "exact", head: true })
          .eq("business_id", businessId);
        setTeamCount(count ?? 0);
      }
    })();
  }, [user?.id, businessId]);

  if (!roleLoading && !canAccessBilling) {
    return (
      <div className="max-w-3xl">
        <h2 className="font-serif text-2xl font-bold mb-1" style={{ color: "#171208" }}>Billing</h2>
        <div data-testid="billing-locked" className="mt-6 border rounded-lg p-8 text-center bg-card" style={{ borderColor: BORDER }}>
          <Lock className="w-8 h-8 mx-auto mb-3" style={{ color: RED }} />
          <p className="text-[15px] font-semibold" style={{ color: "#171208" }}>Billing is restricted to the Owner</p>
          <p className="text-[13px] mt-2" style={{ color: "rgba(23,18,8,0.6)" }}>
            Your role is <span className="font-semibold capitalize">{role}</span>. Ask the workspace Owner to update billing, payment methods, or the plan.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h2 className="font-serif text-2xl font-bold mb-1" style={{ color: "#171208" }}>Billing</h2>
      <p className="text-[13px] mb-6" style={{ color: "rgba(23,18,8,0.60)" }}>Manage plan, usage, invoices and payment methods.</p>


      <Card title="Current Plan">
        <div className="flex items-start justify-between">
          <div>
            {(() => {
              const expired = trial.isExpired && !trial.hasPaidSubscription;
              const paid = trial.hasPaidSubscription;
              const badgeBg = expired ? "rgba(169,56,56,0.12)" : "rgba(139,105,20,0.18)";
              const badgeBorder = expired ? `${RED}55` : `${GOLD}55`;
              const badgeColor = expired ? RED : GOLD;
              const badgeText = paid
                ? "★ PAID PLAN"
                : expired
                  ? "TRIAL EXPIRED"
                  : "★ EARLY ACCESS — FREE TRIAL";
              const statusLine = paid
                ? `You're on the ${trial.plan ?? "paid"} plan.`
                : expired
                  ? "Your free trial has ended. Upgrade to continue using FynHelp."
                  : trial.daysRemaining !== null
                    ? `${trial.daysRemaining} day${trial.daysRemaining === 1 ? "" : "s"} left in your free trial${trial.trialEndsAt ? ` — ends ${trial.trialEndsAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : ""}.`
                  : "You're on the FynHelp Early Access plan.";
              return (
                <>
                  <span className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide"
                    style={{ background: badgeBg, border: `1px solid ${badgeBorder}`, color: badgeColor }}>{badgeText}</span>
                  <p className="text-[13px] mt-3" style={{ color: "rgba(23,18,8,0.7)" }}>{statusLine}</p>
                </>
              );
            })()}
            <ul className="mt-3 space-y-1 text-[13px]">
              {["All 8 intelligence modules", "Fynny AI queries", "Team members", "CSV/PDF exports", "Email + WhatsApp alerts"].map((f) => (
                <li key={f}><span style={{ color: "#16A34A" }}>✓</span> {f} <span style={{ color: "rgba(23,18,8,0.45)" }}>— limits vary by plan</span></li>
              ))}
            </ul>
          </div>
        </div>
        <button onClick={() => toast("Coming Soon — paid plans launch shortly. Reach us at support@fynhelp.com to upgrade early.")} className="px-5 py-2.5 rounded-md text-sm font-semibold text-white" style={{ background: RED }}>Upgrade to Paid Plan</button>
      </Card>

      <Card title="Usage This Month">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Fynny queries" used={aiQueries === null ? "…" : String(aiQueries)} total="∞" pct={0} />
          <Metric label="Reports generated" used="—" total="∞" pct={0} />
          <Metric label="Team members" used={teamCount === null ? "…" : String(teamCount)} total="3" pct={teamCount ? Math.min(100, (teamCount / 3) * 100) : 0} />
          <Metric label="Data storage" used="—" total="1 GB" pct={0} />
        </div>
      </Card>

      <Card title="Invoice History">
        <p className="text-[13px] text-center py-6" style={{ color: "rgba(23,18,8,0.55)" }}>
          No invoices yet. Invoices will appear here once you upgrade to a paid plan.
        </p>
      </Card>

      <Card title="Payment Method">
        <p className="text-[13px]" style={{ color: "#171208" }}>No payment method added yet</p>
        <p className="text-[12px]" style={{ color: "rgba(23,18,8,0.55)" }}>Add a payment method before your free trial ends</p>
        <div className="flex gap-3">
          <button onClick={() => toast("Coming Soon")} className="px-4 py-2 rounded-md text-sm font-medium border" style={{ color: RED, borderColor: RED }}>Add Credit/Debit Card</button>
          <button onClick={() => toast("Coming Soon")} className="px-4 py-2 rounded-md text-sm font-medium border" style={{ color: RED, borderColor: RED }}>Add UPI</button>
        </div>
      </Card>

      <Card title="Promo Code">
        <div className="flex gap-2">
          <input value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="Enter promo code" className={inpCls + " max-w-xs"} style={{ borderColor: BORDER }} />
          <button onClick={() => toast.info("Promo codes will be available at launch.")} className="px-4 rounded-md text-sm font-semibold text-white" style={{ background: RED }}>Apply</button>
        </div>
        <p className="text-[12px]" style={{ color: "rgba(23,18,8,0.55)" }}>Have a referral code? Enter it here for extended free access</p>
      </Card>

      <Card title="Cancel Plan" danger>
        <p className="text-[13px]" style={{ color: "rgba(23,18,8,0.7)" }}>Your data will be retained for 30 days after cancellation.</p>
        {!showCancel ? (
          <button onClick={() => setShowCancel(true)} className="px-4 py-2 rounded-md text-sm font-medium border" style={{ color: RED, borderColor: RED }}>Cancel Plan</button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => { toast.error("Plan cancellation requested"); setShowCancel(false); }} className="px-4 py-2 rounded-md text-sm font-semibold text-white" style={{ background: RED }}>Confirm Cancellation</button>
            <button onClick={() => setShowCancel(false)} className="px-4 py-2 rounded-md text-sm font-medium border" style={{ borderColor: BORDER }}>Keep Plan</button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default BillingPage;
