/**
 * A bank statement PDF, the way it arrives: stored, then read by the server (`processExtraction`), checked, owner-checked and
 * filed as transactions. Uses a made-up 60-page statement (the old reader stopped at page 40) and an in-memory database, and,
 * when the tester's real statements are on this machine (REAL_STATEMENTS=dir), those too.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { memoryDb } from "../../helpers/memoryDb";

vi.mock("@/lib/practice/orchestrator.server", () => ({
  startRun: async () => "run1",
  finishRun: async () => undefined,
  afterExtraction: async () => ({ pipeline: [] }),
  loadMemories: async () => [],
  markMemoriesApplied: async () => undefined,
  teachFromReview: async () => undefined,
}));
vi.mock("@/lib/practice/llm.server", () => ({
  practiceLlm: () => null,
  withinAiCap: async () => false,
}));
vi.mock("@/lib/practice/ocr.server", () => ({ practiceOcr: () => null }));

const FIRM = "f1";
const BUSINESS = "b1";

async function upload(
  file: string,
  bytes: Uint8Array,
  clientName: string,
  extra: { id: string; name: string }[] = [],
  times = 1,
) {
  const path = `${FIRM}/${BUSINESS}/${file}`;
  const { db, tables } = memoryDb(
    {
      ca_document_extractions: [
        {
          id: "d1",
          ca_firm_id: FIRM,
          business_id: BUSINESS,
          original_filename: file,
          storage_path: path,
          side: "bank",
          extract_status: null,
          extract_attempts: 0,
          extracted: { source: "Manual" },
          uploaded_by: "u1",
        },
      ],
      ca_clients: [
        {
          id: "row1",
          business_id: BUSINESS,
          ca_firm_id: FIRM,
          client_name: clientName,
        },
        ...extra.map((c) => ({
          id: `row-${c.id}`,
          business_id: c.id,
          ca_firm_id: FIRM,
          client_name: c.name,
        })),
      ],
    },
    { [path]: bytes },
  );
  const { processExtraction } = await import("@/lib/practice/documents.server");
  let result = await processExtraction(db, "d1", {
    trigger: "user",
    userId: "u1",
  });
  // A second read of the same file (a retry, or "read again" in the app) must not file the lines twice.
  for (let k = 1; k < times; k++)
    result = await processExtraction(db, "d1", {
      trigger: "user",
      userId: "u1",
    });
  return {
    result,
    doc: tables["ca_document_extractions"]![0]!,
    txns: tables["ca_txns"] ?? [],
    review: tables["ca_review_items"] ?? [],
  };
}

describe("a bank statement PDF through the whole upload", () => {
  const bytes = new Uint8Array(
    readFileSync("tests/fixtures/pdf/synthetic-bank-statement.pdf"),
  );
  const truth = JSON.parse(
    readFileSync(
      "tests/fixtures/pdf/synthetic-bank-statement.truth.json",
      "utf8",
    ),
  ) as { date: string; out: boolean; amt: number; bal: number }[];

  it("reads all 60 pages, files every line with its direction, and the balance check passes", async () => {
    const { result, doc, txns, review } = await upload(
      "statement.pdf",
      bytes,
      "Synthetic Traders Private Limited",
      [{ id: "b2", name: "Other Client Ltd" }],
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe("parsed");
    expect(doc["row_count"]).toBe(1200);
    expect(txns).toHaveLength(1200);
    expect(review).toHaveLength(0);
    // Every line has the amount, direction and balance the bank printed.
    const inn = (t: { out: boolean }) => (t.out ? "out" : "in");
    const sorted = [...txns].sort(
      (a, b) => Number(a["row_index"]) - Number(b["row_index"]),
    );
    truth.forEach((t, i) => {
      expect([
        sorted[i]!["direction"],
        Number(sorted[i]!["amount"]),
        Number(sorted[i]!["balance"]),
      ]).toEqual([inn(t), t.amt, t.bal]);
    });
    const check = (
      doc["extracted"] as {
        statement_check: {
          status: string;
          breaks: unknown[];
          lines: number;
          hold?: unknown;
        };
      }
    ).statement_check;
    expect(check.status).toBe("pass");
    expect(check.breaks).toHaveLength(0);
    expect(check.lines).toBe(1200);
    expect(check.hold).toBeUndefined();
  });

  it("a statement printed for another client is held, not filed, and the message names both", async () => {
    const { doc, txns } = await upload(
      "statement.pdf",
      bytes,
      "Other Client Ltd",
      [{ id: "b3", name: "Synthetic Traders Private Limited" }],
    );
    const check = (
      doc["extracted"] as {
        statement_check: {
          hold?: {
            reason: string;
            suggested: { id: string; name: string } | null;
          };
        };
      }
    ).statement_check;
    expect(check.hold?.suggested?.name).toBe(
      "Synthetic Traders Private Limited",
    );
    expect(check.hold?.reason).toContain("Other Client Ltd");
    expect(check.hold?.reason).not.toMatch(/not \./);
    expect(txns).toHaveLength(0);
    expect(doc["extract_status"]).toBe("needs_review");
  });

  it("reading the same statement again files no second copy of any line", async () => {
    const again = await upload(
      "statement.pdf",
      bytes,
      "Synthetic Traders Private Limited",
      [],
      2,
    );
    expect(again.txns).toHaveLength(1200);
    expect(again.doc["row_count"]).toBe(1200);
  });
});

describe("identical-looking lines in one statement", () => {
  const csv = [
    "Date,Description,Debit,Credit,Balance",
    "01/04/2025,OPENING DEPOSIT,,10000.00,10000.00",
    "05/04/2025,MAB CHGS,50.00,,9950.00",
    "05/04/2025,MAB CHGS,50.00,,9900.00", // same charge twice: the balance moved twice, so both are real
    "06/04/2025,CASH WDL,100.00,,9800.00",
    "06/04/2025,CASH WDL,100.00,,9800.00", // same balance: a repeated line, not a second withdrawal
  ].join("\n");

  it("files both lines when the running balance moved twice, and sends only a true repeat to review", async () => {
    const { txns, review } = await upload(
      "small.csv",
      new TextEncoder().encode(csv),
      "Synthetic Traders Private Limited",
    );
    expect(
      txns.filter((t) => String(t["description"]).includes("MAB CHGS")),
    ).toHaveLength(2);
    expect(
      txns.filter((t) => String(t["description"]).includes("CASH WDL")),
    ).toHaveLength(1);
    expect(review).toHaveLength(1);
  });
});

const REAL = process.env["REAL_STATEMENTS"];
describe.skipIf(!REAL || !existsSync(REAL ?? ""))(
  "the tester's real statements (only when REAL_STATEMENTS points at them)",
  () => {
    const files =
      REAL && existsSync(REAL)
        ? readdirSync(REAL).filter((f) => f.endsWith(".pdf"))
        : [];
    it.each(files)("%s", async (f) => {
      const m = /^(.+?)\|\|(.+)\.pdf$/.exec(f);
      const client = m?.[1] ?? "Client";
      const { result, doc, txns, review } = await upload(
        f,
        new Uint8Array(readFileSync(`${REAL}/${f}`)),
        client,
      );
      const check = (
        doc["extracted"] as {
          statement_check?: { status: string; hold?: unknown; lines: number; bankTie?: { tied: boolean | null; source: string }; headline?: string };
        }
      ).statement_check;
      console.log(
        `${f}: ${result.status}, read ${check?.lines}, filed ${txns.length}, review ${review.length}, duplicates ${doc["duplicate_count"]}, check ${check?.status}`,
      );
      console.log(`   bank's own figures: ${check?.bankTie ? `${check.bankTie.source}, tied=${check.bankTie.tied}` : "none printed"} | ${String(check?.headline).slice(0, 110)}`);
      expect(result.error).toBeUndefined();
      expect(txns.length).toBeGreaterThan(0);
      expect(check?.hold).toBeUndefined();
      // Whatever the bank printed to tick against must tie; a bank that prints nothing is simply not compared.
      expect(check?.bankTie?.tied).not.toBe(false);
      // A verified statement is never held, and the one answer the product gives is "Passed".
      const { verificationOf } = await import("@/lib/practice/statementVerification");
      expect(verificationOf(check as never).result).toBe("passed");
      expect(verificationOf(check as never).held).toBe(false);
      expect(result.status).toBe("parsed");
      expect(check?.status === "pass" || check?.status === "warn").toBe(true);

      // An independent look: the PDF's plain text is read by another route than the table reader, and every figure and date the
      // reader filed must be in it. A number the reader invented or mis-read would not be.
      const { pdfText } = await import("@/lib/practice/files.server");
      const raw = (await pdfText(new Uint8Array(readFileSync(`${REAL}/${f}`)))).text;
      // Banks print amounts with one or two decimals (SBI: "1,95,00,000.0"), so every figure is read as a number.
      const amounts = new Map<string, number>();
      for (const m of raw.matchAll(/\d[\d,]*\.\d{1,2}/g)) {
        const k = Number(m[0].replace(/,/g, "")).toFixed(2);
        amounts.set(k, (amounts.get(k) ?? 0) + 1);
      }
      // Dates: some banks wrap a date over two lines ("01-Apr-" then "2025"), so the day and month are looked for together and the
      // year on its own. A date the reader invented would have a day-and-month that is never printed.
      const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      const dayMonths = new Set<string>();
      for (const m of raw.matchAll(/\b(\d{1,2})[-/. ]([A-Za-z]{3}|\d{1,2})(?=[-/. ,]|\d{2}|\b)/g)) {
        const mon = /^\d+$/.test(m[2]!) ? Number(m[2]) : MON.indexOf(m[2]!.toLowerCase()) + 1;
        if (mon >= 1 && mon <= 12) dayMonths.add(`${Number(m[1])}-${mon}`);
      }
      const years = new Set<number>();
      for (const m of raw.matchAll(/\b(20\d{2})\b/g)) years.add(Number(m[1]));
      for (const m of raw.matchAll(/[-/.](\d{2})\b/g)) years.add(2000 + Number(m[1]));
      const money = (n: unknown) => Math.abs(Number(n)).toFixed(2);
      const missingAmount: string[] = [];
      const missingBalance: string[] = [];
      const missingDate: string[] = [];
      for (const t of txns) {
        const a = money(t["amount"]);
        if (!amounts.get(a)) missingAmount.push(a);
        if (t["balance"] !== null && t["balance"] !== undefined) {
          const b = money(t["balance"]);
          if (!amounts.get(b)) missingBalance.push(b);
        }
        const [y, mo, d] = String(t["txn_date"]).slice(0, 10).split("-").map(Number) as [number, number, number];
        if (!dayMonths.has(`${d}-${mo}`) || !years.has(y)) missingDate.push(String(t["txn_date"]));
      }
      console.log(`   independent text check: ${txns.length} lines, amounts missing ${missingAmount.length}, balances missing ${missingBalance.length}, dates missing ${missingDate.length}`);
      expect(missingAmount).toEqual([]);
      expect(missingBalance).toEqual([]);
      expect(missingDate).toEqual([]);
    });
  },
);

// Transfers between one client's own accounts, from real statements: the client's two SBI accounts, and its two Indian Bank accounts.
// Names the files by their bank and account so no client is named here; only runs when REAL_STATEMENTS points at the folder.
describe.skipIf(!REAL || !existsSync(REAL ?? ""))("own-account transfers across a client's real accounts", () => {
  const find = (re: RegExp) => (REAL && existsSync(REAL) ? readdirSync(REAL).find((f) => re.test(f)) : undefined);
  async function legsOf(files: string[]) {
    const { pairOwnTransfers } = await import("@/lib/practice/recon/ownTransfers");
    const docs = files.map((f, i) => ({ id: `d${i + 1}`, ca_firm_id: FIRM, business_id: BUSINESS, original_filename: f, storage_path: `${FIRM}/${BUSINESS}/${i}.pdf`, side: "bank", extract_status: null, extract_attempts: 0, extracted: { source: "Manual" }, uploaded_by: "u1" }));
    const blobs = Object.fromEntries(files.map((f, i) => [`${FIRM}/${BUSINESS}/${i}.pdf`, new Uint8Array(readFileSync(`${REAL}/${f}`))]));
    const { db, tables } = memoryDb({ ca_document_extractions: docs, ca_clients: [{ id: "row1", business_id: BUSINESS, ca_firm_id: FIRM, client_name: (/^(.+?)\|\|/.exec(files[0]!)?.[1]) ?? "Client" }] }, blobs);
    const { processExtraction } = await import("@/lib/practice/documents.server");
    for (const d of docs) await processExtraction(db, d.id, { trigger: "user", userId: "u1" });
    const tail = new Map((tables["ca_document_extractions"] ?? []).map((d) => [d["id"] as string, String((d["extracted"] as { account_no?: string }).account_no ?? "").replace(/\D/g, "").slice(-4) || null]));
    const legs = (tables["ca_txns"] ?? []).map((t) => ({ id: t["id"] as string, extractionId: t["extraction_id"] as string, direction: t["direction"] as "in" | "out", amount: Number(t["amount"]), date: String(t["txn_date"]).slice(0, 10), reference: (t["reference"] as string) ?? null, description: (t["description"] as string) ?? "", accountTail: tail.get(t["extraction_id"] as string) ?? null }));
    return { legs, pairs: pairOwnTransfers(legs) };
  }
  it("pairs the SBI current account with the SBI overdraft, and nothing it should not", async () => {
    const files = [find(/SBI_CA_/), find(/SBI_OD_/)].filter(Boolean) as string[];
    if (files.length < 2) return;
    const { legs, pairs } = await legsOf(files);
    expect(pairs.length).toBeGreaterThanOrEqual(16);
    // Every pair is equal and opposite, within two days, on different statements.
    for (const p of pairs) {
      expect(p.out.amount).toBe(p.in.amount);
      expect(p.out.extractionId).not.toBe(p.in.extractionId);
      expect(Math.abs(Date.parse(p.out.date) - Date.parse(p.in.date))).toBeLessThanOrEqual(2 * 86_400_000);
    }
    // No leg is used twice.
    const ids = pairs.flatMap((p) => [p.out.id, p.in.id]);
    expect(new Set(ids).size).toBe(ids.length);
    console.log(`   own-account pairs across two SBI accounts: ${pairs.length} of ${legs.length} lines`);
  });
  it("pairs a transfer between two Indian Bank accounts by the account named in the narration", async () => {
    const files = [find(/IndianBank_7856/), find(/IndianBank_8088/)].filter(Boolean) as string[];
    if (files.length < 2) return;
    const { pairs } = await legsOf(files);
    expect(pairs.length).toBeGreaterThanOrEqual(1);
    console.log(`   own-account pairs across two Indian Bank accounts: ${pairs.length}`);
  });
});
