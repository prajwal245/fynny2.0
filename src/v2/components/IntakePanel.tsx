/**
 * How documents get in, in one place: upload files, the firm's Gmail, or
 * WhatsApp. Each tab shows the channel's real state and the one next step,
 * so nobody has to hunt through Settings to find out why nothing arrived.
 */
import { ReactNode, useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";
import { connectPracticeWhatsapp, getPracticeIntegrations } from "@/lib/practice/practice.functions";
import { pollGmailNow, startGmailConnect } from "@/lib/caGmail.functions";
import { Badge, Card, V, formatDate } from "../ui";
import { ShimmerText } from "../agents";
import { GmailHealth } from "./GmailHealth";
import { useV2 } from "../store";
import { GmailIcon, WhatsAppIcon } from "./BrandIcons";

type Integrations = Awaited<ReturnType<typeof getPracticeIntegrations>>;
type Channel = "upload" | "gmail" | "whatsapp";

/** "5 minutes ago", "yesterday 4:10 pm". */
function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return formatDate(iso);
}

const words = (e: unknown) =>
  e instanceof Error && e.message && e.message !== "[object Object]" ? e.message : "Something went wrong. Please try again.";

function Steps({ items }: { items: string[] }) {
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
      {items.map((t, i) => (
        <li key={t} style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 10, fontSize: 13.5, color: V.body, alignItems: "start" }}>
          <span className="num" style={{ width: 22, height: 22, borderRadius: 999, border: `1px solid ${V.line}`, display: "grid", placeItems: "center", fontSize: 11.5, color: V.ink, fontWeight: 600 }}>{i + 1}</span>
          <span>{t}</span>
        </li>
      ))}
    </ol>
  );
}

export function IntakePanel({ upload, unassignedEmail, unassignedWhatsApp, onShowUnassigned }: {
  upload: ReactNode;
  unassignedEmail: number;
  unassignedWhatsApp: number;
  onShowUnassigned: (tab: "Unassigned email" | "Unassigned WhatsApp") => void;
}) {
  const { firmId, refresh, partnerView } = useV2();
  const [channel, setChannel] = useState<Channel>(() => {
    try {
      const v = window.localStorage.getItem("fynhelp.intake.tab");
      return v === "gmail" || v === "whatsapp" ? v : "upload";
    } catch {
      return "upload";
    }
  });
  const [intg, setIntg] = useState<Integrations | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"connect" | "poll" | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [wa, setWa] = useState({ id: "", display: "" });
  const [linking, setLinking] = useState(false);
  const linkWhatsApp = async () => {
    setLinking(true);
    try {
      await connectPracticeWhatsapp({ data: { phone_number_id: wa.id.trim(), display_phone: wa.display.trim() || undefined } });
      toast.success("WhatsApp number linked. Documents clients send to it now arrive here.");
      setWa({ id: "", display: "" });
      await load();
    } catch (e) {
      toast.error(words(e));
    } finally {
      setLinking(false);
    }
  };
  const start = useServerFn(startGmailConnect);
  const poll = useServerFn(pollGmailNow);

  const choose = (c: Channel) => {
    setChannel(c);
    try {
      window.localStorage.setItem("fynhelp.intake.tab", c);
    } catch {
      /* private mode */
    }
  };

  const load = useCallback(async () => {
    try {
      setIntg(await getPracticeIntegrations());
      setLoadError(null);
    } catch (e) {
      setLoadError(words(e));
    }
  }, []);
  useEffect(() => {
    if (channel !== "upload" && !intg) void load();
  }, [channel, intg, load]);

  const gmail = intg?.gmail;
  const active = gmail?.connections.find((c) => c.is_active);

  const connect = async () => {
    if (!firmId) return;
    setBusy("connect");
    try {
      try {
        window.sessionStorage.setItem("fynhelp.gmail.return", "/v2/settings");
      } catch {
        /* private mode */
      }
      const { url } = await start({ data: { firmId, origin: window.location.origin } });
      window.location.href = url;
    } catch (e) {
      toast.error(words(e));
      setBusy(null);
    }
  };
  const checkNow = async () => {
    if (!firmId) return;
    setBusy("poll");
    try {
      const r = await poll({ data: { firmId, origin: window.location.origin } });
      setLastResult(r.detail);
      if (r.ok) toast.success(r.detail);
      else toast.error(r.detail);
      await Promise.all([load(), refresh()]);
    } catch (e) {
      setLastResult(words(e));
      toast.error(words(e));
    } finally {
      setBusy(null);
    }
  };

  const tabs: { key: Channel; label: string; icon: ReactNode; badge?: number }[] = [
    { key: "upload", label: "Upload files", icon: <UploadCloud size={15} /> },
    { key: "gmail", label: "Gmail", icon: <GmailIcon size={17} />, badge: unassignedEmail },
    { key: "whatsapp", label: "WhatsApp", icon: <WhatsAppIcon size={16} />, badge: unassignedWhatsApp },
  ];

  return (
    <Card style={{ padding: 0, marginBottom: 20, overflow: "hidden" }} data-testid="intake-panel">
      <div role="tablist" aria-label="How documents arrive" style={{ display: "flex", gap: 4, padding: "10px 10px 0", borderBottom: `1px solid ${V.line}`, overflowX: "auto" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={channel === t.key}
            onClick={() => choose(t.key)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", border: 0, background: "transparent", cursor: "pointer",
              fontSize: 13.5, fontWeight: channel === t.key ? 600 : 500, color: channel === t.key ? V.ink : V.body,
              borderBottom: `2px solid ${channel === t.key ? V.ink : "transparent"}`, marginBottom: -1, whiteSpace: "nowrap",
            }}
          >
            {t.icon} {t.label}
            {t.badge ? <span className="num" style={{ fontSize: 11, fontWeight: 600, background: V.beige, borderRadius: 999, padding: "1px 7px" }}>{t.badge}</span> : null}
          </button>
        ))}
      </div>

      <div style={{ padding: channel === "upload" ? 0 : 20 }}>
        {channel === "upload" && upload}

        {channel !== "upload" && !intg && !loadError && <div style={{ fontSize: 13, color: V.muted }}>Checking the connection…</div>}
        {channel !== "upload" && loadError && <div style={{ fontSize: 13, color: V.maroon }}>{loadError}</div>}

        {channel === "gmail" && gmail && (
          <div style={{ display: "grid", gap: 16 }} data-testid="intake-gmail">
            {!gmail.available ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Gmail isn't switched on for this workspace yet</div>
                <div style={{ fontSize: 13.5, color: V.body }}>The Google keys are not set on the server. Until they are, upload files from the first tab. The person who set up FynHelp can switch it on in a few minutes.</div>
                {unassignedEmail > 0 && (
                  <button className="v2-btn v2-btn-ghost" style={{ justifySelf: "start" }} onClick={() => onShowUnassigned("Unassigned email")}>
                    File {unassignedEmail} email attachment{unassignedEmail === 1 ? "" : "s"} waiting for a client
                  </button>
                )}
              </>
            ) : !active ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px,100%),1fr))", gap: 18, alignItems: "start" }}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>Let clients' emails file themselves</div>
                  <Steps items={["A client emails a statement or bill to your firm's Gmail.", "FynHelp files it under the client whose email it came from.", "Extract reads it. Anything unclear waits for you."]} />
                  <div style={{ fontSize: 12.5, color: V.muted }}>Read-only. Only emails with attachments are looked at; your own sent mail never is. Disconnect any time.</div>
                </div>
                <div style={{ display: "grid", gap: 10, justifyItems: "start" }}>
                  {partnerView ? (
                    <button className="v2-btn v2-btn-primary v2-btn-lg" onClick={connect} disabled={busy === "connect"} data-busy={busy === "connect"}>
                      <span style={{ background: "#fff", borderRadius: 6, padding: "2px 3px", display: "inline-grid" }}><GmailIcon size={16} /></span> Connect Gmail
                    </button>
                  ) : (
                    <div style={{ fontSize: 13.5, color: V.body }} data-testid="gmail-partner-only">A partner connects the firm's Gmail. Once connected, emailed statements show up here for everyone.</div>
                  )}
                  <div style={{ fontSize: 12.5, color: V.body }}>On Google's screen, tick the box that lets FynHelp <b>view your email messages</b>.</div>
                  {gmail.connections.find((c) => c.error_message)?.error_message && (
                    <div style={{ fontSize: 12.5, color: V.maroon }}>Last time: {gmail.connections.find((c) => c.error_message)?.error_message}</div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <Badge tone="good">Connected</Badge>
                      <span style={{ fontSize: 14, fontWeight: 600, overflowWrap: "anywhere" }}>{active.gmail_address}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: V.body, marginTop: 4 }}>
                      {active.last_polled_at ? `Last checked ${ago(active.last_polled_at)}. ` : "Not checked yet: the first check covers the last 7 days. "}
                      Emails from a client's saved address file themselves.
                    </div>
                    {active.error_message && <div style={{ fontSize: 12.5, color: V.maroon, marginTop: 4 }}>{active.error_message}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {unassignedEmail > 0 && (
                      <button className="v2-btn v2-btn-ghost" onClick={() => onShowUnassigned("Unassigned email")}>
                        File {unassignedEmail} waiting for a client
                      </button>
                    )}
                    <button className="v2-btn v2-btn-primary" onClick={checkNow} disabled={busy === "poll"} data-working={busy === "poll"}>
                      {busy === "poll" ? <ShimmerText text="Checking inbox…" tone="light" /> : "Check now"}
                    </button>
                  </div>
                </div>
                {firmId && <GmailHealth firmId={firmId} lastResult={lastResult} />}
              </>
            )}
          </div>
        )}

        {channel === "whatsapp" && intg && (
          <div style={{ display: "grid", gap: 14 }} data-testid="intake-whatsapp">
            {intg.whatsapp.channels.some((c) => c.is_active) ? (
              <>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Badge tone="good">Connected</Badge>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{intg.whatsapp.channels.filter((c) => c.is_active).map((c) => c.display_phone ?? c.phone_number_id).join(", ")}</span>
                </div>
                <div style={{ fontSize: 13.5, color: V.body }}>Documents clients send to this number are matched to the client by phone number. Unknown numbers wait for you.</div>
                {unassignedWhatsApp > 0 && (
                  <button className="v2-btn v2-btn-ghost" style={{ justifySelf: "start" }} onClick={() => onShowUnassigned("Unassigned WhatsApp")}>
                    File {unassignedWhatsApp} waiting for a client
                  </button>
                )}
              </>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px,100%),1fr))", gap: 18, alignItems: "start" }}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>Take documents on WhatsApp</div>
                  <Steps items={["Link your firm's WhatsApp Business number here.", "Save each client's WhatsApp number on the client.", "Photos and PDFs they send are filed under the client and read like uploads."]} />
                  <div style={{ fontSize: 12.5, color: V.muted }}>Already works without this: the Chaser opens WhatsApp with a ready message for any client with a number.</div>
                </div>
                {intg.whatsapp.available ? (
                  <form
                    style={{ display: "grid", gap: 10 }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (wa.id.trim()) void linkWhatsApp();
                    }}
                  >
                    <label className="v2-label" htmlFor="wa-id">Phone number ID (from Meta's WhatsApp Manager)</label>
                    <input id="wa-id" className="v2-input" value={wa.id} onChange={(e) => setWa({ ...wa, id: e.target.value })} placeholder="15-digit ID" inputMode="numeric" />
                    <label className="v2-label" htmlFor="wa-display">Number your clients see</label>
                    <input id="wa-display" className="v2-input" value={wa.display} onChange={(e) => setWa({ ...wa, display: e.target.value })} placeholder="+91 …" inputMode="tel" />
                    <button className="v2-btn v2-btn-primary" type="submit" disabled={!wa.id.trim() || linking} data-busy={linking} style={{ justifySelf: "start" }}>
                      <WhatsAppIcon size={16} /> Link WhatsApp number
                    </button>
                    <div style={{ fontSize: 12, color: V.muted }}>
                      Webhook address for Meta: <span className="num" style={{ overflowWrap: "anywhere" }}>{typeof window === "undefined" ? "" : `${window.location.origin}/api/public/whatsapp-webhook`}</span>
                    </div>
                  </form>
                ) : (
                  <div style={{ display: "grid", gap: 8, fontSize: 13.5, color: V.body }}>
                    <div style={{ fontWeight: 600, color: V.ink }}>WhatsApp Business isn't switched on for this workspace yet</div>
                    <div>The person who set up FynHelp adds the three WhatsApp keys from Meta (verify token, app secret, access token). Then link the number here in one step.</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
