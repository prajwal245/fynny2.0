/**
 * Who is handling each exception, where it stands, and the history of it.
 *
 * Every change writes an append-only event naming who did it and when. The status here (open, query sent, answered, resolved,
 * accepted as timing) is the TEAM's handling status; whether the line itself is matched stays the reconciliation's own
 * status and is changed only by resolving or ignoring it. Nothing is deleted. Until the database change is applied each call says so
 * plainly instead of failing half way.
 */
import { logActivity, type Db, type FirmContext } from "./db.server";
import { PracticeError } from "./core";
import { WORK_LABEL, isExplained, nextStatuses, type WorkStatus } from "./exceptionKinds";

const SENIOR = new Set(["owner", "admin", "partner", "manager"]);
const MISSING = "The team-work tables are not set up yet. Run supabase/apply_nov_2026.sql in the Supabase SQL Editor.";

let readyUntil = 0;
/** For tests: forget that the tables were found. */
export const resetReadyCache = () => {
  readyUntil = 0;
};
async function assertReady(db: Db): Promise<void> {
  if (Date.now() < readyUntil) return;
  const a = await db.from("ca_exception_events").select("id", { head: true, count: "exact" }).limit(1);
  const b = await db.from("ca_exceptions").select("work_status").limit(1);
  if (a.error || b.error) throw new PracticeError("not_ready", MISSING);
  readyUntil = Date.now() + 60_000;
}

export interface Member {
  userId: string;
  name: string;
  role: string;
  isYou: boolean;
}

/** The people exceptions can be given to: the firm's active members. */
export async function assignableMembers(db: Db, ctx: FirmContext): Promise<Member[]> {
  const { data } = await db.from("ca_firm_members").select("user_id, role, status, invited_email").eq("ca_firm_id", ctx.firmId).eq("status", "active");
  const rows = (data ?? []).filter((m) => m.user_id) as { user_id: string; role: string; invited_email: string | null }[];
  const seen = new Set<string>();
  const out: Member[] = [];
  for (const m of rows) {
    if (seen.has(m.user_id)) continue;
    seen.add(m.user_id);
    out.push({ userId: m.user_id, name: await displayName(db, m.user_id, m.invited_email), role: m.role, isYou: m.user_id === ctx.userId });
  }
  if (!seen.has(ctx.userId)) out.push({ userId: ctx.userId, name: await displayName(db, ctx.userId, null), role: ctx.role, isYou: true });
  return out.sort((a, b) => Number(b.isYou) - Number(a.isYou) || a.name.localeCompare(b.name));
}

async function displayName(db: Db, userId: string, fallback: string | null): Promise<string> {
  try {
    const { data } = await db.auth.admin.getUserById(userId);
    const meta = data?.user?.user_metadata as { full_name?: string } | undefined;
    return meta?.full_name?.trim() || data?.user?.email?.split("@")[0] || fallback?.split("@")[0] || "A team member";
  } catch {
    return fallback?.split("@")[0] || "A team member";
  }
}

interface ExcRow {
  id: string;
  ca_firm_id: string;
  business_id: string | null;
  owner_id: string | null;
  work_status: WorkStatus;
  review_state: string;
  reviewer_id: string | null;
  status: string;
  remark: string | null;
  due_date: string | null;
}

async function load(db: Db, ctx: FirmContext, ids: string[]): Promise<ExcRow[]> {
  const { data } = await db
    .from("ca_exceptions")
    .select("id, ca_firm_id, business_id, owner_id, work_status, review_state, reviewer_id, status, remark, due_date")
    .eq("ca_firm_id", ctx.firmId)
    .in("id", ids);
  const rows = (data ?? []) as ExcRow[];
  if (rows.length !== new Set(ids).size) throw new PracticeError("not_found", "One of those exceptions was not found.");
  return rows;
}

async function event(
  db: Db,
  ctx: FirmContext,
  actor: string,
  e: ExcRow,
  type: string,
  o: { from?: string | null; to?: string | null; note?: string | null; meta?: Record<string, unknown> } = {},
) {
  const { error } = await db.from("ca_exception_events").insert({
    ca_firm_id: ctx.firmId,
    business_id: e.business_id,
    exception_id: e.id,
    actor_id: ctx.userId,
    actor_name: actor,
    event_type: type,
    from_value: o.from ?? null,
    to_value: o.to ?? null,
    note: o.note?.trim().slice(0, 500) || null,
    meta: o.meta ?? {},
  });
  if (error) throw new PracticeError("db_error", error.message);
  // What people did sits in the client's Activity beside what the agents did. A remark or a due date is housekeeping, not activity.
  const said: Record<string, string> = {
    assigned: `assigned an exception to ${o.to ?? "a teammate"}`,
    handover: `handed an exception from ${o.from ?? "someone"} to ${o.to ?? "a teammate"}`,
    status: `moved an exception from "${o.from}" to "${o.to}"`,
    review_sent: `sent an exception to ${o.to ?? "a senior"} for review`,
    review_returned: `returned an exception to ${o.to ?? "its owner"}`,
    review_approved: "approved an exception's handling",
    resolved: "resolved an exception",
    ignored: "set an exception aside",
    reopened: "reopened an exception",
  };
  if (said[type]) await logActivity(db, ctx.firmId, e.business_id, "team", `${actor} ${said[type]}${o.note?.trim() ? `: ${o.note.trim().slice(0, 200)}` : ""}.`.slice(0, 1900)).catch(() => undefined);
}

const touch = (ctx: FirmContext) => ({ updated_by: ctx.userId, updated_at: new Date().toISOString() });

/** Give exceptions to a team member (or take the owner off with null). Up to 200 at once; each gets its own history entry. */
export async function assignExceptions(db: Db, ctx: FirmContext, ids: string[], ownerId: string | null, note?: string) {
  await assertReady(db);
  if (!ids.length || ids.length > 200) throw new PracticeError("invalid", "Choose between 1 and 200 exceptions.");
  const members = await assignableMembers(db, ctx);
  const target = ownerId ? members.find((m) => m.userId === ownerId) : null;
  if (ownerId && !target) throw new PracticeError("invalid", "That person is not an active member of this firm.");
  const rows = await load(db, ctx, ids);
  const actor = members.find((m) => m.isYou)?.name ?? "A team member";
  const nameOf = (id: string | null) => (id ? (members.find((m) => m.userId === id)?.name ?? "a former member") : "nobody");
  let changed = 0;
  for (const e of rows) {
    if ((e.owner_id ?? null) === (ownerId ?? null)) continue;
    const { error } = await db.from("ca_exceptions").update({ owner_id: ownerId, ...touch(ctx) }).eq("id", e.id).eq("ca_firm_id", ctx.firmId);
    if (error) throw new PracticeError("db_error", error.message);
    await event(db, ctx, actor, e, e.owner_id ? "handover" : "assigned", { from: nameOf(e.owner_id), to: nameOf(ownerId), note });
    changed++;
  }
  return { changed };
}

/** Move an exception along its handling status. "Resolved" is reached by resolving the line, not from here. */
export async function setWorkStatus(db: Db, ctx: FirmContext, id: string, to: WorkStatus, note?: string) {
  await assertReady(db);
  const [e] = await load(db, ctx, [id]);
  if (!e) throw new PracticeError("not_found", "Exception not found.");
  const from: WorkStatus = e.work_status ?? "open";
  if (from === to) return { status: to };
  if (!nextStatuses(from).includes(to)) throw new PracticeError("invalid", `It cannot go from "${WORK_LABEL[from]}" to "${WORK_LABEL[to]}" from here.`);
  if (to === "accepted_timing" && !note?.trim()) throw new PracticeError("invalid", "Say why this is only a timing difference, so the next person can see it.");
  const members = await assignableMembers(db, ctx);
  const actor = members.find((m) => m.isYou)?.name ?? "A team member";
  const { error } = await db.from("ca_exceptions").update({ work_status: to, ...touch(ctx) }).eq("id", id).eq("ca_firm_id", ctx.firmId);
  if (error) throw new PracticeError("db_error", error.message);
  await event(db, ctx, actor, e, "status", { from: WORK_LABEL[from], to: WORK_LABEL[to], note });
  return { status: to };
}

/** The internal remark and the target date. Each change is its own history entry. */
export async function setRemarkAndDue(db: Db, ctx: FirmContext, id: string, patch: { remark?: string; dueDate?: string | null }) {
  await assertReady(db);
  const [e] = await load(db, ctx, [id]);
  if (!e) throw new PracticeError("not_found", "Exception not found.");
  const actor = (await assignableMembers(db, ctx)).find((m) => m.isYou)?.name ?? "A team member";
  const update: Record<string, unknown> = { ...touch(ctx) };
  if (patch.remark !== undefined && patch.remark.trim() !== (e.remark ?? "")) {
    update["remark"] = patch.remark.trim().slice(0, 1000) || null;
    await event(db, ctx, actor, e, "remark", { from: e.remark, to: patch.remark.trim().slice(0, 500) });
  }
  if (patch.dueDate !== undefined && (patch.dueDate ?? null) !== (e.due_date ?? null)) {
    if (patch.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate)) throw new PracticeError("invalid", "The date is not valid.");
    update["due_date"] = patch.dueDate;
    await event(db, ctx, actor, e, "due", { from: e.due_date, to: patch.dueDate });
  }
  if (Object.keys(update).length === 1) return { changed: false };
  const { error } = await db.from("ca_exceptions").update(update).eq("id", id).eq("ca_firm_id", ctx.firmId);
  if (error) throw new PracticeError("db_error", error.message);
  return { changed: true };
}

/** Senior review: send to a senior, who approves it or returns it to the junior with a note. */
export async function reviewAction(db: Db, ctx: FirmContext, id: string, action: "send" | "return" | "approve", o: { reviewerId?: string; note?: string }) {
  await assertReady(db);
  const [e] = await load(db, ctx, [id]);
  if (!e) throw new PracticeError("not_found", "Exception not found.");
  const members = await assignableMembers(db, ctx);
  const actor = members.find((m) => m.isYou)?.name ?? "A team member";
  const nameOf = (uid: string | null) => (uid ? (members.find((m) => m.userId === uid)?.name ?? "a former member") : "nobody");
  if (action === "send") {
    const reviewer = o.reviewerId ? members.find((m) => m.userId === o.reviewerId) : null;
    if (!reviewer || !SENIOR.has(reviewer.role)) throw new PracticeError("invalid", "Choose a partner or manager to review it.");
    const { error } = await db.from("ca_exceptions").update({ review_state: "with_senior", reviewer_id: reviewer.userId, ...touch(ctx) }).eq("id", id).eq("ca_firm_id", ctx.firmId);
    if (error) throw new PracticeError("db_error", error.message);
    await event(db, ctx, actor, e, "review_sent", { to: reviewer.name, note: o.note });
    return { reviewState: "with_senior" as const };
  }
  if (!SENIOR.has(ctx.role)) throw new PracticeError("forbidden", "Only a partner or manager can approve or return a review.");
  if (e.review_state !== "with_senior") throw new PracticeError("invalid", "This exception is not waiting for review.");
  if (action === "return") {
    if (!o.note?.trim()) throw new PracticeError("invalid", "Say what needs to change, so the junior knows what to do.");
    const { error } = await db.from("ca_exceptions").update({ review_state: "returned", ...touch(ctx) }).eq("id", id).eq("ca_firm_id", ctx.firmId);
    if (error) throw new PracticeError("db_error", error.message);
    await event(db, ctx, actor, e, "review_returned", { to: nameOf(e.owner_id), note: o.note });
    return { reviewState: "returned" as const };
  }
  const { error } = await db.from("ca_exceptions").update({ review_state: "none", reviewer_id: null, ...touch(ctx) }).eq("id", id).eq("ca_firm_id", ctx.firmId);
  if (error) throw new PracticeError("db_error", error.message);
  await event(db, ctx, actor, e, "review_approved", { note: o.note });
  return { reviewState: "none" as const };
}

export interface TimelineEvent {
  id: string;
  type: string;
  at: string;
  by: string;
  from: string | null;
  to: string | null;
  note: string | null;
}

/** The whole history of one exception, oldest first. */
export async function exceptionTimeline(db: Db, ctx: FirmContext, id: string): Promise<TimelineEvent[]> {
  const { data, error } = await db
    .from("ca_exception_events")
    .select("id, event_type, created_at, actor_name, from_value, to_value, note")
    .eq("ca_firm_id", ctx.firmId)
    .eq("exception_id", id)
    .order("created_at", { ascending: true })
    .limit(200);
  // A failed read must not look like an empty history: say so, and keep the reason in the server log.
  if (error) {
    console.error(`[exceptions] history could not be read for ${id}: ${error.message}`);
    throw new PracticeError("db_error", "The history could not be loaded just now.");
  }
  return (data ?? []).map((r) => ({ id: r.id, type: r.event_type, at: r.created_at, by: r.actor_name ?? "FynHelp", from: r.from_value, to: r.to_value, note: r.note }));
}

/**
 * Called after an exception is resolved or ignored, or reopened, so the handling status follows the line.
 * Best effort: if the team-work columns are not there yet, resolving still works.
 */
export async function followResolution(db: Db, ctx: FirmContext, id: string, state: "resolved" | "ignored" | "reopened", note?: string) {
  try {
    await assertReady(db);
    const [e] = await load(db, ctx, [id]);
    if (!e) return;
    const to: WorkStatus = state === "reopened" ? "open" : "resolved";
    const actor = (await assignableMembers(db, ctx)).find((m) => m.isYou)?.name ?? "A team member";
    // Resolving also ends any review in progress.
    await db.from("ca_exceptions").update({ work_status: to, ...(state === "reopened" ? {} : { review_state: "none", reviewer_id: null }), ...touch(ctx) }).eq("id", id).eq("ca_firm_id", ctx.firmId);
    await event(db, ctx, actor, e, state === "reopened" ? "reopened" : state === "ignored" ? "ignored" : "resolved", { from: WORK_LABEL[e.work_status], to: WORK_LABEL[to], note });
  } catch {
    // The line was resolved; only the history entry is missing.
  }
}

export { isExplained };
