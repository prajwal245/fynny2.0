import { describe, expect, it } from "vitest";
import { readTally, rowsFromTally } from "@/lib/practice/extract/tally";

const v = (type: string, date: string, no: string, party: string, entries: [string, string][], extra = "") =>
  `<VOUCHER VCHTYPE="${type}"><DATE>${date}</DATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME><VOUCHERNUMBER>${no}</VOUCHERNUMBER><PARTYLEDGERNAME>${party}</PARTYLEDGERNAME>${extra}` +
  entries.map(([l, a]) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${l}</LEDGERNAME><AMOUNT>${a}</AMOUNT></ALLLEDGERENTRIES.LIST>`).join("") + `</VOUCHER>`;
const xml = (...vs: string[]) => `<ENVELOPE><BODY><DATA><TALLYMESSAGE>${vs.join("")}</TALLYMESSAGE></DATA></BODY></ENVELOPE>`;

describe("Day Book into bank reconciliation", () => {
  const book = xml(
    v("Receipt", "20261102", "1", "Sundara", [["HDFC Bank", "-50000"], ["Sundara", "50000"]]),
    v("Payment", "20261103", "2", "Rao Steels", [["Rao Steels", "-20000"], ["HDFC Bank", "20000"]]),
    v("Sales", "20261104", "3", "Sundara", [["Sundara", "-118000"], ["Sales", "100000"], ["Output GST", "18000"]]),
    v("Journal", "20261105", "4", "", [["Depreciation", "-5000"], ["Machinery", "5000"]]),
    v("Purchase", "20261106", "5", "Rao Steels", [["Purchases", "-40000"], ["Rao Steels", "40000"]]),
    v("Receipt", "20261107", "6", "Cancelled Co", [["HDFC Bank", "-1000"], ["Cancelled Co", "1000"]], "<ISCANCELLED>Yes</ISCANCELLED>"),
  );

  it("keeps only vouchers that touch the bank, and says what it left out", () => {
    const r = readTally(book);
    expect(r.rows.map((x) => x.reference)).toEqual(["1", "2"]);
    expect(r.rows.map((x) => x.direction)).toEqual(["in", "out"]);
    expect(r.skippedNonBank).toBe(3);
    expect(r.skippedCancelled).toBe(1);
    expect(r.vouchers).toBe(6);
  });
  it("rowsFromTally returns the same rows", () => {
    expect(rowsFromTally(book)).toHaveLength(2);
  });
  it("a Receipt or Payment whose bank ledger has an unusual name is still kept", () => {
    const r = readTally(xml(v("Receipt", "20261102", "9", "Sundara", [["Current A/c 4455", "-50000"], ["Sundara", "50000"]])));
    expect(r.rows).toHaveLength(1);
  });
});
