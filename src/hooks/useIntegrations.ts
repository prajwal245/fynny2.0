import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type IntegrationRow = {
  id: string;
  organization_id: string;
  provider: string;
  status: string;
  created_at: string | null;
  updated_at: string | null;
};

export function useIntegrations() {
  const { businessId } = useAuth();
  const qc = useQueryClient();
  const orgId = businessId ?? "";

  const query = useQuery({
    queryKey: ["integrations", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<IntegrationRow[]> => {
      // SECURITY: never select `metadata` client-side — it holds secrets like key_secret / webhook_secret.
      const { data, error } = await supabase
        .from("integrations")
        .select("id, organization_id, provider, status, created_at, updated_at")
        .eq("organization_id", orgId);
      if (error) throw error;
      return (data ?? []) as unknown as IntegrationRow[];
    },
  });

  const connect = useMutation({
    mutationFn: async (args: { provider: string; metadata?: Record<string, unknown> }) => {
      if (!orgId) throw new Error("No business profile found. Complete onboarding first.");
      const payload = {
        organization_id: orgId,
        provider: args.provider,
        status: "active",
        metadata: { ...(args.metadata ?? {}), connected_at: new Date().toISOString() },
      };
      const { error } = await supabase
        .from("integrations")
        .upsert(payload, { onConflict: "organization_id,provider" });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["integrations", orgId] });
      toast.success(`${vars.provider.replace(/_/g, " ")} connected`);
    },
    onError: (e: Error) => toast.error(e.message ?? "Could not connect integration"),
  });

  const disconnect = useMutation({
    mutationFn: async (provider: string) => {
      if (!orgId) throw new Error("No business profile found.");
      const { error } = await supabase
        .from("integrations")
        .update({ status: "disconnected" })
        .eq("organization_id", orgId)
        .eq("provider", provider);
      if (error) throw error;
    },
    onSuccess: (_d, provider) => {
      qc.invalidateQueries({ queryKey: ["integrations", orgId] });
      toast(`${provider.replace(/_/g, " ")} disconnected`);
    },
    onError: (e: Error) => toast.error(e.message ?? "Could not disconnect"),
  });

  const byProvider = new Map<string, IntegrationRow>();
  (query.data ?? []).forEach((r) => byProvider.set(r.provider, r));

  return {
    rows: query.data ?? [],
    byProvider,
    isLoading: query.isLoading,
    connectedCount: (query.data ?? []).filter((r) => r.status === "active").length,
    connect: connect.mutate,
    disconnect: disconnect.mutate,
    isConnecting: connect.isPending,
  };
}
