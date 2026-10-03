import { Link } from "@/lib/router-compat";
import { ArrowRight, Check } from "lucide-react";
import SiteShell, { PageHero, Section, CtaBand, Reveal } from "@/components/site/SiteShell";
import { CTA_DEMO, CTA_START, SIGNUP_URL, trackCta } from "@/components/site/cta";
import { DemoLink } from "@/components/site/BookDemo";

const BELIEFS = [
  {
    t: "Books are a source, not a chore",
    d: "Every entry already contains the answer to a question someone is about to ask. The work is retrieval, not data entry.",
  },
  {
    t: "A number without its source is a rumour",
    d: "Anything FynHelp shows can be traced back to the bank line or invoice behind it, in one click, months later.",
  },
  {
    t: "Software should not guess quietly",
    d: "When the data does not support an answer, the honest response is to say so. We would rather show a gap than fabricate confidence.",
  },
  {
    t: "Built for Indian statute, not adapted to it",
    d: "GST, TDS, ITC blocking rules and the filing calendar are the model, not a localisation layer bolted onto a foreign product.",
  },
];

const TIMELINE = [
  { y: "2024", t: "The problem, up close", d: "Months spent inside SME books and CA practices watching the same reconciliation repeated by hand, forty times over." },
  { y: "2025", t: "The first agent", d: "A cash agent that rebuilt the 13 week forecast every morning. The first users stopped maintaining their own sheet within a fortnight." },
  { y: "2026", t: "Eight agents and a practice OS", d: "A full finance desk for SMEs, and a firm wide operating layer for the CAs who serve them." },
];

export default function AboutPage() {
  return (
    <SiteShell>
      <PageHero
        kicker="About FynHelp"
        title="We are building the intelligence layer"
        italic="between documents and the ledger"
        sub="FynHelp reads what an Indian business already produces, invoices, statements, filings, and turns it into the handful of decisions a CFO would actually raise this week."
        actions={
          <>
            <Link to={SIGNUP_URL} className="fh-btn fh-btn-primary" onClick={() => trackCta("start", "about-hero")}>
              {CTA_START} <ArrowRight size={15} />
            </Link>
            <DemoLink location="about-hero" className="fh-btn fh-btn-ghost">
              {CTA_DEMO}
            </DemoLink>
          </>
        }
      />

      <div className="fh-wrap">
        <div className="fh-strip">
          <div className="fh-strip-grid">
            <div><div className="v num">2024</div><div className="l">founded in Bengaluru</div></div>
            <div><div className="v num">8</div><div className="l">finance agents shipped</div></div>
            <div><div className="v num">2</div><div className="l">products, SME and CA firm</div></div>
            <div><div className="v num">India</div><div className="l">first, by design</div></div>
          </div>
        </div>
      </div>

      <Section
        kicker="Why we exist"
        title="Most Indian businesses find out late,"
        italic="and then it is expensive"
        lead="The information was in the books the whole time. It just was not read until the quarter closed, the notice arrived, or the cash ran short."
      >
        <div className="fh-split2" style={{ marginTop: 44 }}>
          <Reveal>
            <div className="fh-card">
              <h3>What the founder saw</h3>
              <p>
                An owner discovers a cash gap in the week payroll is due. A CA firm reconciles the same
                mismatch for the fortieth client that month. Both are competent. Both are working from
                information that arrived too late to act on.
              </p>
              <p>
                Nothing about that is a discipline problem. It is a reading problem, and reading at that
                scale is what software is for.
              </p>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="fh-card">
              <h3>What we built instead</h3>
              <ul className="fh-list">
                <li><Check size={15} /><span>Agents that run every day, not a dashboard you remember to open</span></li>
                <li><Check size={15} /><span>Findings written as decisions, with the amount at stake</span></li>
                <li><Check size={15} /><span>Every figure linked to the transaction that produced it</span></li>
                <li><Check size={15} /><span>The same engine serving the business and its CA</span></li>
              </ul>
              <p className="fh-note">
                The result is a shorter month end, and far fewer surprises inside it.
              </p>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section
        alt
        kicker="What we believe"
        title="Four positions we are"
        italic="not willing to trade"
      >
        <div className="fh-grid fh-g2" style={{ marginTop: 40 }}>
          {BELIEFS.map((b, i) => (
            <Reveal key={b.t} delay={(i % 2) * 90}>
              <div className="fh-card">
                <span className="fh-tag">{String(i + 1).padStart(2, "0")}</span>
                <h3>{b.t}</h3>
                <p>{b.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section kicker="How we got here" title="Three years," italic="one narrow obsession">
        <div className="fh-steps" style={{ marginTop: 40 }}>
          {TIMELINE.map((s, i) => (
            <Reveal key={s.y} delay={i * 80}>
              <div className="fh-step">
                <span className="n num">{s.y}</span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <CtaBand
        kicker="Come see it"
        title="Thirty minutes with"
        italic="your own books"
        lead="No slides. We run the agents on one month of your data and read the findings together."
        location="about-final"
      />
    </SiteShell>
  );
}
