// Shared password policy used by ResetPasswordPage and LoginPage (sign-up tab).
// Keep in sync — do NOT fork the rules in individual pages.

export type RuleKey = "length" | "upper" | "lower" | "digit" | "symbol" | "noSpaces";

export interface Rule {
  key: RuleKey;
  label: string;
  test: (pw: string) => boolean;
}

export const RULES: Rule[] = [
  { key: "length", label: "At least 10 characters", test: (p) => p.length >= 10 },
  { key: "upper", label: "An uppercase letter (A–Z)", test: (p) => /[A-Z]/.test(p) },
  { key: "lower", label: "A lowercase letter (a–z)", test: (p) => /[a-z]/.test(p) },
  { key: "digit", label: "A number (0–9)", test: (p) => /\d/.test(p) },
  { key: "symbol", label: "A symbol (e.g. ! @ # $ %)", test: (p) => /[^A-Za-z0-9]/.test(p) },
  { key: "noSpaces", label: "No leading or trailing spaces", test: (p) => p.length === 0 || p === p.trim() },
];

export const COMMON_WEAK = new Set([
  "password", "password1", "password123", "qwerty", "qwerty123",
  "12345678", "123456789", "1234567890", "letmein", "welcome",
  "admin", "iloveyou", "abc12345", "monkey", "dragon",
]);

export const evaluateStrength = (pw: string, passedCount: number) => {
  if (!pw) return { score: 0, label: "", color: "bg-fyn-ink-10" };
  if (COMMON_WEAK.has(pw.toLowerCase())) {
    return { score: 1, label: "Too common", color: "bg-fyn-red" };
  }
  let score = passedCount;
  if (pw.length >= 14) score += 1;
  if (pw.length >= 18) score += 1;
  if (score <= 2) return { score: 1, label: "Weak", color: "bg-fyn-red" };
  if (score <= 4) return { score: 2, label: "Fair", color: "bg-fyn-gold" };
  if (score <= 6) return { score: 3, label: "Strong", color: "bg-fyn-success" };
  return { score: 4, label: "Excellent", color: "bg-fyn-success" };
};
