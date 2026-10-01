/**
 * Notices when a signed-in session ends without the user signing out, so
 * sign-in can say "your session ended" instead of appearing from nowhere.
 * Imported by the root route: it must run before the auth client finishes
 * starting up, because a stored session that cannot be refreshed is dropped
 * silently then.
 */
import { supabase } from "@/integrations/supabase/client";

export const EXPIRED_KEY = "fynhelp.v2.expired";
let byUser = false;

/** Call just before signing out on purpose. */
export function setSigningOutByUser() {
  byUser = true;
}

function markExpired() {
  try {
    sessionStorage.setItem(EXPIRED_KEY, "1");
  } catch {
    /* private mode */
  }
}

if (typeof window !== "undefined") {
  let hadStoredSession = false;
  try {
    hadStoredSession = Object.keys(localStorage).some((k) =>
      /^sb-.+-auth-token$/.test(k),
    );
  } catch {
    /* private mode */
  }
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION" && !session && hadStoredSession)
      markExpired();
    if (event === "SIGNED_OUT" && !byUser) markExpired();
    if (event === "SIGNED_OUT") byUser = false;
  });
}
