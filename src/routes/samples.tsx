import { createFileRoute } from "@tanstack/react-router";
import { noindexHead } from "@/lib/seo";

const FILES = [
  { file: "hdfc_statement_sep2026.csv", what: "Bank statement, 8 lines (one in USD)", expect: "7 transactions read, 1 sent to Review" },
  { file: "tally_daybook_sep2026.xml", what: "Tally day book, 6 vouchers", expect: "6 transactions read; Recon matches 5, leaves 2 exceptions" },
  { file: "purchase_register_sep2026.csv", what: "One purchase entry", expect: "Read as a book entry" },
  { file: "README.txt", what: "Expected results in full", expect: "" },
];

/** Made-up test files for pilots and user tests (Sundara Textiles, September 2026). */
function SamplesPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 18px 80px", fontFamily: "'Instrument Sans', system-ui, sans-serif", color: "#141414" }}>
      <p style={{ fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "#7c7973", fontWeight: 600, margin: 0 }}>FynHelp · Sample pack</p>
      <h1 style={{ fontSize: 32, letterSpacing: "-0.02em", margin: "10px 0 8px" }}>Test files</h1>
      <p style={{ color: "#4a4844", margin: "0 0 24px", lineHeight: 1.6 }}>
        Made-up files for a client called Sundara Textiles Pvt Ltd, September 2026. Safe to share. Set the period to September 2026 and upload them in this order.
      </p>
      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
        {FILES.map((f, i) => (
          <li key={f.file} style={{ border: "1px solid #e6e3dc", borderRadius: 14, padding: "14px 16px", background: "#fff", display: "grid", gap: 4 }}>
            <a href={`/samples/${f.file}`} download style={{ fontWeight: 600, color: "#141414" }}>
              {i + 1}. {f.file}
            </a>
            <span style={{ fontSize: 14, color: "#4a4844" }}>{f.what}</span>
            {f.expect && <span style={{ fontSize: 13, color: "#1F5A46" }}>Expect: {f.expect}</span>}
          </li>
        ))}
      </ol>
    </main>
  );
}

export const Route = createFileRoute("/samples")({
  head: () => noindexHead("Sample files"),
  component: SamplesPage,
});
