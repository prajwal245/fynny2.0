import { useState } from "react";
import { Plus, Minus } from "lucide-react";

const C = {
  bg: "#ECE6D2",
  card: "#FFFFFF",
  ink: "#111111",
  body: "#3A3A3A",
  muted: "#6B6B6B",
  red: "#B8333A",
  border: "rgba(0,0,0,0.08)",
};

type QA = { q: string; a: string };
const FAQS: Record<string, QA[]> = {
  "Getting Started": [
    { q: "How does Fynny learn my business?", a: "Fynny analyzes your transaction patterns, categorizes spend, and learns your business rhythms within 48 hours. Upload a CSV or connect Razorpay/Zoho and Fynny starts working immediately." },
    { q: "Do I need accounting software first?", a: "No. FynHelp works with raw bank statements, CSVs, or direct integrations. You don't need Tally or Zoho — but if you have them, Fynny connects seamlessly." },
    { q: "How long does onboarding take?", a: "Under 5 minutes. Upload your data, Fynny processes it, and your first financial brief is ready within the hour." },
  ],
  "Integrations": [
    { q: "What tools does FynHelp integrate with?", a: "Razorpay, Zoho Books, HDFC, ICICI, SBI, Axis Bank, Kotak, Tally, Stripe, PayU, GST Portal, QuickBooks — 12+ integrations and growing." },
    { q: "Can I connect multiple bank accounts?", a: "Yes. Connect all your business accounts for a unified cash position view across banks." },
  ],
  "Pricing & Plans": [
    { q: "Is FynHelp free?", a: "Early access users get 30 days free. After that, plans start at ₹999/month for startups and scale with your business." },
    { q: "Is there a free trial?", a: "Yes — your first financial audit report is free, no credit card required." },
  ],
  "Security & Privacy": [
    { q: "Is my financial data secure?", a: "Bank-grade encryption (AES-256), SOC 2 compliant infrastructure, data hosted in India (AWS Mumbai). We never sell or share your data." },
    { q: "Does FynHelp replace my CA?", a: "No. FynHelp gives you intelligence between CA visits. Your CA handles compliance — Fynny handles daily financial clarity. Many CAs love it because clients come to meetings better prepared." },
  ],
  "CA Partners": [
    { q: "What is the CA Partner Program?", a: "The CA Partner Program gives chartered accountants a dedicated workbench to manage all their client portfolios from a single dashboard. CAs can onboard clients, track GST and TDS compliance deadlines, run ITC reconciliation against GSTR-2B, and generate white-label reports. Each CA firm gets 20 client seats included in the base plan. Additional clients are billed at ₹99 per client per month." },
    { q: "How does a CA manage multiple clients without data mixing?", a: "Every client onboarded by a CA receives a permanent unique reference code in the format FYN-XXXXX. All data, documents, and filings for that client are stored in an isolated namespace keyed to their UUID. Even if two clients upload files with identical names, they are stored in completely separate locations. No client can ever see another client's data." },
  ],
};

const CATS = Object.keys(FAQS);

const STYLES = `
  .faq-section { padding: 96px 0; background: ${C.bg}; }
  .faq-wrap { max-width: 1180px; margin: 0 auto; padding: 0 24px; }
  .faq-head { text-align: center; margin-bottom: 56px; }
  .faq-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 0.16em; color: ${C.red}; text-transform: uppercase; }
  .faq-title { font-family: 'Inter', sans-serif; font-weight: 800; font-size: clamp(36px, 5vw, 56px); letter-spacing: -0.025em; line-height: 1.05; color: ${C.ink}; margin: 14px 0 0; }
  .faq-title .hl { color: ${C.red}; }
  .faq-grid { display: grid; grid-template-columns: 1fr; gap: 24px; }
  @media (min-width: 860px) { .faq-grid { grid-template-columns: 280px 1fr; gap: 48px; align-items: start; } }
  .faq-cats { display: flex; flex-direction: row; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
  @media (min-width: 860px) { .faq-cats { flex-direction: column; gap: 4px; overflow: visible; position: sticky; top: 100px; } }
  .faq-cat { background: transparent; border: none; text-align: left; padding: 14px 18px; border-radius: 10px; cursor: pointer;
    font-family: 'Inter', sans-serif; font-size: 15px; font-weight: 500; color: ${C.muted}; white-space: nowrap;
    border-left: 3px solid transparent; transition: all .15s ease; }
  .faq-cat:hover { color: ${C.ink}; background: rgba(0,0,0,0.03); }
  .faq-cat.active { color: ${C.red}; font-weight: 600; border-left-color: ${C.red}; background: rgba(184,51,58,0.06); }
  @media (max-width: 859px) { .faq-cat { border-left: none; border-bottom: 3px solid transparent; }
    .faq-cat.active { border-left: none; border-bottom-color: ${C.red}; } }
  .faq-list { display: flex; flex-direction: column; gap: 12px; }
  .faq-item { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 14px; overflow: hidden; transition: box-shadow .2s ease; }
  .faq-item:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.04); }
  .faq-q { width: 100%; background: transparent; border: none; cursor: pointer; padding: 22px 26px; display: flex; align-items: center; justify-content: space-between; gap: 16px; text-align: left;
    font-family: 'Inter', sans-serif; font-size: 16px; font-weight: 600; color: ${C.ink}; }
  .faq-icon { flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%; background: rgba(184,51,58,0.08); color: ${C.red}; display: flex; align-items: center; justify-content: center; }
  .faq-a { max-height: 0; overflow: hidden; transition: max-height .3s ease, padding .3s ease;
    font-size: 15px; line-height: 1.6; color: ${C.body}; padding: 0 26px; }
  .faq-item.open .faq-a { max-height: 400px; padding: 0 26px 22px; }
`;

export default function FAQSection() {
  const [cat, setCat] = useState<string>(CATS[0]);
  const [open, setOpen] = useState<string | null>(FAQS[CATS[0]][0].q);

  const selectCat = (c: string) => {
    setCat(c);
    setOpen(FAQS[c][0].q);
  };

  return (
    <section className="faq-section">
      <style>{STYLES}</style>
      <div className="faq-wrap">
        <div className="faq-head">
          <span className="faq-eyebrow">FAQ</span>
          <h2 className="faq-title">We have the <span className="hl">answers</span></h2>
        </div>
        <div className="faq-grid">
          <div className="faq-cats" role="tablist">
            {CATS.map((c) => (
              <button key={c} className={`faq-cat ${cat === c ? "active" : ""}`} onClick={() => selectCat(c)}>
                {c}
              </button>
            ))}
          </div>
          <div className="faq-list">
            {FAQS[cat].map(({ q, a }) => {
              const isOpen = open === q;
              return (
                <div key={q} className={`faq-item ${isOpen ? "open" : ""}`}>
                  <button className="faq-q" onClick={() => setOpen(isOpen ? null : q)} aria-expanded={isOpen}>
                    <span>{q}</span>
                    <span className="faq-icon">{isOpen ? <Minus size={16} /> : <Plus size={16} />}</span>
                  </button>
                  <div className="faq-a">{a}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
