import { useScrollReveal } from "@/hooks/useScrollReveal";

const blocks = [
  {
    icon: "🔒",
    title: "AES-256 encryption at rest, TLS 1.3 in transit",
    desc: "Every transaction, every invoice, every GST figure stored in FynHelp is encrypted using the same standard used by India's largest banks. Your GSTIN, PAN, and bank account details are additionally encrypted at the application layer. Even our own engineers cannot read them in plaintext.",
  },
  {
    icon: "🇮🇳",
    title: "Your data never leaves India",
    desc: "All FynHelp data is stored on AWS ap-south-1 (Mumbai) servers. We comply with India's Digital Personal Data Protection Act (DPDP) 2023 and will be among the first fintech platforms to achieve DPDP compliance certification.",
  },
  {
    icon: "🛡️",
    title: "CFO Fynny never sees your personal information",
    desc: "When CFO Fynny reasons about your business, she works with anonymised metrics. Customer names appear as 'Customer_01', vendors as 'Vendor_03'. Real names, GSTINs, and account numbers are masked before any AI call. This is an architectural constraint, not a policy.",
  },
  {
    icon: "✓",
    title: "You own your data. Completely.",
    desc: "Export everything in Excel or JSON format anytime. If you cancel, your data is available for 90 days then permanently deleted. Your Account Aggregator consent can be revoked from your bank app in 30 seconds. We never sell or share your data.",
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
