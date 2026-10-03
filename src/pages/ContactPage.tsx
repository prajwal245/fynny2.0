import { useState } from "react";
import SiteShell, { Section, Reveal } from "@/components/site/SiteShell";
import { C } from "@/components/site/siteTheme";
import { DemoLink } from "@/components/site/BookDemo";

/* ================================================================
   FynHelp — Contact
================================================================ */

const STYLES = `
.fh-contact-grid { display:grid; grid-template-columns: 5fr 7fr; gap:22px; margin-top:48px; align-items:start; }
@media (max-width:900px){ .fh-contact-grid{ grid-template-columns:1fr; } }
.fh-ccard { background:${C.card}; border:1px solid ${C.line}; border-radius:20px; padding:24px; }
.fh-ccard h3 { font-size:16px; letter-spacing:-0.02em; }
.fh-ccard p { font-size:13.5px; line-height:1.65; color:${C.body}; margin:8px 0 0; }
.fh-ccard a { color:${C.maroon}; font-weight:600; text-decoration:none; border-bottom:1px solid ${C.maroon}; }
.fh-cstack { display:grid; gap:14px; }
.fh-form { background:${C.card}; border:1px solid ${C.line}; border-radius:24px; padding:30px; }
.fh-form label { display:block; font-size:11px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:${C.muted}; margin:18px 0 7px; }
.fh-form label:first-child { margin-top:0; }
.fh-form input, .fh-form select, .fh-form textarea { width:100%; background:${C.pageAlt}; border:1px solid ${C.line}; border-radius:12px; padding:12px 14px; font-size:14px; font-family:inherit; color:${C.ink}; outline:none; transition:border-color .2s; }
.fh-form input:focus, .fh-form select:focus, .fh-form textarea:focus { border-color:${C.maroon}; }
.fh-form textarea { min-height:130px; resize:vertical; }
.fh-form .row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
@media (max-width:640px){ .fh-form .row{ grid-template-columns:1fr; } }
.fh-form-note { font-size:12px; color:${C.muted}; margin-top:14px; line-height:1.6; }
.fh-form-done { text-align:center; padding:40px 10px; }
.fh-form-done .tick { width:52px; height:52px; border-radius:99px; background:rgba(31,90,70,.12); color:${C.green}; font-size:22px; font-weight:700; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; }
`;

const TOPICS = ["Starting a trial", "Pricing and plans", "The free Pilot program", "CA firm partnership", "Something else"];

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [firm, setFirm] = useState("");
  const [topic, setTopic] = useState(TOPICS[0]);
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(`[FynHelp] ${topic} — ${name}`);
    const body = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}\nFirm / company: ${firm}\nTopic: ${topic}\n\n${msg}`
    );
    window.location.href = `mailto:support@fynhelp.com?subject=${subject}&body=${body}`;
    setSent(true);
  };

  return (
    <SiteShell>
      <style>{STYLES}</style>

      <section className="fh-phero center">
        <div className="fh-wrap">
          <div className="in">
            <Reveal>
              <div>
                <span className="fh-kicker">Contact</span>
                <h1>
                  Talk to a human, <span className="ital">not a ticket queue.</span>
                </h1>
                <p className="sub" style={{ marginInline: "auto" }}>
                  Questions on pricing, the free Pilot program, or onboarding your firm's book of
                  clients — we reply within one working day.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <Section>
        <div className="fh-contact-grid">
          <div className="fh-cstack">
            <Reveal>
              <div className="fh-ccard">
                <h3>Support</h3>
                <p>
                  Product help, onboarding and anything account related.{" "}
                  <a href="mailto:support@fynhelp.com">support@fynhelp.com</a>
                </p>
              </div>
            </Reveal>
            <Reveal delay={70}>
              <div className="fh-ccard">
                <h3>Pricing and plans</h3>
                <p>
                  Per-client billing, flat-firm quotes, and the free Pilot program for books under
                  three clients. <a href="mailto:pricing@fynhelp.com">pricing@fynhelp.com</a>
                </p>
              </div>
            </Reveal>
            <Reveal delay={140}>
              <div className="fh-ccard">
                <h3>Office</h3>
                <p>FynHelp Technologies · Bengaluru, India. Data residency stays in India on every plan.</p>
              </div>
            </Reveal>
            <Reveal delay={210}>
              <div className="fh-ccard">
                <h3>Prefer a walkthrough?</h3>
                <p>
                  Book a twenty-minute demo and we will run the pipeline on a sample book with you.{" "}
                  <DemoLink location="contact">Book a demo</DemoLink>
                </p>
              </div>
            </Reveal>
          </div>

          <Reveal delay={100}>
            <div className="fh-form">
              {sent ? (
                <div className="fh-form-done">
                  <div className="tick">✓</div>
                  <h3 style={{ fontSize: 20 }}>Your mail app should be open.</h3>
                  <p style={{ fontSize: 14, color: C.body, lineHeight: 1.65, marginTop: 10 }}>
                    The message is pre-filled and addressed to support@fynhelp.com — just press
                    send. We reply within one working day.
                  </p>
                </div>
              ) : (
                <form onSubmit={submit}>
                  <div className="row">
                    <div>
                      <label htmlFor="ct-name">Your name</label>
                      <input id="ct-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ananya Rao" />
                    </div>
                    <div>
                      <label htmlFor="ct-email">Work email</label>
                      <input id="ct-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@firm.in" />
                    </div>
                  </div>
                  <div className="row">
                    <div>
                      <label htmlFor="ct-firm">Firm or company</label>
                      <input id="ct-firm" value={firm} onChange={(e) => setFirm(e.target.value)} placeholder="Rao and Associates" />
                    </div>
                    <div>
                      <label htmlFor="ct-topic">Topic</label>
                      <select id="ct-topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
                        {TOPICS.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <label htmlFor="ct-msg">Message</label>
                  <textarea
                    id="ct-msg"
                    required
                    value={msg}
                    onChange={(e) => setMsg(e.target.value)}
                    placeholder="Tell us about your book of clients, or what you would like to see working first."
                  />
                  <button type="submit" className="fh-btn fh-btn-primary" style={{ marginTop: 20, border: "none" }}>
                    Send message
                  </button>
                  <p className="fh-form-note">
                    This opens your mail app with the message pre-filled — nothing is stored until
                    you press send. We never share your details.
                  </p>
                </form>
              )}
            </div>
          </Reveal>
        </div>
      </Section>
    </SiteShell>
  );
}
