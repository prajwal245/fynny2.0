/**
 * Sends a lead (sign-up) to the team's Google Sheet through an Apps Script web app (see docs/ATTRIBUTION_SETUP.md).
 * LEAD_SHEET_WEBHOOK_URL: the web app address (https). LEAD_SHEET_SECRET: a shared value the script checks.
 * Best effort and quick: it never throws and never holds a sign-up up for more than a few seconds.
 */
export async function pushLeadToSheet(row: Record<string, string | number | boolean>): Promise<boolean> {
  const url = (process.env["LEAD_SHEET_WEBHOOK_URL"] ?? "").trim();
  if (!/^https:\/\//i.test(url)) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: process.env["LEAD_SHEET_SECRET"] ?? "", ts: new Date().toISOString(), ...row }),
      signal: AbortSignal.timeout(4000),
      redirect: "follow",
    });
    return res.ok;
  } catch (e) {
    console.error(`[lead-sheet] ${(e as Error).message}`);
    return false;
  }
}
