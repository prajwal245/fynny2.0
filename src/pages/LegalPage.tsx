/**
 * Terms of Service and Privacy Policy. Written to match what the product
 * actually does: which data it reads, where it goes, and what a firm can
 * ask us to delete. Review with counsel before changing the substance.
 */
import type { ReactNode } from "react";
import { Link } from "@/lib/router-compat";
import SiteShell, { PageHero } from "@/components/site/SiteShell";
import { C } from "@/components/site/siteTheme";

const UPDATED = "1 October 2026";

function Prose({ children }: { children: ReactNode }) {
  return (
    <section className="fh-sec" style={{ paddingTop: 0 }}>
      <div className="fh-wrap">
        <article
          className="fh-legal"
          style={{
            maxWidth: 760,
            color: C.body,
            fontSize: 15.5,
            lineHeight: 1.75,
          }}
        >
          <style>{`
            .fh-legal h2 { font-size: 21px; margin: 36px 0 10px !important; color: ${C.ink}; letter-spacing: -0.01em; }
            .fh-legal p, .fh-legal li { margin: 0 0 12px; }
            .fh-legal ul { padding-left: 20px; list-style: disc; }
            .fh-legal a { color: ${C.ink}; text-decoration: underline; }
            .fh-legal table { width: 100%; border-collapse: collapse; font-size: 14px; margin: 8px 0 16px; }
            .fh-legal th, .fh-legal td { text-align: left; padding: 8px 10px; border-bottom: 1px solid rgba(0,0,0,.08); vertical-align: top; }
          `}</style>
          <p style={{ fontSize: 13, opacity: 0.75 }}>Last updated {UPDATED}</p>
          {children}
        </article>
      </div>
    </section>
  );
}

export function PrivacyPage() {
  return (
    <SiteShell>
      <PageHero
        kicker="Legal"
        title="Privacy"
        italic="policy"
        sub="What FynHelp reads, why, where it is stored and how to have it deleted."
      />
      <Prose>
        <p>
          FynHelp Technologies (“FynHelp”, “we”) provides a practice workspace
          for chartered accountancy firms. This policy explains how we handle
          personal data when a firm (“you”) uses FynHelp, in line with the
          Digital Personal Data Protection Act, 2023. For the documents a firm
          uploads about its own clients, the firm decides why and how that data
          is processed and FynHelp processes it only on the firm’s instructions.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <b>Account data:</b> name, work email, firm name, membership number
            (optional) and team roles.
          </li>
          <li>
            <b>Client records you create:</b> client names, contacts, GSTIN/PAN
            and other details you enter.
          </li>
          <li>
            <b>Documents you send us:</b> bank statements, ledger exports,
            invoices and photos uploaded by your team, forwarded through a
            connected Gmail inbox, or sent on WhatsApp, and the transactions we
            extract from them.
          </li>
          <li>
            <b>Usage data:</b> sign-in events, agent runs and actions taken in
            the product, kept as an audit trail.
          </li>
        </ul>

        <h2>How we use it</h2>
        <ul>
          <li>
            To read documents into transactions, match bank to books, draft MIS
            reports and send the follow-ups you set up.
          </li>
          <li>
            To keep an audit trail so every number can be traced to its source.
          </li>
          <li>
            To operate, secure and support the service. We do not sell personal
            data and we do not use your documents to train AI models.
          </li>
        </ul>

        <h2>Gmail</h2>
        <p>
          If you connect Gmail, FynHelp requests read-only access (
          <code>gmail.readonly</code>) to find emails from your clients that
          carry attachments, and stores those attachments as documents in your
          workspace. We do not send, delete or modify email. FynHelp’s use and
          transfer of information received from Google APIs adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. Gmail data is not used for
          advertising, is not sold, and is not read by people except with your
          permission, for security, or where the law requires it. You can
          disconnect Gmail at any time from Settings, and revoke access from
          your Google account.
        </p>

        <h2>Service providers</h2>
        <p>
          We use these providers to run FynHelp. Each receives only what it
          needs for its task.
        </p>
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Supabase</td>
              <td>Database, authentication and file storage</td>
            </tr>
            <tr>
              <td>Vercel</td>
              <td>Application hosting</td>
            </tr>
            <tr>
              <td>Google (Gemini), Groq</td>
              <td>Reading document text that cannot be parsed directly</td>
            </tr>
            <tr>
              <td>OCR.space</td>
              <td>Text recognition for scanned PDFs and photos</td>
            </tr>
            <tr>
              <td>Resend</td>
              <td>Sending account and follow-up emails</td>
            </tr>
            <tr>
              <td>Meta (WhatsApp Business), if enabled</td>
              <td>Receiving documents and sending follow-ups on WhatsApp</td>
            </tr>
          </tbody>
        </table>
        <p>
          Some of these providers process data outside India. We rely on their
          contractual commitments to protect it.
        </p>

        <h2>Security</h2>
        <p>
          Data is encrypted in transit and at rest. Every firm’s data is
          isolated at the database level, files are stored in private buckets
          and shared only through short-lived links, and team members see only
          their own firm. See <Link to="/security">Security</Link> for more.
        </p>

        <h2>Retention and deletion</h2>
        <p>
          We keep your data while your firm’s account is active. A partner can
          ask us to export or delete the firm’s data by writing to{" "}
          <a href="mailto:support@fynhelp.com">support@fynhelp.com</a>; we
          complete deletion within 30 days, except for records the law requires
          us to keep.
        </p>

        <h2>Your rights</h2>
        <p>
          You can ask to access, correct or erase your personal data, or
          withdraw consent, by writing to{" "}
          <a href="mailto:support@fynhelp.com">support@fynhelp.com</a>. If your
          firm’s client asks about their data, we will help the firm respond.
          You may also complain to the Data Protection Board of India.
        </p>

        <h2>Contact</h2>
        <p>
          Grievance officer, FynHelp Technologies, Bengaluru, India ·{" "}
          <a href="mailto:support@fynhelp.com">support@fynhelp.com</a>
        </p>
      </Prose>
    </SiteShell>
  );
}

export function TermsPage() {
  return (
    <SiteShell>
      <PageHero
        kicker="Legal"
        title="Terms of"
        italic="service"
        sub="The agreement between your firm and FynHelp."
      />
      <Prose>
        <p>
          These terms govern your firm’s use of FynHelp. By creating an account
          you accept them on behalf of your firm and confirm you are authorised
          to do so.
        </p>

        <h2>The service</h2>
        <p>
          FynHelp reads financial documents, matches transactions, drafts
          reports and sends follow-ups for your firm. Its agents are tools that
          assist your team: they do not provide accounting, audit, tax or legal
          advice, and they do not replace professional judgement. Unsure lines
          and exceptions are sent to your team for review, and a report is final
          only after a partner signs it off.
        </p>

        <h2>Your responsibilities</h2>
        <ul>
          <li>
            Keep sign-in details secure and give access only to your team.
          </li>
          <li>
            Upload or connect only data you are entitled to process, with any
            consent your clients need to give.
          </li>
          <li>
            Review extracted figures, matches and reports before relying on them
            or sharing them.
          </li>
          <li>
            Do not misuse the service, attempt to reach other firms’ data, or
            overload or reverse-engineer it.
          </li>
        </ul>

        <h2>Your data</h2>
        <p>
          Your firm owns the data it puts into FynHelp. You give us permission
          to process it only to provide the service, as described in our{" "}
          <Link to="/privacy">Privacy policy</Link>. You can export it or ask us
          to delete it at any time.
        </p>

        <h2>Plans and fees</h2>
        <p>
          Paid plans are billed per client entity as shown on our pricing page
          or in your order. Fees exclude taxes. We will give 30 days’ notice of
          any price change for an existing plan.
        </p>

        <h2>Availability and changes</h2>
        <p>
          We work to keep FynHelp available and to fix problems promptly, but
          the service is provided “as is” and may occasionally be interrupted
          for maintenance. We may improve or change features; we will tell you
          in advance about any change that materially reduces what you rely on.
        </p>

        <h2>Liability</h2>
        <p>
          To the extent the law allows, FynHelp is not liable for indirect or
          consequential losses, and our total liability for any claim is limited
          to the fees your firm paid in the 12 months before the claim.
        </p>

        <h2>Ending the agreement</h2>
        <p>
          You can stop using FynHelp at any time. We may suspend an account that
          breaches these terms after notice, or immediately where needed to
          protect other users. On closure you can export your data for 30 days
          before it is deleted.
        </p>

        <h2>Law</h2>
        <p>
          These terms are governed by the laws of India, and the courts of
          Bengaluru have jurisdiction.
        </p>

        <h2>Contact</h2>
        <p>
          <a href="mailto:support@fynhelp.com">support@fynhelp.com</a>
        </p>
      </Prose>
    </SiteShell>
  );
}
