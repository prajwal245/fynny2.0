import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const text = readFileSync("public/robots.txt", "utf8");

interface Group {
  agents: string[];
  rules: { allow: boolean; path: string }[];
}

/** Groups as RFC 9309 reads them: consecutive User-agent lines share the rules that follow. */
function parse(src: string): { groups: Group[]; sitemaps: string[] } {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const val = m[2]!.trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur!.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (key === "sitemap") sitemaps.push(val);
      else if ((key === "allow" || key === "disallow") && cur)
        cur.rules.push({ allow: key === "allow", path: val });
    }
  }
  return { groups, sitemaps };
}

const matches = (pattern: string, path: string) => {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
};

/** Whether a crawler may fetch a path: its own group if it has one, else "*"; the longest matching rule wins, Allow on a tie. */
function allowed(agent: string, path: string): boolean {
  const { groups } = parse(text);
  const a = agent.toLowerCase();
  const group =
    groups.find((g) => g.agents.includes(a)) ??
    groups.find((g) => g.agents.includes("*"));
  if (!group) return true;
  let best: { allow: boolean; len: number } | null = null;
  for (const r of group.rules) {
    if (!r.path || !matches(r.path, path)) continue;
    if (
      !best ||
      r.path.length > best.len ||
      (r.path.length === best.len && r.allow)
    )
      best = { allow: r.allow, len: r.path.length };
  }
  return best ? best.allow : true;
}

const CRAWLERS = [
  "Googlebot",
  "Bingbot",
  "OAI-SearchBot",
  "GPTBot",
  "ChatGPT-User",
  "PerplexityBot",
  "ClaudeBot",
  "Claude-SearchBot",
  "Google-Extended",
  "Applebot",
];
const PUBLIC = [
  "/",
  "/pricing",
  "/blog",
  "/blog/some-post",
  "/llms.txt",
  "/sitemap.xml",
  "/approach",
];
const PRIVATE = [
  "/app",
  "/app/",
  "/app/review",
  "/app/settings?tab=integrations",
  "/dashboard",
  "/dashboard/settings",
  "/admin",
  "/intern",
  "/api/public/tally-outbox",
  "/blog-admin",
];

describe("robots.txt", () => {
  it.each(CRAWLERS)("%s is named, and may read the public site", (bot) => {
    expect(
      parse(text).groups.some((g) => g.agents.includes(bot.toLowerCase())),
    ).toBe(true);
    for (const p of PUBLIC) expect(allowed(bot, p), `${bot} ${p}`).toBe(true);
  });

  it.each(CRAWLERS)(
    "%s is asked to stay out of /app and /dashboard and the other private areas",
    (bot) => {
      for (const p of PRIVATE)
        expect(allowed(bot, p), `${bot} ${p}`).toBe(false);
    },
  );

  it("a crawler not named gets the same rules", () => {
    expect(allowed("SomeOtherBot", "/pricing")).toBe(true);
    expect(allowed("SomeOtherBot", "/app/review")).toBe(false);
  });

  it("does not block public pages whose address merely starts with /app", () => {
    expect(allowed("Googlebot", "/apple-pay-for-ca-firms")).toBe(true);
  });

  it("points at the sitemap by its full address, and that route exists", () => {
    const { sitemaps } = parse(text);
    expect(sitemaps).toEqual(["https://www.fynhelp.com/sitemap.xml"]);
    expect(readFileSync("src/routes/sitemap[.]xml.ts", "utf8")).toContain(
      'createFileRoute("/sitemap.xml")',
    );
  });
});
