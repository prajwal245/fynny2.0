#!/usr/bin/env node
/**
 * Creates (or resets) a tester account: a sign-in plus a firm flagged as a test firm.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-tester.mjs tester1@fynhelp.com ["Firm name"]
 *   ... node scripts/create-tester.mjs --list
 *   ... node scripts/create-tester.mjs tester1@fynhelp.com --reset-password
 *
 * Only the platform (the service role key) can make a test firm; the app cannot. A tester is never part of a
 * real firm, and a test firm never appears in reports, billing runs or emails to real people.
 * The password is printed once. It is not stored anywhere else, so pass it to the tester over a private channel.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(2);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const [email, firmName] = args.filter((a) => !a.startsWith("--"));

const newPassword = () => `Fyn-${randomBytes(9).toString("base64url")}-${Math.floor(10 + Math.random() * 89)}`;

if (flags.has("--list")) {
  const { data, error } = await db.from("ca_firms").select("id, firm_name, email, created_at").eq("is_test", true).order("created_at");
  if (error) throw error;
  for (const f of data ?? []) console.log(`${f.email ?? "-"}\t${f.firm_name}\t${f.id}`);
  console.log(`${(data ?? []).length} test firm(s)`);
  process.exit(0);
}

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: node scripts/create-tester.mjs tester@fynhelp.com [\"Firm name\"] [--reset-password] | --list");
  process.exit(2);
}
if (!email.toLowerCase().endsWith("@fynhelp.com") && !flags.has("--allow-other-domain")) {
  console.error("Testers should use a @fynhelp.com address, so test emails can reach them. Add --allow-other-domain to override.");
  process.exit(2);
}

const lower = email.toLowerCase();
const { data: list, error: listErr } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listErr) throw listErr;
let user = list.users.find((u) => (u.email ?? "").toLowerCase() === lower);
const password = newPassword();

if (user) {
  const { data: owns } = await db.from("ca_firms").select("id, is_test").eq("user_id", user.id);
  if ((owns ?? []).some((f) => !f.is_test)) {
    console.error(`${lower} already owns a real firm. Use a different address: a tester can never be part of a real firm.`);
    process.exit(1);
  }
  if (flags.has("--reset-password") || !(owns ?? []).length) {
    const { error } = await db.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (error) throw error;
  } else {
    console.log(`${lower} is already a tester. Add --reset-password to issue a new password.`);
    process.exit(0);
  }
} else {
  const { data, error } = await db.auth.admin.createUser({ email: lower, password, email_confirm: true, user_metadata: { full_name: "FynHelp Tester" } });
  if (error) throw error;
  user = data.user;
}

const { data: existing } = await db.from("ca_firms").select("id").eq("user_id", user.id).eq("is_test", true).maybeSingle();
if (!existing) {
  const { error } = await db.from("ca_firms").insert({ user_id: user.id, firm_name: firmName || `Test Firm (${lower.split("@")[0]})`, email: lower, is_test: true });
  if (error) throw error;
}

console.log("\nTester account ready\n--------------------");
console.log(`Sign in at : ${process.env.PUBLIC_APP_URL || "https://fynhelp.com"}/login`);
console.log(`Email      : ${lower}`);
console.log(`Password   : ${password}`);
console.log("Firm       : test firm (sandbox). Nothing here is billed, reported or sent to real people.");
