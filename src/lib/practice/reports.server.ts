/**
 * Problem reports, server side: store what a firm reports with the page it was on, tell the team by email, and let the firm see
 * what happened to what it reported. If the table is not in the database yet the report still reaches the team by email.
 */
import type { Db, FirmContext } from "./db.server";
import { PracticeError } from "./core";
import { sendEmail } from "./email.server";
import { CATEGORY_LABEL, checkReport, overDailyLimit, STATUS_LABEL, type ReportInput, type ReportStatus } from "./reportRules";
import { isTestFirm } from "./testMode.server";

/** Who is told about every report: the shared support inbox and the founder. */
export const REPORT_RECIPIENTS = ["support@fynhelp.com", "prajwal@fynhelp.com"] as const;
const missingTable = (m: string | undefined) => /does not exist|schema cache|relation .* not found|42P01/i.test(m ?? "");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function submitReport(db: Db, ctx: FirmContext, input: ReportInput, email: string | null, context: Record<string, unknown>) {
  const checked = checkReport(input);
  if (!checked.ok) throw new PracticeError("invalid", checked.problem);
  const r = checked.report;
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db.from("ca_problem_reports").select("id", { count: "exact", head: true }).eq("ca_firm_id", ctx.firmId).gte("created_at", since);
  if (overDailyLimit(count ?? 0)) throw new PracticeError("limit", "You have sent several reports today. We are working through them; please add to an existing one by email at support@fynhelp.com.");
  const test = await isTestFirm(db, ctx.firmId).catch(() => false);
  const row = {
    ca_firm_id: ctx.firmId,
    user_id: ctx.userId,
    user_email: email,
    firm_name: ctx.firmName,
    is_test: test,
    category: r.category,
    summary: r.summary,
    what_happened: r.whatHappened || null,
    expected: r.expected || null,
    document_id: r.documentId,
    document_name: r.documentName || null,
    page: r.page || null,
    context,
  };
  const { data, error } = await db.from("ca_problem_reports").insert(row).select("id").maybeSingle();
  const stored = !error && Boolean(data?.id);
  if (error && !missingTable(error.message)) throw new PracticeError("db_error", "Could not save your report. Please try again, or email support@fynhelp.com.");

  const importance = String(context["importance"] ?? "").toLowerCase();
  const lines = [
    `${ctx.firmName}${test ? " (test firm)" : ""} · ${email ?? "no email"}`,
    `${CATEGORY_LABEL[r.category]}`,
    `Importance: ${importance || "medium"} · Page: ${r.page || "unknown"}${r.documentName ? ` · File: ${r.documentName}` : ""}`,
    "",
    r.summary,
    r.whatHappened ? `\nWhat happened:\n${r.whatHappened}` : "",
    r.expected ? `\nWhat was expected:\n${r.expected}` : "",
    `\nDetails: ${JSON.stringify(context).slice(0, 1500)}`,
  ].filter((x) => x !== "");
  const tag = importance === "high" ? "[High] " : importance === "low" ? "[Low] " : "";
  const subject = `${tag}Problem report: ${r.summary}`.slice(0, 150);
  const html = `<pre style="font:13px/1.55 system-ui,sans-serif;white-space:pre-wrap">${esc(lines.join("\n"))}</pre>`;
  // One email to each recipient, so a failure for one never hides the report from the other.
  const results = await Promise.all(
    REPORT_RECIPIENTS.map((to) => sendEmail({ to, subject, text: lines.join("\n"), html, replyTo: email }).catch(() => ({ sent: false, simulated: false }))),
  );
  const mail = { sent: results.some((m) => m.sent), simulated: results.some((m) => (m as { simulated?: boolean }).simulated) };
  // Neither stored nor mailed: say so, instead of pretending it arrived.
  if (!stored && !mail.sent && !(mail as { simulated?: boolean }).simulated)
    throw new PracticeError("not_sent", "We could not send your report just now. Please email it to support@fynhelp.com.");
  return { id: (data?.id as string | undefined) ?? null, stored };
}

export async function myReports(db: Db, ctx: FirmContext) {
  const { data, error } = await db
    .from("ca_problem_reports")
    .select("id, category, summary, status, admin_note, created_at, resolved_at")
    .eq("ca_firm_id", ctx.firmId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: String(r.id),
    category: String(r.category),
    summary: String(r.summary),
    status: (String(r.status) as ReportStatus) ?? "new",
    statusLabel: STATUS_LABEL[String(r.status) as ReportStatus] ?? "Received",
    note: (r.admin_note as string | null) ?? null,
    at: String(r.created_at),
  }));
}
