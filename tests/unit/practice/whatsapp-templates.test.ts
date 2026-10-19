import { describe, expect, it } from "vitest";
import {
  WA_MONTHLY_ALLOWANCE,
  WA_TEMPLATES,
  cleanParam,
  isStopReply,
  last10,
  nextStatus,
  paramsFor,
  pickFirm,
  renderBody,
  templateFor,
  templatePayload,
  whyBlocked,
} from "@/lib/practice/whatsapp/templates";

const ok = { phone: "98450 12345", optedOut: false, doNotDisturb: false, sentToday: 0, dailyLimit: 100, sentThisMonth: 0, monthlyAllowance: 500, alreadyToday: false };

describe("WhatsApp templates", () => {
  it("asks first, reminds in the middle, and says final on the last round", () => {
    expect(templateFor(1, 3).name).toBe("fh_doc_request");
    expect(templateFor(2, 3).name).toBe("fh_doc_reminder");
    expect(templateFor(3, 3).name).toBe("fh_doc_final");
    expect(templateFor(2, 2).name).toBe("fh_doc_final");
    expect(templateFor(1, 1).name).toBe("fh_doc_request");
  });

  it("fills every variable, and names the firm", () => {
    const p = paramsFor({ contactName: "Ravi Kumar", firmName: "Sharma & Co", item: "bank statement for September 2026", clientName: "Kaveri Fashions" });
    expect(p).toEqual(["Ravi", "Sharma & Co", "bank statement for September 2026", "Kaveri Fashions"]);
    const body = renderBody(WA_TEMPLATES.first, p);
    expect(body).toBe("Hi Ravi, Sharma & Co needs the bank statement for September 2026 for Kaveri Fashions. Please reply to this chat with a photo or PDF. Reply STOP to opt out.");
    expect(body).not.toMatch(/\{\{/);
  });

  it("every template uses exactly the variables it is sent, and tells people how to stop", () => {
    for (const t of Object.values(WA_TEMPLATES)) {
      const used = [...t.body.matchAll(/\{\{(\d)\}\}/g)].map((m) => Number(m[1]));
      expect(Math.max(...used)).toBe(4);
      expect(new Set(used)).toEqual(new Set([1, 2, 3, 4].filter((i) => used.includes(i))));
      expect(t.body).toMatch(/STOP/);
    }
  });

  it("keeps variables inside what Meta accepts", () => {
    expect(cleanParam("line one\nline two\t\tx")).toBe("line one line two x");
    expect(cleanParam("")).toBe("-");
    expect(cleanParam("a".repeat(100), 20)).toHaveLength(20);
    expect(paramsFor({ contactName: "", firmName: "F", item: "X", clientName: "C" })[0]).toBe("there");
  });

  it("builds the Graph payload Meta expects", () => {
    expect(templatePayload("919845012345", WA_TEMPLATES.reminder, ["a", "b", "c", "d"])).toEqual({
      messaging_product: "whatsapp",
      to: "919845012345",
      type: "template",
      template: { name: "fh_doc_reminder", language: { code: "en" }, components: [{ type: "body", parameters: ["a", "b", "c", "d"].map((text) => ({ type: "text", text })) }] },
    });
  });

  describe("who may be messaged", () => {
    it("lets a normal message through", () => expect(whyBlocked(ok)).toBeNull());
    it("blocks a bad number, an opt-out, do-not-disturb, and a repeat in one day", () => {
      expect(whyBlocked({ ...ok, phone: "12345" })).toBe("no_number");
      expect(whyBlocked({ ...ok, phone: null })).toBe("no_number");
      expect(whyBlocked({ ...ok, optedOut: true })).toBe("opted_out");
      expect(whyBlocked({ ...ok, doNotDisturb: true })).toBe("do_not_disturb");
      expect(whyBlocked({ ...ok, alreadyToday: true })).toBe("already_sent_today");
    });
    it("stops at the daily limit and at the month's allowance", () => {
      expect(whyBlocked({ ...ok, sentToday: 100 })).toBe("daily_limit");
      expect(whyBlocked({ ...ok, sentThisMonth: 500 })).toBe("monthly_limit");
      expect(whyBlocked({ ...ok, monthlyAllowance: 0 })).toBe("monthly_limit");
    });
    it("puts opt-out ahead of every limit", () => {
      expect(whyBlocked({ ...ok, optedOut: true, sentToday: 999, sentThisMonth: 999 })).toBe("opted_out");
    });
    it("gives Essential no WhatsApp", () => {
      expect(WA_MONTHLY_ALLOWANCE.starter).toBe(0);
      expect(WA_MONTHLY_ALLOWANCE.scale).toBeGreaterThan(WA_MONTHLY_ALLOWANCE.professional);
    });
  });

  describe("replies", () => {
    it("reads STOP however it is typed, but not a sentence that contains it", () => {
      for (const t of ["STOP", " stop ", "Stop.", "Unsubscribe", "OPT OUT", "opt-out", "Do not message"]) expect(isStopReply(t), t).toBe(true);
      for (const t of ["please don't stop the filing", "stop by tomorrow", "here is the statement", "", null, undefined]) expect(isStopReply(t as string), String(t)).toBe(false);
    });
    it("only moves a delivery state forward", () => {
      expect(nextStatus("sent", "delivered")).toBe("delivered");
      expect(nextStatus("read", "delivered")).toBe("read");
      expect(nextStatus("delivered", "sent")).toBe("delivered");
      expect(nextStatus("sent", "failed")).toBe("failed");
      expect(nextStatus("delivered", "failed")).toBe("delivered");
      expect(nextStatus("sent", "whatever")).toBe("sent");
    });
    it("compares numbers by their last ten digits", () => {
      expect(last10("+91 98450 12345")).toBe("9845012345");
      expect(last10(null)).toBe("");
    });
  });

  describe("which firm a reply belongs to", () => {
    const now = Date.parse("2026-10-20T10:00:00Z");
    it("is the firm that messaged them most recently", () => {
      expect(pickFirm([{ firmId: "A", at: "2026-10-01T00:00:00Z" }, { firmId: "B", at: "2026-10-15T00:00:00Z" }], ["A", "B"], now)).toBe("B");
    });
    it("ignores a message older than the window", () => {
      expect(pickFirm([{ firmId: "A", at: "2026-08-01T00:00:00Z" }], [], now)).toBeNull();
    });
    it("falls back to the one firm that has them as a client, and to nobody when it is unclear", () => {
      expect(pickFirm([], ["A", "A"], now)).toBe("A");
      expect(pickFirm([], ["A", "B"], now)).toBeNull();
      expect(pickFirm([], [], now)).toBeNull();
    });
  });
});
