// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanEnv, clientIdLooksValid, zohoConfigProblems } from "@/lib/practice/zohoConfig";

const ID = "1000.5T0NX3YS0TYS9TKQ16JZ5EE0I5UBMP";
const good = { ZOHO_CLIENT_ID: ID, ZOHO_CLIENT_SECRET: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3", GMAIL_ENCRYPTION_KEY: "k" };

describe("cleaning Zoho settings", () => {
  it("removes the line break, spaces and quotes that come with pasted values", () => {
    expect(cleanEnv(`${ID}\n`)).toBe(ID);
    expect(cleanEnv(`  ${ID} \r\n`)).toBe(ID);
    expect(cleanEnv(`"${ID}"`)).toBe(ID);
    expect(cleanEnv(`'${ID}'\n`)).toBe(ID);
    expect(cleanEnv(`​${ID}`)).toBe(ID);
    expect(cleanEnv(undefined)).toBe("");
  });

  it("knows the shape of a Zoho client id", () => {
    expect(clientIdLooksValid(ID)).toBe(true);
    expect(clientIdLooksValid(`${ID}\n`)).toBe(false);
    expect(clientIdLooksValid("abc")).toBe(false);
    expect(clientIdLooksValid("")).toBe(false);
  });
});

describe("what System Health says about the Zoho settings", () => {
  it("is quiet for clean settings", () => {
    expect(zohoConfigProblems(good)).toEqual([]);
  });

  it("explains the trailing line break that caused 'Invalid Client'", () => {
    const p = zohoConfigProblems({ ...good, ZOHO_CLIENT_ID: `${ID}\n` });
    expect(p).toHaveLength(1);
    expect(p[0]).toContain("stray space, quote or line break");
  });

  it("names what is missing or wrong", () => {
    expect(zohoConfigProblems({})).toEqual(expect.arrayContaining(["ZOHO_CLIENT_ID is not set", "ZOHO_CLIENT_SECRET is not set"]));
    expect(zohoConfigProblems({ ...good, ZOHO_CLIENT_ID: "nope" }).join(" ")).toContain("does not look like a Zoho client id");
    expect(zohoConfigProblems({ ...good, ZOHO_ACCOUNTS_URL: "https://evil.example.com" }).join(" ")).toContain("ZOHO_ACCOUNTS_URL");
    expect(zohoConfigProblems({ ...good, ZOHO_ACCOUNTS_URL: "https://accounts.zoho.in/" })).toEqual([]);
    expect(zohoConfigProblems({ ...good, ZOHO_REDIRECT_URI: "https://www.fynhelp.com/wrong" }).join(" ")).toContain("ZOHO_REDIRECT_URI");
    expect(zohoConfigProblems({ ...good, ZOHO_REDIRECT_URI: "https://www.fynhelp.com/api/integrations/zoho/callback" })).toEqual([]);
    expect(zohoConfigProblems({ ZOHO_CLIENT_ID: good.ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET: good.ZOHO_CLIENT_SECRET }).join(" ")).toContain("GMAIL_ENCRYPTION_KEY");
  });
});

describe("the sign-in address FynHelp builds", () => {
  const keep = { ...process.env };
  beforeEach(() => {
    process.env["GMAIL_ENCRYPTION_KEY"] = "k";
    process.env["ZOHO_CLIENT_SECRET"] = "secret\n";
  });
  afterEach(() => {
    process.env = { ...keep };
  });

  it("carries a clean client id even when the stored one ends in a line break", async () => {
    process.env["ZOHO_CLIENT_ID"] = `${ID}\n`;
    const z = await import("@/lib/practice/zoho.server");
    expect(z.zohoConfigured()).toBe(true);
    expect(z.connectProblem()).toBeNull();
    const url = await z.consentUrl("firm", "user", "nonce");
    expect(url).toContain(`client_id=${ID}&`);
    expect(url).not.toContain("%0A");
    expect(url.startsWith("https://accounts.zoho.in/oauth/v2/auth?")).toBe(true);
  });

  it("refuses to send a partner to Zoho with a client id that cannot be right", async () => {
    process.env["ZOHO_CLIENT_ID"] = "not-an-id";
    const z = await import("@/lib/practice/zoho.server");
    expect(z.connectProblem()).toContain("not set up correctly");
  });

  it("cleans the other Zoho settings too", async () => {
    process.env["ZOHO_CLIENT_ID"] = ID;
    process.env["ZOHO_ACCOUNTS_URL"] = " https://accounts.zoho.eu/ \n";
    process.env["ZOHO_REDIRECT_URI"] = '"https://www.fynhelp.com/api/integrations/zoho/callback"\n';
    const z = await import("@/lib/practice/zoho.server");
    expect(z.defaultAccountsServer()).toBe("https://accounts.zoho.eu");
    expect(z.redirectUri()).toBe("https://www.fynhelp.com/api/integrations/zoho/callback");
  });
});
