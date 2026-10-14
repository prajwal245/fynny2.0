/**
 * Admin panel security, enforced on the server for every admin call:
 *
 *   1. Network: ADMIN_IP_ALLOWLIST (comma-separated IPs or CIDRs, IPv4 or IPv6).
 *      Unset means any network; set it in production.
 *   2. Identity: a valid Supabase access token for a user with an admin role.
 *   3. MFA: the token must be AAL2, i.e. a TOTP code was verified this session.
 *   4. Admin session: an HttpOnly, SameSite=Strict cookie naming a server-side
 *      admin session tied to this Supabase session, idle for at most 15 minutes.
 *   5. Permission: the role table in ./rbac.
 *
 * Password sign-in also runs here, so failed attempts are counted on the server
 * (5 failures in 15 minutes locks the account for 15 minutes). If the counter
 * cannot be read, sign-in is refused rather than allowed.
 */
import { getCookie, getRequest, getRequestIP, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { adminDb, type Db } from "../practice/db.server";
import { ipInList } from "./network";
import {
  can,
  IDLE_LIMIT_MS,
  isAdminRole,
  LOGIN_LOCK_MS,
  LOGIN_MAX_FAILURES,
  type AdminRole,
  type Permission,
} from "./rbac";

export const REAUTH = "ADMIN_REAUTH";
export const COOKIE = "fh_admin";

export class AdminDenied extends Error {
  constructor(public code: "ip_blocked" | "not_admin" | "mfa_required" | "session" | "forbidden" | "locked" | "bad_login", message: string) {
    // The prefix tells the admin app to send the person back to sign-in.
    super(code === "forbidden" || code === "bad_login" || code === "locked" ? message : `${REAUTH}: ${message}`);
  }
}

/* ── network ─────────────────────────────────────────────── */

export function clientIp(req: Request | undefined = getRequest()): string {
  const h = req?.headers;
  const first = (v: string | null | undefined) => (v ?? "").split(",")[0]?.trim() || "";
  const ip =
    first(h?.get("x-vercel-forwarded-for")) ||
    first(h?.get("x-real-ip")) ||
    first(h?.get("x-forwarded-for")) ||
    (() => {
      try {
        return getRequestIP() ?? "";
      } catch {
        return "";
      }
    })();
  return ip.replace(/^::ffff:/, "");
}

export function networkAllowed(ip: string): boolean {
  const list = process.env["ADMIN_IP_ALLOWLIST"]?.trim();
  if (!list) return true;
  return ipInList(ip, list);
}

/* ── password sign-in with lockout ───────────────────────── */

function supabaseAuthEnv() {
  const url = process.env["SUPABASE_URL"] ?? process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? import.meta.env.VITE_SUPABASE_URL;
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["SUPABASE_ANON_KEY"] ??
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ??
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured.");
  return { url: String(url).replace(/\/$/, ""), key: String(key) };
}

/** Failures since the last success, inside the lock window. Throws if the count cannot be read. */
export async function lockState(db: Db, email: string, ip: string, now = Date.now()) {
  const since = new Date(now - LOGIN_LOCK_MS).toISOString();
  const { data, error } = await db
    .from("admin_login_attempts")
    .select("success, at")
    .ilike("email", email)
    .gte("at", since)
    .order("at", { ascending: false })
    .limit(50);
  if (error) throw new AdminDenied("locked", "Sign-in is unavailable right now. Try again in a few minutes.");
  const recent = (data ?? []) as { success: boolean; at: string }[];
  const lastOk = recent.findIndex((r) => r.success);
  const fails = (lastOk === -1 ? recent : recent.slice(0, lastOk)).filter((r) => !r.success);
  const { count: ipFails, error: ipErr } = await db
    .from("admin_login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("success", false)
    .gte("at", since);
  if (ipErr) throw new AdminDenied("locked", "Sign-in is unavailable right now. Try again in a few minutes.");
  const lockedByEmail = fails.length >= LOGIN_MAX_FAILURES;
  const lockedByIp = (ipFails ?? 0) >= LOGIN_MAX_FAILURES * 4;
  const unlockAt = lockedByEmail
    ? new Date(fails[LOGIN_MAX_FAILURES - 1].at).getTime() + LOGIN_LOCK_MS
    : lockedByIp
      ? now + LOGIN_LOCK_MS
      : 0;
  return { locked: lockedByEmail || lockedByIp, unlockAt, remaining: Math.max(0, LOGIN_MAX_FAILURES - fails.length) };
}

const minutes = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));

export async function passwordSignIn(email: string, password: string) {
  const ip = clientIp();
  if (!networkAllowed(ip)) throw new AdminDenied("ip_blocked", "The admin panel cannot be reached from this network.");
  const db = await adminDb();
  const addr = email.trim().toLowerCase();
  const before = await lockState(db, addr, ip);
  if (before.locked)
    throw new AdminDenied("locked", `Too many failed attempts. Sign-in is locked for ${minutes(before.unlockAt - Date.now())} more minute(s).`);

  const record = async (success: boolean) => {
    const { error } = await db.from("admin_login_attempts").insert({ email: addr, ip, success });
    if (error) throw new AdminDenied("locked", "Sign-in is unavailable right now. Try again in a few minutes.");
  };
  const failed = async () => {
    await record(false);
    const after = await lockState(db, addr, ip);
    if (after.locked) throw new AdminDenied("locked", `Too many failed attempts. Sign-in is locked for ${minutes(LOGIN_LOCK_MS)} minutes.`);
    throw new AdminDenied("bad_login", `Wrong email or password. ${after.remaining} attempt${after.remaining === 1 ? "" : "s"} left before a 15-minute lock.`);
  };

  const { url, key } = supabaseAuthEnv();
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ email: addr, password }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; user?: { id: string } };
  if (!res.ok || !body.access_token || !body.user) return failed();

  const roles = await rolesOf(db, body.user.id);
  if (!roles.length) {
    // A real account but not an admin: end the session we just made and count it as a failure.
    await fetch(`${url}/auth/v1/logout?scope=local`, { method: "POST", headers: { apikey: key, authorization: `Bearer ${body.access_token}` } }).catch(() => null);
    return failed();
  }
  await record(true);
  return { access_token: body.access_token, refresh_token: body.refresh_token ?? "" };
}

/* ── roles and the admin session ─────────────────────────── */

export async function rolesOf(db: Db, userId: string): Promise<AdminRole[]> {
  const { data, error } = await db.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new AdminDenied("not_admin", "Your access could not be checked. Sign in again.");
  return [...new Set((data ?? []).map((r: { role: string }) => r.role).filter(isAdminRole))];
}

const enc = new TextEncoder();
function cookieSecret(): string {
  const s = process.env["ADMIN_SESSION_SECRET"] || process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!s) throw new Error("ADMIN_SESSION_SECRET is not set.");
  return s;
}
async function sign(value: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(cookieSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(value)));
  return btoa(String.fromCharCode(...mac)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function verify(signed: string | undefined): Promise<string | null> {
  if (!signed) return null;
  const i = signed.lastIndexOf(".");
  if (i < 1) return null;
  const value = signed.slice(0, i);
  const expect = await sign(value);
  const got = signed.slice(i + 1);
  if (expect.length !== got.length) return null;
  let d = 0;
  for (let j = 0; j < got.length; j++) d |= got.charCodeAt(j) ^ expect.charCodeAt(j);
  return d === 0 ? value : null;
}

function secureRequest(): boolean {
  const req = getRequest();
  const proto = req?.headers.get("x-forwarded-proto") ?? (req ? new URL(req.url).protocol.replace(":", "") : "");
  return proto === "https" || process.env["NODE_ENV"] === "production";
}

interface Claims {
  sub?: string;
  aal?: string;
  session_id?: string;
  email?: string;
}

export interface AdminCtx {
  db: Db;
  userId: string;
  email: string | null;
  roles: AdminRole[];
  adminSessionId: string;
  ip: string;
}

/** After the TOTP code: opens the server-side admin session and sets its cookie. */
export async function startAdminSession(userId: string, claims: Claims) {
  const ip = clientIp();
  if (!networkAllowed(ip)) throw new AdminDenied("ip_blocked", "The admin panel cannot be reached from this network.");
  const db = await adminDb();
  const roles = await rolesOf(db, userId);
  if (!roles.length) throw new AdminDenied("not_admin", "This account is not an admin.");
  if (claims.aal !== "aal2") throw new AdminDenied("mfa_required", "Enter the code from your authenticator app to continue.");
  const ua = getRequest()?.headers.get("user-agent")?.slice(0, 300) ?? null;
  const { data, error } = await db
    .from("admin_sessions")
    .insert({ user_id: userId, auth_session_id: claims.session_id ?? null, ip, user_agent: ua })
    .select("id")
    .single();
  if (error || !data) throw new AdminDenied("session", "The admin session could not be started. Sign in again.");
  setCookie(COOKIE, `${data.id}.${await sign(data.id)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: secureRequest(),
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  const ctx: AdminCtx = { db, userId, email: claims.email ?? null, roles, adminSessionId: data.id, ip };
  await audit(ctx, "admin_login", "auth", userId, { ip });
  return ctx;
}

/**
 * Every admin call goes through here. Throws AdminDenied (with the REAUTH
 * prefix where the person must sign in again) or returns the admin context.
 */
export async function requireAdmin(userId: string, claims: Claims, perm: Permission): Promise<AdminCtx> {
  const ip = clientIp();
  if (!networkAllowed(ip)) throw new AdminDenied("ip_blocked", "The admin panel cannot be reached from this network.");
  const db = await adminDb();
  const roles = await rolesOf(db, userId);
  if (!roles.length) throw new AdminDenied("not_admin", "This account is not an admin.");
  if (claims.aal !== "aal2") throw new AdminDenied("mfa_required", "Enter the code from your authenticator app to continue.");
  const sessionId = await verify(getCookie(COOKIE));
  if (!sessionId) throw new AdminDenied("session", "Your admin session has ended. Sign in again.");
  const { data: s } = await db
    .from("admin_sessions")
    .select("id, user_id, auth_session_id, last_seen_at, revoked_at")
    .eq("id", sessionId)
    .maybeSingle();
  const row = s as { id: string; user_id: string; auth_session_id: string | null; last_seen_at: string; revoked_at: string | null } | null;
  if (!row || row.user_id !== userId || row.revoked_at || (row.auth_session_id && claims.session_id && row.auth_session_id !== claims.session_id))
    throw new AdminDenied("session", "Your admin session has ended. Sign in again.");
  const idle = Date.now() - new Date(row.last_seen_at).getTime();
  if (idle > IDLE_LIMIT_MS) {
    await db.from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", row.id);
    throw new AdminDenied("session", "You were signed out after 15 minutes without activity.");
  }
  const ctx: AdminCtx = { db, userId, email: claims.email ?? null, roles, adminSessionId: row.id, ip };
  if (!can(roles, perm)) {
    await audit(ctx, "admin_denied", "permission", null, { perm });
    throw new AdminDenied("forbidden", "Your role does not allow this.");
  }
  if (idle > 20_000) await db.from("admin_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", row.id);
  return ctx;
}

export async function endAdminSession(userId: string) {
  const db = await adminDb();
  const id = await verify(getCookie(COOKIE));
  if (id) await db.from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
  deleteCookie(COOKIE, { path: "/" });
  if (id) await audit({ db, userId, email: null, roles: [], adminSessionId: id, ip: clientIp() }, "admin_logout", "auth", userId, {});
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One audit row per admin action, written by the server (not the browser). */
export async function audit(ctx: AdminCtx, action: string, targetType: string, targetId: string | null, details: Record<string, unknown>) {
  const { error } = await ctx.db.from("admin_audit_logs").insert({
    admin_user_id: ctx.userId,
    action,
    target_type: targetType,
    target_id: targetId && UUID.test(targetId) ? targetId : null,
    details: { ...details, ...(targetId && !UUID.test(targetId) ? { target: targetId } : {}), roles: ctx.roles },
    ip_address: ctx.ip,
    user_agent: getRequest()?.headers.get("user-agent")?.slice(0, 300) ?? null,
  });
  if (error) console.error(`[admin audit] ${error.message}`);
}
