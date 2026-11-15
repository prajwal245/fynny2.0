/**
 * Settings → Help: short guides for each part of the product, the limits worth knowing, and a way to report a problem that
 * carries the page and the file with it. Reports go to the FynHelp team, and the firm sees what became of each one.
 */
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { ChevronDown, LifeBuoy, Mail, Send } from "lucide-react";
import { Badge, Card, V, formatDate, type Tone } from "../ui";
import { useV2 } from "../store";
import { getPracticeProblemReports, submitPracticeProblemReport } from "@/lib/practice/practice.functions";
import { CATEGORY_LABEL, LIMITS, REPORT_CATEGORIES, checkReport, type ReportCategory } from "@/lib/practice/reportRules";

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");

interface Guide {
  id: string;
  title: string;
  body: ReactNode;
}

/** What each part of FynHelp does, in the words the screens use. Only what is true today. */
const GUIDES: Guide[] = [
  {
    id: "upload",
    title: "Add a client and upload a statement",
    body: (
      <>
        <p>Add the client in <b>Clients</b>, then drop their bank statement or Tally file into <b>Documents</b>. CSV, Excel, Tally XML, PDF and photos are accepted, up to 25 MB each.</p>
        <p>A password-protected PDF or Excel file asks for its password once and is then read. Scans and photos are read as text, so a clear original gives better results than a photo of a photo.</p>
      </>
    ),
  },
  {
    id: "check",
    title: "The Statement check: what green, amber and red mean",
    body: (
      <>
        <p><b>Green:</b> every line moves the running balance by exactly its amount, and the opening and closing balances add up.</p>
        <p><b>Amber:</b> the lines are right, but something is worth a look, for example a stretch of weeks with no line.</p>
        <p><b>Red:</b> the balance stops following at a line. A line may be missing or read with the wrong amount. Compare the line count with the bank's own count and open the line it names. If the statement is right and FynHelp is wrong, report it here.</p>
      </>
    ),
  },
  {
    id: "review",
    title: "Review Queue and Exception Queue",
    body: (
      <>
        <p>Lines FynHelp is not sure about go to the <b>Review Queue</b> with a reason. Lines that do not match the books go to the <b>Exception Queue</b> with the numbers behind them.</p>
        <p>Nothing is posted or settled without a person deciding. Decisions you make are remembered for similar lines.</p>
      </>
    ),
  },
  {
    id: "match",
    title: "How matching works",
    body: (
      <>
        <p>Bank lines are matched to the books by exact amount and date first, then close matches inside a tolerance, then your own rules. A 12-digit UPI or IMPS reference, or a NEFT/RTGS UTR in the narration, is used when it points to one entry on each side.</p>
        <p>The same reference on two different bank accounts of one client (a transfer between your own accounts) is kept as two lines, one for each account.</p>
      </>
    ),
  },
  {
    id: "chaser",
    title: "Chaser: asking clients for documents",
    body: (
      <>
        <p>Chaser asks a client for what is missing by WhatsApp or email, with an upload link that needs no login, and follows up on a schedule. It stops by itself when the document arrives.</p>
        <p>WhatsApp reminders from FynHelp's number use credits (1 per reminder). Email reminders and reminders from your own linked number do not.</p>
      </>
    ),
  },
  {
    id: "books",
    title: "Tally and Zoho Books",
    body: (
      <>
        <p>Link a client to Tally or to Zoho Books under <b>Settings → Integrations</b>. Pulling a month replaces that month's earlier entries, so an entry deleted at the source disappears here after the next pull.</p>
        <p>Link a client to one books source. If a client is linked to both, the same entries can be counted twice.</p>
      </>
    ),
  },
  {
    id: "plan",
    title: "Plans, credits and usage",
    body: (
      <>
        <p>You are charged per active client: a client is active in a month once a document is read or a reconciliation runs for them. Documents above the pooled allowance are billed in blocks on the next invoice, and work is never blocked by them.</p>
        <p>See usage and change plan under <b>Settings → Billing</b>. WhatsApp credits last 12 months.</p>
      </>
    ),
  },
  {
    id: "limits",
    title: "What FynHelp does not read yet",
    body: (
      <>
        <p><b>Trial Balance</b> and <b>debtor or creditor ageing</b> reports are not read, because they hold balances, not transactions. Export the Day Book or the bank ledger from Tally instead.</p>
        <p>Very long scanned PDFs may need splitting. If a file is read wrongly, tell us: reports like yours are how the reader gets better.</p>
      </>
    ),
  },
];

const STATUS_TONE: Record<string, Tone> = { new: "info", looking: "warn", fixed: "good", wont_fix: "neutral" };

function Guides() {
  const [open, setOpen] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const base = useId();
  return (
    <div style={{ display: "grid", gap: 6 }} data-testid="help-guides">
      {GUIDES.map((g) => {
        const o = open === g.id;
        const panel = `${base}-${g.id}`;
        return (
          <div key={g.id} style={{ border: `1px solid ${V.line}`, borderRadius: 14, overflow: "hidden" }}>
            <button
              type="button"
              aria-expanded={o}
              aria-controls={panel}
              onClick={() => setOpen(o ? null : g.id)}
              style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", background: "transparent", border: 0, font: "inherit", fontWeight: 600, fontSize: 14, color: V.ink, textAlign: "left", cursor: "pointer" }}
              data-testid={`guide-${g.id}`}
            >
              {g.title}
              <ChevronDown size={16} style={{ flexShrink: 0, transition: reduce ? "none" : "transform .3s cubic-bezier(.34,1.56,.64,1)", transform: o ? "rotate(180deg)" : "none" }} />
            </button>
            <AnimatePresence initial={false}>
              {o && (
                <motion.div
                  id={panel}
                  initial={reduce ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                  style={{ overflow: "hidden" }}
                >
                  <div style={{ padding: "0 14px 14px", fontSize: 13.5, lineHeight: 1.65, color: V.body, display: "grid", gap: 8 }}>{g.body}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/** The details a report carries so the team can see what you saw. Nothing about the content of any file. */
function pageContext(extra: Record<string, string | number | boolean | null>): Record<string, string | number | boolean | null> {
  const w = typeof window !== "undefined" ? window : null;
  return {
    path: w?.location.pathname ?? null,
    viewport: w ? `${w.innerWidth}x${w.innerHeight}` : null,
    browser: w ? w.navigator.userAgent.slice(0, 200) : null,
    version: (import.meta.env["VITE_APP_VERSION"] as string | undefined) ?? null,
    sentAt: new Date().toISOString(),
    ...extra,
  };
}

function ReportForm({ onSent }: { onSent: () => void }) {
  const { docs, clients, period, firm } = useV2();
  const [category, setCategory] = useState<ReportCategory | "">("");
  const [summary, setSummary] = useState("");
  const [what, setWhat] = useState("");
  const [expected, setExpected] = useState("");
  const [docId, setDocId] = useState("");
  const [worked, setWorked] = useState("");
  const [importance, setImportance] = useState<"high" | "medium" | "low">("medium");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const recent = useMemo(() => [...docs].slice(0, 40), [docs]);
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "";
  const hint = REPORT_CATEGORIES.find((c) => c.key === category)?.hint;
  const problem = category ? (summary.trim() ? checkReport({ category, summary, whatHappened: what, expected }) : null) : null;
  const ready = Boolean(category) && summary.trim().length >= LIMITS.summary.min;

  const submit = async () => {
    const check = checkReport({ category, summary, whatHappened: what, expected });
    if (!check.ok) {
      toast.error(check.problem);
      return;
    }
    const doc = docs.find((d) => d.id === docId);
    setBusy(true);
    try {
      await submitPracticeProblemReport({
        data: {
          category,
          summary,
          whatHappened: what || null,
          expected: expected || null,
          documentId: doc?.id ?? null,
          documentName: doc ? `${doc.name}${clientName(doc.clientId) ? ` (${clientName(doc.clientId)})` : ""}` : null,
          page: typeof window !== "undefined" ? window.location.pathname : null,
          context: pageContext({ period, firm: firm?.name ?? null, documentStatus: doc?.status ?? null, importance, workedWell: worked.trim().slice(0, 280) || null }),
        },
      });
      setSent(true);
      setCategory("");
      setSummary("");
      setWhat("");
      setExpected("");
      setDocId("");
      setWorked("");
      setImportance("medium");
      toast.success("Thank you. We have your report.");
      onSent();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }} data-testid="report-form">
      <AnimatePresence initial={false}>
        {sent && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="status" style={{ background: V.blue, borderRadius: 12, padding: "10px 14px", fontSize: 13.5 }} data-testid="report-thanks">
            Sent. The team has it, and it appears under <b>Your reports</b> below with its status. You can send another.
          </motion.div>
        )}
      </AnimatePresence>
      <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: V.muted }}>
        What is it about?
        <select className="v2-input" value={category} onChange={(e) => setCategory(e.target.value as ReportCategory)} data-testid="report-category">
          <option value="">Choose…</option>
          {REPORT_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
        {hint && <span style={{ fontSize: 12 }}>{hint}</span>}
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: V.muted }}>
        In one line, what went wrong?
        <input className="v2-input" value={summary} maxLength={LIMITS.summary.max} onChange={(e) => setSummary(e.target.value)} placeholder="For example: ICICI statement shows 1,440 lines, the bank says 1,461" data-testid="report-summary" />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: V.muted }}>
        What did you do, and what did you see? (optional)
        <textarea className="v2-input" rows={3} value={what} maxLength={LIMITS.text} onChange={(e) => setWhat(e.target.value)} data-testid="report-what" />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: V.muted }}>
        What worked well? (optional)
        <input className="v2-input" value={worked} maxLength={280} onChange={(e) => setWorked(e.target.value)} data-testid="report-worked" />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: V.muted }}>
        What did you expect instead? (optional)
        <textarea className="v2-input" rows={2} value={expected} maxLength={LIMITS.text} onChange={(e) => setExpected(e.target.value)} data-testid="report-expected" />
      </label>
      {recent.length > 0 && (
        <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: V.muted }}>
          Which file is it about? (optional)
          <select className="v2-input" value={docId} onChange={(e) => setDocId(e.target.value)} data-testid="report-doc">
            <option value="">Not about one file</option>
            {recent.map((d) => (
              <option key={d.id} value={d.id}>{d.name}{clientName(d.clientId) ? `, ${clientName(d.clientId)}` : ""}</option>
            ))}
          </select>
        </label>
      )}
      <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: V.muted, maxWidth: 240 }}>
        How important is it?
        <select className="v2-input" value={importance} onChange={(e) => setImportance(e.target.value as "high" | "medium" | "low")} data-testid="report-importance">
          <option value="high">High: it blocks my work or the numbers are wrong</option>
          <option value="medium">Medium: it slows me down</option>
          <option value="low">Low: a small annoyance</option>
        </select>
      </label>
      <p style={{ margin: 0, fontSize: 12, color: V.muted, lineHeight: 1.55 }}>
        We attach the page you are on, the month, your browser and the file you pick, so we can see what you saw. We do not send the contents of your files, and we never ask for passwords.
      </p>
      {problem && !problem.ok && <p style={{ margin: 0, fontSize: 12.5, color: V.maroon }}>{problem.problem}</p>}
      <div>
        <button type="button" className="v2-btn v2-btn-primary" disabled={!ready || busy} onClick={() => void submit()} data-testid="report-send">
          <Send size={14} style={{ marginRight: 8 }} />
          {busy ? "Sending…" : "Send report"}
        </button>
      </div>
    </div>
  );
}

function MyReports({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getPracticeProblemReports>> | null>(null);
  useEffect(() => {
    let live = true;
    getPracticeProblemReports()
      .then((r) => live && setRows(r))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [refreshKey]);
  if (!rows || rows.length === 0) return null;
  return (
    <div style={{ marginTop: 18 }} data-testid="my-reports">
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Your reports</div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ border: `1px solid ${V.line}`, borderRadius: 12, padding: "10px 12px", display: "grid", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.summary}</span>
              <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.statusLabel}</Badge>
            </div>
            <div style={{ fontSize: 12, color: V.muted }}>{CATEGORY_LABEL[r.category as ReportCategory] ?? r.category} · {formatDate(r.at)}</div>
            {r.note && <div style={{ fontSize: 13, lineHeight: 1.55 }}>FynHelp: {r.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Settings → Help. */
export function HelpPanel() {
  const [sentCount, setSentCount] = useState(0);
  return (
    <>
      <Card style={{ marginBottom: 16 }} data-testid="help-panel">
        <h3 style={{ fontSize: 15.5, margin: "0 0 4px", display: "flex", gap: 8, alignItems: "center" }}><LifeBuoy size={17} /> Help</h3>
        <p style={{ fontSize: 12.5, color: V.muted, margin: "0 0 14px", lineHeight: 1.6 }}>Short answers for each part of FynHelp. Open one to read it.</p>
        <Guides />
        <p style={{ fontSize: 13, color: V.body, margin: "14px 0 0", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Mail size={15} /> Prefer to write? <a className="v2-link" href="mailto:support@fynhelp.com">support@fynhelp.com</a>
        </p>
      </Card>
      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15.5, margin: "0 0 4px" }}>Report a problem</h3>
        <p style={{ fontSize: 12.5, color: V.muted, margin: "0 0 14px", lineHeight: 1.6 }}>Something read wrongly, a figure that does not add up, a message that did not go? Tell us. You do not need to be sure it is a bug: if it looks wrong to you, we want to see it.</p>
        <ReportForm onSent={() => setSentCount((n) => n + 1)} />
        <MyReports refreshKey={sentCount} />
      </Card>
    </>
  );
}
