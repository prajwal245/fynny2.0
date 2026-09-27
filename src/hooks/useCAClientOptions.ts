import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";

export interface CAClientOption {
  id: string;
  business_id: string;
  client_name: string;
  client_reference_code: string | null;
  client_email: string | null;
}

export function useCAClientOptions() {
  const { firmId } = useCAPortal();
  const [clients, setClients] = useState<CAClientOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!firmId) {
      setClients([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from("ca_clients")
        .select("id, business_id, client_name, client_email")
        .eq("ca_firm_id", firmId)
        .order("client_name");
      const rows = (data ?? []) as { id: string; business_id: string | null; client_name: string; client_email: string | null }[];
      const mapped = rows
        .filter((r) => !!r.business_id)
        .map((r) => ({
          id: r.id,
          business_id: r.business_id as string,
          client_name: r.client_name,
          client_reference_code: null as string | null,
          client_email: r.client_email,
        }));

      if (!cancelled) {
        setClients(mapped);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firmId]);

  return { clients, isLoading };
}
