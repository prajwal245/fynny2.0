import { useNavigate } from "@/lib/router-compat";

const INK = "#171208";
const BEIGE = "#F4EDDA";
const GOLD = "#8B6914";
const RED = "#C41E1E";

export default function ArchivedFeaturePage() {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: "100vh", background: BEIGE, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px" }}>
      <div style={{ maxWidth: 480, textAlign: "center" }}>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: GOLD, marginBottom: 12 }}>
          Feature unavailable
        </div>
        <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 28, color: INK, marginBottom: 12, lineHeight: 1.2 }}>
          This module is temporarily unavailable
        </h1>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, color: "rgba(23,18,8,0.6)", lineHeight: 1.65, marginBottom: 28 }}>
          This feature is undergoing refinement before its public release. Your existing data is safe and untouched. We will notify you when it becomes available.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => navigate("/dashboard/cockpit")}
            style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 14, background: RED, color: "white", border: "none", borderRadius: 8, padding: "11px 24px", cursor: "pointer" }}
          >
            Back to dashboard
          </button>
          <button
            onClick={() => navigate(-1)}
            style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 14, background: "transparent", color: INK, border: "1px solid rgba(23,18,8,0.2)", borderRadius: 8, padding: "11px 24px", cursor: "pointer" }}
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}
