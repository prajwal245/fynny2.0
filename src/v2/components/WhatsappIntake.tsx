/**
 * Documents → WhatsApp. What this tab shows depends on the number the firm chose:
 *   FynHelp's number: nothing to set up. The number, how clients send documents, a message to share, the JOIN code.
 *   Own number:       linked → its status; not linked → the Phone number ID form.
 * The number is chosen here with two buttons and the same choice applies to the Chaser and to Settings.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Copy, Share2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { setChaserPrefs } from "@/lib/caGmail.functions";
import { connectPracticeWhatsapp, getPracticeWhatsappStatus } from "@/lib/practice/practice.functions";
import { Badge, V } from "../ui";
import { WhatsAppIcon } from "./BrandIcons";
import { useV2 } from "../store";

type Status = Awaited<ReturnType<typeof getPracticeWhatsappStatus>>;
type Mode = "fynhelp" | "own";

const words = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");
const copy = (text: string, what: string) => void navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copied`));

function Steps({ items }: { items: string[] }) {
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
      {items.map((t, i) => (
        <li key={t} style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 10, fontSize: 13.5, color: V.body, alignItems: "start" }}>
          <span className="num" style={{ width: 22, height: 22, borderRadius: 999, border: `1px solid ${V.line}`, display: "grid", placeItems: "center", fontSize: 11.5, color: V.ink, fontWeight: 600 }}>{i + 1}</span>
          <span>{t}</span>
        </li>
      ))}
    </ol>
  );
}

const pill = (on: boolean, disabled = false): React.CSSProperties => ({
  padding: "8px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
  background: on ? V.brand : V.card, color: on ? "#fff" : V.body, border: `1px solid ${on ? V.brand : V.line}`,
});

export function WhatsappIntake({ unassigned, onShowUnassigned, onChanged }: { unassigned: number; onShowUnassigned: () => void; onChanged?: () => void }) {
  const { firmId, partnerView } = useV2();
  const load = useServerFn(getPracticeWhatsappStatus);
  const link = useServerFn(connectPracticeWhatsapp);
  const save = useServerFn(setChaserPrefs);
  const [st, setSt] = useState<Status | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [f, setF] = useState({ id: "", display: "" });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const s = await load();
    setSt(s);
    setMode((m) => m ?? s.sender ?? (s.shared.configured ? "fynhelp" : "own"));
  }, [load]);
  useEffect(() => {
    void refresh().catch((e) => toast.error(words(e)));
  }, [refresh]);

  if (!st || !mode) return <div style={{ fontSize: 13, color: V.muted }}>Loading…</div>;

  const own = st.channels.find((c) => c.is_active) ?? null;
  const sharedOk = st.shared.configured;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const number = st.shared.display ?? "FynHelp's number";
  const code = st.shared.join_code;
  const shareText = `Hello! Please send your documents (bank statements, bills, photos or PDFs) on WhatsApp to ${number}. ${code ? `If this is your first message, start with: JOIN ${code}` : ""}`.trim();

  const choose = async (m: Mode) => {
    setMode(m);
    if (!firmId || !partnerView) return;
    if ((m === "fynhelp" && !sharedOk) || (m === "own" && !own)) return;
    try {
      await save({ data: { firmId, whatsappSender: m } });
      await refresh();
      onChanged?.();
      toast.success(m === "own" ? "Using your own WhatsApp number" : "Using FynHelp's WhatsApp number");
    } catch (e) {
      toast.error(words(e));
    }
  };

  const doLink = async () => {
    if (!firmId) return;
    setBusy(true);
    try {
      await link({ data: { phone_number_id: f.id.trim(), display_phone: f.display.trim() || undefined } });
      await save({ data: { firmId, whatsappSender: "own" } });
      setF({ id: "", display: "" });
      await refresh();
      onChanged?.();
      toast.success("WhatsApp number linked. Documents clients send to it now arrive here.");
    } catch (e) {
      toast.error(words(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }} data-testid="intake-whatsapp">
      <div role="radiogroup" aria-label="WhatsApp number" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button role="radio" aria-checked={mode === "fynhelp"} style={pill(mode === "fynhelp", !sharedOk && !partnerView)} onClick={() => void choose("fynhelp")}>FynHelp's number</button>
        <button role="radio" aria-checked={mode === "own"} style={pill(mode === "own")} onClick={() => void choose("own")}>My own number</button>
        {st.test && <Badge tone="warn">Test account: simulated</Badge>}
      </div>

      {mode === "fynhelp" ? (
        sharedOk ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px,100%),1fr))", gap: 22, alignItems: "start" }} data-testid="intake-whatsapp-shared">
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Badge tone="good">Ready</Badge>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{number}</span>
                {st.shared.display && <button className="v2-btn v2-btn-quiet" onClick={() => copy(st.shared.display!, "Number")}><Copy size={13} /> Copy</button>}
              </div>
              <div style={{ fontSize: 13.5, color: V.body }}>Nothing to set up. Clients send documents to this number and they arrive here, filed under the right client.</div>
              <Steps items={[
                "Save each client's WhatsApp number on the client. Their documents are then matched to them automatically.",
                `Ask them to send photos and PDFs to ${number}.`,
                code ? `A client you have not saved yet sends JOIN ${code} once, and is linked to your firm.` : "A client you have not saved yet will wait in Unassigned until you file them.",
              ]} />
              {unassigned > 0 && (
                <button className="v2-btn v2-btn-ghost" style={{ justifySelf: "start" }} onClick={onShowUnassigned}>File {unassigned} waiting for a client</button>
              )}
            </div>
            <div style={{ display: "grid", gap: 10, background: V.gray, borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Message to send your clients</div>
              <div style={{ fontSize: 13, color: V.body, lineHeight: 1.6 }}>{shareText}</div>
              {code && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, color: V.muted }}>Your code</span>
                  <code style={{ fontWeight: 700, letterSpacing: 1 }}>JOIN {code}</code>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="v2-btn v2-btn-ghost" onClick={() => copy(shareText, "Message")}><Copy size={14} /> Copy message</button>
                <a className="v2-btn v2-btn-primary" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer"><Share2 size={14} /> Share on WhatsApp</a>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8, fontSize: 13.5, color: V.body }}>
            <div style={{ fontWeight: 600, color: V.ink }}>FynHelp's number is not switched on yet</div>
            <div>Missing on the server: <b>{st.shared.missing.length ? st.shared.missing.join(", ") : "its settings"}</b>. Until then, choose "My own number", or ask the person who set up FynHelp to add it.</div>
          </div>
        )
      ) : own ? (
        <div style={{ display: "grid", gap: 10 }} data-testid="intake-whatsapp-own">
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Badge tone="good">Connected</Badge>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{own.display_phone ?? own.phone_number_id}</span>
          </div>
          <div style={{ fontSize: 13.5, color: V.body }}>Documents clients send to your number are matched to the client by phone number. Unknown numbers wait for you.</div>
          {unassigned > 0 && (
            <button className="v2-btn v2-btn-ghost" style={{ justifySelf: "start" }} onClick={onShowUnassigned}>File {unassigned} waiting for a client</button>
          )}
          <div style={{ fontSize: 12.5, color: V.muted }}>Change the number, token or country in <Link to="/app/settings" style={{ color: V.maroon, fontWeight: 600 }}>Settings</Link>.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px,100%),1fr))", gap: 18, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Take documents on your own number</div>
            <Steps items={["Paste your WhatsApp Business number's Phone number ID from Meta's WhatsApp Manager.", "Save each client's WhatsApp number on the client.", "Photos and PDFs they send are filed under the client and read like uploads."]} />
          </div>
          <form style={{ display: "grid", gap: 10 }} onSubmit={(e) => { e.preventDefault(); if (f.id.trim()) void doLink(); }}>
            <label className="v2-label" htmlFor="wa-id">Phone number ID (from Meta's WhatsApp Manager)</label>
            <input id="wa-id" className="v2-input" value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} placeholder="15-digit ID" inputMode="numeric" />
            <label className="v2-label" htmlFor="wa-display">Number your clients see</label>
            <input id="wa-display" className="v2-input" value={f.display} onChange={(e) => setF({ ...f, display: e.target.value })} placeholder="+91 …" inputMode="tel" />
            <button className="v2-btn v2-btn-primary" type="submit" disabled={!f.id.trim() || busy || !partnerView} data-busy={busy} style={{ justifySelf: "start" }}>
              <WhatsAppIcon size={16} /> Link WhatsApp number
            </button>
            {!partnerView && <div style={{ fontSize: 12, color: V.muted }}>Only a partner can link a number.</div>}
            <div style={{ fontSize: 12, color: V.muted }}>Webhook address for Meta: <span className="num" style={{ overflowWrap: "anywhere" }}>{origin}/api/public/whatsapp-webhook</span></div>
          </form>
        </div>
      )}
    </div>
  );
}
