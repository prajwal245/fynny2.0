import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site/SiteShell";
import { noindexHead } from "@/lib/seo";

const FILES = [
  {
    file: "hdfc_statement_sep2026.csv",
    what: "Bank statement, 8 lines (one in USD)",
    expect: "7 transactions read, 1 sent to Review",
  },
  {
    file: "tally_daybook_sep2026.xml",
    what: "Tally day book, 6 vouchers",
    expect: "6 transactions read; Recon matches 5, leaves 2 exceptions",
  },
  {
    file: "purchase_register_sep2026.csv",
    what: "One purchase voucher from the books (no GST columns)",
    expect:
      "Read as 1 book entry. A real GST purchase register, with GSTIN and tax columns, is kept as a register with its totals instead",
  },
  { file: "README.txt", what: "Expected results in full", expect: "" },
];

/** A harder month-end for one client: every detection rule, Indian-law check and exception path. */
const RETEST = [
  {
    file: "R01_hdfc_bank_statement_jul2026.csv",
    what: "Bank statement, 17 lines, July 2026",
    expect: "17 bank lines",
  },
  {
    file: "R02_bank_ledger_tally_jul2026.csv",
    what: "Tally bank ledger, named 'bank' on purpose",
    expect: "Filed as Books; Debit = money in; Recon runs",
  },
  {
    file: "R05_gst_purchase_register_jul2026.csv",
    what: "GST purchase register",
    expect: "Kept as a register; GSTIN on OM-552 flagged",
  },
  {
    file: "R07_tds_register_jul2026.csv",
    what: "TDS register with a TDS Rate % column",
    expect: "TDS ₹18,500 (194I ₹8,500, 194C ₹400, 194J ₹9,600); rates pass",
  },
  {
    file: "R08_payroll_jul2026.csv",
    what: "Payroll sheet",
    expect: "ESI above the ₹21,000 limit flagged for Rahul Menon",
  },
  {
    file: "R09_razorpay_settlement_jul2026.csv",
    what: "Razorpay settlement report",
    expect: "Gross ₹50,000, fees ₹1,000, GST ₹180, net ₹48,820",
  },
  {
    file: "R10_hdfc_bank_statement_jul2026_copy.csv",
    what: "Same statement again",
    expect: "Nothing added twice",
  },
  {
    file: "R12_hdfc_bank_statement_aug2026.csv",
    what: "August bank statement",
    expect: "Bank charge shows 'Learned' from July",
  },
  {
    file: "R13_tally_ledger_aug2026.csv",
    what: "August Tally ledger",
    expect: "Recon runs for August",
  },
];

/** Tally XML in every shape a firm receives: masters, voucher imports, Day Book, bank and cash books, party ledgers. Three made-up companies. */
const TALLY = [
  {
    file: "01_masters_godavari_spices_foods.xml",
    what: "Ledger masters with opening balances (Godavari Spices & Foods)",
    expect:
      "Read as masters: 43 ledgers, no transactions; openings balance; bank and cash ledgers found",
  },
  {
    file: "01_masters_narmada_textile_mills.xml",
    what: "Ledger masters (Narmada Textile Mills LLP)",
    expect: "44 ledgers; openings balance",
  },
  {
    file: "01_masters_brahmaputra_it_services.xml",
    what: "Ledger masters (Brahmaputra IT Services)",
    expect: "39 ledgers; openings balance",
  },
  {
    file: "02_vouchers_godavari_oct2026_import.xml",
    what: "All books for October 2026, 104 vouchers (Godavari)",
    expect:
      "43 bank lines kept; 54 sales, purchase or journal vouchers and 7 cash-only vouchers left out and said so",
  },
  {
    file: "02_vouchers_narmada_nov2026_import.xml",
    what: "All books for November 2026, 123 vouchers (Narmada)",
    expect: "42 bank lines; reads the same as the Day Book of the month",
  },
  {
    file: "03_day_book_nov2026_export.xml",
    what: "Day Book export, November 2026 (Narmada)",
    expect: "42 bank lines; sales, purchases and cash-only vouchers left out",
  },
  {
    file: "04_bank_book_hdfc_godavari_oct2026.xml",
    what: "Bank book as XML: HDFC, October 2026 (Godavari)",
    expect:
      "43 lines, debits ₹25,86,840.15, credits ₹14,64,889.09. Reconciles completely with the October voucher file",
  },
  {
    file: "04_bank_book_sbi_brahmaputra_sep2026.xml",
    what: "Bank book as XML: SBI, September 2026 (Brahmaputra)",
    expect: "29 lines, debits ₹37,95,692.90, credits ₹21,12,526.31",
  },
  {
    file: "05_cash_book_brahmaputra_sep2026.xml",
    what: "Cash book as XML, September 2026 (Brahmaputra)",
    expect: "8 lines; the two withdrawals are Contras",
  },
  {
    file: "06_customer_ledger_northeast_power_corp.xml",
    what: "Customer ledger: Northeast Power Corp",
    expect:
      "Summarised (invoiced ₹15,41,226.47, received ₹14,85,927.66), not used as bank lines",
  },
  {
    file: "07_supplier_ledger_surat_power_looms.xml",
    what: "Supplier ledger: Surat Power Looms Assn",
    expect: "Summarised (billed, paid, outstanding), not used as bank lines",
  },
  {
    file: "README.txt",
    what: "How to use these files and what each one proves",
    expect: "",
  },
];

/** Made-up test files for pilots and user tests (Sundara Textiles, September 2026). */
function SamplesPage() {
  return (
    <>
      <main
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "48px 18px 80px",
          fontFamily: "'Instrument Sans', system-ui, sans-serif",
          color: "#141414",
        }}
      >
        <p
          style={{
            fontSize: 12,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "#7c7973",
            fontWeight: 600,
            margin: 0,
          }}
        >
          FynHelp · Sample pack
        </p>
        <h1
          style={{
            fontSize: 32,
            letterSpacing: "-0.02em",
            margin: "10px 0 8px",
          }}
        >
          Test files
        </h1>
        <p style={{ color: "#4a4844", margin: "0 0 24px", lineHeight: 1.6 }}>
          Made-up files for a client called Sundara Textiles Pvt Ltd, September
          2026. Safe to share. Set the period to September 2026 and upload them
          in this order.
        </p>
        <ol
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: 10,
          }}
        >
          {FILES.map((f, i) => (
            <li
              key={f.file}
              style={{
                border: "1px solid #e6e3dc",
                borderRadius: 14,
                padding: "14px 16px",
                background: "#fff",
                display: "grid",
                gap: 4,
              }}
            >
              <a
                href={`/samples/${f.file}`}
                download
                style={{ fontWeight: 600, color: "#141414" }}
              >
                {i + 1}. {f.file}
              </a>
              <span style={{ fontSize: 14, color: "#4a4844" }}>{f.what}</span>
              {f.expect && (
                <span style={{ fontSize: 13, color: "#1F5A46" }}>
                  Expect: {f.expect}
                </span>
              )}
            </li>
          ))}
        </ol>

        <h2
          style={{
            fontSize: 22,
            letterSpacing: "-0.02em",
            margin: "40px 0 8px",
          }}
        >
          Tally XML files
        </h2>
        <p style={{ color: "#4a4844", margin: "0 0 16px", lineHeight: 1.6 }}>
          The shapes of XML a firm gets from Tally Prime, for three made-up
          companies. Upload a file to a client, as Books (or as Bank for a bank
          book you want to reconcile), and FynHelp says what it is and what it
          did with it.
        </p>
        <ol
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: 10,
          }}
        >
          {TALLY.map((f) => (
            <li
              key={f.file}
              style={{
                border: "1px solid #e6e3dc",
                borderRadius: 14,
                padding: "14px 16px",
                background: "#fff",
                display: "grid",
                gap: 4,
              }}
            >
              <a
                href={`/samples/tally/${f.file}`}
                download
                style={{
                  fontWeight: 600,
                  color: "#141414",
                  fontFamily: "var(--font-geist-mono)",
                  fontSize: 14,
                  overflowWrap: "anywhere",
                }}
              >
                {f.file}
              </a>
              <span style={{ fontSize: 14, color: "#4a4844" }}>{f.what}</span>
              {f.expect && (
                <span style={{ fontSize: 13, color: "#1F5A46" }}>
                  Expect: {f.expect}
                </span>
              )}
            </li>
          ))}
        </ol>

        <h2
          style={{
            fontSize: 22,
            letterSpacing: "-0.02em",
            margin: "40px 0 8px",
          }}
        >
          July 2026 walkthrough pack
        </h2>
        <p style={{ color: "#4a4844", margin: "0 0 16px", lineHeight: 1.6 }}>
          Client "Sample Client Pvt Ltd" (add it with any email), period July
          2026. A step-by-step guide with screenshots is on{" "}
          <a href="/blog/month-end-close-walkthrough-sample-files">the blog</a>.
          Upload R01 and R02, then the registers, then R10. In the Exception
          Queue: match Office Mart with a difference (₹300), ignore SB INT, mark
          BANK CHARGES reconciled elsewhere, and leave Meera Textiles ₹42,000
          open. The Monthly MIS should show revenue ₹4,13,000, expenses
          ₹4,67,480.50, taxes ₹1,47,500 and advances ₹1,50,000, with 1 line left
          out. Then switch to August 2026 and upload R12 and R13.
        </p>
        <ol
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: 10,
          }}
        >
          {RETEST.map((f) => (
            <li
              key={f.file}
              style={{
                border: "1px solid #e6e3dc",
                borderRadius: 14,
                padding: "14px 16px",
                background: "#fff",
                display: "grid",
                gap: 4,
              }}
            >
              <a
                href={`/samples/retest/${f.file}`}
                download
                style={{
                  fontWeight: 600,
                  color: "#141414",
                  fontFamily: "var(--font-geist-mono)",
                  fontSize: 14,
                  overflowWrap: "anywhere",
                }}
              >
                {f.file}
              </a>
              <span style={{ fontSize: 14, color: "#4a4844" }}>{f.what}</span>
              <span style={{ fontSize: 13, color: "#1F5A46" }}>
                Expect: {f.expect}
              </span>
            </li>
          ))}
        </ol>
      </main>
      <SiteFooter />
    </>
  );
}

export const Route = createFileRoute("/samples")({
  head: () => noindexHead("Sample files"),
  component: SamplesPage,
});
