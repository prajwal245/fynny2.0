/**
 * Settings → Billing: all credits in one calm section. Two tiles (WhatsApp reminders, Tally posting pages),
 * each with a gauge, a plain status and one button; one shared activity list; automatic top-up tucked below.
 */
import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, FileText, Plus, Zap } from "lucide-react";
import { Badge, Card, Segmented, V, formatDate, type Tone } from "../ui";
import { WhatsAppIcon } from "./BrandIcons";
import { AutoTopUp, TopUpModal } from "./CreditsPanel";
import { PagesTopUpModal } from "./PagesPanel";
import { useCredits } from "../lib/credits";
import { usePages } from "../lib/pages";
import { lowThreshold, remindersLeft } from "@/lib/practice/billing/credits";
import { pageLowThreshold } from "@/lib/practice/billing/pageCredits";

type Level = "ok" | "low" | "out";
const COLOR: Record<Level, string> = { ok: V.green, low: "#B45309", out: V.maroon };
const TONE: Record<Level, Tone> = { ok: "good", low: "warn", out: "bad" };
const WORD: Record<Level, string> = { ok: "Healthy", low: "Running low", out: "Used up" };
const n = (x: number) => x.toLocaleString("en-IN");

/** A ring that fills to the share of the monthly allowance still available. */
function Gauge({ value, max, color, label, children }: { value: number; max: number; color: string; label: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const r = 46;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / Math.max(max, value)) : 0;
  return (
    <div role="img" aria-label={label} style={{ position: "relative", width: 116, height: 116, flexShrink: 0 }}>
      <svg width="116" height="116" viewBox="0 0 116 116" aria-hidden="true">
        <circle cx="58" cy="58" r={r} fill="none" stroke="rgba(23,18,8,.08)" strokeWidth="9" />
        <motion.circle
          cx="58" cy="58" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          transform="rotate(-90 58 58)" strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? c * (1 - pct) : c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: reduce ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>{children}</div>
    </div>
  );
}

interface TileProps {
  icon: React.ReactNode;
  title: string;
  what: string;
  unit: string;
  balance: number;
  monthly: number;
  level: Level;
  unmetered: boolean;
  low: number;
  expiry: { n: number; at: string } | null;
  button: string;
  onAdd: () => void;
  extra?: string;
}

function Tile(p: TileProps) {
  const color = p.unmetered ? V.muted : COLOR[p.level];
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      aria-label={p.title}
      style={{ border: `1px solid ${V.line}`, borderRadius: 18, padding: 20, display: "grid", gap: 14, background: V.card, alignContent: "start" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
        <h4 style={{ margin: 0, fontSize: 15.5, display: "flex", alignItems: "center", gap: 8 }}>{p.icon} {p.title}</h4>
        {p.unmetered ? <Badge tone="info">Test account: free</Badge> : <Badge tone={TONE[p.level]}>{WORD[p.level]}</Badge>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <Gauge value={p.unmetered ? 0 : p.balance} max={p.monthly} color={color} label={p.unmetered ? `${p.title}: not charged on a test account` : `${p.title}: ${n(p.balance)} ${p.unit} left`}>
          {p.unmetered ? (
            <span style={{ fontSize: 13, fontWeight: 600, color: V.muted, lineHeight: 1.25 }}>Free<br />in test mode</span>
          ) : (
            <div>
              <motion.div key={p.balance} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.02em", color, fontVariantNumeric: "tabular-nums", lineHeight: 1.05 }}>{n(p.balance)}</motion.div>
              <div style={{ fontSize: 11.5, color: V.muted }}>{p.unit}</div>
            </div>
          )}
        </Gauge>
        <div style={{ display: "grid", gap: 6, fontSize: 13, color: V.body, lineHeight: 1.5, minWidth: 0, flex: "1 1 180px" }}>
          <div>{p.what}</div>
          {!p.unmetered && <div style={{ color: V.muted }}>{p.extra}</div>}
        </div>
      </div>
      {!p.unmetered && (
      <div style={{ fontSize: 12.5, color: V.muted, lineHeight: 1.6 }}>
        Your plan adds <b style={{ color: V.ink }}>{n(p.monthly)}</b> each month. Unused ones roll over for 12 months
        {p.expiry ? `; the next ${n(p.expiry.n)} expire on ${formatDate(p.expiry.at)}` : ""}.
        {` We warn you at ${n(p.low)} left.`}
      </div>
      )}
      {!p.unmetered && (
        <button className="v2-btn v2-btn-primary" style={{ justifySelf: "start" }} onClick={p.onAdd}>
          <Plus size={16} /> {p.button}
        </button>
      )}
    </motion.section>
  );
}

type Source = "all" | "wa" | "pg";
interface Row { source: "wa" | "pg"; delta: number; label: string; at: string }

export function CreditsHub() {
  const c = useCredits();
  const p = usePages();
  const [waOpen, setWaOpen] = useState(false);
  const [pgOpen, setPgOpen] = useState(false);
  const [src, setSrc] = useState<Source>("all");
  const [more, setMore] = useState(false);
  const [auto, setAuto] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const wa = (c?.recent ?? []).map((r) => ({ source: "wa" as const, delta: r.delta, at: r.at, label: r.reason === "spend" ? "WhatsApp reminder sent" : r.reason === "refund" ? "WhatsApp credit returned (not sent)" : r.note ? `WhatsApp credits added: ${r.note}` : "WhatsApp credits added" }));
    const pg = (p?.recent ?? []).map((r) => ({ source: "pg" as const, delta: r.delta, at: r.at, label: r.reason === "spend" ? "Document posted to Tally" : r.reason === "refund" ? "Pages returned (not used)" : r.note ? `Pages added: ${r.note}` : "Pages added" }));
    return [...wa, ...pg].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }, [c, p]);
  const shown = rows.filter((r) => src === "all" || r.source === src);
  const list = more ? shown : shown.slice(0, 5);

  if (!c && !p) return null;
  return (
    <Card style={{ marginBottom: 16 }} data-testid="credits-hub">
      <div style={{ display: "grid", gap: 4, marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 17 }}>Credits</h3>
        <div style={{ fontSize: 13, color: V.body, maxWidth: 620, lineHeight: 1.6 }}>
          Two things are paid for with credits. Everything else, including reading documents, matching and the MIS, is part of your plan. Top up any time; nothing stops without a warning first.
        </div>
      </div>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,100%),1fr))" }}>
        {c && (
          <Tile
            icon={<WhatsAppIcon size={18} />}
            title="WhatsApp reminders"
            what="1 credit sends 1 WhatsApp reminder from FynHelp's number. Email reminders and your own linked number are free."
            unit="credits"
            balance={c.balance}
            monthly={c.monthly}
            level={c.level}
            unmetered={c.unmetered}
            low={lowThreshold(c.monthly)}
            expiry={c.nextExpiry ? { n: c.nextExpiry.credits, at: c.nextExpiry.expiresAt } : null}
            button="Add credits"
            onAdd={() => setWaOpen(true)}
            extra={remindersLeft(c.balance)}
          />
        )}
        {p && (
          <Tile
            icon={<FileText size={18} />}
            title="Tally posting"
            what="1 credit is 1 page of a document posted to Tally. Approving more lines from the same document costs nothing more."
            unit="pages"
            balance={p.balance}
            monthly={p.monthly}
            level={p.level}
            unmetered={p.unmetered}
            low={pageLowThreshold(p.monthly)}
            expiry={p.nextExpiry ? { n: p.nextExpiry.pages, at: p.nextExpiry.expiresAt } : null}
            button="Add pages"
            onAdd={() => setPgOpen(true)}
            extra="Used when you approve entries for Tally"
          />
        )}
      </div>

      {c && !c.unmetered && (
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            className="v2-btn v2-btn-ghost"
            aria-expanded={auto}
            aria-controls="hub-auto"
            onClick={() => setAuto((v) => !v)}
          >
            <Zap size={15} /> Automatic WhatsApp top-up
            <ChevronDown size={15} style={{ transform: auto ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
          </button>
          <AnimatePresence initial={false}>
            {auto && (
              <motion.div id="hub-auto" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
                <div style={{ paddingTop: 10 }}><AutoTopUp c={c} /></div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div style={{ marginTop: 22 }} data-testid="credits-history">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Recent activity</div>
          <Segmented<Source>
            label="Filter activity"
            value={src}
            onChange={(v) => { setSrc(v); setMore(false); }}
            options={[{ value: "all", label: "All" }, { value: "wa", label: "WhatsApp" }, { value: "pg", label: "Tally pages" }]}
          />
        </div>
        {shown.length === 0 ? (
          <div style={{ fontSize: 13, color: V.muted, padding: "10px 0" }}>Nothing yet. Credits you add or use will show here.</div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid" }}>
            <AnimatePresence initial={false}>
              {list.map((r, i) => (
                <motion.li
                  key={`${r.source}-${r.at}-${i}`}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i, 6) * 0.02 }}
                  style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "9px 0", borderTop: i ? `1px solid ${V.line}` : "none", fontSize: 13 }}
                >
                  <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 9, background: V.gray, display: "grid", placeItems: "center", color: V.body }}>
                    {r.source === "wa" ? <WhatsAppIcon size={14} /> : <FileText size={14} />}
                  </span>
                  <span style={{ color: V.ink, overflowWrap: "anywhere" }}>{r.label}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    <b style={{ color: r.delta > 0 ? V.green : V.ink }}>{r.delta > 0 ? "+" : ""}{n(r.delta)}</b>
                    <span style={{ color: V.muted }}> · {formatDate(r.at)}</span>
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
        {shown.length > 5 && (
          <button type="button" className="v2-btn v2-btn-ghost" style={{ marginTop: 8 }} onClick={() => setMore((v) => !v)}>
            {more ? "Show fewer" : `Show all ${shown.length}`}
          </button>
        )}
      </div>

      <TopUpModal open={waOpen} onClose={() => setWaOpen(false)} />
      <PagesTopUpModal open={pgOpen} onClose={() => setPgOpen(false)} />
    </Card>
  );
}
