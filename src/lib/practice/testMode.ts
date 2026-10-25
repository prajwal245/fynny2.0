/**
 * Rules for test (tester) firms, pure so they are tested on their own.
 * A test firm is a sandbox: real messages go only to the team's own addresses and numbers, nothing is billed,
 * and none of it appears in reports.
 */

/** Recipients a test firm may really email: the team's own domain, plus anything listed in TEST_RECIPIENTS. */
export const TEAM_EMAIL_DOMAINS = ["fynhelp.com"];

const digits = (s: string) => s.replace(/\D/g, "");

/** TEST_RECIPIENTS: emails and phone numbers separated by commas, spaces or semicolons. */
export function parseAllowlist(raw: string | undefined | null): { emails: Set<string>; phones: Set<string> } {
  const emails = new Set<string>();
  const phones = new Set<string>();
  for (const part of String(raw ?? "").split(/[\s,;]+/)) {
    const v = part.trim().toLowerCase();
    if (!v) continue;
    if (v.includes("@")) emails.add(v);
    else if (digits(v).length >= 8) phones.add(digits(v).slice(-10));
  }
  return { emails, phones };
}

export function emailAllowedInTest(to: string, allowlistRaw?: string | null): boolean {
  const addr = to.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return false;
  if (TEAM_EMAIL_DOMAINS.some((d) => addr.endsWith(`@${d}`))) return true;
  return parseAllowlist(allowlistRaw).emails.has(addr);
}

/** Phone numbers match on their last 10 digits, whatever the formatting. */
export function phoneAllowedInTest(phone: string, allowlistRaw?: string | null): boolean {
  const d = digits(phone);
  return d.length >= 8 && parseAllowlist(allowlistRaw).phones.has(d.slice(-10));
}

/** What the screen says on a test firm: shown to testers so nobody mistakes it for live data. */
export const TEST_BANNER = "Test account. Nothing here is real: messages are simulated, nothing is billed, and none of it appears in reports.";

/** A recorded message id for a simulated send, so timelines look normal but are clearly marked. */
export const sandboxId = (rand: () => string = () => Math.random().toString(36).slice(2, 10)) => `sandbox-${rand()}`;
