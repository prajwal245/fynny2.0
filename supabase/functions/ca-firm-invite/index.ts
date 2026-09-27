// CA portal invitations managed by platform senior admins.
// Ops: list (firms + pending invites), invite (existing firm or new firm),
//      resend, revoke, quota (update a firm's client quota).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders, handlePreflight, rejectDisallowedOrigin, rejectOversizedBody } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FIRM_ROLES = ["partner", "manager", "staff", "viewer"] as const;
const ALLOWED_REDIRECTS = new Set([
  "https://fynhelp.com",
  "https://www.fynhelp.com",
  "https://fynhelp.lovable.app",
]);
const MIN_QUOTA = 1;
const MAX_QUOTA = 5000;

type Json = Record<string, unknown>;

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  const originBlock = rejectDisallowedOrigin(req);
  if (originBlock) return originBlock;
  const sizeBlock = rejectOversizedBody(req, 200_000);
  if (sizeBlock) return sizeBlock;

  const reply = (body: Json, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return reply({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    const callerId = claims?.claims?.sub as string | undefined;
    if (!callerId) return reply({ error: "Unauthorized" }, 401);

    const { data: roleRows } = await userClient.from("user_roles").select("role").eq("user_id", callerId);
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    if (!roles.some((r) => ["super_admin", "admin", "ops_admin"].includes(r))) {
      return reply({ error: "Forbidden — senior admin only" }, 403);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = (await req.json().catch(() => ({}))) as Json;
    const op = String(body.op ?? "");

    const audit = async (action: string, targetId: string | null, details: Json) => {
      await admin.from("admin_audit_logs").insert({
        admin_user_id: callerId,
        action,
        target_type: "ca_firm",
        target_id: targetId,
        details,
        ip_address: req.headers.get("x-forwarded-for"),
        user_agent: req.headers.get("user-agent"),
      });
    };

    const origin = req.headers.get("origin") ?? "";
    const redirectBase = ALLOWED_REDIRECTS.has(origin) ? origin : "https://fynhelp.com";
    const redirectTo = `${redirectBase}/ca/login`;

    // ---------------------------------------------------------------- list
    if (op === "list") {
      const { data: firms, error: firmErr } = await admin
        .from("ca_firms")
        .select("id, firm_name, ca_name, email, plan_type, max_clients, is_active, is_verified, verification_status, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (firmErr) return reply({ error: firmErr.message }, 500);

      const { data: members, error: memErr } = await admin
        .from("ca_firm_members")
        .select("id, ca_firm_id, user_id, invited_email, role, status, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (memErr) return reply({ error: memErr.message }, 500);

      const { data: accessRows } = await admin
        .from("ca_client_access")
        .select("ca_firm_id")
        .eq("is_active", true)
        .limit(5000);
      const used: Record<string, number> = {};
      (accessRows ?? []).forEach((r: { ca_firm_id: string }) => {
        used[r.ca_firm_id] = (used[r.ca_firm_id] ?? 0) + 1;
      });

      return reply({
        success: true,
        firms: (firms ?? []).map((f: Json) => ({ ...f, clients_used: used[f.id as string] ?? 0 })),
        members: members ?? [],
      });
    }

    // -------------------------------------------------------------- invite
    if (op === "invite") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const role = String(body.role ?? "staff");
      const quota = Number(body.max_clients ?? 25);
      const mode = body.ca_firm_id ? "existing" : "new";

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return reply({ error: "Valid email required" }, 400);
      if (!FIRM_ROLES.includes(role as typeof FIRM_ROLES[number])) return reply({ error: "Invalid role" }, 400);
      if (!Number.isInteger(quota) || quota < MIN_QUOTA || quota > MAX_QUOTA) {
        return reply({ error: `Client quota must be between ${MIN_QUOTA} and ${MAX_QUOTA}` }, 400);
      }

      let firmId = body.ca_firm_id ? String(body.ca_firm_id) : "";
      let firmName = String(body.firm_name ?? "").trim();

      if (mode === "existing") {
        const { data: firm } = await admin.from("ca_firms").select("id, firm_name").eq("id", firmId).maybeSingle();
        if (!firm) return reply({ error: "Firm not found" }, 404);
        firmName = firm.firm_name as string;
      } else if (!firmName || firmName.length > 160) {
        return reply({ error: "Firm name required for a new firm" }, 400);
      }

      // Find or invite the auth user.
      let userId: string | null = null;
      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (inviteErr) {
        // Most common cause: the user already exists — look them up and continue.
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const match = list?.users?.find((u) => u.email?.toLowerCase() === email);
        if (!match) return reply({ error: inviteErr.message }, 400);
        userId = match.id;
      } else {
        userId = invited.user?.id ?? null;
      }
      if (!userId) return reply({ error: "Could not resolve invited user" }, 500);

      if (mode === "new") {
        const { data: firm, error: firmErr } = await admin
          .from("ca_firms")
          .insert({
            user_id: userId,
            firm_name: firmName,
            ca_name: String(body.ca_name ?? "").trim() || firmName,
            email,
            max_clients: quota,
            plan_type: String(body.plan_type ?? "starter"),
            is_active: true,
            verification_status: "pending",
            onboarding_step: 1,
          })
          .select("id")
          .single();
        if (firmErr) return reply({ error: firmErr.message }, 400);
        firmId = firm.id as string;
      } else {
        const { error: quotaErr } = await admin.from("ca_firms").update({ max_clients: quota }).eq("id", firmId);
        if (quotaErr) return reply({ error: quotaErr.message }, 400);
      }

      const { error: memberErr } = await admin
        .from("ca_firm_members")
        .insert({
          ca_firm_id: firmId,
          user_id: userId,
          invited_email: email,
          role: mode === "new" ? "partner" : role,
          status: "invited",
        });
      if (memberErr && !memberErr.message.includes("duplicate")) {
        return reply({ error: memberErr.message }, 400);
      }

      await audit("ca_firm_invite", firmId, { email, role, max_clients: quota, mode, firm_name: firmName });
      return reply({ success: true, ca_firm_id: firmId, user_id: userId, email, role, max_clients: quota, mode });
    }

    // -------------------------------------------------------------- resend
    if (op === "resend") {
      const memberId = String(body.member_id ?? "");
      const { data: member } = await admin
        .from("ca_firm_members")
        .select("id, ca_firm_id, invited_email")
        .eq("id", memberId)
        .maybeSingle();
      if (!member?.invited_email) return reply({ error: "Invite not found" }, 404);
      const { error } = await admin.auth.admin.inviteUserByEmail(member.invited_email as string, { redirectTo });
      if (error) return reply({ error: error.message }, 400);
      await audit("ca_firm_invite_resend", member.ca_firm_id as string, { email: member.invited_email });
      return reply({ success: true });
    }

    // -------------------------------------------------------------- revoke
    if (op === "revoke") {
      const memberId = String(body.member_id ?? "");
      const { data: member } = await admin
        .from("ca_firm_members")
        .select("id, ca_firm_id, invited_email, status")
        .eq("id", memberId)
        .maybeSingle();
      if (!member) return reply({ error: "Invite not found" }, 404);
      const { error } = await admin.from("ca_firm_members").delete().eq("id", memberId);
      if (error) return reply({ error: error.message }, 400);
      await audit("ca_firm_invite_revoke", member.ca_firm_id as string, {
        email: member.invited_email,
        previous_status: member.status,
      });
      return reply({ success: true });
    }

    // --------------------------------------------------------------- quota
    if (op === "quota") {
      const firmId = String(body.ca_firm_id ?? "");
      const quota = Number(body.max_clients);
      if (!Number.isInteger(quota) || quota < MIN_QUOTA || quota > MAX_QUOTA) {
        return reply({ error: `Client quota must be between ${MIN_QUOTA} and ${MAX_QUOTA}` }, 400);
      }
      const { error } = await admin.from("ca_firms").update({ max_clients: quota }).eq("id", firmId);
      if (error) return reply({ error: error.message }, 400);
      await audit("ca_firm_quota_update", firmId, { max_clients: quota });
      return reply({ success: true, max_clients: quota });
    }

    return reply({ error: "Unknown op" }, 400);
  } catch (e) {
    return reply({ error: (e as Error).message }, 500);
  }
});
