import { Link } from "@/lib/router-compat";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const capabilities = [
  { title: "Proactive, not reactive", desc: "CFO Fynny identifies your top 3 financial risks every morning before you ask. Most problems are solved before they become crises." },
  { title: "Speaks your language, literally", desc: "Hindi, Gujarati, Tamil, Marathi, English. CFO Fynny auto-detects your preference. Switch mid-conversation. The intelligence doesn't change, only the language does." },
  { title: "Grounded in live data, always", desc: "Every number CFO Fynny speaks is fetched live from your bank, your Tally, your GST portal. She is architecturally prevented from estimating or guessing any financial figure." },
  { title: "Action-first, not insight-last", desc: "Every CFO Fynny insight includes a recommended action and a one-tap way to execute it, draft the WhatsApp, open the simulator, generate the report." },
  { title: "Named after a real person", desc: "Nidhi Siddhapura, Co-Founder and CMO of FynHelp, designed every insight this AI delivers. Fynny carries her judgment in every recommendation she makes." },
];

export default function FynnySection() {
  const ref = useScrollReveal();

  return (
    <section className="bg-fyn-ink py-24" ref={ref}>
      <div className="fyn-container">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          {/* Left, Fynny Profile */}
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-8 reveal-left">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-fyn-red flex items-center justify-center">
                <span className="text-white font-display text-2xl font-bold">F</span>
              </div>
              <div>
                <p className="text-white font-serif text-3xl">CFO Fynny</p>
                <p className="fyn-caption font-semibold text-sm text-primary-foreground">AI CFO · FynHelp</p>
              </div>
              <div className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full bg-fyn-success/20">
                <span className="w-2 h-2 rounded-full bg-fyn-success pulse-dot" />
                <span className="text-white/70 text-[11px]">Always on</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="bg-white/5 rounded-lg p-4">
                <p className="text-white/50 text-[10px] mb-1">CFO Fynny</p>
                <p className="text-white/80 text-sm leading-relaxed">
                  Good morning. Your cash runway is 52 days at ₹23,846 daily burn.
                  That's 8 days less than last week, burn accelerated due to Diwali
                  advance payments to suppliers.
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <p className="text-white/50 text-[10px] mb-1">CFO Fynny</p>
                <p className="text-white/80 text-sm leading-relaxed">
                  ABC Electronics owes ₹8.4L and is 62 days overdue. Collecting this
                  today adds 15 days to your runway. Want me to draft a reminder?
                </p>
              </div>
              <div className="bg-fyn-red-tint rounded-lg p-4 ml-8">
                <p className="text-white/50 text-[10px] mb-1">You</p>
                <p className="text-white/80 text-sm">What should I do today?</p>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <p className="text-white/50 text-[10px] mb-1">CFO Fynny</p>
                <p className="text-white/80 text-sm leading-relaxed">
                  Three actions with highest impact:<br/>
                  1. Chase ABC Electronics (₹8.4L, 62 days), adds 15 days runway.<br/>
                  2. File GSTR-3B before Apr 20, ₹3.2L ITC at risk if delayed.<br/>
                  3. Hold the 3 new hires until May, saves ₹5.25L burn next quarter.
                </p>
                <div className="flex gap-2 mt-3">
                  <span className="text-[11px] bg-fyn-red/20 text-fyn-red px-3 py-1 rounded cursor-pointer hover:bg-fyn-red/30 transition-colors">Draft chase message</span>
                  <span className="text-[11px] bg-white/10 text-white/60 px-3 py-1 rounded cursor-pointer hover:bg-white/15 transition-colors">Open GST</span>
                  <span className="text-[11px] bg-white/10 text-white/60 px-3 py-1 rounded cursor-pointer hover:bg-white/15 transition-colors">Simulate hiring</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right, Capabilities */}
          <div>
            <span className="fyn-caption text-fyn-gold block mb-4 reveal-right">Your AI CFO</span>
            <h2 className="text-3xl lg:text-[44px] leading-[1.2] text-white mb-6 reveal-right font-serif" style={{ transitionDelay: "100ms" }}>
              The intelligence of a world-class CFO. In your language. On your phone. Every single morning.
            </h2>
            <p className="text-white/60 text-lg leading-relaxed mb-10 reveal-right" style={{ transitionDelay: "200ms" }}>
              CFO Fynny is not a chatbot. She is a financial reasoning engine trained on Indian SME data -
              GST filing patterns, seasonal cash cycles, working capital norms by industry, RBI regulations,
              CBIC circulars, and the payment behavior of Indian buyers and suppliers.
            </p>

            <div className="space-y-6 stagger-children">
              {capabilities.map((c) => (
                <div key={c.title} className="flex gap-4">
                  <div className="w-2 h-2 rounded-full bg-fyn-red mt-2 shrink-0" />
                  <div>
                    <p className="text-white font-medium text-base mb-1">{c.title}</p>
                    <p className="text-white/50 text-sm leading-relaxed">{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <Link to="/waitlist" className="inline-block bg-fyn-red text-white font-semibold px-8 py-3.5 rounded-lg mt-10 hover-btn-primary">
              Talk to CFO Fynny, free for 30 days →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
