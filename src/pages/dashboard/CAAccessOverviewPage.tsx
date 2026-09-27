import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Briefcase, ShieldCheck, Info } from "lucide-react";

interface ActiveAccessRow {
  id: string;
  ca_firm_id: string;
  access_level: string | null;
  granted_at: string | null;
  granted_by: string | null;
  notes: string | null;
}

interface FirmInfo {
  id: string;
  firm_name: string;
  membership_number: string | null;
  city: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;
  is_verified: boolean | null;
}

const accessLabel: Record<string, string> = {
  read_only: "Read-only",
  full_read: "Full read",
  report_download: "Report download",
  data_entry: "Data entry",
};

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-";

export default function CAAccessOverviewPage() {
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

  const { data: access, isLoading: aLoading } = useQuery({
    queryKey: ["ca-access-overview", businessId],
    queryFn: async (): Promise<ActiveAccessRow[]> => {
      if (!businessId) return [];
      const { data, error } = await supabase
        .from("ca_client_access")
        .select("id, ca_firm_id, access_level, granted_at, granted_by, notes")
        .eq("business_id", businessId)
        .eq("is_active", true)
        .order("granted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ActiveAccessRow[];
    },
    enabled: !!businessId,
  });

  const firmIds = Array.from(new Set((access ?? []).map((a) => a.ca_firm_id)));

  const { data: firms, isLoading: fLoading } = useQuery({
    queryKey: ["ca-access-firms", firmIds.sort().join(",")],
    queryFn: async (): Promise<Record<string, FirmInfo>> => {
      if (firmIds.length === 0) return {};
      const { data, error } = await supabase
        .from("ca_firms")
        .select("id, firm_name, membership_number, city, state, email, phone, is_verified")
        .in("id", firmIds);
      if (error) throw error;
      const map: Record<string, FirmInfo> = {};
      (data ?? []).forEach((f: any) => { map[f.id] = f; });
      return map;
    },
    enabled: firmIds.length > 0,
  });

  const isLoading = aLoading || (firmIds.length > 0 && fLoading);
  const rows = access ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold" style={{ color: "#171208", fontFamily: "Inter" }}>
            CA Firm Access
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(23,18,8,0.60)" }}>
            Chartered Accountant firms that currently have access to your business data.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#8B6914" }}>
              Active CA firms
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-16 mt-2" />
            ) : (
              <div className="text-3xl font-bold mt-1" style={{ color: "#171208" }}>
                {rows.length}
              </div>
            )}
          </Card>
          <Card className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#8B6914" }}>
              With write access
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-16 mt-2" />
            ) : (
              <div className="text-3xl font-bold mt-1" style={{ color: "#171208" }}>
                {rows.filter((r) => r.access_level === "data_entry").length}
              </div>
            )}
          </Card>
          <Card className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#8B6914" }}>
              Read-only
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-16 mt-2" />
            ) : (
              <div className="text-3xl font-bold mt-1" style={{ color: "#171208" }}>
                {rows.filter((r) => r.access_level !== "data_entry").length}
              </div>
            )}
          </Card>
        </div>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={18} style={{ color: "#8B6914" }} />
            <h2 className="text-base font-semibold" style={{ color: "#171208" }}>
              Firms with access
            </h2>
          </div>

          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}

          {!isLoading && rows.length === 0 && (
            <div className="text-center py-10">
              <Briefcase size={28} className="mx-auto mb-2" style={{ color: "rgba(23,18,8,0.30)" }} />
              <p className="text-sm" style={{ color: "rgba(23,18,8,0.60)" }}>
                No CA firms currently have access to your business.
              </p>
              <p className="text-[12px] mt-1" style={{ color: "rgba(23,18,8,0.45)" }}>
                When a CA firm requests access and you approve it, they'll appear here.
              </p>
            </div>
          )}

          {!isLoading && rows.length > 0 && (
            <div className="space-y-3">
              {rows.map((row) => {
                const firm = firms?.[row.ca_firm_id];
                return (
                  <div
                    key={row.id}
                    className="border rounded-lg p-4 flex items-start gap-4"
                    style={{ borderColor: "#E0D9C8", background: "#FFFFFF" }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "#FAF7F0", color: "#8B6914" }}
                    >
                      <Briefcase size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-[15px]" style={{ color: "#171208" }}>
                          {firm?.firm_name ?? "Chartered Accountant firm"}
                        </h3>
                        {firm?.is_verified && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                            style={{ background: "#DCFCE7", color: "#166534" }}
                          >
                            VERIFIED
                          </span>
                        )}
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                          style={{ background: "#FAF7F0", color: "#8B6914" }}
                        >
                          {accessLabel[row.access_level ?? ""] ?? row.access_level ?? "Access"}
                        </span>
                      </div>
                      <p className="text-[12px] mt-1" style={{ color: "rgba(23,18,8,0.60)" }}>
                        {firm?.membership_number ? `M.No. ${firm.membership_number}` : ""}
                        {firm?.membership_number && (firm?.city || firm?.state) ? " · " : ""}
                        {firm?.city ?? ""}{firm?.city && firm?.state ? ", " : ""}{firm?.state ?? ""}
                      </p>
                      {(firm?.email || firm?.phone) && (
                        <p className="text-[12px] mt-1" style={{ color: "rgba(23,18,8,0.55)" }}>
                          {firm?.email}
                          {firm?.email && firm?.phone ? " · " : ""}
                          {firm?.phone}
                        </p>
                      )}
                      <p className="text-[12px] mt-2" style={{ color: "rgba(23,18,8,0.50)" }}>
                        Access granted {formatDate(row.granted_at)}
                      </p>
                      {row.notes && (
                        <blockquote
                          className="text-[12px] mt-2 pl-3 border-l-2 italic"
                          style={{ borderColor: "#D4C9A8", color: "rgba(23,18,8,0.65)" }}
                        >
                          {row.notes}
                        </blockquote>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div
          className="flex items-start gap-2 p-4 rounded-lg"
          style={{ background: "#FAF7F0", border: "1px solid #E0D9C8" }}
        >
          <Info size={16} className="flex-shrink-0 mt-0.5" style={{ color: "#8B6914" }} />
          <p className="text-[13px]" style={{ color: "rgba(23,18,8,0.70)" }}>
            To revoke a CA firm's access, contact the firm directly or visit{" "}
            <a href="/dashboard/settings/ca-access" className="underline font-medium" style={{ color: "#C41E1E" }}>
              Settings → CA Access
            </a>
            .
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
