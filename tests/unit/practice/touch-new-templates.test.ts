import { describe, expect, it } from "vitest";
import { pickTouchTemplate, touchParams, TOUCH_TEMPLATES } from "@/lib/practice/touchpoints/whatsapp";
import type { MetaTemplate } from "@/lib/practice/whatsappFlow";

const threeButtons = [
  { type: "URL", text: "Open FynHelp", url: "https://fynhelp.com/app" },
  { type: "QUICK_REPLY", text: "Call me" },
  { type: "QUICK_REPLY", text: "Not now" },
  { type: "QUICK_REPLY", text: "Stop messages" },
];
const tpl = (name: string, category: string, status: string, buttons: unknown[]): MetaTemplate =>
  ({ name, language: "en", category, status, components: [{ type: "BODY", text: "Hello {{1}} {{2}} {{3}}" }, { type: "BUTTONS", buttons }] }) as unknown as MetaTemplate;

describe("fh_account_update and fh_results_ready are picked once approved", () => {
  for (const key of ["issue", "ready"] as const) {
    const name = TOUCH_TEMPLATES[key].name;
    const o = { language: "en", allowMarketing: true };
    it(`${key}: not used while in review`, () => {
      expect(pickTouchTemplate(key, [tpl(name, "MARKETING", "PENDING", threeButtons)], o).template).toBeUndefined();
    });
    it(`${key}: used once approved, even if Meta classed it Marketing (flagged as Marketing)`, () => {
      const p = pickTouchTemplate(key, [tpl(name, "MARKETING", "APPROVED", threeButtons)], o);
      expect(p.template?.name).toBe(name);
      expect(p.marketing).toBe(true);
    });
    it(`${key}: used as Utility when approved as Utility`, () => {
      const p = pickTouchTemplate(key, [tpl(name, "UTILITY", "APPROVED", threeButtons)], o);
      expect(p.template?.name).toBe(name);
      expect(p.marketing).toBe(false);
    });
    it(`${key}: refused with the wrong buttons (dynamic link, phone button, two quick replies)`, () => {
      const wrong = [{ type: "URL", text: "Open Account", url: "https://fynhelp.com/account/{{1}}" }, { type: "PHONE_NUMBER", text: "Ask us to call", phone_number: "+9100" }, { type: "QUICK_REPLY", text: "Pause Updates" }, { type: "QUICK_REPLY", text: "Stop Messages" }];
      expect(pickTouchTemplate(key, [tpl(name, "UTILITY", "APPROVED", wrong)], o).template).toBeUndefined();
    });
    it(`${key}: Marketing is not used when Marketing is switched off`, () => {
      expect(pickTouchTemplate(key, [tpl(name, "MARKETING", "APPROVED", threeButtons)], { ...o, allowMarketing: false }).template).toBeUndefined();
    });
  }
  it("fills three fields for both", () => {
    expect(touchParams("processing_issue", { name: "Asha Rao", firmName: "Rao & Co" }, { failedDocs: 2 })).toHaveLength(3);
    expect(touchParams("results_ready", { name: "Asha Rao", firmName: "Rao & Co" }, { readyDocs: 3, readyReports: 1 })?.[2]).toBe("3 documents were read and 1 report is ready.");
  });
});
