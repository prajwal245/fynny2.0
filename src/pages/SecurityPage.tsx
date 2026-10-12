import { Link } from "@/lib/router-compat";
import { ArrowRight, Check } from "lucide-react";
import SiteShell, { PageHero, Section, CtaBand, Reveal } from "@/components/site/SiteShell";
import { CTA_DEMO, CTA_START, SIGNUP_URL, trackCta } from "@/components/site/cta";
import { DemoLink } from "@/components/site/BookDemo";

/**
 * /security — what is actually in place today, stated plainly. Nothing here
 * claims a certification, region or SLA we do not have; when that changes,
 * this page changes with it.
 */

const CONTROLS = [
  {
    t: "Each firm's data is walled off",
    d: "Every table holding client data has row-level security in the database, so one firm can never read another firm's rows, even through a bug in the app.",
  },
  {
    t: "Private file storage",
    d: "Uploaded statements and registers sit in private storage. A file opens only through a signed link that expires after five minutes.",
  },
  {
    t: "Encrypted in transit and at rest",
    d: "Every connection uses HTTPS. The database and file storage are encrypted at rest by our hosting provider.",
  },
  {
    t: "Partner and junior roles",
    d: "Settings, Gmail and WhatsApp connections, what the agents remember, and MIS sign-off are partner-only. The server checks the role on every request, not just the screen.",
  },
  {
    t: "Read-only Gmail access",
    d: "If a partner connects the firm's Gmail, FynHelp asks only for read-only access to pick up client attachments. It cannot send, delete or change mail. Disconnect at any time.",
  },
  {
    t: "A full audit trail",
    d: "Every match, ignore, sign-off and correction is logged with who did it, when, and the note they left.",
  },
];

const FACTS: [string, string][] = [
  ["Hosting", "Database and files on Supabase (AWS, Sydney region, ap-southeast-2). App served by Vercel. Moving data to an Indian region is planned; this page will say so when it is done."],
  ["Sign-in", "Email and password through Supabase Auth. Passwords are stored as salted hashes, never in plain text."],
  ["AI processing", "To read documents and draft MIS insights, the text of a document is sent to our AI providers (Google Gemini, Groq, and OCR.space for scans and photos) through their APIs. We never use your clients' data to train models."],
  ["Learning", "When your team corrects a line or decides an exception, that lesson is kept for your firm and that client only. Partners can make the agents forget it."],
  ["Your ledger", "FynHelp never writes to Tally or Zoho. You upload exports; your books stay where they are."],
  ["Deleting data", "Write to support@fynhelp.com from the firm owner's email and we delete the firm's documents and data."],
  ["Certifications", "None yet. We will publish certifications only once they are independently verified."],
];

export default function SecurityPage() {
  return (
    <SiteShell>
      <PageHero
        kicker="Security"
        title="How we look after"
        italic="your clients' books"
        sub="What is in place today, written plainly. No badges we have not earned, no regions we are not in."
        actions={
          <>
            <Link to={SIGNUP_URL} className="fh-btn fh-btn-primary" onClick={() => trackCta("start", "security-hero")}>
              {CTA_START} <ArrowRight size={15} />
            </Link>
            <DemoLink location="security-hero" className="fh-btn fh-btn-ghost">
              {CTA_DEMO}
            </DemoLink>
          </>
        }
      />

      <Section kicker="Controls" title="Six things in place" italic="from day one">
        <div className="fh-grid fh-g3" style={{ marginTop: 40 }}>
          {CONTROLS.map((c, i) => (
            <Reveal key={c.t} delay={(i % 3) * 80}>
              <div className="fh-card">
                <h3>{c.t}</h3>
                <p>{c.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section alt kicker="The facts" title="Where your data lives" italic="and who sees it">
        <div className="fh-card" style={{ marginTop: 40 }}>
          <ul className="fh-list">
            {FACTS.map(([k, v]) => (
              <li key={k}>
                <Check size={15} />
                <span>
                  <b>{k}.</b> {v}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section kicker="Report a problem" title="Found a security issue?" italic="Tell us first">
        <Reveal>
          <p style={{ marginTop: 24, maxWidth: "62ch", lineHeight: 1.7 }}>
            Email <a href="mailto:support@fynhelp.com">support@fynhelp.com</a> with the details. A founder reads
            every report and replies within two working days.
          </p>
        </Reveal>
      </Section>

      <CtaBand
        kicker="See it yourself"
        title="Try it on sample files"
        italic="before your clients' books"
        lead="Sign up, then load the sample files from the guide. Nothing real needs to leave your office until you are ready."
        location="security-final"
      />
    </SiteShell>
  );
}
