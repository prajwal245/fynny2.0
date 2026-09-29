---
name: profiles org_id ↔ business_id sync trigger
description: profiles.business_id and profiles.org_id are mechanically mirrored by a DB trigger, not coincidence
type: feature
---
A trigger function `sync_business_org_id()` on `public.profiles` auto-mirrors writes between `business_id` and `org_id` on every INSERT/UPDATE. Writing either column populates the other.

**Why this matters:** `get_user_business_id()` uses `COALESCE(business_id, org_id)` and the two columns always match in live data — that is the trigger's doing, not luck. Any future migration that drops one column, removes the trigger, or splits the semantics must update `get_user_business_id()` and every RLS policy that depends on it simultaneously.

**Don't:** assume one column is canonical and the other derived. They are symmetric. Read either; write either; the trigger handles the rest.
