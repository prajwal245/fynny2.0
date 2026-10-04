/**
 * The right-hand side of onboarding: what the agents will do with what the
 * partner has just typed. It previews real behaviour (the Chaser's actual
 * message, the MIS header with the firm's name, the first document's result),
 * never invented numbers.
 */
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AGENTS, ShimmerText, type AgentKey } from "../agents";

const INK = "#141414";
const SOFT = "rgba(255,255,255,.62)";
const LINE = "rgba(255,255,255,.12)";

const ROLE: Record<AgentKey, string> = {
  extract: "Reads statements, Tally exports, bills and photos into transactions. Unsure lines wait for you.",
  recon: "Matches bank to books: exact, then fuzzy, then your rules. Only real exceptions reach you.",
  narrate: "Writes the MIS from matched transactions only. Every number links to its source.",
  chaser: "Asks clients for what is missing and stops the moment it arrives.",
};

function AgentRow({ agent, active = false }: { agent: AgentKey; active?: boolean }) {
  const a = AGENTS[agent];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 12, alignItems: "start", padding: "12px 0", borderTop: `1px solid ${LINE}` }}>
      <span style={{ marginTop: 5, width: 8, height: 8, borderRadius: 999, background: a.dot, boxShadow: active ? `0 0 0 4px ${a.dot}33` : "none" }} />
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div>
        <div style={{ fontSize: 12.5, color: SOFT, marginTop: 2, lineHeight: 1.5 }}>{ROLE[agent]}</div>
      </div>
    </div>
  );
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "rgba(255,255,255,.06)", border: `1px solid ${LINE}`, borderRadius: 16, padding: 16 }}>
      <div style={{ fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: SOFT, fontWeight: 700, marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  );
}

export function OnboardingPanel(props: {
  step: number;
  mode: string;
  firmName: string;
  partnerName: string;
  client: { name: string; contact: string };
  docName: string | null;
  reading: boolean;
  txns: number;
  review: number;
  autonomy: { auto_recon: boolean; auto_chase_day: number | null };
}) {
  const { step } = props;
  const firm = props.firmName.trim() || "Your firm";
  // "CA Priya Rao" signs as "Priya": professional titles are not first names.
  const partner =
    props.partnerName.trim().replace(/^(ca|cs|cma|dr|mr|mrs|ms|shri|smt)\.?\s+/i, "").split(" ")[0] || "the partner";
  const clientName = props.client.name.trim() || "your client";
  const contact = props.client.contact.trim().replace(/^(mr|mrs|ms|dr|shri|smt)\.?\s+/i, "").split(" ")[0] || "there";
  const month = new Date(Date.now() - 20 * 86400000).toLocaleString("en-IN", { month: "long" });

  let title: ReactNode = "";
  let body: React.ReactNode = null;
  if (step === 0) {
    title = props.mode === "signin" ? "Your agents kept working" : "Four agents. One month-end close.";
    body = (
      <>
        <div style={{ marginTop: 8 }}>
          {(Object.keys(AGENTS) as AgentKey[]).map((k) => <AgentRow key={k} agent={k} />)}
        </div>
        <div style={{ marginTop: 18, display: "grid", gap: 8, fontSize: 12.5, color: SOFT }}>
          <div>· Matching is deterministic: no AI decides a match.</div>
          <div>· Nothing is filed under a client unless the sender is certain.</div>
          <div>· Every number in an MIS opens the transactions behind it.</div>
        </div>
      </>
    );
  } else if (step === 1) {
    title = "How your clients will see you";
    body = (
      <Frame label="MIS header">
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>{firm}</div>
        <div style={{ fontSize: 12.5, color: SOFT, marginTop: 4 }}>Monthly MIS · prepared from matched transactions · signed off by the partner</div>
      </Frame>
    );
  } else if (step === 2) {
    title = "The Chaser writes like your firm";
    body = (
      <Frame label={`Email to ${props.client.contact.trim() || "the client contact"}`}>
        <div style={{ fontSize: 13.5, lineHeight: 1.65 }}>
          Hi {contact}, hope you are well. Could you share the bank statement for {month} for {clientName} when you get a chance? Thank you!
          <div style={{ marginTop: 10, color: SOFT }}>
            {partner}, {firm}
          </div>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: SOFT }}>Day 0, 3 and 7. Stops the moment the document arrives, on any channel.</div>
      </Frame>
    );
  } else if (step === 3) {
    title = props.docName ? (props.reading ? <ShimmerText text="Extract is reading…" tone="light" /> : "Read and structured") : "Start with one document";
    body = props.docName ? (
      <Frame label={props.docName}>
        {props.reading ? (
          <div style={{ display: "grid", gap: 8 }}>
            {[70, 90, 55].map((w, i) => (
              <motion.div key={i} animate={{ opacity: [0.35, 0.8, 0.35] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.15 }} style={{ height: 10, width: `${w}%`, borderRadius: 999, background: "rgba(255,255,255,.18)" }} />
            ))}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
            <div><b style={{ fontSize: 22 }}>{props.txns}</b> transactions, each traceable to its line</div>
            <div style={{ color: SOFT }}>{props.review ? `${props.review} unsure line${props.review === 1 ? "" : "s"} wait for you in the Review Queue` : "Nothing needed a second look"}</div>
          </div>
        )}
      </Frame>
    ) : (
      <div style={{ fontSize: 13.5, color: SOFT, lineHeight: 1.7 }}>
        A bank statement is the best first document: the Extract agent verifies each line against the running balance.
        Add the books (Tally or ledger) later and Recon matches the month on its own.
      </div>
    );
  } else if (step === 4) {
    title = "You stay in charge";
    body = (
      <div style={{ display: "grid", gap: 12 }}>
        <Frame label="Agents do on their own">
          <div style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
            <div>Read every document that arrives</div>
            <div style={{ opacity: props.autonomy.auto_recon ? 1 : 0.4 }}>Match bank to books when a month is complete</div>
            <div style={{ opacity: props.autonomy.auto_chase_day ? 1 : 0.4 }}>Chase a missing statement {props.autonomy.auto_chase_day ? `from the ${props.autonomy.auto_chase_day}th` : "(off)"}</div>
            <div>Retry anything that failed for a temporary reason</div>
          </div>
        </Frame>
        <Frame label="Always waits for a person">
          <div style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
            <div>Unsure lines and every exception</div>
            <div>Generating the MIS and signing it off</div>
          </div>
        </Frame>
      </div>
    );
  } else if (step === 5) {
    title = "Documents arrive, agents start";
    body = (
      <div style={{ display: "grid", gap: 10, fontSize: 13.5 }}>
        {["Client emails a statement", "Gmail intake matches the sender", "Extract reads it", "Recon matches the month"].map((t, i) => (
          <div key={t} style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ width: 22, height: 22, borderRadius: 999, border: `1px solid ${LINE}`, display: "grid", placeItems: "center", fontSize: 11, color: SOFT }}>{i + 1}</span>
            {t}
          </div>
        ))}
        <div style={{ color: SOFT, fontSize: 12.5, marginTop: 6 }}>An unknown sender is never guessed: the document waits in the Unassigned inbox for one click.</div>
      </div>
    );
  } else {
    title = "Your agents are on duty";
    body = (
      <div style={{ marginTop: 4 }}>
        {(Object.keys(AGENTS) as AgentKey[]).map((k) => <AgentRow key={k} agent={k} active />)}
      </div>
    );
  }

  return (
    <aside className="onb-panel" aria-label="What your agents will do" style={{ background: INK, color: "#fff", padding: "clamp(28px,4vw,56px)", display: "flex", flexDirection: "column", justifyContent: "center", position: "sticky", top: 0, height: "100vh" }}>
      <AnimatePresence mode="wait">
        <motion.div key={`${step}:${props.mode}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }} style={{ display: "grid", gap: 16, maxWidth: 420 }}>
          <div style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: SOFT, fontWeight: 700 }}>FynHelp agents</div>
          <h2 style={{ fontSize: 26, letterSpacing: "-0.03em", lineHeight: 1.2, margin: 0, color: "#fff" }}>{title}</h2>
          {body}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}
