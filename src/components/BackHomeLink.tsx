import { ArrowLeft } from "lucide-react";
import { Link } from "@/lib/router-compat";
import { C } from "@/components/site/siteTheme";

/**
 * Shared "Back to home" pill shown at the top-left of every login page.
 * Uses the FynHelp site palette (cream pill, maroon hover) from siteTheme.
 */
export default function BackHomeLink() {
  return (
    <Link
      to="/"
      aria-label="Back to home"
      style={{
        position: "fixed",
        top: 16,
        left: 16,
        zIndex: 50,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        borderRadius: 999,
        background: C.card,
        border: `1px solid ${C.line}`,
        color: C.ink,
        fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif",
        fontSize: 13,
        fontWeight: 600,
        textDecoration: "none",
        boxShadow: "0 2px 10px rgba(23,18,8,0.08)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = C.maroon;
        e.currentTarget.style.borderColor = C.maroon;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = C.ink;
        e.currentTarget.style.borderColor = C.line;
      }}
    >
      <ArrowLeft size={15} />
      Back to home
    </Link>
  );
}
