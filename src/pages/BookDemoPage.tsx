import { useState } from "react";
import SiteShell, { Section, Reveal } from "@/components/site/SiteShell";
import { C } from "@/components/site/siteTheme";

/* ================================================================
   FynHelp — Book a demo
   Collects a few ICP details, then hands off to Calendly with the
   name/email prefilled and the details attached to the booking.
================================================================ */

const CALENDLY_URL = "https://calendly.com/prajwal-fynhelp/fynhelp-demo";

const STYLES = `
.fh-demo-wrap { max-width:640px; margin:48px auto 0; }
.fh-form { background:${C.card}; border:1px solid ${C.line}; border-radius:24px; padding:30px; }
.fh-form label { display:block; font-size:11px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:${C.muted}; margin:18px 0 7px; }
.fh-form label:first-child { margin-top:0; }
.fh-form input, .fh-form select, .fh-form textarea { width:100%; background:${C.pageAlt}; border:1px solid ${C.line}; border-radius:12px; padding:12px 14px; font-size:14px; font-family:inherit; color:${C.ink}; outline:none; transition:border-color .2s; }
.fh-form input:focus, .fh-form select:focus, .fh-form textarea:focus { border-color:${C.maroon}; }
.fh-form textarea { min-height:90px; resize:vertical; }
.fh-form .row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
@media (max-width:640px){ .fh-form .row{ grid-template-columns:1fr; } }
.fh-form-note { font-size:12px; color:${C.muted}; margin-top:14px; line-height:1.6; }
`;

const SIZES = ["1–5 people", "6–20 people", "21–50 people", "50+ people"];
const CLIENTS = ["Under 50", "50–200", "200–500", "500+"];

export default function BookDemoPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [firm, setFirm] = useState("");
  const [role, setRole] = useState("");
  const [size, setSize] = useState(SIZES[0]);
  const [clients, setClients] = useState(CLIENTS[0]);
  const [challenge, setChallenge] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const details = [
      `Firm: ${firm}`,
      `Role: ${role}`,
      `Team size: ${size}`,
      `Clients served: ${clients}`,
      `Phone: ${phone || "-"}`,
      `Biggest challenge: ${challenge || "-"}`,
    ].join("\n");
    const params = new URLSearchParams({ name, email, a1: details });
    window.location.href = `${CALENDLY_URL}?${params.toString()}`;
  };

  return (
    <SiteShell>
      <style>{STYLES}</style>

      <section className="fh-phero center">
        <div className="fh-wrap">
          <div className="in">
            <Reveal>
              <div>
                <span className="fh-kicker">Book a demo</span>
                <h1>
                  See FynHelp <span className="ital">in 30 minutes.</span>
                </h1>
                <p className="sub" style={{ marginInline: "auto" }}>
                  Free, live walkthrough for CA firms. Tell us a little about your practice, then pick a time.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <Section>
        <div className="fh-demo-wrap">
          <form className="fh-form" onSubmit={submit}>
            <div className="row">
              <div>
                <label htmlFor="bd-name">Your name</label>
                <input id="bd-name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label htmlFor="bd-email">Work email</label>
                <input id="bd-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="row">
              <div>
                <label htmlFor="bd-firm">Firm name</label>
                <input id="bd-firm" required value={firm} onChange={(e) => setFirm(e.target.value)} />
              </div>
              <div>
                <label htmlFor="bd-role">Your role</label>
                <input id="bd-role" required placeholder="Partner, Manager…" value={role} onChange={(e) => setRole(e.target.value)} />
              </div>
            </div>
            <div className="row">
              <div>
                <label htmlFor="bd-size">Team size</label>
                <select id="bd-size" value={size} onChange={(e) => setSize(e.target.value)}>
                  {SIZES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="bd-clients">Clients served</label>
                <select id="bd-clients" value={clients} onChange={(e) => setClients(e.target.value)}>
                  {CLIENTS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <label htmlFor="bd-phone">Phone / WhatsApp (optional)</label>
            <input id="bd-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <label htmlFor="bd-challenge">Biggest challenge today (optional)</label>
            <textarea id="bd-challenge" value={challenge} onChange={(e) => setChallenge(e.target.value)} />
            <button type="submit" className="fh-btn" style={{ marginTop: 22, width: "100%" }}>
              Continue to pick a time
            </button>
            <p className="fh-form-note">Free, 30 minutes, no obligation. Next step: choose a slot on our calendar.</p>
          </form>
        </div>
      </Section>
    </SiteShell>
  );
}
