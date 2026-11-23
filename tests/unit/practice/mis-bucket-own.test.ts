import { describe, expect, it } from "vitest";
import {
  isOwnTransfer,
  misBucket,
  type OwnAccounts,
} from "@/lib/practice/narrate/flows";
import { BANK_LEDGER_NOTE } from "@/lib/practice/narrate.server";

const own: OwnAccounts = {
  names: ["SATKAARIKA ENTERPRISES PVT LTD"],
  accounts: ["6407563276", "7856871247"],
};
const line = (direction: "in" | "out", description: string) => ({
  direction,
  category: null,
  description,
  counterparty: null,
});

describe("transfers between the client's own accounts", () => {
  it("are not revenue, whichever own account they come from", () => {
    expect(
      misBucket(
        line(
          "in",
          "STD0000000010 07 2025 /SATKAARIKA ENTERPRISES PVT LTD /TRAN SFER FROM 8014561633 BRANCH : VISAKHAPATNAM",
        ),
        own,
      ),
    ).toBe("transfer");
    expect(
      misBucket(
        line(
          "in",
          "SATKAARIKA ENTERPRISES PVT LTD /TRANSFER FROM 6407563276 tr sf to current ac",
        ),
        own,
      ),
    ).toBe("transfer");
    expect(
      misBucket(
        line("in", "Deposit by from occ 6407563276 /BRANCH : VISAKHAPATNAM"),
        own,
      ),
    ).toBe("transfer");
  });
  it("need both the wording and an own name or number", () => {
    expect(
      isOwnTransfer("TRANSFER FROM 94957000128 SRI GOPAL CONSTRUCTIONS", own),
    ).toBe(false);
    expect(
      isOwnTransfer("NEFT SATKAARIKA ENTERPRISES PVT LTD invoice 55", own),
    ).toBe(false);
    expect(isOwnTransfer("TRANSFER FROM 6407563276", null)).toBe(false);
  });
  it("leave a customer receipt as revenue", () => {
    expect(
      misBucket(
        line(
          "in",
          "MUMBAI FORT BY TRANSFER RTGS/BKID/BKIDR5 2026032000699244/ SRI GOPA/ TRANSFER FROM 94957000128",
        ),
        own,
      ),
    ).toBe("revenue");
  });
});

describe("a payment through a cash-credit account is not a loan", () => {
  it("drops the bank ledger note from the book text", () => {
    const text =
      "MANOHAR CIVIL STRUCTURES (Indian Bank CC A/c 6407563276) Sub Contract Services";
    expect(text.replace(BANK_LEDGER_NOTE, " ")).not.toMatch(/cc a\/c/i);
    expect(
      misBucket(
        line("out", `RTGS TO MANOHAR ${text.replace(BANK_LEDGER_NOTE, " ")}`),
        own,
      ),
    ).toBe("expense");
  });
  it("still reads a genuine loan", () => {
    expect(misBucket(line("out", "LOAN EMI 0123"), own)).toBe("loan_capital");
  });
});
