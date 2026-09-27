// =============================================================================
// Realtime cross-tenant isolation test (Deno).
//
// Verifies that the Supabase Realtime broker NEVER delivers a postgres_changes
// event from tenant B to a subscriber authenticated as tenant A — and vice
// versa. Required because realtime authorization is a *separate* enforcement
// layer from table-level RLS; the SQL suite cannot prove it.
//
// Strategy:
//   1. Acquire two confirmed users with distinct profiles.business_id.
//      Path A (preferred, no setup): use TEST_USER_A_* / TEST_USER_B_* env.
//      Path B (auto): provision two synthetic users via the service role,
//                     create a business per user, attach to profiles, run the
//                     test, then delete everything created.
//   2. Open one anon-key client per user, sign in with password to obtain a
//      real JWT, subscribe to `receivables` filtered by business_id=eq.<own>.
//   3. As user A, INSERT a receivable for business_a.
//      As user B, INSERT a receivable for business_b.
//   4. Wait long enough for delivery (5s).
//   5. Assert: A's channel saw A's row and ONLY A's row. Same for B.
//   6. Cleanup (always).
//
// Run:
//   SUPABASE_URL=...  \
//   SUPABASE_PUBLISHABLE_KEY=...  \
//   SUPABASE_SERVICE_ROLE_KEY=... \   # path B only
//   deno test --allow-net --allow-env supabase/tests/realtime_isolation.test.ts
// =============================================================================

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.4";

// ---------- env --------------------------------------------------------------
const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL") ?? "";
const ANON_KEY =
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ??
  "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const PRESEEDED_A_EMAIL = Deno.env.get("TEST_USER_A_EMAIL") ?? "";
const PRESEEDED_A_PASS = Deno.env.get("TEST_USER_A_PASSWORD") ?? "";
const PRESEEDED_B_EMAIL = Deno.env.get("TEST_USER_B_EMAIL") ?? "";
const PRESEEDED_B_PASS = Deno.env.get("TEST_USER_B_PASSWORD") ?? "";

const haveAnon = !!(SUPABASE_URL && ANON_KEY);
const havePreseed =
  !!(PRESEEDED_A_EMAIL && PRESEEDED_A_PASS &&
     PRESEEDED_B_EMAIL && PRESEEDED_B_PASS);
const haveServiceRole = !!SERVICE_ROLE_KEY;

const PASSWORD = "Test#Realtime#" + crypto.randomUUID().slice(0, 8);

// ---------- helpers ----------------------------------------------------------
type Tenant = {
  email: string;
  password: string;
  userId: string;
  businessId: string;
  // Was this tenant provisioned by the test (and therefore must be cleaned)?
  provisioned: boolean;
};

const RECV_MARKER = "__realtime_isolation_test__";
const BIZ_MARKER = "__rt_iso_test__";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Creates a service-role admin client (path B only). */
function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Provision a fresh confirmed user + business + profile via service role. */
async function provisionTenant(label: "A" | "B"): Promise<Tenant> {
  const admin = adminClient();
  const email = `rtiso+${label.toLowerCase()}+${crypto
    .randomUUID()
    .slice(0, 8)}@example.test`;

  const { data: created, error: createErr } =
    await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
  if (createErr || !created.user) {
    throw new Error(`createUser ${label}: ${createErr?.message}`);
  }

  // The handle_new_user trigger created a profile already; capture it.
  const userId = created.user.id;

  // Create a tagged business and link the profile to it.
  const { data: biz, error: bizErr } = await admin
    .from("businesses")
    .insert({ business_name: `${BIZ_MARKER}-${label}` })
    .select("id")
    .single();
  if (bizErr || !biz) throw new Error(`insert business: ${bizErr?.message}`);

  const { error: pErr } = await admin
    .from("profiles")
    .update({ business_id: biz.id, full_name: `${BIZ_MARKER}-${label}` })
    .eq("user_id", userId);
  if (pErr) throw new Error(`link profile: ${pErr.message}`);

  return {
    email,
    password: PASSWORD,
    userId,
    businessId: biz.id,
    provisioned: true,
  };
}

/** Resolve a pre-seeded tenant by signing in and reading their business_id. */
async function resolvePreseededTenant(
  email: string,
  password: string,
  label: "A" | "B",
): Promise<Tenant> {
  const c = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(`preseed signIn ${label}: ${error?.message}`);
  }
  const { data: prof, error: pErr } = await c
    .from("profiles")
    .select("business_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (pErr || !prof?.business_id) {
    throw new Error(`preseed ${label} profile.business_id missing`);
  }
  await c.auth.signOut();
  return {
    email,
    password,
    userId: data.user.id,
    businessId: prof.business_id as string,
    provisioned: false,
  };
}

/** Sign in and return an authed client for a tenant. */
async function authedClient(t: Tenant): Promise<SupabaseClient> {
  const c = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  const { error } = await c.auth.signInWithPassword({
    email: t.email,
    password: t.password,
  });
  if (error) throw new Error(`signIn ${t.email}: ${error.message}`);
  // Make sure the realtime socket sends the JWT.
  const session = (await c.auth.getSession()).data.session;
  await c.realtime.setAuth(session?.access_token ?? null);
  return c;
}

type DeliveryRecord = {
  channelOwnerBiz: string;
  payloadBiz: string | null;
  rowId: string | null;
};

/**
 * Subscribe to receivables filtered by business_id=eq.<ownBiz>. Returns the
 * channel + a live array that records every row delivered to it.
 */
async function subscribeReceivables(
  c: SupabaseClient,
  ownBiz: string,
  bucket: DeliveryRecord[],
  channelLabel: string,
): Promise<RealtimeChannel> {
  const ch = c.channel(`rtiso-${channelLabel}-${ownBiz}`);
  ch.on(
    "postgres_changes" as never,
    {
      event: "INSERT",
      schema: "public",
      table: "receivables",
      filter: `business_id=eq.${ownBiz}`,
    },
    (payload: { new: Record<string, unknown> }) => {
      const row = payload.new ?? {};
      bucket.push({
        channelOwnerBiz: ownBiz,
        payloadBiz: (row.business_id as string) ?? null,
        rowId: (row.id as string) ?? null,
      });
    },
  );

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("subscribe timeout")), 10_000);
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(t);
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(t);
        reject(new Error(`subscribe failed: ${status}`));
      }
    });
  });
  return ch;
}

async function cleanupProvisioned(tenants: Tenant[]) {
  if (!haveServiceRole) return;
  const admin = adminClient();

  // Children first.
  for (const t of tenants) {
    await admin.from("receivables").delete().eq("business_id", t.businessId);
  }
  for (const t of tenants) {
    if (!t.provisioned) continue;
    // Profile row is owned by the user_id; null out business_id then delete user.
    await admin.from("profiles").update({ business_id: null }).eq(
      "user_id",
      t.userId,
    );
    await admin.from("businesses").delete().eq("id", t.businessId);
    await admin.auth.admin.deleteUser(t.userId);
  }
}

// ---------- the test ---------------------------------------------------------
Deno.test({
  name: "realtime: tenant A and tenant B never receive each other's rows",
  // Realtime needs network + env access.
  sanitizeOps: false,
  sanitizeResources: false,
  ignore: !haveAnon || (!havePreseed && !haveServiceRole),
  async fn() {
    // 1. Resolve two tenants.
    let tA: Tenant;
    let tB: Tenant;
    if (havePreseed) {
      tA = await resolvePreseededTenant(
        PRESEEDED_A_EMAIL,
        PRESEEDED_A_PASS,
        "A",
      );
      tB = await resolvePreseededTenant(
        PRESEEDED_B_EMAIL,
        PRESEEDED_B_PASS,
        "B",
      );
    } else {
      tA = await provisionTenant("A");
      tB = await provisionTenant("B");
    }
    assert(
      tA.businessId !== tB.businessId,
      "test prerequisite: tenants must have distinct business_id",
    );

    // 2. Authed clients + subscriptions.
    const cA = await authedClient(tA);
    const cB = await authedClient(tB);

    const deliveriesA: DeliveryRecord[] = [];
    const deliveriesB: DeliveryRecord[] = [];

    let chA: RealtimeChannel | null = null;
    let chB: RealtimeChannel | null = null;

    try {
      chA = await subscribeReceivables(cA, tA.businessId, deliveriesA, "A");
      chB = await subscribeReceivables(cB, tB.businessId, deliveriesB, "B");

      // Tiny settle so the broker fully registers both subscriptions.
      await wait(500);

      // 3. INSERT a receivable as each user.
      const idA = crypto.randomUUID();
      const idB = crypto.randomUUID();

      const { error: insAErr } = await cA.from("receivables").insert({
        id: idA,
        business_id: tA.businessId,
        customer_name: RECV_MARKER,
        amount: 1,
      });
      assertEquals(insAErr, null, `insert A: ${insAErr?.message}`);

      const { error: insBErr } = await cB.from("receivables").insert({
        id: idB,
        business_id: tB.businessId,
        customer_name: RECV_MARKER,
        amount: 2,
      });
      assertEquals(insBErr, null, `insert B: ${insBErr?.message}`);

      // 4. Allow up to 5s for delivery.
      const deadline = Date.now() + 5_000;
      while (
        Date.now() < deadline &&
        (!deliveriesA.some((d) => d.rowId === idA) ||
          !deliveriesB.some((d) => d.rowId === idB))
      ) {
        await wait(150);
      }

      // 5a. Each tenant must see their own row.
      assert(
        deliveriesA.some((d) => d.rowId === idA),
        `tenant A did not receive its own INSERT (got ${deliveriesA.length} events)`,
      );
      assert(
        deliveriesB.some((d) => d.rowId === idB),
        `tenant B did not receive its own INSERT (got ${deliveriesB.length} events)`,
      );

      // 5b. CRITICAL: neither tenant ever saw a row from the other tenant.
      const leakedToA = deliveriesA.filter(
        (d) => d.payloadBiz !== tA.businessId,
      );
      const leakedToB = deliveriesB.filter(
        (d) => d.payloadBiz !== tB.businessId,
      );
      assertEquals(
        leakedToA,
        [],
        `tenant A received cross-tenant row(s): ${JSON.stringify(leakedToA)}`,
      );
      assertEquals(
        leakedToB,
        [],
        `tenant B received cross-tenant row(s): ${JSON.stringify(leakedToB)}`,
      );

      // 5c. Specifically, tenant A must NEVER have seen the row B created.
      assertEquals(
        deliveriesA.find((d) => d.rowId === idB),
        undefined,
        "tenant A received tenant B's row id",
      );
      assertEquals(
        deliveriesB.find((d) => d.rowId === idA),
        undefined,
        "tenant B received tenant A's row id",
      );
    } finally {
      // 6. Teardown channels + sessions, then cleanup data.
      try { if (chA) await cA.removeChannel(chA); } catch { /* ignore */ }
      try { if (chB) await cB.removeChannel(chB); } catch { /* ignore */ }
      try { await cA.auth.signOut(); } catch { /* ignore */ }
      try { await cB.auth.signOut(); } catch { /* ignore */ }
      await cleanupProvisioned([tA, tB]);
    }
  },
});
