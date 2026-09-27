import { Navigate } from "@/lib/router-compat";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export default function ProtectedCeoRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, hasRole } = useAdminAuth();
  const toastedRef = useRef(false);
  const isSuper = hasRole("super_admin");

  useEffect(() => {
    if (loading || toastedRef.current) return;
    if (!user) {
      toast.error("Please log in to access this page");
      toastedRef.current = true;
    } else if (!isSuper) {
      toast.error("Access Denied: CEO View requires super admin privileges");
      toastedRef.current = true;
    }
  }, [loading, user, isSuper]);

  if (loading) {
    return (
      <div className="grid place-items-center" style={{ minHeight: "60vh" }}>
        <div className="text-center">
          <div
            style={{
              width: 40, height: 40, margin: "0 auto 16px",
              border: "3px solid rgba(139,105,20,0.2)",
              borderTopColor: "#C41E1E",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <p style={{ fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.6)" }}>
            Verifying access...
          </p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/admin/login" replace />;
  if (!isSuper) return <Navigate to="/admin/dashboard" replace />;

  return <>{children}</>;
}
