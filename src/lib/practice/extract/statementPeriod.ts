/**
 * The period a bank statement says it covers, from its own header ("Statement From 01-Apr-2025 To 31-Mar-2026"). The lines of a
 * statement can start months after its period does (an account with no entries in April to June), so "which months are covered" is read
 * from this, and the lines are only the fallback.
 */
const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const D = String.raw`(\d{1,2})[\s\-/.](?:([A-Za-z]{3,9})|(\d{1,2}))[\s\-/.,]+(\d{2,4})`;

function iso(day: string, name: string | undefined, num: string | undefined, year: string): string | null {
  let m = -1;
  if (name) m = MON.indexOf(name.slice(0, 3).toLowerCase());
  else if (num) m = Number(num) - 1;
  const d = Number(day);
  let y = Number(year);
  if (y < 100) y += 2000;
  if (m < 0 || m > 11 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const RANGES: RegExp[] = [
  // "Statement From : 01-Apr-2025 To : 31-Mar-2026", with anything (a line break, a page header) between the two dates
  new RegExp(String.raw`statement\s+(?:period\s*)?from\s*[:\-]?\s*${D}[\s\S]{0,80}?\bto\s*[:\-]?\s*${D}`, "i"),
  new RegExp(String.raw`(?:statement\s+)?period\s*[:\-]?\s*(?:from\s*)?${D}\s*(?:to|-|–)\s*${D}`, "i"),
  new RegExp(String.raw`\bfrom\s*[:\-]?\s*${D}\s*to\s*[:\-]?\s*${D}`, "i"),
];

export function statedPeriod(text: string): { from: string; to: string } | null {
  const head = text.slice(0, 8000);
  for (const re of RANGES) {
    const m = re.exec(head);
    if (!m) continue;
    const from = iso(m[1]!, m[2], m[3], m[4]!);
    const to = iso(m[5]!, m[6], m[7], m[8]!);
    if (from && to && from <= to && Date.parse(to) - Date.parse(from) < 800 * 86_400_000) return { from, to };
  }
  return null;
}
