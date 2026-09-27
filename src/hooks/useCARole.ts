/**
 * CA firm role + permission resolution.
 *
 * The role and its permissions are resolved server-side (SECURITY DEFINER
 * helpers + the ca_role_permissions table). Nothing here is authoritative:
 * RLS enforces the same rules on every write. This hook only decides what to
 * show.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";

export type CARole = "partner" | "manager" | "senior" | "junior" | "client";

export type CAPermission =
  | "view_all"
  | "manage_users"
  | "approve"
  | "sign_off"
  | "process"
  | "upload"
  | "manage_clients"
  | "manage_billing";

export const CA_ROLE_LABELS: Record<CARole, string> = {
  partner: "Partner",
  manager: "Manager",
  senior: "Senior",
  junior: "Junior",
  client: "Client",
};

export const CA_ROLE_BLURB: Record<CARole, string> = {
  partner: "Full visibility, sign-off authority, billing and user management",
  manager: "Approve work, manage clients and staff, run every queue",
  senior: "Review and approve processed work across the portfolio",
  junior: "Process queues and upload documents",
  client: "Upload documents and respond to requests for their own business",
};

export interface CARoleState {
  role: CARole | null;
  permissions: CAPermission[];
  can: (p: CAPermission) => boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
  /** True when the firm has a practising CA's ICAI membership number on file. */
  hasICAI: boolean;
  setHasICAI: (v: boolean) => void;
}

export function useCARole(): CARoleState {
  const { firmId, isLoading: portalLoading } = useCAPortal();
  const [role, setRole] = useState<CARole | null>(null);
  const [permissions, setPermissions] = useState<CAPermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasICAI, setHasICAI] = useState(false);

  const load = useCallback(async () => {
    if (!firmId) {
      setRole(null);
      setPermissions([]);
      setIsLoading(portalLoading);
      return;
    }
    setIsLoading(true);
    try {
      const [{ data: roleData }, { data: firm }] = await Promise.all([
        supabase.rpc("ca_member_role", { _firm_id: firmId }),
        supabase.from("ca_firms").select("icai_membership_number").eq("id", firmId).maybeSingle(),
      ]);
      setHasICAI(!!(firm?.icai_membership_number?.trim()));
      const resolved = (roleData as CARole | null) ?? null;
      setRole(resolved);
      if (resolved) {
        const { data: perms } = await supabase
          .from("ca_role_permissions")
          .select("permission")
          .eq("role", resolved);
        setPermissions(((perms ?? []) as { permission: string }[]).map((p) => p.permission as CAPermission));
      } else {
        setPermissions([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [firmId, portalLoading]);

  useEffect(() => {
    void load();
  }, [load]);

  const can = useCallback(
    (p: CAPermission) => permissions.includes(p),
    [permissions],
  );

  return { role, permissions, can, isLoading, refresh: load, hasICAI, setHasICAI };
}
