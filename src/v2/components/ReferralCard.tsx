/**
 * Settings → Refer a firm. The firm's own code and link, how the reward works, and where each
 * referral stands. Nothing here changes billing: rewards are given by the server.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Share2 } from "lucide-react";
import { referralOverview } from "@/lib/practice/practice.functions";
import { referralLink } from "@/lib/practice/referrals";
import { Badge, Card, V, formatDate } from "../ui";

type View = Awaited<ReturnType<typeof referralOverview>>;

const STATUS: Record<View["referrals"][number]["status"], { label: string; tone: "neutral" | "good" | "warn" }> = {
  signed_up: { label: "Joined. Waiting for their first client", tone: "warn" },
  qualified: { label: "Free month earned", tone: "good" },
  void: { label: "Not eligible", tone: "neutral" },
};

const copy = (text: string, what: string) => {
  void navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copied`));
};

export function ReferralCard() {
  const [v, setV] = useState<View | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setV(await referralOverview());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (failed) return null;
  if (!v) return null;
  const link = referralLink(window.location.origin, v.code);
  const message = `I use FynHelp to close client books faster: bank-to-Tally reconciliation and MIS in minutes. Join with my link and we both get a free month once you add your first client: ${link}`;

  return (
    <Card style={{ marginBottom: 16 }} data-testid="referral-card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <h3 style={{ fontSize: 15.5, margin: 0 }}>Refer a firm, get a free month</h3>
        {v.monthsEarned > 0 && <Badge tone="good">{v.monthsEarned} free month{v.monthsEarned === 1 ? "" : "s"} earned</Badge>}
      </div>
      <p style={{ fontSize: 13, color: V.body, margin: "6px 0 14px", lineHeight: 1.6 }}>
        Share your code with another CA firm. When they join with it and add their first client, <b>you both get one extra month</b>.
        On a free trial the 30 days are added straight away. On a paid plan our billing team credits one month's fee to your next invoice within 3 business days.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <code style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1.5, padding: "8px 14px", background: V.gray, borderRadius: 10 }} aria-label="Your referral code">{v.code}</code>
        <button className="v2-btn v2-btn-ghost" onClick={() => copy(v.code, "Code")}><Copy size={14} /> Copy code</button>
        <button className="v2-btn v2-btn-ghost" onClick={() => copy(link, "Link")}><Copy size={14} /> Copy link</button>
        <a className="v2-btn v2-btn-primary" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><Share2 size={14} /> Share on WhatsApp</a>
      </div>
      <div style={{ fontSize: 12, color: V.muted, marginTop: 8, wordBreak: "break-all" }}>{link}</div>

      {v.referredBy && (
        <div style={{ marginTop: 14, fontSize: 13, color: V.body }}>
          You joined with {v.referredBy.firmName}'s code.{" "}
          {v.referredBy.status === "qualified" ? "Your free month has been added." : v.referredBy.status === "signed_up" ? "Add your first client and you both get a free month." : ""}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 16 }}>
        {[
          ["Firms referred", v.referrals.length],
          ["Added a client", v.referrals.filter((r) => r.status === "qualified").length],
          ["Free months earned", v.monthsEarned],
          ["Waiting for billing credit", v.monthsPending],
        ].map(([label, n]) => (
          <div key={String(label)} style={{ border: `1px solid ${V.line}`, borderRadius: 12, padding: "10px 14px" }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{n}</div>
            <div style={{ fontSize: 12, color: V.muted }}>{label}</div>
          </div>
        ))}
      </div>

      {v.referrals.length > 0 && (
        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          {v.referrals.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 13, borderTop: `1px solid ${V.line}`, paddingTop: 8 }}>
              <span><b>{r.firmName}</b> <span style={{ color: V.muted }}>· joined {formatDate(r.joinedAt)}</span></span>
              <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 12, color: V.muted, marginTop: 12 }}>
        Up to {v.yearlyLimit} free months a year as a referrer. A code cannot be used by the firm that owns it, by a firm with the same owner or email, or after a firm's first week.
      </div>
    </Card>
  );
}
