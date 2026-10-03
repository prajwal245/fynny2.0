import { describe, expect, it } from "vitest";
import { isPrivatePath, normalizeUrl, robotsHeaderFor } from "@/lib/searchPolicy";

describe("search policy", () => {
  it("lets the public site on the real domain be indexed", () => {
    for (const p of ["/", "/pricing", "/agents/recon", "/blog/some-post", "/ca-firms"]) {
      expect(robotsHeaderFor("www.fynhelp.com", p)).toBeNull();
    }
    expect(robotsHeaderFor("fynhelp.com", "/pricing")).toBeNull();
  });

  it("keeps the app, sign-in and admin out of search, even on the real domain", () => {
    for (const p of ["/v2", "/v2/clients/1", "/login", "/signup", "/dashboard/cash", "/admin/blog", "/ca/login", "/api/public/x", "/shared/mis/t", "/waitlist", "/demo/gst"]) {
      expect(robotsHeaderFor("www.fynhelp.com", p)).toBe("noindex, nofollow");
    }
  });

  it("does not confuse look-alike public paths with private ones", () => {
    expect(isPrivatePath("/ca-firms")).toBe(false);
    expect(isPrivatePath("/demographics")).toBe(false);
    expect(isPrivatePath("/ca")).toBe(true);
  });

  it("noindexes preview and project hosts so they never compete with the real site", () => {
    expect(robotsHeaderFor("fynny20-abc123-fynny2.vercel.app", "/")).toBe("noindex, nofollow");
    expect(robotsHeaderFor("fynny20.vercel.app", "/pricing")).toBe("noindex, nofollow");
  });

  it("redirects trailing slashes permanently and keeps the query", () => {
    const r = normalizeUrl(new Request("https://www.fynhelp.com/pricing/?utm_source=x"));
    expect(r?.status).toBe(308);
    expect(r?.headers.get("location")).toBe("/pricing?utm_source=x");
    expect(normalizeUrl(new Request("https://www.fynhelp.com/"))).toBeNull();
    expect(normalizeUrl(new Request("https://www.fynhelp.com/pricing"))).toBeNull();
  });
});
