import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";

type ComplianceEvent = {
  id: string;
  business_id: string;
  filing_type: string;
  filing_name: string;
  due_date: string;
  status: string | null;
  urgency: string | null;
  notes: string | null;
};

const FILTERS = ["All", "GST", "TDS", "ROC", "Audit"] as const;
type Filter = (typeof FILTERS)[number];

const FilingCalendarPage = () => {
  const navigate = useNavigate();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("All");

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

  const { data: events, isLoading } = useQuery({
    queryKey: ["compliance-events", businessId],
    queryFn: async (): Promise<ComplianceEvent[]> => {
      if (!businessId) return [];
      const today = new Date();
      const ninetyDaysFromNow = new Date();
      ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

      const { data } = await supabase
        .from("compliance_events")
        .select("*")
        .eq("business_id", businessId)
        .gte("due_date", today.toISOString().split("T")[0])
        .lte("due_date", ninetyDaysFromNow.toISOString().split("T")[0])
        .order("due_date", { ascending: true });

      return (data as ComplianceEvent[]) || [];
    },
    enabled: !!businessId,
  });

  const filteredEvents = useMemo(() => {
    if (!events) return [];
    if (filter === "All") return events;
    return events.filter((e) => e.filing_type?.toLowerCase() === filter.toLowerCase());
  }, [events, filter]);

  const eventsByMonth = useMemo(() => {
    return filteredEvents.reduce((acc, ev) => {
      const month = ev.due_date.substring(0, 7);
      if (!acc[month]) acc[month] = [];
      acc[month].push(ev);
      return acc;
    }, {} as Record<string, ComplianceEvent[]>);
  }, [filteredEvents]);

  const isEmpty = !isLoading && filteredEvents.length === 0;

  return (
    <DashboardLayout>
      {/* FILTERS */}
      <div className="flex gap-2 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? "bg-fyn-ink text-white"
                : "bg-fyn-beige-dark border border-fyn-ink-10 text-fyn-ink/70 hover:text-fyn-ink"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* LOADING */}
      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {/* EMPTY STATE */}
      {isEmpty && (
        <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-12 text-center">
          <h3 className="text-fyn-ink text-xl font-serif mb-2">No Upcoming Compliance Events</h3>
          <p className="text-fyn-ink/60 text-sm mb-6">
            Your filing calendar will appear here once you add compliance deadlines
          </p>
          <button
            onClick={() => navigate("/dashboard/settings/integrations")}
            className="bg-fyn-ink text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-fyn-ink/90 transition-colors"
          >
            Connect Accounting →
          </button>
        </div>
      )}

      {/* CALENDAR BY MONTH */}
      {!isLoading && filteredEvents.length > 0 && (
        <div className="space-y-5">
          {Object.entries(eventsByMonth).map(([month, monthEvents]) => (
            <div key={month} className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-5">
              <h3 className="text-fyn-ink font-serif text-lg mb-4">
                {new Date(month + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
              </h3>
              <div className="space-y-2">
                {monthEvents.map((ev) => {
                  const daysUntil = Math.ceil(
                    (new Date(ev.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                  );
                  const isUrgent = daysUntil <= 7;
                  const isCritical = ev.urgency === "critical";

                  return (
                    <div
                      key={ev.id}
                      className={`flex items-center gap-4 bg-card rounded-lg p-4 border-l-4 ${
                        isUrgent || isCritical ? "border-[#C41E1E]" : "border-fyn-ink/20"
                      }`}
                    >
                      <div className="text-center min-w-[60px]">
                        <div className="text-fyn-ink/40 text-xs fyn-label">
                          {new Date(ev.due_date).toLocaleDateString("en-IN", { month: "short" })}
                        </div>
                        <div className="text-fyn-ink text-2xl font-bold font-sans">
                          {new Date(ev.due_date).getDate()}
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="text-fyn-ink font-medium">{ev.filing_name}</div>
                        <div className="text-fyn-ink/50 text-xs mt-0.5 fyn-label">
                          {ev.filing_type?.toUpperCase()}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded ${
                            isCritical
                              ? "bg-[#C41E1E]/10 text-[#C41E1E]"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {ev.urgency || "normal"}
                        </span>
                        <span
                          className={`text-sm font-medium ${
                            isUrgent ? "text-[#C41E1E]" : "text-fyn-ink/60"
                          }`}
                        >
                          {daysUntil} {daysUntil === 1 ? "day" : "days"} left
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
};

export default FilingCalendarPage;
