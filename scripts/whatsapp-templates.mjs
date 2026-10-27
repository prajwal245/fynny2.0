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
  const res = await fetch(`${GRAPH}/${WABA}/message_templates?fields=name,status,language,category&limit=200`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const body = await res.json();
  if (!res.ok) throw new Error(`Meta said: ${body.error?.message ?? res.status}`);
  const have = new Map();
  for (const t of body.data ?? []) have.set(t.name, `${t.status}, ${String(t.category).toLowerCase()}, ${t.language}`);

  console.log("\nOn your account now:");
  for (const [n, s] of have) console.log(`  ${n.padEnd(26)} ${s}`);
  const missing = TEMPLATES.filter((t) => !have.has(t.name));
  console.log("\nThe app needs:");
  for (const t of TEMPLATES) console.log(`  ${t.name.padEnd(26)} ${have.has(t.name) ? `already there (${have.get(t.name)})` : "MISSING"}`);
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
