import { afterEach, describe, expect, it } from "vitest";
import { signupRecipients } from "@/lib/practice/teamNotify.server";

afterEach(() => { delete process.env["SIGNUP_NOTIFY_EMAILS"]; });

describe("new sign-up notification recipients", () => {
  it("defaults to the founders' FynHelp addresses", () => {
    const to = signupRecipients();
    expect(to.length).toBeGreaterThan(0);
    for (const e of to) expect(e).toMatch(/@fynhelp\.com$/);
  });
  it("can be set from the environment, ignoring anything that is not an email", () => {
    process.env["SIGNUP_NOTIFY_EMAILS"] = "a@fynhelp.com, nonsense , B@fynhelp.com";
    expect(signupRecipients()).toEqual(["a@fynhelp.com", "b@fynhelp.com"]);
  });
});
