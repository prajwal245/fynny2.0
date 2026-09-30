import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  disconnectGmail,
  pollGmailNow,
  startGmailConnect,
} from "@/lib/caGmail.functions";
import {
  connectPracticeWhatsapp,
  getPracticeIntegrations,
  invitePracticeMember,
  listPracticeTeam,
  revokePracticeMember,
} from "@/lib/practice/practice.functions";
import { Badge, Card, PageHeader, V, formatDate } from "../ui";
import { RowSkeleton } from "../agents";
import { useV2 } from "../store";
import { AgentSettings } from "../components/AgentSettings";

type Team = Awaited<ReturnType<typeof listPracticeTeam>>;
type Integrations = Awaited<ReturnType<typeof getPracticeIntegrations>>;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

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
  const { firm, firmId, saveFirm, session } = useV2();
  const [form, setForm] = useState({ name: "", city: "", frn: "", email: "" });
  const [team, setTeam] = useState<Team | null>(null);
  const [intg, setIntg] = useState<Integrations | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [invite, setInvite] = useState({
    email: "",
    role: "junior" as Team["roles"][number],
  });
  const [wa, setWa] = useState({ phoneNumberId: "", display: "" });
  const [profileName, setProfileName] = useState(session?.name ?? "");
  const [busy, setBusy] = useState<string | null>(null);

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
          `Invite created. Email is not configured yet, so share this link: ${r.link}`,
        );
      else if (!r.emailed)
        toast.error(
          `Invite created but the email failed: ${r.error}. Share this link: ${r.link}`,
        );
      else toast.success(`Invite emailed to ${invite.email}`);
      setInvite({ ...invite, email: "" });
    });

  const connectGmail = () =>
    run("gmail", async () => {
      if (!firmId) throw new Error("Create your practice first");
      try {
        window.sessionStorage.setItem(GMAIL_RETURN_KEY, "/v2/settings");
      } catch {
        /* private mode */
      }
      const { url } = await startGmail({
        data: { firmId, origin: window.location.origin },
      });
      window.location.href = url;
    });

  const webhook =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/whatsapp-webhook`
      : "/api/public/whatsapp-webhook";

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

      <Section
        title="Firm profile"
        subtitle="Shown on every MIS and on the emails the Chaser sends."
      >
        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
          }}
        >
          <div>
            <label className="v2-label">Firm name</label>
            <input
              className="v2-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="v2-label">City</label>
            <input
              className="v2-input"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </div>
          <div>
            <label className="v2-label">Firm registration number</label>
            <input
              className="v2-input"
              value={form.frn}
              onChange={(e) => setForm({ ...form, frn: e.target.value })}
            />
          </div>
          <div>
            <label className="v2-label">Reply-to email</label>
            <input
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
          onClick={() => {
            saveFirm({
              name: form.name.trim(),
              city: form.city.trim(),
              frn: form.frn.trim(),
              email: form.email.trim(),
            });
            toast.success("Firm details saved");
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
            {team.canManage ? (
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
                      {r[0].toUpperCase() + r.slice(1)}
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
            <Row>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Gmail</div>
                {intg.gmail.connections.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: V.body, marginTop: 3 }}>
                    Pull statements and bills your clients email to the firm
                    inbox, every 15 minutes.
                  </div>
                ) : (
                  intg.gmail.connections.map((c) => (
                    <div
                      key={c.id}
                      style={{ fontSize: 12.5, color: V.body, marginTop: 3 }}
                    >
                      {c.gmail_address} ·{" "}
                      {c.is_active ? "active" : "disconnected"}
                      {c.last_polled_at
                        ? ` · last checked ${formatDate(c.last_polled_at)}`
                        : ""}
                      {c.error_message ? (
                        <span style={{ color: V.maroon }}>
                          {" "}
                          · {c.error_message}
                        </span>
                      ) : null}
                    </div>
                  ))
                )}
                {!intg.gmail.available && (
                  <div style={{ fontSize: 12, color: V.muted, marginTop: 3 }}>
                    Gmail sign-in is not configured on this server yet
                    (GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET).
                  </div>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                {intg.gmail.connections.some((c) => c.is_active) ? (
                  <>
                    <Badge tone="good">Connected</Badge>
                    <button
                      className="v2-btn v2-btn-ghost"
                      disabled={busy === "poll"}
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
                            if (!r.ok) throw new Error(r.detail);
                          },
                          "Checked the inbox. New attachments are being read.",
                        )
                      }
                    >
                      Check now
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
                    <Badge>Not connected</Badge>
                    <button
                      className="v2-btn v2-btn-primary"
                      disabled={!intg.gmail.available || busy === "gmail"}
                      onClick={connectGmail}
                    >
                      Connect Gmail
                    </button>
                  </>
                )}
              </div>
            </Row>

            <Row>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  WhatsApp Business
                </div>
                <div style={{ fontSize: 12.5, color: V.body, marginTop: 3 }}>
                  Clients send documents to your official WhatsApp Business
                  number; they are matched to the client by phone number.
                </div>
                {intg.whatsapp.channels.map((c) => (
                  <div
                    key={c.phone_number_id}
                    style={{ fontSize: 12.5, color: V.body, marginTop: 3 }}
                  >
                    {c.display_phone ?? c.phone_number_id} ·{" "}
                    {c.is_active ? "active" : "off"}
                    {c.last_message_at
                      ? ` · last document ${formatDate(c.last_message_at)}`
                      : ""}
                  </div>
                ))}
                <div style={{ fontSize: 12, color: V.muted, marginTop: 6 }}>
                  Webhook URL for Meta: <span className="num">{webhook}</span>
                </div>
                {!intg.whatsapp.available && (
                  <div style={{ fontSize: 12, color: V.muted, marginTop: 3 }}>
                    The WhatsApp Cloud API keys are not configured on this
                    server yet (WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET,
                    WHATSAPP_VERIFY_TOKEN).
                  </div>
                )}
              </div>
              <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                <Badge
                  tone={
                    intg.whatsapp.channels.some((c) => c.is_active)
                      ? "good"
                      : "neutral"
                  }
                >
                  {intg.whatsapp.channels.some((c) => c.is_active)
                    ? "Connected"
                    : "Not connected"}
                </Badge>
              </div>
            </Row>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                className="v2-input"
                style={{ flex: "1 1 200px" }}
                placeholder="Phone number ID from WhatsApp Manager"
                value={wa.phoneNumberId}
                onChange={(e) =>
                  setWa({ ...wa, phoneNumberId: e.target.value })
                }
              />
              <input
                className="v2-input"
                style={{ flex: "1 1 160px" }}
                placeholder="Display number, e.g. +91 98450 12345"
                value={wa.display}
                onChange={(e) => setWa({ ...wa, display: e.target.value })}
              />
              <button
                className="v2-btn v2-btn-ghost"
                disabled={!wa.phoneNumberId.trim() || busy === "wa"}
                onClick={() =>
                  run(
                    "wa",
                    () =>
                      connectPracticeWhatsapp({
                        data: {
                          phone_number_id: wa.phoneNumberId.trim(),
                          display_phone: wa.display.trim() || undefined,
                        },
                      }),
                    "WhatsApp number linked to this practice",
                  )
                }
              >
                Link number
              </button>
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
                  : "Not configured (RESEND_API_KEY)"}
              </Badge>
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
            gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
          }}
        >
          <div>
            <label className="v2-label">Name</label>
            <input
              className="v2-input"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
            />
          </div>
          <div>
            <label className="v2-label">Email</label>
            <input className="v2-input" value={session?.email ?? ""} disabled />
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
