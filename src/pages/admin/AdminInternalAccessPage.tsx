import { useNavigate } from "@/lib/router-compat";
import { ChevronRight, Users, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Internal Access page. Provides direct launch cards for the SME client demo
 * and the CA partner demo. No password gate — access is already scoped by the
 * admin route protection.
 */
export default function AdminInternalAccessPage() {
  const nav = useNavigate();

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontWeight: 700,
            fontSize: 28,
            color: "hsl(var(--fyn-ink))",
            margin: 0,
          }}
        >
          Internal Access
        </h1>
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 14,
            color: "hsl(var(--fyn-ink) / 0.6)",
            marginTop: 6,
          }}
        >
          Launch internal demo environments for the FYNHelp team.
        </p>
      </div>

      {/* SME Client Demo card */}
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid hsl(var(--fyn-gold) / 0.25)",
          borderRadius: 16,
          padding: 28,
          boxShadow: "0 8px 24px hsl(var(--fyn-ink) / 0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <LayoutDashboard size={18} style={{ color: "#A93838" }} />
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 20, color: "hsl(var(--fyn-ink))", margin: 0 }}>
            SME Client Demo
          </h2>
        </div>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.65)", margin: 0, marginBottom: 18 }}>
          Full SME client dashboard with 5 intelligence modules, Fynny AI CFO, liquidity tracking, revenue analytics, and compliance calendar. Pre-loaded with realistic demo business data.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => nav("/dashboard")}
            style={{
              background: "#C41E1E", color: "#fff", border: "none", borderRadius: 10,
              padding: "12px 18px", fontFamily: "Inter, sans-serif", fontWeight: 600,
              fontSize: 14, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
            }}
          >
            Launch SME Demo <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* CA Partner Demo card */}
      <div
        style={{
          marginTop: 24,
          background: "#FFFFFF",
          border: "1px solid hsl(var(--fyn-gold) / 0.25)",
          borderRadius: 16,
          padding: 28,
          boxShadow: "0 8px 24px hsl(var(--fyn-ink) / 0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Users size={18} style={{ color: "#A93838" }} />
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 20, color: "hsl(var(--fyn-ink))", margin: 0 }}>
            CA Partner Demo
          </h2>
        </div>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.65)", margin: 0, marginBottom: 18 }}>
          8 demo clients covering Textiles, IT, Agriculture, Logistics, Food, Manufacturing, Pharma, and Creative Services. Includes compliance events, ITC records, TDS records, and notifications.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => nav("/ca/dashboard")}
            style={{
              background: "#C41E1E", color: "#fff", border: "none", borderRadius: 10,
              padding: "12px 18px", fontFamily: "Inter, sans-serif", fontWeight: 600,
              fontSize: 14, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
            }}
          >
            Launch CA Demo <ChevronRight size={16} />
          </button>
          <button
            onClick={async () => {
              const { error } = await supabase.rpc("clear_ca_demo_data" as any);
              if (error) toast.error(error.message);
              else toast.success("CA demo data cleared.");
            }}
            style={{
              background: "transparent", color: "hsl(var(--fyn-ink))",
              border: "1px solid hsl(var(--fyn-ink) / 0.2)", borderRadius: 10,
              padding: "12px 18px", fontFamily: "Inter, sans-serif", fontWeight: 600,
              fontSize: 14, cursor: "pointer",
            }}
          >
            Clear demo data
          </button>
        </div>
      </div>
    </div>
  );
}
