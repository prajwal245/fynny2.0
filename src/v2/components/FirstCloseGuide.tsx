/**
 * The first-run guide: the seven steps from an empty workspace to a signed-off
 * MIS, worked out from what the firm has actually done. Each step says what
 * to do, why, and takes you to the exact place to do it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, Check, Compass, FileDown, X } from "lucide-react";
import { toast } from "sonner";
import { Card, Drawer, V } from "../ui";
import { monthOf, useV2 } from "../store";
import { openExceptions } from "../lib/exceptions";

const HIDE_KEY = "fynhelp.v2.firstclose.hidden";
const DONE_KEY = "fynhelp.v2.firstclose.celebrated";

export type GuideStep = {
  key: string;
  title: string;
  why: string;
  how: string;
  done: boolean;
  action: { label: string; to: string };
  partnerOnly?: boolean;
};

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode: the guide just shows again */
    }
  },
};

/** Steps for the client the firm has got furthest with, in the month on screen. */
export function useFirstCloseSteps() {
  const { clients, docs, exceptions, reports, period, partnerView } = useV2();
  return useMemo(() => {
    const progress = (id: string) => {
      const rows = docs.filter((d) => d.clientId === id).flatMap((d) => d.rows);
      return rows.length + reports.filter((r) => r.clientId === id).length * 1000;
    };
    const client = [...clients].sort((a, b) => progress(b.id) - progress(a.id))[0];
    const base = client ? `/app/clients/${client.id}` : "/app/clients";
    const rows = client ? docs.filter((d) => d.clientId === client.id).flatMap((d) => d.rows).filter((r) => r.date && monthOf(r.date) === period) : [];
    const bank = rows.filter((r) => r.side === "bank");
    const books = rows.filter((r) => r.side === "books");
    const matched = rows.some((r) => r.matchStatus === "matched");
    const openEx = client ? openExceptions(exceptions).filter((e) => e.clientId === client.id && e.date && monthOf(e.date) === period).length : 0;
    const report = client
      ? reports
          .filter((r) => r.clientId === client.id && r.period === period && r.template === "Monthly MIS")
          .sort((a, b) => (a.generated < b.generated ? 1 : -1))[0]
      : undefined;
    const name = client?.name ?? "your client";
    const steps: GuideStep[] = [
      {
        key: "client",
        title: "Add your first client",
        why: "The agents work client by client. Their email lets statements they send file themselves.",
        how: "Name and email are enough. The GSTIN is checked against its last character.",
        done: clients.length > 0,
        action: { label: "Add a client", to: "/app/clients?add=1" },
      },
      {
        key: "bank",
        title: `Upload ${name}'s bank statement for ${period}`,
        why: "Recon starts from the bank: every line in it has to be explained by the books.",
        how: "CSV, Excel or PDF from net banking. Pick the month at the top of the screen first; FynHelp tells you if the file belongs to another month.",
        done: bank.length > 0,
        action: { label: "Upload statement", to: `${base}?tab=documents` },
      },
      {
        key: "books",
        title: "Upload the books for the same month",
        why: "Recon matches the bank to the books, so it needs both sides of the same account.",
        how: "Export the Tally day book or the bank ledger (CSV, Excel or Tally XML) for the same month and bank account.",
        done: books.length > 0,
        action: { label: "Upload books", to: `${base}?tab=recon` },
      },
      {
        key: "recon",
        title: "Run Recon",
        why: "Exact, same-day, close and rule matches are made for you; only the leftovers need a person.",
        how: "Recon runs by itself once both sides are in. If it has not, press Run recon on the Recon tab.",
        done: matched,
        action: { label: "Open Recon", to: `${base}?tab=recon` },
      },
      {
        key: "exceptions",
        title: openEx ? `Decide ${openEx} exception${openEx === 1 ? "" : "s"}` : "Decide the exceptions",
        why: "Each unmatched line has a reason. Your decision, and the note you leave, are kept on the audit trail and remembered next month.",
        how: "Match it (with a note if amounts differ), mark it reconciled elsewhere, or ignore it. Leave a line open if it is a question for the client.",
        done: matched && openEx === 0,
        action: { label: "Open the queue", to: `${base}?tab=exceptions` },
      },
      {
        key: "mis",
        title: `Generate the ${period} MIS`,
        why: "Narrate builds revenue, expenses and insights from matched lines only, each figure linked to its source.",
        how: "Choose Monthly MIS. Lines still open are left out and the report says so at the top.",
        done: Boolean(report),
        action: { label: "Generate MIS", to: report ? `/app/reports/${report.id}` : `${base}?tab=mis` },
      },
      {
        key: "signoff",
        title: "Check a figure, then sign off",
        why: "Open any number to see the transactions behind it. A partner's sign-off makes it the version for the client.",
        how: partnerView
          ? "Click Revenue to check its lines, then Sign off. Download the PDF or Excel to send to the client."
          : "Ask a partner to sign it off. Until then it stays a draft.",
        done: Boolean(report?.signedOff),
        action: { label: report ? "Open the MIS" : "MIS and Reports", to: report ? `/app/reports/${report.id}` : "/app/reports" },
        partnerOnly: true,
      },
    ];
    return { steps, client, period, done: steps.filter((s) => s.done).length };
  }, [clients, docs, exceptions, reports, period, partnerView]);
}

function StepList({ onNavigate }: { onNavigate?: () => void }) {
  const { steps } = useFirstCloseSteps();
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }} data-testid="first-close-steps">
      {steps.map((s, i) => {
        const isNow = i === current;
        return (
          <li
            key={s.key}
            data-done={s.done}
            data-current={isNow}
            style={{
              display: "grid",
              gridTemplateColumns: "26px minmax(0,1fr)",
              gap: 10,
              padding: isNow ? "12px 12px" : "8px 12px",
              borderRadius: 12,
              background: isNow ? V.gray : "transparent",
              border: isNow ? `1px solid ${V.line}` : "1px solid transparent",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                fontSize: 11.5,
                fontWeight: 700,
                background: s.done ? V.green : isNow ? V.maroon : "transparent",
                color: s.done || isNow ? "#fff" : V.muted,
                border: s.done || isNow ? "none" : `1.5px solid ${V.line}`,
                marginTop: 1,
              }}
            >
              {s.done ? <Check size={12} strokeWidth={3} /> : i + 1}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: isNow ? 650 : 500, color: s.done ? V.muted : V.ink, textDecoration: s.done ? "line-through" : "none" }}>{s.title}</div>
              {isNow && (
                <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
                  <div style={{ fontSize: 12.5, color: V.body, lineHeight: 1.55 }}>{s.why}</div>
                  <div style={{ fontSize: 12.5, color: V.body, lineHeight: 1.55 }}>
                    <b>How:</b> {s.how}
                  </div>
                  <div>
                    <Link
                      className="v2-btn v2-btn-primary v2-btn-sm"
                      to={s.action.to.split("?")[0] as never}
                      search={Object.fromEntries(new URLSearchParams(s.action.to.split("?")[1] ?? "")) as never}
                      onClick={onNavigate}
                      data-testid="first-close-action"
                    >
                      {s.action.label} <ArrowRight size={13} />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SampleHelp() {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12.5, color: V.body }}>
      <a className="v2-btn v2-btn-quiet v2-btn-sm" href="/samples" target="_blank" rel="noreferrer">
        <FileDown size={13} /> No files yet? Use the sample pack
      </a>
      <a className="v2-btn v2-btn-quiet v2-btn-sm" href="/blog/month-end-close-walkthrough-sample-files" target="_blank" rel="noreferrer">
        <BookOpen size={13} /> Walkthrough with screenshots
      </a>
    </div>
  );
}

/** The guide as a card on the Portfolio. */
export function FirstCloseCard() {
  const { done, steps } = useFirstCloseSteps();
  const [hidden, setHidden] = useState(() => store.get(HIDE_KEY) === "1");
  if (hidden || done === steps.length) return null;
  return (
    <Card data-testid="first-close-guide">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 15.5, margin: 0 }}>Your first MIS, step by step</h3>
          <div style={{ fontSize: 12.5, color: V.muted, margin: "4px 0 0" }}>
            {done} of {steps.length} done · about 15 minutes with the sample files
          </div>
        </div>
        <button
          className="v2-btn v2-btn-quiet v2-btn-sm"
          aria-label="Hide the guide"
          title="Hide (open it again from Your first MIS at the bottom of the menu)"
          onClick={() => {
            store.set(HIDE_KEY, "1");
            setHidden(true);
          }}
        >
          <X size={13} />
        </button>
      </div>
      <div className="v2-bar" style={{ margin: "12px 0 14px" }}>
        <motion.i initial={false} animate={{ width: `${(done / steps.length) * 100}%` }} transition={{ duration: 0.4 }} style={{ background: V.green, animation: "none", marginLeft: 0 }} />
      </div>
      <StepList />
      <div style={{ marginTop: 14 }}>
        <SampleHelp />
      </div>
    </Card>
  );
}

/** The guide from anywhere: a button in the menu that opens it in a side panel, and a cheer when the first MIS is signed off. */
export function FirstCloseLauncher() {
  const { done, steps } = useFirstCloseSteps();
  const [open, setOpen] = useState(false);
  const prev = useRef(done);
  useEffect(() => {
    if (done === steps.length && prev.current < steps.length && store.get(DONE_KEY) !== "1") {
      store.set(DONE_KEY, "1");
      toast.success("Your first MIS is signed off. That is the whole monthly close, end to end.", { duration: 6000 });
    }
    prev.current = done;
  }, [done, steps.length]);
  if (done === steps.length) return null;
  return (
    <>
      <button
        type="button"
        className="v2-btn v2-btn-quiet"
        style={{ width: "100%", justifyContent: "flex-start", gap: 10, borderRadius: 14, border: `1px solid ${V.line}`, padding: "10px 12px" }}
        onClick={() => setOpen(true)}
        data-testid="first-close-launcher"
      >
        <Compass size={16} />
        <span style={{ textAlign: "left", lineHeight: 1.25 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>Your first MIS</span>
          <span style={{ display: "block", fontSize: 11.5, color: V.muted }}>
            Step {Math.min(done + 1, steps.length)} of {steps.length}
          </span>
        </span>
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Your first MIS, step by step">
        <p style={{ fontSize: 13, color: V.body, margin: "0 0 14px", lineHeight: 1.6 }}>
          From a bank statement and the books to a monthly MIS a partner signs off. The steps tick themselves as you go.
        </p>
        <StepList onNavigate={() => setOpen(false)} />
        <div style={{ marginTop: 16 }}>
          <SampleHelp />
        </div>
      </Drawer>
    </>
  );
}

const WELCOME_KEY = "fynhelp.v2.welcome.seen";

/** Shown once, the first time a new firm lands in the workspace. */
export function FirstRunWelcome() {
  const { session, firm } = useV2();
  const { done, steps } = useFirstCloseSteps();
  const [open, setOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  useEffect(() => {
    if (done <= 2 && store.get(WELCOME_KEY) !== "1" && firm) setOpen(true);
  }, [done, firm]);
  const close = () => {
    store.set(WELCOME_KEY, "1");
    setOpen(false);
  };
  const first = (session?.name ?? "").split(" ").filter((w) => !/^(ca|mr|ms|mrs|dr)\.?$/i.test(w))[0] ?? "";
  return (
    <>
      <Drawer open={open} onClose={close} title={`Welcome to FynHelp${first ? `, ${first}` : ""}`}>
        <div style={{ display: "grid", gap: 16 }} data-testid="first-run-welcome">
          <p style={{ fontSize: 14, color: V.body, margin: 0, lineHeight: 1.6 }}>
            Here is how one month-end close works. Your first one takes about 15 minutes, and the steps tick themselves as you go.
          </p>
          <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 10, fontSize: 13.5, lineHeight: 1.55 }}>
            <li>
              <b>Bring in the bank statement and the books</b> for one client and one month. Extract reads every line.
            </li>
            <li>
              <b>Recon matches them.</b> Only the lines that do not tie reach you, each with a reason.
            </li>
            <li>
              <b>Decide those lines</b> with a short note. FynHelp remembers your decisions for next month.
            </li>
            <li>
              <b>Generate the MIS and sign it off.</b> Every figure opens the transactions behind it.
            </li>
          </ol>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="v2-btn v2-btn-primary"
              onClick={() => {
                close();
                setGuideOpen(true);
              }}
              data-testid="welcome-start"
            >
              Start step {Math.min(done + 1, steps.length)} <ArrowRight size={14} />
            </button>
            <a className="v2-btn v2-btn-ghost" href="/samples" target="_blank" rel="noreferrer">
              <FileDown size={14} /> Try it with sample files
            </a>
          </div>
          <p style={{ fontSize: 12.5, color: V.muted, margin: 0 }}>
            You can reopen the steps any time from <b>Your first MIS</b> at the bottom of the menu. Your free trial runs 14 days.
          </p>
        </div>
      </Drawer>
      <Drawer open={guideOpen} onClose={() => setGuideOpen(false)} title="Your first MIS, step by step">
        <StepList onNavigate={() => setGuideOpen(false)} />
        <div style={{ marginTop: 16 }}>
          <SampleHelp />
        </div>
      </Drawer>
    </>
  );
}
