import { describe, expect, it } from "vitest";
import {
  BANK_CHARGE_MAX_RUPEES,
  categorise,
} from "@/lib/practice/extract/classify";

describe("a bank charge is small and is not a payment that mentions charges", () => {
  it("still reads a real bank charge", () => {
    expect(categorise("SMS CHGS QTR", "out", "bank", 23.6)).toBe("bank_charge");
    expect(categorise("MIN BAL CHARGES", "out", "bank", 708)).toBe(
      "bank_charge",
    );
    expect(categorise("GST ON CHARGES", "out", "bank", 4.3)).toBe(
      "bank_charge",
    );
  });
  it("does not read a large payment as a bank charge because the word appears", () => {
    expect(
      categorise(
        "TRANSFER TO 123 Txn Amt. 47,32,488.00 Charges. 29.21 /NEFT/SUPPLIER",
        "out",
        "bank",
        4_732_517.21,
      ),
    ).toBe("payment");
    expect(
      categorise(
        "SOME CHARGES SETTLEMENT",
        "out",
        "bank",
        BANK_CHARGE_MAX_RUPEES + 1,
      ),
    ).toBe("payment");
  });
  it("does not read a mid-size transfer with an embedded fee as a bank charge", () => {
    expect(
      categorise(
        "TRANSFER TO 89634000339 Txn Amt. 48,903.00 Charges. 5.61 /NEFT/HDFC",
        "out",
        "bank",
        48_908.61,
      ),
    ).toBe("payment");
  });
  it("keeps the old behaviour when no amount is known", () => {
    expect(categorise("SMS CHGS", "out", "bank")).toBe("bank_charge");
  });
});
