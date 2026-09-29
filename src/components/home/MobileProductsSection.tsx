import { useEffect, useRef } from "react";
import { Link } from "@/lib/router-compat";

const PRODUCTS: { name: string; desc: string; status: "Live" | "Coming Soon" }[] = [
  { name: "Liquidity Intelligence", desc: "Cash flow forecast, burn rate, runway alerts", status: "Live" },
  { name: "Revenue Intelligence", desc: "Receivables AI, default prediction, churn warning", status: "Live" },
  { name: "Cost Intelligence", desc: "Spend control, vendor signals, anomaly detection", status: "Live" },
  { name: "GST & Tax Intelligence", desc: "ITC reconciliation, notice risk scorer, advance tax", status: "Live" },
  { name: "Governance Intelligence", desc: "ROC/MCA tracking, MSME compliance, audit readiness", status: "Coming Soon" },
  { name: "HR & Workforce Intelligence", desc: "Payroll planner, PF/ESIC compliance, attrition risk", status: "Coming Soon" },
  { name: "Decision Simulator", desc: "Hiring impact, pricing scenario, loan impact simulators", status: "Coming Soon" },
  { name: "Market & Growth Intelligence", desc: "Benchmarking, credit rating predictor, fundraise readiness", status: "Coming Soon" },
  { name: "Banking & Fintech Intelligence", desc: "Multi-bank aggregation, UPI tagger, RBI AA framework", status: "Coming Soon" },
  { name: "CA & Partner Ecosystem", desc: "CA white-label dashboard, referral commissions, client view", status: "Coming Soon" },
];

const CSS = `
#products-mobile { display: none; }
@media (max-width: 768px) {
  #products-mobile { display: block; background: #F4EDDA; padding: 48px 20px 40px; font-family: 'Sora', sans-serif; }
  #products-mobile .pm-eyebrow { font-weight: 500; font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: #8B6914; }
  #products-mobile .pm-h { font-weight: 800; font-size: 28px; letter-spacing: -0.5px; color: #1A1008; margin: 8px 0 0; line-height: 1.15; }
  #products-mobile .pm-sub { font-weight: 300; font-size: 14px; color: rgba(26,16,8,0.55); margin-top: 6px; }
  #products-mobile .pm-grid { display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 24px; }
  #products-mobile .pm-card { display: flex; align-items: center; min-height: 64px; padding: 18px 16px; background: #1A1008; border: 1px solid rgba(244,237,218,0.08); border-left: 2px solid transparent; border-radius: 8px; cursor: pointer; text-decoration: none; transition: background 150ms ease, border-color 150ms ease; opacity: 0; transform: translateY(16px); }
  #products-mobile .pm-card.in { opacity: 1; transform: translateY(0); transition: opacity 400ms ease-out, transform 400ms ease-out, background 150ms ease, border-color 150ms ease; }
  #products-mobile .pm-card:active, #products-mobile .pm-card:hover { background: #1F0E07; border-left: 2px solid #C41E1E; }
  #products-mobile .pm-left { flex: 1; min-width: 0; }
  #products-mobile .pm-name { font-weight: 600; font-size: 15px; color: #F4EDDA; margin-bottom: 4px; }
  #products-mobile .pm-desc { font-weight: 300; font-size: 12px; color: rgba(244,237,218,0.55); line-height: 1.5; }
  #products-mobile .pm-badge { border-radius: 20px; padding: 3px 10px; font-size: 9px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-left: 10px; flex-shrink: 0; }
  #products-mobile .pm-badge.live { background: rgba(15,120,70,0.15); border: 1px solid rgba(15,120,70,0.3); color: #1a9e67; }
  #products-mobile .pm-badge.soon { background: rgba(139,105,20,0.12); border: 1px solid rgba(139,105,20,0.25); color: #8B6914; }
  #products-mobile .pm-chev { font-weight: 400; font-size: 16px; color: rgba(244,237,218,0.25); flex-shrink: 0; margin-left: 12px; }
  #products-mobile .pm-cta { display: block; width: 100%; background: #C41E1E; color: #F4EDDA; border-radius: 6px; padding: 15px; font-size: 14px; font-weight: 600; text-align: center; margin-top: 16px; text-decoration: none; }
  #products-mobile .pm-foot { font-weight: 300; font-size: 11px; color: rgba(26,16,8,0.4); text-align: center; margin-top: 10px; }
}
`;

export default function MobileProductsSection() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".pm-card"));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            cards.forEach((c, i) => setTimeout(() => c.classList.add("in"), i * 50));
            io.disconnect();
          }
        });
      },
      { threshold: 0.15 }
    );
    io.observe(root);
    return () => io.disconnect();
  }, []);

  return (
    <section id="products-mobile" ref={ref}>
      <style>{CSS}</style>
      <div className="pm-eyebrow">Our Products</div>
      <h2 className="pm-h">Everything your CFO would do.</h2>
      <div className="pm-sub">Ten intelligence modules. One platform.</div>
      <div className="pm-grid">
        {PRODUCTS.map((p) => (
          <Link key={p.name} to="/waitlist" className="pm-card">
            <div className="pm-left">
              <div className="pm-name">{p.name}</div>
              <div className="pm-desc">{p.desc}</div>
            </div>
            <span className={`pm-badge ${p.status === "Live" ? "live" : "soon"}`}>{p.status}</span>
            <span className="pm-chev" aria-hidden>→</span>
          </Link>
        ))}
      </div>
      <Link to="/waitlist" className="pm-cta">Join the Waitlist →</Link>
      <div className="pm-foot">Free during beta · No credit card required</div>
    </section>
  );
}
