import { describe, expect, it } from "vitest";
import { sortRows } from "@/v2/ui";

type R = { id: string; date: string; amount: number | null; name: string };
const rows: R[] = [
  { id: "a", date: "2026-10-12", amount: -500, name: "Invoice 10" },
  { id: "b", date: "2026-10-03", amount: 1200, name: "Invoice 2" },
  { id: "c", date: "2026-10-12", amount: null, name: "" },
  { id: "d", date: "2026-10-03", amount: -90, name: "invoice 1" },
];
const ids = (r: R[]) => r.map((x) => x.id).join("");

describe("sorting the lines of a statement and the other tables", () => {
  it("sorts by date, ascending and descending, keeping the statement order for lines on the same day", () => {
    expect(ids(sortRows(rows, (r) => r.date, "asc"))).toBe("bdac");
    expect(ids(sortRows(rows, (r) => r.date, "desc"))).toBe("acbd");
  });
  it("sorts amounts as numbers (money out is below money in) and puts empty amounts last in both directions", () => {
    expect(ids(sortRows(rows, (r) => r.amount, "asc"))).toBe("adbc");
    expect(ids(sortRows(rows, (r) => r.amount, "desc"))).toBe("bdac");
  });
  it("sorts text the way a person reads it: Invoice 2 before Invoice 10, case ignored, empty last", () => {
    expect(ids(sortRows(rows, (r) => r.name, "asc"))).toBe("dbac");
  });
  it("never changes the rows it was given", () => {
    const copy = [...rows];
    sortRows(rows, (r) => r.amount, "asc");
    expect(rows).toEqual(copy);
  });
});
