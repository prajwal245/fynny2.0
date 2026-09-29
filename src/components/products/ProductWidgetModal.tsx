import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "@/lib/router-compat";
import { X } from "lucide-react";
import LiquidityWidget from "./widgets/LiquidityWidget";
import RevenueWidget from "./widgets/RevenueWidget";
import CostWidget from "./widgets/CostWidget";
import GstWidget from "./widgets/GstWidget";
import SimulatorWidget from "./widgets/SimulatorWidget";
import FynnyWidget from "./widgets/FynnyWidget";
import GenericWidget from "./widgets/GenericWidget";
import CAPartnerWidget from "./widgets/CAPartnerWidget";
import type { WidgetKey } from "./productMeta";
import { FYN } from "./widgets/Shared";

export interface ModalProduct {
  name: string;
  description: string;
  widget: WidgetKey;
  href: string;
  status: "live" | "coming_soon";
}

interface Props {
  product: ModalProduct | null;
  onClose: () => void;
}

function renderWidget(product: ModalProduct) {
  switch (product.widget) {
    case "liquidity": return <LiquidityWidget />;
    case "revenue": return <RevenueWidget />;
    case "cost": return <CostWidget />;
    case "gst": return <GstWidget />;
    case "simulator": return <SimulatorWidget />;
    case "fynny": return <FynnyWidget />;
    case "ca-partner": return <CAPartnerWidget />;
    default: return <GenericWidget name={product.name} />;
  }
}

export default function ProductWidgetModal({ product, onClose }: Props) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!product) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [product, onClose]);

  const handleCta = () => {
    onClose();
    if (product?.status === "coming_soon") {
      navigate("/waitlist");
    } else {
      navigate(product?.href ?? "/dashboard/cockpit");
    }
  };

  return (
    <AnimatePresence>
      {product && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(26,26,26,0.92)",
            backdropFilter: "blur(12px) saturate(120%)",
            WebkitBackdropFilter: "blur(12px) saturate(120%)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            overflowY: "auto",
          }}
          role="dialog"
          aria-modal="true"
          aria-label={product.name}
        >
          <motion.div
            key={product.name}
            initial={{ opacity: 0, scale: 0.9, y: 30, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.95, filter: "blur(5px)" }}
            transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 900,
              background: "linear-gradient(145deg, #FFFFFF 0%, #FAFAF8 100%)",
              borderRadius: 24,
              boxShadow:
                "0 40px 80px rgba(196,30,30,0.25), 0 0 1px rgba(196,30,30,0.3), inset 0 1px 0 rgba(255,255,255,0.9)",
              border: "1px solid rgba(196,30,30,0.1)",
              padding: "40px 32px 32px",
              position: "relative",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="fyn-modal-close"
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: FYN.beige,
                color: FYN.ink,
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
              }}
            >
              <X size={20} />
            </button>

            {/* Header */}
            <div style={{ marginBottom: 20, paddingRight: 40 }}>
              <h2
                style={{
                  fontFamily: "'Oswald', sans-serif",
                  fontWeight: 700,
                  fontSize: "clamp(26px, 4vw, 36px)",
                  color: FYN.ink,
                  letterSpacing: "-0.5px",
                  margin: 0,
                  marginBottom: 8,
                  lineHeight: 1.1,
                }}
              >
                {product.name}
              </h2>
              <p
                style={{
                  fontFamily: "'Roboto', sans-serif",
                  fontSize: 15,
                  color: FYN.gray,
                  lineHeight: 1.6,
                  margin: 0,
                  maxWidth: 600,
                }}
              >
                {product.description}
              </p>
            </div>

            {/* Widget */}
            <div style={{ marginTop: 8 }}>{renderWidget(product)}</div>

            {/* CTA */}
            <div style={{ marginTop: 24, display: "flex", justifyContent: "center" }}>
              <button
                type="button"
                onClick={handleCta}
                className="fyn-cta-btn"
                style={{
                  background: `linear-gradient(135deg, ${FYN.red} 0%, ${FYN.redBright} 100%)`,
                  color: FYN.white,
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 700,
                  fontSize: 15,
                  padding: "14px 40px",
                  borderRadius: 12,
                  border: "none",
                  boxShadow: "0 8px 24px rgba(196,30,30,0.4)",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  cursor: "pointer",
                  transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
                }}
              >
                {product.status === "coming_soon" ? "Join Waitlist" : "Open in Dashboard"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
