#!/usr/bin/env node
/**
 * Checks that the document-reading model answers, with the same settings the app uses.
 *
 *   GEMINI_API_KEY=... [GEMINI_MODEL=gemini-flash-latest] node scripts/check-ai.mjs
 *
 * It sends a three-line bank statement and expects the three rows back as JSON, then prints the model, the time and the tokens. It
 * costs a fraction of a paisa. Run it with the key from the production environment before relying on the AI reader.
 */
const key = (process.env.GEMINI_API_KEY ?? "").trim();
const model = (process.env.GEMINI_MODEL ?? "gemini-flash-latest").trim();
if (!key) {
  console.error("GEMINI_API_KEY is not set. Set it to the key in the production environment and run again.");
  process.exit(2);
}
const text = `Date Description Debit Credit Balance
01-04-2025 OPENING 0.00
05-04-2025 NEFT CR SHARMA STEELS 50,000.00 50,000.00
09-04-2025 CHQ 004512 PAID TO RAVI TRADERS 12,500.00 37,500.00`;
const started = Date.now();
const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
  body: JSON.stringify({
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: 'Return JSON {"rows":[{"date":"YYYY-MM-DD","description":string,"debit":number,"credit":number,"balance":number}]} with one row per transaction line. Skip the opening line.' },
      { role: "user", content: text },
    ],
  }),
});
const ms = Date.now() - started;
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`The model answered ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  process.exit(1);
}
let rows = [];
try { rows = JSON.parse(body.choices?.[0]?.message?.content ?? "{}").rows ?? []; } catch { /* reported below */ }
const u = body.usage ?? {};
console.log(`model ${body.model ?? model} answered in ${ms} ms; prompt ${u.prompt_tokens ?? "?"}, total ${u.total_tokens ?? "?"} tokens`);
const ok = rows.length === 2 && Number(rows[0]?.credit) === 50000 && Number(rows[1]?.debit) === 12500;
console.log(ok ? "OK: both transactions were read correctly." : `NOT OK: expected 2 rows (50,000 credit, 12,500 debit), got ${JSON.stringify(rows)}`);
process.exit(ok ? 0 : 1);
