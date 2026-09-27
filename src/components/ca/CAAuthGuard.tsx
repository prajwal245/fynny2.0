import { ReactNode } from "react";
import { Navigate, useLocation } from "@/lib/router-compat";
import { useCAPortal } from "@/hooks/useCAPortal";
import { CA } from "./portalUi";

export default function CAAuthGuard({ children }: { children: ReactNode }) {
  const { userId, firmId, isLoading } = useCAPortal();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: CA.bg }}>
        <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted }}>Loading CA portal…</div>
      </div>
    );
  }
  if (!userId) return <Navigate to="/ca/login" replace state={{ from: location.pathname }} />;
  if (!firmId) return <Navigate to="/ca/register" replace />;
  return <>{children}</>;
}
