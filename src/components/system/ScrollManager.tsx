import { useEffect, useState } from "react";
import { useLocation } from "@/lib/router-compat";
import { ArrowUp } from "lucide-react";

/**
 * Resets scroll on route change and renders a back-to-top button
 * once the user has scrolled past one viewport.
 */
export default function ScrollManager() {
  const { pathname } = useLocation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      className="fyn-no-print"
      style={{
        position: "fixed",
        right: 20,
        bottom: 88,
        width: 40,
        height: 40,
        borderRadius: 12,
        border: "1px solid rgba(23,18,8,0.12)",
        background: "#FFFFFF",
        color: "#171208",
        boxShadow: "0 8px 24px rgba(23,18,8,0.14)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        zIndex: 70,
      }}
    >
      <ArrowUp size={17} />
    </button>
  );
}
