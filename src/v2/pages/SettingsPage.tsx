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
import { Badge, Card, EmptyState, PageHeader, Segmented, V, formatDate } from "../ui";
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
import { CONTROLS_STYLES, Checkbox, Disclosure, Field, SettingRow } from "../components/Controls";
import { Link } from "@tanstack/react-router";
import { UploadCloud } from "lucide-react";

type Team = Awaited<ReturnType<typeof listPracticeTeam>>;
type Integrations = Awaited<ReturnType<typeof getPracticeIntegrations>>;

const TABS = ["general", "billing", "integrations", "team", "automations"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { general: "General", billing: "Billing", integrations: "Integrations", team: "Team", automations: "Automations" };

/** Which tab to open: the address (?tab=), a link to #billing, or coming back from Google. */
function firstTab(): Tab {
  if (typeof window === "undefined") return "general";
  const q = new URLSearchParams(window.location.search);
  const t = q.get("tab");
  if (t && (TABS as readonly string[]).includes(t)) return t as Tab;
  if (window.location.hash.replace("#", "") === "billing") return "billing";
  if (q.get("gmail") === "connected") return "integrations";
  return "general";
}

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
  const [tab, setTabState] = useState<Tab>(firstTab);
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

  /** Changes tab and keeps it in the address, so a refresh or a shared link lands on the same tab. */
  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("tab", t);
      u.hash = "";
      window.history.replaceState(null, "", u.toString());
    } catch {
      /* no address to update */
    }
  };

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
        window.sessionStorage.setItem(GMAIL_RETURN_KEY, "/app/settings?tab=integrations");
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
        <PageHeader title="Settings" subtitle="Firm details, team, integrations and automations." />
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

  const gmailActive = intg?.gmail.connections.some((c) => c.is_active) ?? false;
  const gmailError = intg?.gmail.connections.find((c) => c.error_message) ?? null;
  const waActive = intg ? intg.whatsapp.channels.some((c) => c.is_active) || intg.whatsapp.sharedReady : false;

  return (
    <>
      <style>{CONTROLS_STYLES}</style>
      <PageHeader
        title="Settings"
        subtitle="Your firm, billing, connections, team and automations."
      />

      <div style={{ overflowX: "auto", marginBottom: 18, paddingBottom: 2 }}>
        <Segmented
          label="Settings sections"
          value={tab}
          onChange={setTab}
          options={TABS.map((t) => ({ value: t, label: TAB_LABEL[t] }))}
        />
      </div>

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

      {tab === "general" && (
        <>
          <Section
            title="Firm profile"
            subtitle="Shown on every MIS and on the emails the Chaser sends."
          >
            <div
              style={{
                display: "grid",
                gap: 16,
                gridTemplateColumns: "repeat(auto-fit,minmax(min(220px, 100%), 1fr))",
              }}
            >
              <Field label="Firm name" htmlFor="settings-firm-name">
                <input id="settings-firm-name" className="v2-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="City" htmlFor="settings-city">
                <input id="settings-city" className="v2-input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </Field>
              <Field label="Firm registration number" htmlFor="settings-firm-registration-number">
                <input id="settings-firm-registration-number" className="v2-input" value={form.frn} onChange={(e) => setForm({ ...form, frn: e.target.value })} />
              </Field>
              <Field label="Reply-to email" htmlFor="settings-reply-to-email" hint="Clients' replies to the Chaser's emails come here.">
                <input id="settings-reply-to-email" className="v2-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Your mobile number" htmlFor="settings-mobile" hint="So a person at FynHelp can reach you if something needs help. Never shared.">
                <input id="settings-mobile" className="v2-input" type="tel" inputMode="tel" placeholder="98200 11223" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
            </div>
            <div style={{ marginTop: 14 }}>
              <Checkbox checked={form.whatsappOk} onChange={(v) => setForm({ ...form, whatsappOk: v })}>
                Setup tips and trial alerts on WhatsApp. Reply STOP anytime to opt out.
              </Checkbox>
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

          <Section title="Your profile">
            <div
              style={{
                display: "grid",
                gap: 16,
                gridTemplateColumns: "repeat(auto-fit,minmax(min(220px, 100%), 1fr))",
              }}
            >
              <Field label="Name" htmlFor="settings-name">
                <input id="settings-name" className="v2-input" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
              </Field>
              <Field label="Email" htmlFor="settings-email" hint="This is how you sign in.">
                <input id="settings-email" className="v2-input" value={session?.email ?? ""} disabled />
              </Field>
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
      )}

      {tab === "billing" && (
        <>
          <BillingSection />
          <CreditsPanel />
          <ReferralCard />
        </>
      )}

      {tab === "integrations" && (
        <Section
          title="Integrations"
          subtitle="Documents that arrive through a connection go straight to the Extract agent. Anything from an unknown sender waits in the Unassigned inboxes on the Documents page."
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
                      : gmailActive
                        ? intg.gmail.connections
                            .filter((c) => c.is_active)
                            .map((c) => `${c.gmail_address}${c.last_polled_at ? ` · checked ${formatDate(c.last_polled_at)}` : " · first check covers the last 7 days"}`)
                            .join(" · ")
                        : "Statements and bills your clients email to the firm inbox come in on their own, every few minutes."
                  }
                  status={
                    busy === "poll"
                      ? { tone: "neutral", label: "Syncing", live: true }
                      : gmailActive
                        ? { tone: "good", label: "Active", live: true }
                        : gmailError
                          ? { tone: "bad", label: "Error" }
                          : intg.gmail.available
                            ? { tone: "neutral", label: "Not connected" }
                            : { tone: "warn", label: "Not available yet" }
                  }
                  defaultOpen={justConnected}
                  nextStep={
                    intg.gmail.available && !gmailActive
                      ? gmailError
                        ? { text: "Gmail needs to be reconnected before new mail comes in.", cta: "Reconnect Gmail", onClick: () => void connectGmail(), busy: busy === "gmail" }
                        : { text: "Connect the firm inbox and statements arrive on their own.", cta: "Connect Gmail", onClick: () => void connectGmail(), busy: busy === "gmail" }
                      : undefined
                  }
                  actions={
                    gmailActive ? (
                      <>
                        <button
                          className="v2-btn v2-btn-ghost"
                          disabled={busy === "poll"}
                          data-working={busy === "poll"}
                          onClick={() =>
                            run("poll", async () => {
                              const r = await pollGmail({ data: { firmId: firmId!, origin: window.location.origin } });
                              // Say what was found, not just that it ran; keep it on screen.
                              setGmailResult(r.detail);
                              if (r.ok) toast.success(r.detail);
                              else toast.error(r.detail);
                            })
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
                              onClick={() => run("gmail-off", () => stopGmail({ data: { connectionId: c.id, firmId: firmId! } }), "Gmail disconnected")}
                            >
                              Disconnect
                            </button>
                          ))}
                      </>
                    ) : undefined
                  }
                >
                  {intg.gmail.available && firmId && gmailActive ? (
                    <div style={{ display: "grid", gap: 12 }}>
                      {gmailError && (
                        <div role="alert" style={{ fontSize: 12.5, color: V.maroon }}>
                          {gmailError.gmail_address}: {gmailError.error_message}
                        </div>
                      )}
                      <ChaserSending firmId={firmId} busy={busy === "gmail"} onAllow={() => void connectGmail(true)} />
                      <Disclosure label="Connection check" defaultOpen={justConnected}>
                        <GmailHealth firmId={firmId} lastResult={gmailResult} autoRun={justConnected} />
                      </Disclosure>
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
                      ? { tone: "good", label: "Active", live: true }
                      : intg.whatsapp.sharedReady
                        ? { tone: "good", label: "Active", live: true }
                        : { tone: "neutral", label: "Not connected" }
                  }
                  nextStep={waActive ? undefined : { text: "Pick FynHelp's number or link your own to start chasing on WhatsApp.", cta: "Set up WhatsApp" }}
                >
                  {firmId ? <WhatsappSetup firmId={firmId} webhook={webhook} onChanged={() => void load()} /> : undefined}
                </IntegrationCard>

                <IntegrationCard
                  index={3}
                  testId="tally-card"
                  icon={<TallyIcon size={26} />}
                  tint="rgba(31,78,140,.08)"
                  name="TallyPrime"
                  tag={<span style={{ fontSize: 11, color: V.muted, fontWeight: 600 }}>OR VIA EXPORT</span>}
                  description="Connect TallyPrime live with the FynHelp Connector, or export the bank ledger and drop it on Documents. Works with Tally on office PCs and Tally on Cloud."
                  status={tallyOnline ? { tone: "good", label: "Active", live: true } : { tone: "neutral", label: "Not connected" }}
                  nextStep={tallyOnline ? undefined : { text: "Install the Connector on the PC that runs Tally, or upload an export.", cta: "Set up Tally" }}
                  actions={
                    <Link to="/app/documents" className="v2-btn v2-btn-ghost" style={{ padding: "8px 14px", fontSize: 13 }}>
                      <UploadCloud size={14} /> Upload export
                    </Link>
                  }
                >
                  <div style={{ display: "grid", gap: 14 }}>
                    <TallyConnector onChange={setTallyOnline} />
                    <Disclosure label="Or upload an export by hand">
                      <div style={{ display: "grid", gap: 8, fontSize: 13, color: V.body }}>
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
                    </Disclosure>
                  </div>
                </IntegrationCard>
              </div>

              <div>
                <SettingRow title="Chaser email" description="Follow-up emails go out from FynHelp with your firm name, and replies come to your reply-to address.">
                  <Badge tone={intg.email.available ? "good" : "warn"}>{intg.email.available ? "Active" : "Not available yet"}</Badge>
                </SettingRow>
                <SettingRow
                  title="Document reading"
                  description="Spreadsheets, Tally files and PDFs are read for you, and so are scans and photos."
                  tip="Spreadsheets, Tally files and text PDFs are read directly with no AI. Scans and photos go through text recognition. AI only helps sort a document into its type, and every amount it reads must appear in the document itself."
                >
                  <Badge tone={intg.reading.ocr || intg.reading.vision ? "good" : "warn"}>
                    {intg.reading.ocr || intg.reading.vision ? "Active" : "Scans not available yet"}
                  </Badge>
                </SettingRow>
              </div>
            </div>
          )}
        </Section>
      )}

      {tab === "team" && (
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
                    {m.status === "pending" && <Badge tone="warn">Invite pending</Badge>}
                    {team.canManage && !m.isYou && (
                      <button
                        className="v2-btn v2-btn-quiet"
                        disabled={busy === m.id}
                        onClick={() =>
                          run(
                            m.id,
                            () => revokePracticeMember({ data: { id: m.id } }),
                            m.status === "pending" ? "Invite cancelled" : "Removed from the team",
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
                <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                  <input
                    className="v2-input"
                    style={{ flex: "1 1 220px" }}
                    type="email"
                    aria-label="Colleague's email"
                    placeholder="colleague@firm.com"
                    value={invite.email}
                    onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                  />
                  <select
                    className="v2-input"
                    aria-label="Role"
                    style={{ width: "auto", maxWidth: "100%" }}
                    value={invite.role}
                    onChange={(e) => setInvite({ ...invite, role: e.target.value as Team["roles"][number] })}
                  >
                    {team.roles.map((r) => (
                      <option key={r} value={r}>
                        {r === "partner" ? "Partner · can sign off reports" : r === "junior" ? "Junior · prepares, cannot sign off" : r[0].toUpperCase() + r.slice(1)}
                      </option>
                    ))}
                  </select>
                  <button className="v2-btn v2-btn-primary" disabled={!invite.email.trim() || busy === "invite"} onClick={sendInvite}>
                    {busy === "invite" ? "Inviting" : "Send invite"}
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: 12.5, color: V.muted }}>Only a partner can invite or remove people.</div>
              )}
            </div>
          )}
        </Section>
      )}

      {tab === "automations" && <AgentSettings />}
    </>
  );
}

