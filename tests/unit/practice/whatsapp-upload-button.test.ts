import { describe, expect, it } from "vitest";
import { uploadLinkProblem } from "@/lib/practice/whatsappFlow";

const tpl = (url?: string) => ({ components: [{ type: "BODY", text: "Hello {{1}}" }, ...(url ? [{ type: "BUTTONS", buttons: [{ type: "URL", text: "Upload documents", url }, { type: "QUICK_REPLY", text: "Sending today" }] }] : [])] });

describe("where the template's Upload button goes", () => {
  it("is fine when it points at this app's upload page, with or without www", () => {
    expect(uploadLinkProblem(tpl("https://fynhelp.com/u/{{1}}"), "https://fynhelp.com")).toBeNull();
    expect(uploadLinkProblem(tpl("https://www.fynhelp.com/u/{{1}}"), "https://fynhelp.com")).toBeNull();
    expect(uploadLinkProblem(tpl("https://fynhelp.com/u/{{1}}"), "https://www.fynhelp.com/")).toBeNull();
  });
  it("names the problem when it points at another domain or another path", () => {
    expect(uploadLinkProblem(tpl("https://old-app.lovable.app/u/{{1}}"), "https://fynhelp.com")).toMatch(/not valid/);
    const p = uploadLinkProblem(tpl("https://fynhelp.com/upload/{{1}}"), "https://fynhelp.com");
    expect(p).toMatch(/opens https:\/\/fynhelp.com\/upload\/<link>/);
    expect(p).toMatch(/https:\/\/fynhelp.com\/u\/\{\{1\}\}/);
  });
  it("catches the variable typed twice, the mistake behind \"This link is not valid\"", () => {
    const p = uploadLinkProblem(tpl("https://www.fynhelp.com/u/{{1}}{{1}}"), "https://fynhelp.com");
    expect(p).toMatch(/variable twice/);
    expect(p).toMatch(/not valid/);
  });
  it("has nothing to say about a template with no Upload button", () => {
    expect(uploadLinkProblem(tpl(), "https://fynhelp.com")).toBeNull();
    expect(uploadLinkProblem(undefined, "https://fynhelp.com")).toBeNull();
  });
});
