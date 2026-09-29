import { useState, useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useInfiniteQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 20;

const SimulatorPage = () => {
  const navigate = useNavigate();
  const [businessId, setBusinessId] = useState<string | null>(null);

  useEffect(() => {
    const fetchBusiness = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.business_id) setBusinessId(data.business_id);
    };
    fetchBusiness();
  }, []);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["simulations", businessId],
    enabled: !!businessId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (!businessId) return [];
      const from = (pageParam as number) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data } = await supabase
        .from("simulations")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .range(from, to);
      return data || [];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length : undefined,
  });

  const simulations = data?.pages.flat() ?? [];

  if (isLoading || !businessId) {
    return (
      <DashboardLayout>
        <div className="text-fyn-ink/60 text-sm">Loading simulations…</div>
      </DashboardLayout>
    );
  }

  if (simulations.length === 0) {
    return (
      <DashboardLayout>
        <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-10 text-center">
          <h2 className="text-fyn-ink text-2xl font-sans font-semibold mb-2">
            No Simulations Yet
          </h2>
          <p className="text-fyn-ink/60 text-sm mb-6">
            Run financial scenarios to see simulations here
          </p>
          <button
            onClick={() => navigate("/dashboard/fynny-chat")}
            className="bg-fyn-red text-white px-5 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition"
          >
            Create Simulation
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-fyn-ink text-lg font-sans">Simulation History</h3>
          <button
            onClick={() => navigate("/dashboard/fynny-chat")}
            className="bg-fyn-red text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition"
          >
            New Simulation
          </button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Scenario Type</TableHead>
              <TableHead>Parameters</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Shared</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {simulations.map((sim: any) => {
              const paramKeys = sim.parameters
                ? Object.keys(sim.parameters).slice(0, 3).join(", ")
                : "-";
              return (
                <TableRow key={sim.id}>
                  <TableCell className="font-medium capitalize">
                    {sim.scenario_type || "-"}
                  </TableCell>
                  <TableCell className="text-fyn-ink/70 text-sm">
                    {paramKeys || "-"}
                  </TableCell>
                  <TableCell>
                    {new Date(sim.created_at).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    {sim.shared_link ? (
                      <a
                        href={sim.shared_link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-fyn-red text-sm hover:underline"
                      >
                        View →
                      </a>
                    ) : (
                      <span className="text-fyn-ink/40 text-sm">Private</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-fyn-ink-10">
          <p className="text-fyn-ink/60 text-xs">
            Showing {simulations.length} simulation
            {simulations.length === 1 ? "" : "s"}
          </p>
          {hasNextPage ? (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="bg-fyn-ink text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          ) : (
            <p className="text-fyn-ink/40 text-xs">All simulations loaded</p>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SimulatorPage;
