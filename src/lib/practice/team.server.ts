/**
 * Team and integrations for the practice Settings screen.
 *
 * Invites are pending ca_firm_members rows keyed by email. When the invited
 * person signs in (or signs up) with that email, they join the firm instead of
 * creating a new one.
 */
import { PracticeError } from "./core";
import { logActivity, type Db, type FirmContext } from "./db.server";
import { isEmail, sendEmail } from "./email.server";

export const TEAM_ROLES = [
  "partner",
  "manager",
  "senior",
  "junior",
  "staff",
] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

const canManageTeam = (ctx: FirmContext) =>
  ctx.role === "owner" || ctx.role === "admin" || ctx.role === "partner";

async function emailOf(db: Db, userId: string): Promise<string | null> {
  const { data } = await db.auth.admin.getUserById(userId);
  return data?.user?.email?.toLowerCase() ?? null;
}

export async function listTeam(db: Db, ctx: FirmContext) {
  const { data } = await db
    .from("ca_firm_members")
    .select("id, user_id, invited_email, role, status, created_at")
    .eq("ca_firm_id", ctx.firmId)
    .neq("status", "revoked")
    .order("created_at");
  const members = await Promise.all(
    (data ?? []).map(async (m) => {
      let name: string | null = null;
      let email: string | null = m.invited_email || null;
      if (m.user_id) {
        const { data: u } = await db.auth.admin.getUserById(m.user_id);
        name =
          (u?.user?.user_metadata as { full_name?: string } | undefined)
            ?.full_name ?? null;
        email = u?.user?.email ?? email;
      }
      return {
        id: m.id,
        name,
        email,
        role: m.role,
        status: m.status,
        isYou: m.user_id === ctx.userId,
      };
    }),
  );
  return { members, canManage: canManageTeam(ctx), roles: TEAM_ROLES };
}

export async function inviteMember(
  db: Db,
  ctx: FirmContext,
  rawEmail: string,
  role: TeamRole,
  appOrigin: string | null,
) {
  if (!canManageTeam(ctx))
    throw new PracticeError("forbidden", "Only a partner can invite people.");
  const email = rawEmail.trim().toLowerCase();
  if (!isEmail(email))
    throw new PracticeError("invalid", "Enter a valid email address.");
  const { data: existing } = await db
    .from("ca_firm_members")
    .select("id, status")
    .eq("ca_firm_id", ctx.firmId)
    .ilike("invited_email", email)
    .neq("status", "revoked")
    .maybeSingle();
  if (existing)
    throw new PracticeError(
      "conflict",
      existing.status === "active"
        ? "That person is already in your team."
        : "An invite is already pending for that email.",
    );
  const { error } = await db.from("ca_firm_members").insert({
    ca_firm_id: ctx.firmId,
    invited_email: email,
    role,
    status: "pending",
    is_active: false,
  });
  if (error) throw new PracticeError("db_error", error.message);

  const link = `${appOrigin ?? process.env["PUBLIC_APP_URL"] ?? "https://fynhelp.com"}/v2/onboarding`;
  const text = `You have been invited to join ${ctx.firmName} on FynHelp as ${role}.\n\nCreate your account with this email address (${email}) here:\n${link}\n\nYou will join the practice automatically.`;
  const sent = await sendEmail({
    to: email,
    subject: `${ctx.firmName} invited you to FynHelp`,
    text,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">${text
      .split("\n\n")
      .map(
        (p) =>
          `<p>${p.replace(/\n/g, "<br>").replace(link, `<a href="${link}">${link}</a>`)}</p>`,
      )
      .join("")}</div>`,
    replyTo: ctx.firmEmail,
    fromName: ctx.firmName,
  });
  await logActivity(
    db,
    ctx.firmId,
    null,
    "system",
    `${email} invited as ${role}.`,
  );
  return {
    ok: true,
    emailed: sent.sent,
    simulated: sent.simulated,
    link,
    error: sent.error,
  };
}

export async function revokeMember(db: Db, ctx: FirmContext, memberId: string) {
  if (!canManageTeam(ctx))
    throw new PracticeError("forbidden", "Only a partner can remove people.");
  const { data: m } = await db
    .from("ca_firm_members")
    .select("id, user_id")
    .eq("id", memberId)
    .eq("ca_firm_id", ctx.firmId)
    .maybeSingle();
  if (!m) throw new PracticeError("not_found", "Team member not found.");
  if (m.user_id === ctx.userId)
    throw new PracticeError("invalid", "You cannot remove yourself.");
  const { data: firm } = await db
    .from("ca_firms")
    .select("user_id")
    .eq("id", ctx.firmId)
    .maybeSingle();
  if (firm?.user_id && firm.user_id === m.user_id)
    throw new PracticeError("invalid", "The practice owner cannot be removed.");
  await db
    .from("ca_firm_members")
    .update({ status: "revoked", is_active: false })
    .eq("id", memberId);
  return { ok: true };
}

/** Joins the signed-in user to a firm that invited their email. Returns the firm id, or null. */
export async function acceptPendingInvite(
  db: Db,
  userId: string,
): Promise<string | null> {
  const email = await emailOf(db, userId);
  if (!email) return null;
  const { data: invite } = await db
    .from("ca_firm_members")
    .select("id, ca_firm_id")
    .ilike("invited_email", email)
    .eq("status", "pending")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!invite) return null;
  const { error } = await db
    .from("ca_firm_members")
    .update({ user_id: userId, status: "active", is_active: true })
    .eq("id", invite.id);
  if (error) return null;
  await logActivity(
    db,
    invite.ca_firm_id,
    null,
    "system",
    `${email} accepted the invite and joined the practice.`,
  );
  return invite.ca_firm_id;
}

/** Gmail and WhatsApp connection state for Settings (no tokens leave the server). */
export async function integrationStatus(db: Db, ctx: FirmContext) {
  const { data: gmail } = await db
    .from("ca_gmail_connections")
    .select(
      "id, gmail_address, is_active, last_polled_at, error_message, created_at",
    )
    .eq("ca_firm_id", ctx.firmId)
    .order("created_at", { ascending: false });
  const { data: wa } = await db
    .from("ca_whatsapp_channels")
    .select("phone_number_id, display_phone, is_active, last_message_at")
    .eq("ca_firm_id", ctx.firmId);
  const env = (k: string) => Boolean(process.env[k]?.trim());
  return {
    gmail: {
      available:
        (env("GMAIL_CLIENT_ID") || env("GOOGLE_OAUTH_CLIENT_ID")) &&
        (env("GMAIL_CLIENT_SECRET") || env("GOOGLE_OAUTH_CLIENT_SECRET")),
      connections: gmail ?? [],
    },
    whatsapp: {
      available: env("WHATSAPP_ACCESS_TOKEN") && env("WHATSAPP_APP_SECRET"),
      channels: wa ?? [],
    },
    email: { available: env("RESEND_API_KEY") },
  };
}
