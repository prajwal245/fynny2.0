#!/usr/bin/env node
/**
 * Lists FynHelp's WhatsApp message templates on your WhatsApp Business Account, and creates the ones that are missing,
 * with the exact names the app looks for.
 *
 *   WHATSAPP_ACCESS_TOKEN=EAAB... node scripts/whatsapp-templates.mjs           # list, and show what would be created
 *   WHATSAPP_ACCESS_TOKEN=EAAB... node scripts/whatsapp-templates.mjs --apply   # create the missing ones
 *
 * The account id defaults to FynHelp's (1142917261543611); set WHATSAPP_WABA_ID to use another. A template that already
 * exists under a name (in any status) is never touched: Meta locks a name for about 30 days after deletion.
 * Without a token it only prints what it would send, and makes no network call.
 */
const WABA = (process.env.WHATSAPP_WABA_ID ?? "1142917261543611").replace(/\D/g, "");
const TOKEN = (process.env.WHATSAPP_ACCESS_TOKEN ?? "").trim();
const GRAPH = process.env.WHATSAPP_GRAPH_BASE || "https://graph.facebook.com/v21.0";
const APPLY = process.argv.includes("--apply");

const CHASE_EXAMPLE = ["Asha", "Acme Traders", "Bank statement (Sep 2026)", "Rao & Co"];
const chaseButtons = [
  { type: "URL", text: "Upload documents", url: "https://fynhelp.com/u/{{1}}", example: ["Xk3p9QmZ7aT2vL8wN4rB6yHd1cEfGj0s"] },
  { type: "QUICK_REPLY", text: "Sending today" },
  { type: "QUICK_REPLY", text: "Need more time" },
  { type: "QUICK_REPLY", text: "Stop reminders" },
];
const followButtons = [
  { type: "URL", text: "Open FynHelp", url: "https://fynhelp.com/app" },
  { type: "QUICK_REPLY", text: "Call me" },
  { type: "QUICK_REPLY", text: "Not now" },
  { type: "QUICK_REPLY", text: "Stop messages" },
];

const tpl = (name, text, example, buttons) => ({
  name,
  language: "en",
  category: "UTILITY",
  components: [{ type: "BODY", text, example: { body_text: [example] } }, { type: "BUTTONS", buttons }],
});

/** Every template the app uses. The first three are for chasing a firm's clients, the rest are FynHelp's own follow-ups. */
export const TEMPLATES = [
  tpl("document_request_v2", "Hello {{1}}, this is {{4}}. For {{2}} we are still waiting for: {{3}}. Please reply here with the file attached. Thank you.", CHASE_EXAMPLE, chaseButtons),
  tpl("document_followup_v2", "Hello {{1}}, a gentle reminder from {{4}}. For {{2}} we are still waiting for: {{3}}. Please reply here with the file attached, or use the buttons below. Thank you.", CHASE_EXAMPLE, chaseButtons),
  tpl("document_final_v2", "Hello {{1}}, this is {{4}} with a final reminder. For {{2}} we still need: {{3}}. Please send it here, or tell us when you can, so we can complete the work on time. Thank you.", CHASE_EXAMPLE, chaseButtons),
  tpl("fh_setup_help", "Hello {{1}}, this is the FynHelp team. You started setting up {{2}}. {{3}} If you would like a hand, tap a button below and a person will help.", ["Asha", "Rao & Co", "The next step is to add your first client, which takes about 2 minutes."], followButtons),
  tpl("fh_trial_update", "Hello {{1}}, a note from FynHelp about the trial for {{2}}: it {{3}}. Nothing you have done is lost. Would you like help choosing a plan or finishing a client?", ["Asha", "Rao & Co", "ends in 2 days"], followButtons),
  tpl("fh_plan_help", "Hello {{1}}, this is FynHelp about the plan for {{2}}. The payment {{3}}. Nothing is lost, and we can help you finish. Tap a button below.", ["Asha", "Rao & Co", "was not completed"], followButtons),
];

async function main() {
  console.log(`WhatsApp Business Account ${WABA}`);
  if (!TOKEN) {
    console.log("\nNo WHATSAPP_ACCESS_TOKEN set: showing what would be created. Nothing is sent.\n");
    for (const t of TEMPLATES) console.log(`- ${t.name}: ${t.components[0].text}`);
    return;
  }
  // 1. Is this the right account? The number FynHelp sends from must belong to it, or templates made here can never be sent.
  const get = async (path) => {
    const r = await fetch(`${GRAPH}/${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    return { ok: r.ok, body: await r.json().catch(() => ({})) };
  };
  const acct = await get(`${WABA}?fields=name`);
  if (!acct.ok) throw new Error(`This token cannot read account ${WABA}: ${acct.body.error?.message ?? "no access"}. Use a token for the account that owns your number, and check the account id (see docs/WHATSAPP_SETUP_STEPS.md).`);
  const nums = await get(`${WABA}/phone_numbers?fields=id,display_phone_number,verified_name`);
  console.log(`Account name: ${acct.body.name ?? "(none)"}`);
  console.log("Numbers on this account:");
  for (const n of nums.body.data ?? []) console.log(`  ${n.display_phone_number}  id ${n.id}  ${n.verified_name ?? ""}`);
  const sendFrom = (process.env.WHATSAPP_DEFAULT_PHONE_NUMBER_ID ?? "").replace(/\D/g, "");
  if (sendFrom) {
    const ok = (nums.body.data ?? []).some((n) => n.id === sendFrom);
    console.log(ok ? `\n✓ Your sending number (id ${sendFrom}) is on this account.` : `\n✗ Your sending number (id ${sendFrom}) is NOT on this account. These templates would belong to the wrong account. Find the account that owns the number and use its id.`);
    if (!ok) process.exit(2);
  } else {
    console.log("\n(Set WHATSAPP_DEFAULT_PHONE_NUMBER_ID to check that your sending number is on this account.)");
  }

  const res = await fetch(`${GRAPH}/${WABA}/message_templates?fields=name,status,language,category&limit=200`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const body = await res.json();
  if (!res.ok) throw new Error(`Meta said: ${body.error?.message ?? res.status}`);
  const have = new Map();
  for (const t of body.data ?? []) have.set(t.name, `${t.status}, ${String(t.category).toLowerCase()}, ${t.language}`);

  console.log("\nOn your account now:");
  for (const [n, s] of have) console.log(`  ${n.padEnd(26)} ${s}${/marketing/i.test(s) ? "   <- Marketing: FynHelp never uses it" : ""}`);
  const missing = TEMPLATES.filter((t) => !have.has(t.name));
  console.log("\nThe app needs:");
  for (const t of TEMPLATES) {
    const st = have.get(t.name);
    console.log(`  ${t.name.padEnd(26)} ${st ? `already there (${st})${/marketing/i.test(st) ? "  <- NOT Utility: reword and submit under a new name, e.g. " + t.name.replace(/_v\d+$/, "") + "_v3" : ""}` : "MISSING"}`);
  }
  if (!missing.length) return console.log("\nNothing to create.");
  if (!APPLY) return console.log(`\n${missing.length} to create. Run again with --apply to submit them.`);

  console.log("");
  for (const t of missing) {
    const r = await fetch(`${GRAPH}/${WABA}/message_templates`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(t) });
    const b = await r.json();
    console.log(r.ok ? `  submitted ${t.name}: ${b.status ?? "PENDING"} (id ${b.id})` : `  FAILED ${t.name}: ${b.error?.error_user_msg ?? b.error?.message ?? r.status}`);
  }
  console.log("\nApproval is usually minutes to a day. Open WhatsApp Manager to see the status.");
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
