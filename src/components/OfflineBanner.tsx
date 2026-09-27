import { useNetworkStatus } from "@/hooks/useNetworkStatus";

export default function OfflineBanner() {
  const { connected, checking } = useNetworkStatus();
  if (checking || connected) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: "#171208",
        color: "#F4EDDA",
        padding: "8px 16px",
        textAlign: "center",
        fontFamily: "Inter, sans-serif",
        fontSize: "13px",
        fontWeight: 500,
        letterSpacing: "0.01em",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      You are offline. Showing last cached data.
    </div>
  );
}
