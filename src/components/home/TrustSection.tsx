import { useScrollReveal } from "@/hooks/useScrollReveal";
import { COMPANY } from "@/content/legal/company";

const blocks = [
  {
    icon: "🔒",
    title: "Encrypted in transit and at rest",
    desc: "Every connection uses HTTPS. The database and file storage are encrypted at rest by our hosting provider, and secrets such as Gmail tokens and locked-file passwords are encrypted again by FynHelp before they are stored.",
  },
  {
    icon: "🌐",
    title: "Where your data lives, stated plainly",
    desc: `Database and files are hosted on Supabase (${COMPANY.region}). Moving data to an Indian region is planned, and this page will change the day it is done. Our privacy policy follows the IT Act section 43A, the SPDI Rules and the DPDP Act, and lists every provider that handles your data.`,
  },
  {
    icon: "🛡️",
    title: "AI reads, code proves, people approve",
    desc: "To read a document, its relevant text is sent to our AI providers for that task only. Figures such as totals, matches and GST checks are computed by fixed rules, and anything the engine cannot prove becomes an exception for a person to decide. We do not train models on your clients' data.",
  },
  {
    icon: "✓",
    title: "Yours to take, yours to delete",
    desc: "Write to us from the firm owner's email and we export or delete the firm's documents and data. Self-serve export and deletion are being built. We never sell your data.",
  },
];

export default function TrustSection() {
  const ref = useScrollReveal();

  return (
    <section className="bg-fyn-ink py-20" ref={ref}>
      <div className="fyn-container">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          <div>
            <span className="fyn-caption text-fyn-gold block mb-4 reveal-left">Data Security</span>
            <h2 className="text-2xl lg:text-4xl leading-[1.3] text-white mb-6 reveal-left font-display" style={{ transitionDelay: "100ms" }}>
              Your financial data is more sensitive than your health data. We treat it that way.
            </h2>
            <p className="text-white/55 text-lg leading-relaxed reveal-left" style={{ transitionDelay: "200ms" }}>
              Every number you share with FynHelp is encrypted, isolated, auditable, and belongs entirely to you.
            </p>
          </div>

          <div className="space-y-4 stagger-children">
            {blocks.map((b) => (
              <div key={b.title} className="bg-white/[0.03] border border-white/8 rounded-lg p-6 hover-card">
                <div className="flex gap-4">
                  <span className="text-2xl">{b.icon}</span>
                  <div>
                    <h3 className="text-white font-semibold text-base mb-2">{b.title}</h3>
                    <p className="text-white/50 text-sm leading-relaxed">{b.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
