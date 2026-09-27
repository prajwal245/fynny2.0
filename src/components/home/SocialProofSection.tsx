import { useScrollReveal } from "@/hooks/useScrollReveal";

const testimonials = [
  {
    quote: "CFO Fynny told me I'd run out of cash in 34 days, 5 weeks before my CA would have even noticed. I collected from 3 clients that week and avoided what would have been a complete shutdown.",
    initials: "RM", name: "Rajesh Mehta", company: "Mehta Textile Traders, Surat", size: "₹18 Crore turnover business",
    impact: "Crisis averted · ₹24L collected · Runway +22 days", impactBg: "bg-fyn-success-bg", impactText: "text-fyn-success",
  },
  {
    quote: "Our GST notice risk was 74 when we joined. Three months of ITC reconciliation brought it to 18. We recovered ₹4.2L in ITC we didn't know we were missing.",
    initials: "PS", name: "Priya Sharma", company: "Sharma & Sons Distributors, Pune", size: "₹12 Crore business",
    impact: "₹4.2L ITC recovered · Notice risk: 74→18", impactBg: "bg-fyn-success-bg", impactText: "text-fyn-success",
  },
  {
    quote: "I used to spend 3 hours every Monday trying to understand my finances. CFO Fynny's morning brief is 3 sentences. In Hindi. I know everything in 30 seconds.",
    initials: "KS", name: "Karthik Sundaram", company: "KS Engineering Components, Chennai", size: "₹8 Crore manufacturing business",
    impact: "12 hrs/month saved · CA relationship improved", impactBg: "bg-fyn-info-bg", impactText: "text-fyn-info",
  },
  {
    quote: "The MSME rights alert was something I had no idea existed. FynHelp told me a large corporate buyer was legally obligated to pay me within 45 days under Section 43B(h). I sent the notice. They paid within a week. ₹6.8L collected.",
    initials: "AF", name: "Anwar Farooqui", company: "Farooqui Garments Export, Tiruppur", size: "",
    impact: "₹6.8L collected · Section 43B(h) rights exercised", impactBg: "bg-fyn-warning-bg", impactText: "text-fyn-warning",
  },
  {
    quote: "The hiring simulator saved us from a very expensive mistake. We were about to hire 5 people in October. FynHelp showed us our runway would hit 28 days by December. We hired 2 instead. Best decision we made.",
    initials: "VK", name: "Vandana Kapoor", company: "Kapoor Pharma Distribution, Ahmedabad", size: "",
    impact: "₹15L burn avoided · Runway maintained >90 days", impactBg: "bg-fyn-success-bg", impactText: "text-fyn-success",
  },
  {
    quote: "As a CA managing 60+ clients, the partner dashboard transformed my practice. I see all 60 businesses' financial health in one screen. Monthly reports generate automatically. My clients think I'm brilliant.",
    initials: "SJ", name: "CA Sandeep Jain", company: "Jain & Associates, Bengaluru", size: "CA Partner · 60 clients on FynHelp",
    impact: "60 clients managed · 3 hrs/client/month saved", impactBg: "bg-fyn-info-bg", impactText: "text-fyn-info",
  },
];

const counters = [
  { value: "10,000+", label: "businesses" },
  { value: "₹2,400 Cr", label: "monitored" },
  { value: "₹180 Cr", label: "ITC recovered" },
  { value: "98.7%", label: "accuracy" },
  { value: "4.8★", label: "avg rating" },
];

export default function SocialProofSection() {
  const ref = useScrollReveal();

  return (
    <section className="bg-fyn-beige py-20" ref={ref}>
      <div className="fyn-container">
        <span className="fyn-caption text-fyn-gold block mb-4 reveal-up text-base">What Businesses Say</span>
        <h2 className="text-3xl lg:text-[44px] leading-[1.2] text-fyn-ink mb-12 reveal-up">
          The numbers speak. So do our customers.
        </h2>

        {/* Carousel */}
        <div className="overflow-hidden mb-16 reveal-up" style={{ transitionDelay: "200ms" }}>
          <div className="flex gap-6 animate-none hover:pause" style={{
            animation: "ticker-scroll 40s linear infinite",
            width: "max-content",
          }}>
            {[...testimonials, ...testimonials].map((t, i) => (
              <div key={i} className="bg-fyn-beige-card border border-fyn-ink/8 rounded-lg p-7 min-w-[340px] max-w-[380px] hover-card flex-shrink-0">
                <p className="font-display text-base text-fyn-ink leading-relaxed mb-6 italic">
                  "{t.quote}"
                </p>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-fyn-ink flex items-center justify-center">
                    <span className="text-white text-sm font-semibold">{t.initials}</span>
                  </div>
                  <div>
                    <p className="text-fyn-ink font-semibold text-sm">{t.name}</p>
                    <p className="text-fyn-ink/50 text-xs">{t.company}</p>
                    {t.size && <p className="fyn-caption text-fyn-gold text-[10px]">{t.size}</p>}
                  </div>
                </div>
                <div className={`${t.impactBg} ${t.impactText} text-xs font-medium px-3 py-1.5 rounded inline-block`}>
                  {t.impact}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Counters */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 text-center stagger-children">
          {counters.map((c) => (
            <div key={c.label}>
              <p className="fyn-metric text-3xl md:text-4xl font-bold text-fyn-ink">{c.value}</p>
              <p className="text-fyn-ink/70 text-sm mt-1">{c.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
