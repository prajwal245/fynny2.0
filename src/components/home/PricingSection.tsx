import { Link } from "@/lib/router-compat";
import { useScrollReveal } from "@/hooks/useScrollReveal";

interface Plan {
  name: string;
  topBadge?: string;
  priceMain: string;
  priceSub?: string;
  waitlistBadge?: string;
  waitlistNote?: string;
  target: string;
  sub: string;
  features: string[];
  featured?: boolean;
  cta: string;
  isEnterprise?: boolean;
}

const plans: Plan[] = [
  {
    name: "Starter",
    priceMain: "FREE for 30 days",
    priceSub: "Then ₹30,000/year or ₹3,000/month",
    waitlistBadge: "For Waitlisters",
    target: "Businesses up to ₹5 Crore turnover",
    sub: "Perfect for getting started with financial intelligence",
    features: [
      "Liquidity Intelligence (all 6 modules)",
      "Cash flow projection (30 day)",
      "GST filing calendar + deadline alerts",
      "Basic ITC reconciliation (100 invoices/month)",
      "CFO Fynny morning brief in English",
      "1 bank account via Account Aggregator",
      "Bank statement PDF parser",
      "WhatsApp alerts for critical thresholds",
      "Email support (within 8 hours)",
      "1 user account",
    ],
    cta: "Start 30 Day Free Trial",
  },
  {
    name: "Pro",
    topBadge: "MOST POPULAR",
    priceMain: "₹90,000/year",
    waitlistNote: "₹45,000 for waitlisters",
    waitlistBadge: "Save 50%",
    target: "Businesses ₹5 to 50 Crore turnover",
    sub: "Complete financial intelligence for growing businesses",
    features: [
      "Everything in Starter, plus:",
      "Revenue intelligence (all 8 modules)",
      "Full ITC reconciliation (unlimited invoices)",
      "GST notice risk scorer + vendor compliance",
      "HR & Workforce intelligence (all modules)",
      "Decision Simulator (4 scenarios)",
      "CFO Fynny in Hindi + Gujarati",
      "Up to 5 bank accounts via AA",
      "Tally Prime + Zoho Books + QuickBooks",
      "Working capital marketplace access",
      "Priority support (within 2 hours)",
      "3 user accounts + monthly CFO report",
    ],
    featured: true,
    cta: "Start 30 Day Free Trial",
  },
  {
    name: "Enterprise",
    priceMain: "Custom",
    target: "Groups, CA firms managing 50+ clients, banks",
    sub: "White label intelligence at institutional scale",
    features: [
      "Everything in Pro, plus:",
      "Bank API white label deployment",
      "Custom vertical intelligence modules",
      "ISO 27001 + SOC 2 compliance",
      "On site implementation support",
      "Custom integrations (HRMS, ERP)",
      "Unlimited users + API access",
      "Dedicated engineering support",
      "Custom SLA agreements",
    ],
    cta: "Talk to Sales",
    isEnterprise: true,
  },
];

export default function PricingSection() {
  const ref = useScrollReveal();

  return (
    <section className="bg-fyn-ink py-24" ref={ref}>
      <div className="fyn-container">
        <span className="fyn-caption text-fyn-gold block mb-4 text-center reveal-up text-base">Pricing</span>
        <h2 className="text-3xl lg:text-[44px] leading-[1.2] text-white text-center mb-12 reveal-up">
          A real CFO costs ₹30–50 lakh per year. CFO Fynny costs a fraction.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 stagger-children items-start">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`rounded-xl p-6 relative transition-all duration-300 ${
                p.featured
                  ? "bg-white border-2 border-fyn-red lg:scale-[1.04] shadow-2xl"
                  : "bg-white/5 border border-white/10"
              }`}
            >
              {p.topBadge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-fyn-red text-white text-[10px] px-3 py-1 rounded-full fyn-caption tracking-wider">
                  {p.topBadge}
                </span>
              )}

              <h3 className={`font-display text-xl mb-2 ${p.featured ? "text-fyn-ink" : "text-white"}`}>{p.name}</h3>

              <p className={`fyn-metric text-3xl font-bold mb-1 ${p.featured ? "text-fyn-red" : "text-white"}`}>
                {p.priceMain}
              </p>

              {p.priceSub && (
                <p className={`text-xs mb-2 ${p.featured ? "text-fyn-ink/60" : "text-white/50"}`}>{p.priceSub}</p>
              )}

              {p.waitlistNote && (
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`text-sm font-medium ${p.featured ? "text-fyn-ink/80" : "text-white/80"}`}>
                    {p.waitlistNote}
                  </span>
                  {p.waitlistBadge && (
                    <span className="bg-fyn-red text-white text-[10px] px-2 py-0.5 rounded-full fyn-caption">
                      {p.waitlistBadge}
                    </span>
                  )}
                </div>
              )}

              {!p.waitlistNote && p.waitlistBadge && (
                <span className="inline-block bg-fyn-red text-white text-[10px] px-2 py-0.5 rounded-full fyn-caption mb-3">
                  {p.waitlistBadge}
                </span>
              )}

              <p className={`text-sm mt-3 mb-1 ${p.featured ? "text-fyn-ink/80" : "text-white/85"}`}>{p.target}</p>
              <p className={`text-xs mb-5 ${p.featured ? "text-fyn-ink/70" : "text-white/75"}`}>{p.sub}</p>

              <ul className="space-y-2 mb-6">
                {p.features.map((f, i) => (
                  <li key={i} className={`flex gap-2 text-sm ${p.featured ? "text-fyn-ink/80" : "text-white/85"}`}>
                    {!f.endsWith(":") && <span className="text-fyn-success shrink-0">✓</span>}
                    <span className={f.endsWith(":") ? "font-semibold" : ""}>{f}</span>
                  </li>
                ))}
              </ul>

              {p.isEnterprise ? (
                <button className="w-full py-3 rounded-lg font-semibold text-sm border-[1.5px] border-white/60 text-white hover:bg-white hover:text-fyn-ink transition-all duration-200">
                  {p.cta}
                </button>
              ) : (
                <Link
                  to="/waitlist"
                  className="block text-center py-3 rounded-lg font-semibold text-sm bg-fyn-red text-white hover-btn-primary transition-all duration-200"
                >
                  {p.cta}
                </Link>
              )}
            </div>
          ))}
        </div>

        <p className="text-center text-white/50 text-sm mt-8">
          All plans include a 30-day free trial. No credit card required. Cancel anytime.
        </p>
      </div>
    </section>
  );
}
