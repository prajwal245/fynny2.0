/**
 * Reading and checking the Zoho settings. Pure, so each rule is tested on its own.
 *
 * Settings pasted into Vercel often carry a trailing newline, spaces or quotes. For an id or a secret that makes Zoho
 * answer "Invalid Client: Client ID passed does not exist" (the sign-in address then ends in %0A), so every Zoho
 * setting is cleaned when read, and the System Health page says when what was stored needed cleaning.
 */

export function cleanEnv(raw: string | undefined): string {
  return (raw ?? "").replace(/[​﻿]/g, "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
}

const ACCOUNTS = /^https:\/\/accounts\.zoho\.(com|in|eu|com\.au|jp|ca|com\.cn|sa|uk)$/;
const CLIENT_ID = /^1000\.[A-Za-z0-9]{20,48}$/;

/** True when the id has the shape of a Zoho client id. Anything else would only send a partner to Zoho's "Invalid Client" page. */
export const clientIdLooksValid = (id: string) => CLIENT_ID.test(id);

/** What is wrong with the Zoho settings, in plain words, or an empty list. */
export function zohoConfigProblems(env: Record<string, string | undefined>): string[] {
  const out: string[] = [];
  const raw = (k: string) => env[k];
  const val = (k: string) => cleanEnv(env[k]);
  const stray = (k: string) => raw(k) !== undefined && raw(k) !== val(k);

  if (!val("ZOHO_CLIENT_ID")) out.push("ZOHO_CLIENT_ID is not set");
  else {
    if (!CLIENT_ID.test(val("ZOHO_CLIENT_ID"))) out.push("ZOHO_CLIENT_ID does not look like a Zoho client id (it starts with 1000.)");
    if (stray("ZOHO_CLIENT_ID")) out.push("ZOHO_CLIENT_ID has a stray space, quote or line break in Vercel; FynHelp ignores it, but save the value again without it");
  }
  if (!val("ZOHO_CLIENT_SECRET")) out.push("ZOHO_CLIENT_SECRET is not set");
  else if (stray("ZOHO_CLIENT_SECRET")) out.push("ZOHO_CLIENT_SECRET has a stray space, quote or line break in Vercel; FynHelp ignores it, but save the value again without it");

  if (!env["GMAIL_ENCRYPTION_KEY"]) out.push("GMAIL_ENCRYPTION_KEY is not set (it also protects Zoho tokens)");

  const accounts = val("ZOHO_ACCOUNTS_URL").replace(/\/+$/, "");
  if (accounts && !ACCOUNTS.test(accounts)) out.push("ZOHO_ACCOUNTS_URL must be a Zoho sign-in address such as https://accounts.zoho.in");
  const redirect = val("ZOHO_REDIRECT_URI");
  if (redirect && !/^https:\/\/.+\/api\/integrations\/zoho\/callback$/.test(redirect)) out.push("ZOHO_REDIRECT_URI must end with /api/integrations/zoho/callback and be the address registered in the Zoho API Console");
  return out;
}
