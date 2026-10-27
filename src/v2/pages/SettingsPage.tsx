import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  disconnectGmail,
  pollGmailNow,
  startGmailConnect,
} from "@/lib/caGmail.functions";
import {
  getPracticeIntegrations,
  invitePracticeMember,
  listPracticeTeam,
  revokePracticeMember,
} from "@/lib/practice/practice.functions";
import { Badge, Card, EmptyState, PageHeader, V, formatDate } from "../ui";
import { Lock } from "lucide-react";
import { RowSkeleton, ShimmerText } from "../agents";
import { useV2 } from "../store";
import { AgentSettings } from "../components/AgentSettings";
import { BillingSection } from "../components/BillingSection";
import { CreditsPanel } from "../components/CreditsPanel";
import { ReferralCard } from "../components/ReferralCard";
import { GmailHealth } from "../components/GmailHealth";
import { ChaserSending } from "../components/ChaserSending";
import { WhatsappSetup } from "../components/WhatsappSetup";
import { parseMobile } from "@/lib/practice/mobile";
import { TallyConnector } from "../components/TallyConnector";
import { GmailIcon, TallyIcon, WhatsAppIcon } from "../components/BrandIcons";
import { ZohoBooksSection } from "../components/ZohoBooks";
import { INTEGRATION_STYLES, IntegrationCard } from "../components/IntegrationCard";
import { Link } from "@tanstack/react-router";
import { FileSpreadsheet, UploadCloud } from "lucide-react";

type Team = Awaited<ReturnType<typeof listPracticeTeam>>;
type Integrations = Awaited<ReturnType<typeof getPracticeIntegrations>>;

const errMsg = (e: unknown) => (e instanceof Error && e.message && e.message !== "[object Object]" ? e.message : typeof e === "string" ? e : "Something went wrong. Please try again.");

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 15.5, marginBottom: subtitle ? 4 : 14 }}>
        {title}
      </h3>
      {subtitle && (
        <p style={{ fontSize: 12.5, color: V.muted, margin: "0 0 14px" }}>
          {subtitle}
        </p>
      )}
      {children}
    </Card>
  );
}

const Row = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "minmax(0,1fr) auto",
      gap: 12,
      alignItems: "center",
      background: V.gray,
      borderRadius: 14,
      padding: "12px 14px",
    }}
  >
    {children}
  </div>
);

/** Starts Google consent; the callback page brings the user back here. */
export const GMAIL_RETURN_KEY = "fynhelp.gmail.return";

export default function SettingsPage() {
  const { firm, firmId, saveFirm, session, partnerView, canSignOff, setRole } = useV2();
  const [form, setForm] = useState({ name: "", city: "", frn: "", email: "", phone: "", whatsappOk: false });
  const [team, setTeam] = useState<Team | null>(null);
  const [intg, setIntg] = useState<Integrations | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [invite, setInvite] = useState({
    email: "",
    role: "junior" as Team["roles"][number],
  });
  const [tallyOnline, setTallyOnline] = useState(false);
  const [profileName, setProfileName] = useState(session?.name ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [gmailResult, setGmailResult] = useState<string | null>(null);
  // Back from Google: check the inbox straight away and show the health check.
  const [justConnected] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("gmail") === "connected";
  });

  const startGmail = useServerFn(startGmailConnect);
  const pollGmail = useServerFn(pollGmailNow);
  const stopGmail = useServerFn(disconnectGmail);

  useEffect(() => {
    if (firm)
      setForm({
        name: firm.name,
        city: firm.city,
        frn: firm.frn,
        email: firm.email,
        phone: firm.phone ?? "",
        whatsappOk: Boolean(firm.whatsappOk),
      });
  }, [firm]);
  useEffect(() => {
    setProfileName(session?.name ?? "");
  }, [session]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [t, i] = await Promise.all([
        listPracticeTeam(),
        getPracticeIntegrations(),
      ]);
      setTeam(t);
      setIntg(i);
    } catch (e) {
      setLoadError(errMsg(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast.success(ok);
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const sendInvite = () =>
    run("invite", async () => {
      const r = await invitePracticeMember({
        data: {
          email: invite.email,
          role: invite.role,
          origin: window.location.origin,
        },
      });
      if (r.simulated)
        toast.info(
          `Invite ready. Send this link to them on WhatsApp or email: ${r.link}`,
        );
      else if (!r.emailed)
        toast.error(
          `The invite email didn't go out. Send this link to them on WhatsApp or email instead: ${r.link}`,
        );
      else toast.success(`Invite emailed to ${invite.email}`);
      setInvite({ ...invite, email: "" });
    });

  // The first check right after connecting, so the partner sees it working.
  const firstCheck = useRef(false);
  useEffect(() => {
    if (!justConnected || !firmId || firstCheck.current) return;
    firstCheck.current = true;
    void pollGmail({ data: { firmId, origin: window.location.origin } })
      .then((r) => setGmailResult(r.detail))
      .catch((e) => setGmailResult(errMsg(e)))
      .finally(() => void load());
  }, [justConnected, firmId, pollGmail, load]);

  const connectGmail = (enableSending = false) =>
    run("gmail", async () => {
      if (!firmId) throw new Error("Create your practice first");
      try {
        window.sessionStorage.setItem(GMAIL_RETURN_KEY, "/app/settings");
      } catch {
        /* private mode */
      }
      const { url } = await startGmail({
        data: { firmId, origin: window.location.origin, enableSending },
      });
      window.location.href = url;
    });

  const webhook =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/whatsapp-webhook`
      : "/api/public/whatsapp-webhook";

  // Settings are firm administration: partners only, whatever the address bar says.
  if (!partnerView)
    return (
      <>
        <PageHeader title="Settings" subtitle="Firm details, team, integrations and agent automation." />
        <EmptyState
          icon={<Lock size={22} />}
          title="Settings are for partners"
          description={
            canSignOff
              ? "You are working as Junior. Switch to Partner to change firm details, the team, integrations or what the agents remember."
              : "Ask a partner in your firm to change firm details, the team, integrations or what the agents remember."
          }
          action={
            canSignOff ? (
              <button className="v2-btn v2-btn-primary" onClick={() => setRole("Partner")}>Switch to Partner</button>
            ) : (
              <a className="v2-btn v2-btn-primary" href="/app">Back to Portfolio</a>
            )
          }
        />
      </>
    );

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Firm, team, intake channels and your profile."
      />

      {loadError && (
        <Card style={{ marginBottom: 16, borderLeft: `3px solid ${V.maroon}` }}>
          <div style={{ fontSize: 13, color: V.maroon }}>
            Could not load settings: {loadError}
          </div>
          <button
            className="v2-btn v2-btn-ghost"
            style={{ marginTop: 10 }}
            onClick={() => void load()}
          >
            Try again
          </button>
        </Card>
      )}

      <BillingSection />
      <CreditsPanel />
      <ReferralCard />

      <Section
        title="Firm profile"
        subtitle="Shown on every MIS and on the emails the Chaser sends."
      >
        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "repeat(auto-fit,minmax(min(200px, 100%), 1fr))",
          }}
        >
          <div>
            <label className="v2-label" htmlFor="settings-firm-name">Firm name</label>
            <input id="settings-firm-name"
              className="v2-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="v2-label" htmlFor="settings-city">City</label>
            <input id="settings-city"
              className="v2-input"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </div>
          <div>
            <label className="v2-label" htmlFor="settings-firm-registration-number">Firm registration number</label>
            <input id="settings-firm-registration-number"
              className="v2-input"
              value={form.frn}
              onChange={(e) => setForm({ ...form, frn: e.target.value })}
            />
          </div>
          <div>
            <label className="v2-label" htmlFor="settings-mobile">Your mobile number</label>
            <input id="settings-mobile"
              className="v2-input"
              type="tel"
              inputMode="tel"
              placeholder="98200 11223"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <div style={{ fontSize: 11.5, color: V.muted, marginTop: 4 }}>So a person at FynHelp can reach you if something needs help. Never shared.</div>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>
              <input type="checkbox" checked={form.whatsappOk} onChange={(e) => setForm({ ...form, whatsappOk: e.target.checked })} style={{ marginTop: 3 }} />
              <span>Message me on WhatsApp about my set-up, my trial and my plan. You can reply STOP at any time.</span>
            </label>
          </div>
          <div>
            <label className="v2-label" htmlFor="settings-reply-to-email">Reply-to email</label>
            <input id="settings-reply-to-email"
              className="v2-input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
        </div>
        <button
          className="v2-btn v2-btn-primary"
          style={{ marginTop: 16 }}
          disabled={!form.name.trim()}
          onClick={async () => {
            if (form.phone.trim() && !parseMobile(form.phone)) {
              toast.error("Enter a valid mobile number, for example 98200 11223.");
              return;
            }
            const ok = await saveFirm(
              {
                name: form.name.trim(),
                city: form.city.trim(),
                frn: form.frn.trim(),
                email: form.email.trim(),
                phone: form.phone.trim(),
                whatsappOk: form.whatsappOk,
              },
              { settings: true },
            );
            if (ok) toast.success("Firm details saved");
          }}
        >
          Save changes
        </button>
      </Section>

      <Section
        title="Team"
        subtitle="Invite colleagues by email. They join this practice when they sign up with that address."
      >
        {!team ? (
          <RowSkeleton rows={2} />
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {team.members.map((m) => (
              <Row key={m.id}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                    {m.name ?? m.email ?? "Invited"}
                    {m.isYou ? " (you)" : ""}
                  </div>
                  <div style={{ fontSize: 12, color: V.muted }}>{m.email}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Badge tone="info">{m.role}</Badge>
                  {m.status === "pending" && (
                    <Badge tone="warn">Invite pending</Badge>
                  )}
                  {team.canManage && !m.isYou && (
                    <button
                      className="v2-btn v2-btn-quiet"
                      disabled={busy === m.id}
                      onClick={() =>
                        run(
                          m.id,
                          () => revokePracticeMember({ data: { id: m.id } }),
                          m.status === "pending"
                            ? "Invite cancelled"
                            : "Removed from the team",
                        )
                      }
                    >
                      {m.status === "pending" ? "Cancel" : "Remove"}
                    </button>
                  )}
                </div>
              </Row>
            ))}
            {team.canManage && partnerView ? (
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 6,
                  flexWrap: "wrap",
                }}
              >
                <input
                  className="v2-input"
                  style={{ flex: "1 1 220px" }}
                  type="email"
                  placeholder="colleague@firm.com"
                  value={invite.email}
                  onChange={(e) =>
                    setInvite({ ...invite, email: e.target.value })
                  }
                />
                <select
                  className="v2-input"
                  style={{ width: "auto" }}
                  value={invite.role}
                  onChange={(e) =>
                    setInvite({
                      ...invite,
                      role: e.target.value as Team["roles"][number],
                    })
                  }
                >
                  {team.roles.map((r) => (
                    <option key={r} value={r}>
                      {r === "partner" ? "Partner · can sign off reports" : r === "junior" ? "Junior · prepares, cannot sign off" : r[0].toUpperCase() + r.slice(1)}
                    </option>
                  ))}
                </select>
                <button
                  className="v2-btn v2-btn-primary"
                  disabled={!invite.email.trim() || busy === "invite"}
                  onClick={sendInvite}
                >
                  {busy === "invite" ? "Inviting" : "Send invite"}
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: V.muted }}>
                Only a partner can invite or remove people.
              </div>
            )}
          </div>
        )}
      </Section>

      <Section
        title="Integrations"
        subtitle="Documents that arrive here go straight to the Extract agent. Unknown senders land in the Unassigned inboxes on the Documents page."
      >
        {!intg ? (
          <RowSkeleton rows={2} />
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <style>{INTEGRATION_STYLES}</style>
            <div className="ic-list" data-testid="integrations">
            <IntegrationCard
              index={0}
              testId="gmail-card"
              icon={<GmailIcon size={26} />}
              tint="rgba(66,133,244,.08)"
              name="Gmail"
              description={
                !intg.gmail.available
                  ? "Gmail isn't switched on for FynHelp yet. Until it is, upload files on the Documents page."
                  : intg.gmail.connections.some((c) => c.is_active)
                    ? intg.gmail.connections
                        .filter((c) => c.is_active)
                        .map((c) => `${c.gmail_address}${c.last_polled_at ? ` · checked ${formatDate(c.last_polled_at)}` : " · first check covers the last 7 days"}`)
                        .join(" · ")
                    : "Statements and bills your clients email to the firm inbox come in on their own, every few minutes."
              }
              status={
                intg.gmail.connections.some((c) => c.is_active)
                  ? { tone: "good", label: "Connected", live: true }
                  : intg.gmail.connections.some((c) => c.error_message)
                    ? { tone: "bad", label: "Needs reconnecting" }
                    : intg.gmail.available
                      ? { tone: "neutral", label: "Not connected" }
                      : { tone: "warn", label: "Not switched on yet" }
              }
              defaultOpen={justConnected}
              actions={
                <>
                {intg.gmail.connections.some((c) => c.is_active) ? (
                  <>
                    <button
                      className="v2-btn v2-btn-ghost"
                      disabled={busy === "poll"}
                      data-working={busy === "poll"}
                      onClick={() =>
                        run(
                          "poll",
                          async () => {
                            const r = await pollGmail({
                              data: {
                                firmId: firmId!,
                                origin: window.location.origin,
                              },
                            });
                            // Say what was found, not just that it ran; keep it on screen.
                            setGmailResult(r.detail);
                            if (r.ok) toast.success(r.detail);
                            else toast.error(r.detail);
                          },
                        )
                      }
                    >
                      {busy === "poll" ? (
                        <>
                          <span className="v2-dot" style={{ background: V.ink }} />
                          <ShimmerText text="Checking inbox…" />
                        </>
                      ) : (
                        "Check now"
                      )}
                    </button>
                    {intg.gmail.connections
                      .filter((c) => c.is_active)
                      .map((c) => (
                        <button
                          key={c.id}
                          className="v2-btn v2-btn-quiet"
                          disabled={busy === "gmail-off"}
                          onClick={() =>
                            run(
                              "gmail-off",
                              () =>
                                stopGmail({
                                  data: { connectionId: c.id, firmId: firmId! },
                                }),
                              "Gmail disconnected",
                            )
                          }
                        >
                          Disconnect
                        </button>
                      ))}
                  </>
                ) : (
                  <>
                    {intg.gmail.available && (
                      <button
                        className="v2-btn v2-btn-primary"
                        style={{ padding: "8px 16px", fontSize: 13 }}
                        disabled={busy === "gmail"}
                        onClick={() => void connectGmail()}
                      >
                        {busy === "gmail" ? <><span className="ic-spin" /> Opening Google…</> : "Connect"}
                      </button>
                    )}
                  </>
                )}
                </>
              }
            >
              {intg.gmail.available && firmId ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {intg.gmail.connections
                    .filter((c) => c.error_message)
                    .map((c) => (
                      <div key={c.id} style={{ fontSize: 12.5, color: V.maroon }}>
                        {c.gmail_address}: {c.error_message}
                      </div>
                    ))}
                  <GmailHealth firmId={firmId} lastResult={gmailResult} autoRun={justConnected} />
                  {intg.gmail.connections.some((c) => c.is_active) && (
                    <ChaserSending firmId={firmId} busy={busy === "gmail"} onAllow={() => void connectGmail(true)} />
                  )}
                </div>
              ) : undefined}
            </IntegrationCard>

            <ZohoBooksSection index={1} />

            <IntegrationCard
              index={2}
              testId="whatsapp-card"
              icon={<WhatsAppIcon size={26} />}
              tint="rgba(37,211,102,.1)"
              name="WhatsApp Business"
              description={
                intg.whatsapp.channels.length
                  ? intg.whatsapp.channels
                      .map((c) => `${c.display_phone ?? c.phone_number_id}${c.last_message_at ? ` · last document ${formatDate(c.last_message_at)}` : ""}`)
                      .join(" · ")
                  : "Chase clients and receive their documents on WhatsApp, from FynHelp's number or your own."
              }
              status={
                intg.whatsapp.channels.some((c) => c.is_active)
                  ? { tone: "good", label: "Connected", live: true }
                  : intg.whatsapp.sharedReady
                    ? { tone: "good", label: "Using FynHelp's number", live: true }
                    : { tone: "neutral", label: "Not connected" }
              }
            >
              {firmId ? <WhatsappSetup firmId={firmId} webhook={webhook} onChanged={() => void load()} /> : undefined}
            </IntegrationCard>

            <IntegrationCard
              index={3}
              testId="tally-card"
              icon={<TallyIcon size={26} />}
              tint="rgba(31,78,140,.08)"
              name="TallyPrime"
              tag={<span style={{ fontSize: 11, color: V.muted, fontWeight: 600 }}>VIA EXPORT</span>}
              description="Connect TallyPrime live with the FynHelp Connector, or export the bank ledger as XML and drop it on Documents. Works with Tally on office PCs and Tally on Cloud."
              status={tallyOnline ? { tone: "good", label: "Connected", live: true } : { tone: "good", label: "Ready" }}
              actions={
                <Link to="/app/documents" className="v2-btn v2-btn-ghost" style={{ padding: "8px 14px", fontSize: 13 }}>
                  <UploadCloud size={14} /> Upload export
                </Link>
              }
            >
              <div style={{ display: "grid", gap: 14 }}>
              <TallyConnector onChange={setTallyOnline} />
              <div style={{ display: "grid", gap: 8, fontSize: 13, color: V.body, borderTop: `1px solid ${V.line}`, paddingTop: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, color: V.ink }}>Or upload an export by hand</div>
                <div>
                  In TallyPrime: Display More Reports → Account Books → Ledger → the bank ledger, <span className="num">Alt+F2</span> for the month, then{" "}
                  <span className="num">Alt+E</span> → Current → XML (Data Interchange).
                </div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  <a href="/blog/tally-export-to-fynhelp" target="_blank" rel="noreferrer" style={{ color: V.maroon, fontWeight: 600 }}>
                    Step-by-step guide (office PCs) →
                  </a>
                  <a href="/blog/tally-on-cloud-to-fynhelp" target="_blank" rel="noreferrer" style={{ color: V.maroon, fontWeight: 600 }}>
                    Tally on Cloud / Remote Desktop →
                  </a>
                </div>
              </div>
              </div>
            </IntegrationCard>
            </div>

            <Row>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  Chaser email
                </div>
                <div style={{ fontSize: 12.5, color: V.body, marginTop: 3 }}>
                  Follow-up emails go out from FynHelp with your firm name, and
                  replies come to your reply-to address.
                </div>
              </div>
              <Badge tone={intg.email.available ? "good" : "warn"}>
                {intg.email.available
                  ? "Sending"
                  : "Not switched on yet"}
              </Badge>
            </Row>

            <Row>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  Document reading
                </div>
                <div style={{ fontSize: 12.5, color: V.body, marginTop: 3 }}>
                  CSV, Excel, Tally and text PDFs are read in code with no AI.
                  Scans and photos need OCR (or a vision model). The AI only
                  classifies, and every amount it reads must appear in the
                  document.
                </div>
              </div>
              <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                <Badge tone={intg.reading.ocr || intg.reading.vision ? "good" : "warn"}>
                  {intg.reading.ocr
                    ? "Scans: OCR on"
                    : intg.reading.vision
                      ? "Scans: vision on"
                      : "Scans and photos: not switched on yet"}
                </Badge>
                <Badge tone={intg.reading.ai ? "good" : "neutral"}>
                  {intg.reading.ai ? "Smart reading on" : "Standard reading"}
                </Badge>
              </div>
            </Row>
          </div>
        )}
      </Section>

      <AgentSettings />

      <Section title="Profile">
        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "repeat(auto-fit,minmax(min(200px, 100%), 1fr))",
          }}
        >
          <div>
            <label className="v2-label" htmlFor="settings-name">Name</label>
            <input id="settings-name"
              className="v2-input"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
            />
          </div>
          <div>
            <label className="v2-label" htmlFor="settings-email">Email</label>
            <input id="settings-email" className="v2-input" value={session?.email ?? ""} disabled />
          </div>
        </div>
        <button
          className="v2-btn v2-btn-primary"
          style={{ marginTop: 16 }}
          disabled={!profileName.trim() || busy === "profile"}
          onClick={() =>
            run(
              "profile",
              async () => {
                const { error } = await supabase.auth.updateUser({
                  data: { full_name: profileName.trim() },
                });
                if (error) throw error;
              },
              "Profile saved",
            )
          }
        >
          Save profile
        </button>
      </Section>
    </>
  );
}
