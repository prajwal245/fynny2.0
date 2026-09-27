import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";

export interface CAFirmMemberOption {
  id: string;
  userId: string | null;
  email: string | null;
  role: string;
  status: string;
  /** Best available label — email local part until the invite is accepted. */
  label: string;
}

/** Members of the signed-in user's firm, for assignment dropdowns and
 *  for turning owner ids into names in analytics. */
export function useCAFirmMembers() {
  const { firmId } = useCAPortal();
  const [members, setMembers] = useState<CAFirmMemberOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!firmId) {
      setMembers([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from("ca_firm_members")
        .select("id, user_id, invited_email, role, status")
        .eq("ca_firm_id", firmId)
        .order("created_at");
      const rows = (data ?? []) as {
        id: string;
        user_id: string | null;
        invited_email: string | null;
        role: string;
        status: string;
      }[];
      if (cancelled) return;
      setMembers(
        rows.map((r) => ({
          id: r.id,
          userId: r.user_id,
          email: r.invited_email,
          role: r.role,
          status: r.status,
          label: r.invited_email ? r.invited_email.split("@")[0]! : `${r.role} member`,
        })),
      );
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [firmId]);

  /** user_id → display label, for resolving owner columns. */
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of members) if (x.userId) m.set(x.userId, x.label);
    return m;
  }, [members]);

  return { members, nameById, isLoading };
}
