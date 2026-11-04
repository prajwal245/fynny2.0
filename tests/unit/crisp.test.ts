import { describe, expect, it } from "vitest";
import { crispHostOk, crispPathOk } from "@/lib/crisp";

describe("crisp chat gating", () => {
  it("runs on the live site only", () => {
    expect(crispHostOk("www.fynhelp.com")).toBe(true);
    expect(crispHostOk("fynhelp.com")).toBe(true);
    expect(crispHostOk("fynny2-0-git-x.vercel.app")).toBe(false);
    expect(crispHostOk("localhost")).toBe(false);
    expect(crispHostOk("evilfynhelp.com")).toBe(false);
  });
  it("never shows on the admin panel", () => {
    expect(crispPathOk("/admin")).toBe(false);
    expect(crispPathOk("/admin/firms")).toBe(false);
    expect(crispPathOk("/app/clients")).toBe(true);
    expect(crispPathOk("/")).toBe(true);
    expect(crispPathOk("/administrators")).toBe(true);
  });
});
