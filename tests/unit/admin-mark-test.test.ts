// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/security.server", () => ({ audit: async () => undefined }));

import { setFirmsTest } from "@/lib/admin/admin.server";

type Firm = { id: string; firm_name: string; is_demo: boolean; is_test: boolean };

function ctx(firms: Firm[], refuse: string[] = []) {
  const db = {
    from: () => ({
      select: () => ({ in: (_c: string, ids: string[]) => Promise.resolve({ data: firms.filter((f) => ids.includes(f.id)), error: null }) }),
      update: (patch: { is_test: boolean }) => ({
        eq: (_c: string, id: string) => {
          if (refuse.includes(id)) return Promise.resolve({ error: { message: "A tester account cannot be part of a real firm" } });
          const f = firms.find((x) => x.id === id);
          if (f) f.is_test = patch.is_test;
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };
  return { db } as never;
}

const A: Firm = { id: "a", firm_name: "Alpha", is_demo: false, is_test: false };
const B: Firm = { id: "b", firm_name: "Beta", is_demo: false, is_test: true };
const D: Firm = { id: "d", firm_name: "Demo", is_demo: true, is_test: false };

describe("marking firms as test or real", () => {
  it("reports exactly which firms changed, so Undo reverses only those", async () => {
    const firms = [{ ...A }, { ...B }];
    const r = await setFirmsTest(ctx(firms), ["a", "b"], true, "");
    expect(r.changedIds).toEqual(["a"]);
    expect(r.alreadyThere).toBe(1);
    expect(firms.map((f) => f.is_test)).toEqual([true, true]);
    const undo = await setFirmsTest(ctx(firms), r.changedIds, false, "");
    expect(undo.changedIds).toEqual(["a"]);
    expect(firms.map((f) => f.is_test)).toEqual([false, true]);
  });
  it("never switches a demo firm", async () => {
    const r = await setFirmsTest(ctx([{ ...D }]), ["d"], true, "");
    expect(r).toMatchObject({ changed: 0, skippedDemo: 1 });
  });
  it("names the firm whose owner also belongs to the other kind, and carries on with the rest", async () => {
    const r = await setFirmsTest(ctx([{ ...A }, { ...B, id: "c", firm_name: "Gamma", is_test: false }], ["a"]), ["a", "c"], true, "");
    expect(r.changedIds).toEqual(["c"]);
    expect(r.failed).toEqual(["Alpha: its owner also belongs to another firm of the other kind"]);
  });
  it("needs at least one firm", async () => {
    await expect(setFirmsTest(ctx([]), [], true, "")).rejects.toThrow(/at least one/i);
  });
});
