import { describe, expect, it } from "vitest";
import {
  advances,
  buildTemplateMessage,
  chaseTemplateParams,
  classifyInbound,
  explainWaError,
  waParam,
} from "@/lib/practice/whatsappFlow";

describe("template message", () => {
  it("fills four body fields and cleans them", () => {
    const p = chaseTemplateParams({ contactName: "Asha", clientName: "Acme\nTraders", items: ["Bank statement (Sep 2026)"], firmName: "Rao  &  Co" });
    expect(p).toEqual(["Asha", "Acme Traders", "Bank statement (Sep 2026)", "Rao & Co"]);
  });
  it("summarises long item lists and never sends an empty field", () => {
    const p = chaseTemplateParams({ contactName: "", clientName: "A", items: ["a", "b", "c", "d", "e"], firmName: "F" });
    expect(p[0]).toBe("there");
    expect(p[2]).toBe("a, b, c and 2 more");
    expect(waParam("   ")).toBe("-");
  });
  it("builds the Cloud API payload", () => {
    const m = buildTemplateMessage("919845012345", "document_request", "en", ["a", "b", "c", "d"]);
    expect(m).toMatchObject({ messaging_product: "whatsapp", to: "919845012345", type: "template" });
    expect(m.template.components[0].parameters).toHaveLength(4);
  });
});

describe("Meta errors in plain words", () => {
  it("treats bad numbers and unapproved templates as permanent", () => {
    expect(explainWaError(131026, undefined)).toMatchObject({ permanent: true });
    expect(explainWaError(132001, undefined).message).toMatch(/template/i);
    expect(explainWaError(190, undefined).message).toMatch(/token/i);
  });
  it("treats rate limits as retryable", () => {
    expect(explainWaError(130429, undefined).permanent).toBe(false);
    expect(explainWaError(131056, undefined).permanent).toBe(false);
    expect(explainWaError(undefined, "boom").message).toContain("boom");
  });
});

describe("inbound text", () => {
  it("recognises opt-outs", () => {
    for (const t of ["STOP", "stop please", "Unsubscribe", "opt out", "Do not message me", "band karo"])
      expect(classifyInbound(t)).toBe("stop");
  });
  it("treats everything else as a reply", () => {
    for (const t of ["Will send tomorrow", "Please stop by tomorrow to collect it", "ok", "", null])
      expect(classifyInbound(t)).toBe("reply");
  });
});

describe("delivery receipts only move forward", () => {
  it("ignores late or repeated receipts", () => {
    expect(advances(null, "sent")).toBe(true);
    expect(advances("sent", "delivered")).toBe(true);
    expect(advances("read", "delivered")).toBe(false);
    expect(advances("delivered", "delivered")).toBe(false);
    expect(advances("delivered", "failed")).toBe(true);
  });
});
