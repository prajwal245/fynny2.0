import { useAuth } from "@/contexts/AuthContext";

export type TeamRole = "owner" | "manager" | "accountant" | "viewer";

export const TEAM_ROLES: { value: TeamRole; label: string; desc: string }[] = [
  { value: "owner", label: "Owner", desc: "Full access including billing, settings, and deletion." },
  { value: "manager", label: "Manager", desc: "View and edit all financial data. No billing or deletion." },
  { value: "accountant", label: "Accountant", desc: "View and edit GST, tax, and reports. No company settings." },
  { value: "viewer", label: "Viewer", desc: "Read-only access across the workspace." },
];

function normalize(r?: string | null): TeamRole {
  const v = String(r ?? "").toLowerCase();
  if (v === "owner" || v === "manager" || v === "accountant" || v === "viewer") return v;
  // Legacy values default to owner for the account creator, viewer otherwise.
  if (v === "admin") return "owner";
  return "owner";
}

export function useUserRole() {
  const { profile, loading } = useAuth();
  const role = normalize(profile?.role);
  return {
    role,
    loading,
    isOwner: role === "owner",
    canEditFinancials: role === "owner" || role === "manager" || role === "accountant",
    canAccessBilling: role === "owner",
    canManageSettings: role === "owner",
    canAccessTaxAndReports: role !== "viewer",
  };
}
