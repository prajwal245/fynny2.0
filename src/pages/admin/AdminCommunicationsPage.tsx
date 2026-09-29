import { useEffect, useState } from "react";
import { MessageCircle, Share2, Twitter, Mail, Eye, Clock, X, Send, Calendar } from "lucide-react";
import { Card, PageHeader } from "./AdminDashboardPage";
import { EmptyState } from "@/components/admin/EmptyState";
import { toast } from "sonner";
import { sanitizeRichText } from "@/lib/sanitizeHtml";
import { logAdminAction } from "@/lib/adminAudit";
import { supabase } from "@/integrations/supabase/client";

type Platform = "whatsapp" | "meta" | "twitter" | "email";

const CHANNELS: { id: Platform; title: string; subtitle: string; icon: typeof MessageCircle; color: string; status: "connected" | "not" }[] = [
  { id: "whatsapp", title: "WhatsApp Blast", subtitle: "Broadcast & 1:1 messages", icon: MessageCircle, color: "#25D366", status: "not" },
  { id: "meta",     title: "Facebook & Instagram", subtitle: "Feed posts & stories", icon: Share2, color: "#1877F2", status: "not" },
  { id: "twitter",  title: "Twitter / X", subtitle: "Tweets & threads", icon: Twitter, color: "#1DA1F2", status: "not" },
  { id: "email",    title: "Email Blast", subtitle: "Powered by Resend", icon: Mail, color: "#8B6914", status: "connected" },
];

const PLATFORM_META: Record<string, { label: string; color: string; bg: string }> = {
  whatsapp: { label: "WhatsApp", color: "#0E7C3A", bg: "rgba(37,211,102,0.15)" },
  meta:     { label: "Meta",     color: "#0F4FB0", bg: "rgba(24,119,242,0.15)" },
  twitter:  { label: "Twitter",  color: "#0F6AB4", bg: "rgba(29,161,242,0.15)" },
  email:    { label: "Email",    color: "#8B6914", bg: "rgba(139,105,20,0.15)" },
};

type ActivityRow = {
  id: string; created_at: string; action: string;
  platform: string; details: any;
};

function platformFromAction(a: string): string {
  if (a.startsWith("email_")) return "email";
  if (a.startsWith("whatsapp_")) return "whatsapp";
  if (a.startsWith("meta_")) return "meta";
  if (a.startsWith("twitter_")) return "twitter";
  return "email";
}


export default function AdminCommunicationsPage() {
  const [openModal, setOpenModal] = useState<Platform | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadActivity = async () => {
    const { data } = await supabase
      .from("admin_audit_logs")
      .select("id, created_at, action, details")
      .like("action", "%_blast_sent")
      .order("created_at", { ascending: false })
      .limit(50);
    const rows: ActivityRow[] = ((data ?? []) as any[]).map((r) => ({
      id: r.id, created_at: r.created_at, action: r.action,
      platform: platformFromAction(r.action), details: r.details ?? {},
    }));
    setActivity(rows);
    setLoading(false);
  };

  useEffect(() => { loadActivity(); }, []);

  const lastSentByPlatform: Record<string, string> = {};
  for (const r of activity) {
    if (!lastSentByPlatform[r.platform]) lastSentByPlatform[r.platform] = r.created_at;
  }
  const fmtRel = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    const h = Math.floor(ms / 3600000);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div>
      <PageHeader title="Communications Hub" subtitle="Send messages and manage social media from one place" />

      {/* Channels */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {CHANNELS.map((c) => {
          const Icon = c.icon;
          const last = lastSentByPlatform[c.id];
          return (
            <Card key={c.id}>
              <div className="flex items-start justify-between mb-4">
                <span className="grid place-items-center rounded-2xl"
                  style={{ width: 56, height: 56, background: `${c.color}15` }}>
                  <Icon size={28} color={c.color} />
                </span>
                <span style={{
                  fontFamily: "DM Sans, sans-serif", fontSize: 11, fontWeight: 600,
                  padding: "4px 10px", borderRadius: 999,
                  background: c.status === "connected" ? "rgba(16,185,129,0.12)" : "rgba(196,30,30,0.1)",
                  color: c.status === "connected" ? "#0F7B4F" : "#C41E1E",
                }}>
                  {c.status === "connected" ? "✓ Connected" : "⚠ Not Connected"}
                </span>
              </div>
              <h3 style={{ fontFamily: "Raleway, sans-serif", fontWeight: 700, fontSize: 17, color: "hsl(var(--fyn-ink))" }}>
                {c.title}
              </h3>
              <p className="mt-1" style={{ fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.6)" }}>
                {c.subtitle}
              </p>
              <div className="mt-3 flex items-center gap-1.5" style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "hsl(var(--fyn-ink) / 0.5)" }}>
                <Clock size={12} /> Last sent: {last ? fmtRel(last) : "Never"}
              </div>
              <button
                onClick={() => setOpenModal(c.id)}
                className="w-full mt-4 py-2.5 rounded-xl"
                style={{
                  background: c.status === "connected"
                    ? "linear-gradient(135deg, #C41E1E 0%, #8B6914 100%)"
                    : "transparent",
                  border: c.status === "connected" ? "none" : "1px solid rgba(23,18,8,0.18)",
                  color: c.status === "connected" ? "#FFFFFF" : "hsl(var(--fyn-ink) / 0.75)",
                  fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 14,
                }}
              >
                {c.status !== "connected"
                  ? "Setup required"
                  : c.id === "whatsapp" || c.id === "email" ? "Send Message" : c.id === "twitter" ? "Tweet" : "Create Post"}
              </button>

            </Card>
          );
        })}
      </div>

      {/* Recent Activity (from admin_audit_logs) */}
      <Card className="mb-8">
        <h2 className="mb-4" style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, fontSize: 22, color: "hsl(var(--fyn-ink))" }}>
          Recent Activity
        </h2>
        {loading ? (
          <div className="animate-pulse rounded-lg" style={{ height: 120, background: "rgba(139,105,20,0.06)" }} />
        ) : activity.length === 0 ? (
          <EmptyState icon={Send} title="No messages sent yet" hint="Sent broadcasts and posts will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontFamily: "Roboto, sans-serif", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(23,18,8,0.08)" }}>
                  {["Time", "Platform", "Action", "Recipients", ""].map((h) => (
                    <th key={h} className="text-left py-2.5 px-2"
                      style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 12, color: "hsl(var(--fyn-ink) / 0.6)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activity.map((row) => {
                  const meta = PLATFORM_META[row.platform];
                  const recipients = row.details?.sent ?? row.details?.total ?? "-";
                  return (
                    <tr key={row.id} style={{ borderBottom: "1px solid rgba(23,18,8,0.05)" }}>
                      <td className="py-3 px-2 whitespace-nowrap" style={{ color: "hsl(var(--fyn-ink) / 0.7)" }}>{new Date(row.created_at).toLocaleString("en-IN")}</td>
                      <td className="py-3 px-2">
                        <span style={{ padding: "3px 9px", borderRadius: 6, fontWeight: 600, fontSize: 11, background: meta.bg, color: meta.color }}>{meta.label}</span>
                      </td>
                      <td className="py-3 px-2" style={{ color: "hsl(var(--fyn-ink))" }}>{row.action}</td>
                      <td className="py-3 px-2 whitespace-nowrap" style={{ color: "hsl(var(--fyn-ink) / 0.7)" }}>{String(recipients)}</td>
                      <td className="py-3 px-2">
                        <button className="p-1.5 rounded-lg hover:bg-[hsl(var(--fyn-ink)/0.06)]" aria-label="View">
                          <Eye size={15} color="hsl(var(--fyn-ink) / 0.6)" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Scheduled, empty state, not yet implemented */}
      <Card>
        <h2 className="mb-4" style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, fontSize: 22, color: "hsl(var(--fyn-ink))" }}>
          Scheduled Posts
        </h2>
        <EmptyState icon={Calendar} title="No scheduled posts" hint="Scheduling will be available once we wire up a scheduler. For now, all messages send immediately." />
      </Card>

      {openModal && (
        CHANNELS.find((c) => c.id === openModal)?.status === "connected"
          ? <ComposeModal platform={openModal} onClose={() => { setOpenModal(null); loadActivity(); }} />
          : <SetupModal platform={openModal} onClose={() => setOpenModal(null)} />
      )}

    </div>
  );

}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    sent:      { bg: "rgba(16,185,129,0.12)", color: "#0F7B4F" },
    scheduled: { bg: "rgba(24,119,242,0.12)", color: "#0F4FB0" },
    failed:    { bg: "rgba(196,30,30,0.12)",  color: "#C41E1E" },
    draft:     { bg: "rgba(23,18,8,0.08)",    color: "hsl(var(--fyn-ink) / 0.7)" },
  };
  const m = map[status] ?? map.draft;
  return (
    <span style={{
      padding: "3px 9px", borderRadius: 6, fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 11,
      background: m.bg, color: m.color, textTransform: "capitalize",
    }}>{status}</span>
  );
}

function ComposeModal({ platform, onClose }: { platform: Platform; onClose: () => void }) {
  const [content, setContent] = useState("");
  const [audience, setAudience] = useState("all_users");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [facebook, setFacebook] = useState(true);
  const [instagram, setInstagram] = useState(false);
  const [postType, setPostType] = useState<"feed" | "story">("feed");
  const max = platform === "twitter" ? 280 : 1000;

  const [sending, setSending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const sendTest = async () => {
    if (!subject.trim() || !content.trim()) { toast.error("Subject and body are required"); return; }
    setSending(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const email = userRes?.user?.email;
      if (!email) { toast.error("Could not resolve your email"); return; }
      const { error } = await supabase.functions.invoke("email-blast", {
        body: { subject: `[TEST] ${subject}`, body: content, emails: [email] },
      });
      if (error) throw error;
      toast.success(`Test email sent to ${email}`);
    } catch (err) {
      console.error("Test email error:", err);
      toast.error((err as Error).message || "Failed to send test email");
    } finally {
      setSending(false);
    }
  };


  const send = async () => {
    if (platform === "email") {
      if (!subject.trim()) { toast.error("Subject is required"); return; }
      if (!content.trim()) { toast.error("Body is required"); return; }
    } else if (!content.trim()) {
      toast.error(platform === "twitter" ? "Tweet is empty" : "Message is empty"); return;
    }
    if (platform === "meta" && !facebook && !instagram) { toast.error("Select at least one platform"); return; }

    if (platform === "email") {
      setSending(true);
      try {
        const { data, error } = await supabase.functions.invoke("email-blast", {
          body: { audience, subject, body: content },
        });
        if (error) throw error;
        await logAdminAction({
          action: "email_blast_sent",
          target_type: "communications",
          details: { audience, subject, sent: data?.sent, failed: data?.failed, total: data?.total },
        });
        toast.success(`Email sent to ${data?.sent ?? 0} user${data?.sent === 1 ? "" : "s"}`);
        onClose();
      } catch (err) {
        console.error("Email blast error:", err);
        toast.error((err as Error).message || "Failed to send email blast");
      } finally {
        setSending(false);
      }
      return;
    }

    toast.error(`${PLATFORM_META[platform].label} is not connected yet — nothing was sent.`);

  };

  const title = platform === "twitter" ? "New Tweet"
    : platform === "email" ? "New Email Blast"
    : platform === "meta" ? "New Meta Post"
    : "New WhatsApp Message";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(23,18,8,0.5)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl rounded-2xl overflow-hidden"
        style={{ background: "#FFFFFF", boxShadow: "0 24px 64px rgba(0,0,0,0.3)", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(23,18,8,0.08)" }}>
          <h2 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 22, color: "hsl(var(--fyn-ink))" }}>{title}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[hsl(var(--fyn-ink)/0.05)]"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          {(platform === "whatsapp" || platform === "email") && (
            <Field label="Audience">
              <select value={audience} onChange={(e) => setAudience(e.target.value)} className="w-full rounded-lg px-3 py-2.5"
                style={{ border: "1px solid rgba(23,18,8,0.15)", fontFamily: "Roboto, sans-serif", fontSize: 14 }}>
                <option value="all_users">All users</option>
                <option value="pro_users">Pro users</option>
                <option value="trial_users">Trial users (ending soon)</option>
                <option value="churned_users">Churned users</option>
              </select>
            </Field>
          )}

          {platform === "meta" && (
            <>
              <Field label="Platforms">
                <div className="flex gap-4">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={facebook} onChange={(e) => setFacebook(e.target.checked)} /><span style={{ fontFamily: "Roboto, sans-serif", fontSize: 13 }}>Post to Facebook</span></label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={instagram} onChange={(e) => setInstagram(e.target.checked)} /><span style={{ fontFamily: "Roboto, sans-serif", fontSize: 13 }}>Post to Instagram</span></label>
                </div>
              </Field>
              <Field label="Post Type">
                <div className="flex gap-4">
                  <label className="flex items-center gap-2"><input type="radio" name="pt" checked={postType === "feed"} onChange={() => setPostType("feed")} /><span style={{ fontFamily: "Roboto, sans-serif", fontSize: 13 }}>Feed Post</span></label>
                  <label className="flex items-center gap-2"><input type="radio" name="pt" checked={postType === "story"} onChange={() => setPostType("story")} disabled={!instagram} /><span style={{ fontFamily: "Roboto, sans-serif", fontSize: 13, opacity: instagram ? 1 : 0.5 }}>Story (Instagram only)</span></label>
                </div>
              </Field>
            </>
          )}

          {platform === "email" && (
            <>
              <Field label="Subject">
                <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-lg px-3 py-2.5"
                  placeholder="Your trial is ending in 3 days"
                  style={{ border: "1px solid rgba(23,18,8,0.15)", fontFamily: "Roboto, sans-serif", fontSize: 14 }} />
              </Field>
              <Field label="Preheader">
                <input value={preheader} onChange={(e) => setPreheader(e.target.value.slice(0, 140))} className="w-full rounded-lg px-3 py-2.5"
                  placeholder="Don't lose access to your financial data"
                  style={{ border: "1px solid rgba(23,18,8,0.15)", fontFamily: "Roboto, sans-serif", fontSize: 14 }} />
                <div className="mt-1" style={{ fontSize: 11, color: "hsl(var(--fyn-ink) / 0.5)" }}>{preheader.length}/140 characters</div>
              </Field>
            </>
          )}

          <Field label={platform === "email" ? "Body" : platform === "twitter" ? "Tweet" : "Message"}>
            <textarea
              value={content}
              onChange={(e) => {
                const v = e.target.value;
                if (platform === "twitter" && v.length > max) return;
                setContent(platform === "twitter" ? v : v.slice(0, max));
              }}
              rows={platform === "twitter" ? 4 : 8}
              placeholder={
                platform === "whatsapp" ? "Type your WhatsApp message…"
                  : platform === "twitter" ? "What's happening?"
                  : platform === "meta" ? "What's on your mind?"
                  : "Write your email body…"
              }
              className="w-full rounded-lg px-3 py-2.5 resize-y"
              style={{ border: "1px solid rgba(23,18,8,0.15)", fontFamily: "Roboto, sans-serif", fontSize: 14, lineHeight: 1.5 }}
            />
            <div className="mt-1 text-right" style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: content.length > max * 0.95 ? "#C41E1E" : content.length > max * 0.85 ? "#B45309" : "hsl(var(--fyn-ink) / 0.5)" }}>
              {content.length} / {max}
            </div>
            {platform === "twitter" && content.length > 270 && (
              <div className="mt-2 p-2 rounded" style={{ background: "rgba(196,30,30,0.1)", fontSize: 12, color: "#C41E1E" }}>
                ⚠️ Tweet is approaching the character limit
              </div>
            )}
            {platform === "email" && (
              <div className="mt-1" style={{ fontSize: 11, color: "hsl(var(--fyn-ink) / 0.5)" }}>
                Variables: {`{{user_name}}`}, {`{{company_name}}`}, {`{{plan_name}}`}, {`{{trial_end_date}}`}
              </div>
            )}
          </Field>

          {platform === "email" && previewOpen && (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(23,18,8,0.12)" }}>
              <div className="px-4 py-2" style={{ background: "rgba(244,237,218,0.6)", fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 12, color: "hsl(var(--fyn-ink))" }}>
                Preview — {subject || "(no subject)"}
              </div>
              <div className="p-4" style={{ background: "#fff", fontFamily: "Roboto, sans-serif", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}
                dangerouslySetInnerHTML={{ __html: sanitizeRichText(content) }} />
            </div>
          )}
        </div>


        <div className="flex items-center justify-between gap-3 px-6 py-4" style={{ borderTop: "1px solid rgba(23,18,8,0.08)", background: "rgba(244,237,218,0.4)" }}>
          <div className="flex gap-2">
            {platform === "email" && (
              <>
                <button onClick={() => setPreviewOpen((p) => !p)} className="px-3 py-2 rounded-lg" style={{ border: "1px solid rgba(23,18,8,0.15)", fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 12, color: "hsl(var(--fyn-ink))" }}>
                  {previewOpen ? "Hide Preview" : "Preview"}
                </button>
                <button onClick={sendTest} disabled={sending} className="px-3 py-2 rounded-lg" style={{ border: "1px solid rgba(23,18,8,0.15)", fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 12, color: "hsl(var(--fyn-ink))", opacity: sending ? 0.6 : 1 }}>Send Test</button>
              </>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg"
              style={{ border: "1px solid rgba(23,18,8,0.15)", fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 14, color: "hsl(var(--fyn-ink))" }}>
              Cancel
            </button>
            <button onClick={send} disabled={sending} className="flex items-center gap-2 px-5 py-2 rounded-lg text-white"
              style={{ background: "linear-gradient(135deg, #C41E1E 0%, #8B6914 100%)", fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 14, opacity: sending ? 0.6 : 1 }}>
              <Send size={14} /> {sending ? "Sending…" : platform === "twitter" ? "Tweet" : platform === "meta" ? "Post Now" : "Send Now"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const SETUP_STEPS: Record<Platform, { title: string; steps: string[] }> = {
  whatsapp: {
    title: "WhatsApp Business",
    steps: [
      "Connect a WhatsApp Business API provider (Twilio or Meta Cloud API).",
      "Verify your business number and get message templates approved.",
      "Add the provider credentials as backend secrets, then broadcasting turns on here.",
    ],
  },
  meta: {
    title: "Facebook & Instagram",
    steps: [
      "Create a Meta app and link your Facebook Page + Instagram business account.",
      "Grant pages_manage_posts and instagram_content_publish permissions.",
      "Store the long-lived page access token as a backend secret.",
    ],
  },
  twitter: {
    title: "Twitter / X",
    steps: [
      "Create an X developer project with write access.",
      "Generate OAuth 2.0 credentials for the posting account.",
      "Store the credentials as backend secrets to enable posting.",
    ],
  },
  email: { title: "Email", steps: [] },
};

function SetupModal({ platform, onClose }: { platform: Platform; onClose: () => void }) {
  const info = SETUP_STEPS[platform];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(23,18,8,0.5)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(23,18,8,0.08)" }}>
          <h2 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 20, color: "hsl(var(--fyn-ink))" }}>
            {info.title} — not connected
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[hsl(var(--fyn-ink)/0.05)]"><X size={18} /></button>
        </div>
        <div className="p-6">
          <p className="mb-4" style={{ fontFamily: "Roboto, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink) / 0.75)" }}>
            This channel has no provider connected yet, so no messages can be sent from FynHelp. To enable it:
          </p>
          <ol className="space-y-2 list-decimal pl-5" style={{ fontFamily: "Roboto, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink) / 0.85)" }}>
            {info.steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <div className="mt-5 p-3 rounded-lg" style={{ background: "rgba(139,105,20,0.08)", fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.7)" }}>
            Email Blast is live today and can reach the same audiences.
          </div>
        </div>
        <div className="flex justify-end px-6 py-4" style={{ borderTop: "1px solid rgba(23,18,8,0.08)", background: "rgba(244,237,218,0.4)" }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg" style={{ border: "1px solid rgba(23,18,8,0.15)", fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 14, color: "hsl(var(--fyn-ink))" }}>Close</button>
        </div>
      </div>
    </div>
  );
}



function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block mb-1.5" style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 13, color: "hsl(var(--fyn-ink))" }}>{label}</span>
      {children}
    </label>
  );
}
