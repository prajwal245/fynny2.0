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
          statement_check?: { status: string; hold?: unknown; lines: number };
        }
      ).statement_check;
      console.log(
        `${f}: ${result.status}, read ${check?.lines}, filed ${txns.length}, review ${review.length}, duplicates ${doc["duplicate_count"]}, check ${check?.status}`,
      );
      expect(result.error).toBeUndefined();
      expect(txns.length).toBeGreaterThan(0);
      expect(check?.hold).toBeUndefined();
    });
  },
);
