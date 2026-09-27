export default function TickerStrip() {
  const items = [
    "Know your runway in 10 seconds, not 10 days",
    "Never miss a GST deadline again with automated alerts",
    "Track every UPI payment, no more lost revenue",
    "Reduce manual reconciliation from 15 hours to 1 hour per month",
    "Get investor-ready dashboards instantly, no CFO needed",
    "₹40,000 average savings per month on missed tax deductions",
    "4.2 months average runway extension after cost optimization",
    "Real-time cash flow visibility across all bank accounts",
    "Auto-detect hidden vendor charges saving ₹2L+ annually",
    "Proactive burn rate alerts prevent sudden cash crises",
    "GST ITC reconciliation saves ₹1.8L per business yearly",
    "30% faster month-end close with automated expense categorization",
    "Zero GST penalties with deadline tracking and reminders",
    "Payroll intelligence shows true cost-per-employee impact",
    "Predict cash shortfalls 60 days in advance",
  ];

  const SEP = "  •  ";
  const tickerContent = items.join(SEP);

  return (
    <section className="bg-fyn-red py-3 overflow-hidden">
      <div className="ticker-scroll whitespace-nowrap">
        <span
          className="text-white text-sm"
          style={{ fontFamily: "'Roboto', sans-serif", fontWeight: 500, letterSpacing: "0.01em" }}
        >
          {tickerContent}
          {SEP}
          {tickerContent}
          {SEP}
          {tickerContent}
          {SEP}
        </span>
      </div>
    </section>
  );
}
