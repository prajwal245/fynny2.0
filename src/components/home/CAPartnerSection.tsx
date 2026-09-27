import { Link } from "@/lib/router-compat";

const C = {
  bg: "#ECE6D2",
  card: "#FAF7EC",
  ink: "#111111",
  body: "#3A3A3A",
  muted: "#6B6B6B",
  red: "#B8333A",
  redDark: "#9E2A30",
  border: "rgba(0,0,0,0.08)",
};

const cards = [
  {
    title: "Portfolio dashboard",
    body: "Every client visible at a glance. Health scores, ITC risk flags, and upcoming filing deadlines surfaced automatically.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
        <path d="M17 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" />
        <path d="M16 21v-2a4 4 0 0 0-3-3.87" />
      </svg>
    ),
  },
  {
    title: "Bulk GST filing",
    body: "File GSTR-1 and GSTR-3B across all clients in a single queue. Generate pre-filled JSON payloads for portal upload.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6M9 17h6M9 9h2" />
      </svg>
    ),
  },
  {
    title: "ITC reconciliation",
    body: "Automated GSTR-2B matching. Mismatches, missing invoices, and at-risk ITC amounts surfaced per client.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 11a8 8 0 1 1-2.34-5.66L20 8" />
        <path d="M20 3v5h-5" />
      </svg>
    ),
  },
];

const stats = [
  { n: "20 clients free", l: "included in every plan" },
  { n: "₹99 per client", l: "beyond 20 seats, per month" },
  { n: "2 days", l: "typical verification turnaround" },
];

export default function CAPartnerSection() {
  return (
    <section
      style={{
        background: "transparent",
        padding: "100px 24px",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Eyebrow */}
        <div style={{ textAlign: "center" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              borderRadius: 100,
              background: C.card,
              border: `1px solid ${C.border}`,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: C.ink,
              textTransform: "uppercase",
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.red }} />
            For chartered accountants
          </span>
        </div>

        {/* Heading */}
        <h2
          style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 800,
            fontSize: "clamp(30px, 5vw, 42px)",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: C.ink,
            textAlign: "center",
            margin: "20px 0 0",
          }}
        >
          Run your entire practice from one dashboard
        </h2>
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 400,
            fontSize: 18,
            lineHeight: 1.55,
            color: C.body,
            textAlign: "center",
            maxWidth: 780,
            margin: "16px auto 0",
          }}
        >
          Manage every client portfolio, file GST returns in bulk, and track compliance
          deadlines across your entire book. Built for working CAs managing 10 to 150 clients.
        </p>

        {/* Feature cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
            marginTop: 48,
          }}
        >
          {cards.map((c) => (
            <div
              key={c.title}
              style={{
                background: C.card,
                borderRadius: 20,
                border: `1px solid ${C.border}`,
                padding: 28,
              }}
            >
              <div style={{ marginBottom: 16 }}>{c.icon}</div>
              <h3
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700,
                  fontSize: 20,
                  color: C.ink,
                  margin: "0 0 10px",
                  letterSpacing: "-0.01em",
                }}
              >
                {c.title}
              </h3>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 400,
                  fontSize: 14.5,
                  lineHeight: 1.6,
                  color: C.body,
                  margin: 0,
                }}
              >
                {c.body}
              </p>
            </div>
          ))}
        </div>

        {/* Stat row */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            gap: 32,
            borderTop: `1px solid ${C.border}`,
            paddingTop: 32,
            marginTop: 40,
          }}
        >
          {stats.map((s, i) => (
            <div
              key={s.n}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 32,
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 700,
                    fontSize: 24,
                    color: C.ink,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {s.n}
                </div>
                <div
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 400,
                    fontSize: 14,
                    color: C.muted,
                    marginTop: 4,
                  }}
                >
                  {s.l}
                </div>
              </div>
              {i < stats.length - 1 && (
                <div
                  aria-hidden
                  style={{
                    width: 1,
                    height: 40,
                    background: C.border,
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div
          style={{
            display: "flex",
            gap: 14,
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: 36,
          }}
        >
          <Link
            to="/ca/register"
            style={{
              background: C.red,
              color: "#fff",
              borderRadius: 99,
              padding: "14px 32px",
              fontFamily: "'Inter', sans-serif",
              fontWeight: 600,
              fontSize: 15,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              transition: "background .15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = C.redDark)}
            onMouseLeave={(e) => (e.currentTarget.style.background = C.red)}
          >
            Register your CA firm
          </Link>
          <Link
            to="/pricing"
            style={{
              background: C.card,
              color: C.ink,
              border: "1px solid rgba(0,0,0,0.15)",
              borderRadius: 99,
              padding: "14px 32px",
              fontFamily: "'Inter', sans-serif",
              fontWeight: 600,
              fontSize: 15,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            View CA pricing
          </Link>
        </div>
      </div>
    </section>
  );
}
