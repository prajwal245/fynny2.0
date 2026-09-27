# Database & realtime security tests

Three suites:

| File | Layer tested | Run with |
|---|---|---|
| `security_regression.test.sql` | DB schema + RLS (pgTAP) | `pg_prove` or `supabase test db` |
| `security_regression.sql`      | DB schema + RLS (plain SQL fallback) | `psql -f` |
| `realtime_isolation.test.ts`   | **Realtime broker authorization** (Deno) | `deno test --allow-net --allow-env` |

The pgTAP suite verifies the same invariants as the plain-SQL one:

1. `get_user_business_id()` and `get_user_ca_firm_id()` are **callable by
   `authenticated` only** — not by `anon` or `PUBLIC`.
2. Trigger-only functions (`handle_new_user`, `handle_ca_request_approval`,
   `update_updated_at_column`) are **not callable by any client role**.
3. Every owner-scoped table (`receivables`, `payables`, `transactions`,
   `alerts`, etc.) has a `DELETE` policy whose `USING` clause references
   `get_user_business_id()`.
4. Audit / immutable tables (`csv_uploads`, `nidhi_briefs`, `profiles`,
   `ca_activity_log`, …) have **no `DELETE` policy at all**.
5. Behavioural: when ≥2 tenants exist, tenant A cannot `DELETE` tenant B's
   receivable row (RLS blocks it; the test skips on a fresh DB).

Everything runs inside a transaction that is `ROLLBACK`ed at the end —
no test data persists.

## Local run (pgTAP)

```bash
# Requires libtap-parser-sourcehandler-pgtap-perl (apt) or
#   cpan TAP::Parser::SourceHandler::pgTAP
pg_prove -d "$SUPABASE_DB_URL" supabase/tests/security_regression.test.sql
```

Or with raw psql (any psql client works, no extra deps):

```bash
psql "$SUPABASE_DB_URL" -X -q -f supabase/tests/security_regression.test.sql
```

## Supabase CLI

```bash
supabase test db
```

Picks up any `*.test.sql` under `supabase/tests/` automatically.

## Plain-SQL fallback

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_regression.sql
```

Prints `OK: …` per assertion and exits non-zero on first failure.

## Realtime isolation (Deno)

Verifies the **WebSocket broker** never delivers a row from tenant B to a
subscriber authenticated as tenant A. Required because Realtime authorization
is enforced at a separate layer from table-level RLS — pgTAP cannot prove it.

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_PUBLISHABLE_KEY=<anon key>    \
SUPABASE_SERVICE_ROLE_KEY=<svc key>    \  # auto-provisions test users
deno test --allow-net --allow-env supabase/tests/realtime_isolation.test.ts
```

Or use pre-seeded accounts (skip service role):

```bash
TEST_USER_A_EMAIL=... TEST_USER_A_PASSWORD=... \
TEST_USER_B_EMAIL=... TEST_USER_B_PASSWORD=... \
SUPABASE_URL=...      SUPABASE_PUBLISHABLE_KEY=... \
deno test --allow-net --allow-env supabase/tests/realtime_isolation.test.ts
```

The test:

1. Acquires two confirmed users with **distinct** `profiles.business_id`
   (preferring pre-seeded creds; otherwise auto-provisions via service role
   and tags everything with `__rt_iso_test__` for cleanup).
2. Signs each user in with the anon key, calls `realtime.setAuth(jwt)`, and
   subscribes to `receivables` filtered by `business_id=eq.<own>`.
3. INSERTs one tagged receivable per tenant.
4. Waits up to 5 s and asserts:
   - tenant A received its own row,
   - tenant B received its own row,
   - **neither tenant received any row whose `business_id` belongs to the
     other tenant** (the cross-tenant assertion),
   - tenant A never saw B's row id, and vice versa.
5. Auto-cleans channels, sessions, and any provisioned users/businesses/rows.

The test `ignore`s itself if neither pre-seeded creds nor the service role
key are available — so CI without secrets won't false-fail.
