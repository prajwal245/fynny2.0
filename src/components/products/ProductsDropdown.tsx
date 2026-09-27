import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "@/lib/router-compat";
import { Clock, Bot, Lightbulb, UserCheck, BarChart3, X, type LucideIcon } from "lucide-react";
import { SUITES } from "@/data/suiteStatus";

const COLORS = {
  panelBg: "#FDFAF3",
  panelBgAlt: "#F9F5EB",
  border: "rgba(23,18,8,0.08)",
  borderStrong: "rgba(139,105,20,0.2)",
  text: "#171208",
  textDim: "rgba(23,18,8,0.55)",
  red: "#C41E1E",
  gold: "#8B6914",
};

const INVESTOR_BLUE = "#1D4ED8";

const PLATFORM_ICONS: Record<string, LucideIcon> = {
  nidhi: Bot,
  "decision-simulator": Lightbulb,
  "ca-partner-feature": UserCheck,
  "investor-view": BarChart3,
};

export function StatusBadge({ status }: { status: "live" | "coming_soon"; small?: boolean }) {
  if (status === "live") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "rgba(16,185,129,0.1)",
          border: "1px solid rgba(16,185,129,0.3)",
          padding: "3px 9px 3px 8px",
          borderRadius: 999,
          fontFamily: "Inter, sans-serif",
          fontSize: 10,
          fontWeight: 600,
          color: "#065f46",
          textTransform: "uppercase",
          letterSpacing: 0.8,
          lineHeight: 1,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#10b981",
            boxShadow: "0 0 6px rgba(16,185,129,0.6)",
            animation: "fyn-dropdown-pulse 1.4s ease-in-out infinite",
          }}
        />
        Live
      </span>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: "rgba(139,105,20,0.1)",
        border: "1px solid rgba(139,105,20,0.3)",
        padding: "3px 9px 3px 8px",
        borderRadius: 999,
        fontFamily: "Inter, sans-serif",
        fontSize: 10,
        fontWeight: 600,
        color: "#92400e",
        textTransform: "uppercase",
        letterSpacing: 0.8,
        lineHeight: 1,
      }}
    >
      <Clock size={10} />
      Soon
    </span>
  );
}

interface Row {
  id: string;
  name: string;
  description: string;
  status: "live" | "coming_soon";
  Icon: LucideIcon;
  onClick: () => void;
}

function ItemRow({ row, index }: { row: Row; index: number }) {
  const isInvestor = row.id === "investor-view";
  return (
    <motion.button
      type="button"
      onClick={row.onClick}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + index * 0.03, duration: 0.2, ease: "easeOut" }}
      className="fyn-intel-row"
    >
      <div
        className="fyn-intel-node"
        style={
          isInvestor
            ? { background: "rgba(29,78,216,0.1)", borderColor: "rgba(29,78,216,0.25)" }
            : undefined
        }
      >
        <row.Icon size={18} color={isInvestor ? INVESTOR_BLUE : "#171208"} strokeWidth={1.8} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1, textAlign: "left" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            fontFamily: "Inter, sans-serif",
            fontWeight: 600,
            fontSize: 14,
            color: isInvestor ? INVESTOR_BLUE : "#171208",
            letterSpacing: -0.1,
            lineHeight: 1.25,
          }}
        >
          <span>{row.name}</span>
          <StatusBadge status={row.status} />
        </div>
        <p
          style={{
            margin: 0,
            fontFamily: "Inter, sans-serif",
            fontWeight: 400,
            fontSize: 12.5,
            color: "rgba(23,18,8,0.55)",
            lineHeight: 1.45,
          }}
        >
          {row.description}
        </p>
      </div>
    </motion.button>
  );
}

interface Props {
  open: boolean;
  intelligenceItems: { id: string; name: string; description: string; status: "live" | "coming_soon" }[];
  businessItems: { name: string; status: "live" | "coming_soon" }[];
  platformItems: { id: string; name: string; description: string; status: "live" | "coming_soon" }[];
  onSelectIntelligence: (id: string) => void;
  onSelectBusiness: (idx: number) => void;
  onSelectPlatform: (id: string) => void;
  onClose: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export default function ProductsDropdown({
  open,
  intelligenceItems,
  platformItems,
  onSelectIntelligence,
  onSelectPlatform,
  onClose,
  onMouseEnter,
  onMouseLeave,
}: Props) {
  const navigate = useNavigate();

  const intelRows: Row[] = intelligenceItems.map((it) => {
    const suite = SUITES.find((s) => s.id === it.id);
    return {
      ...it,
      Icon: suite?.Icon ?? Bot,
      onClick: () => onSelectIntelligence(it.id),
    };
  });
  const platRows: Row[] = platformItems.map((it) => ({
    ...it,
    Icon: PLATFORM_ICONS[it.id] ?? Bot,
    onClick: () => onSelectPlatform(it.id),
  }));

  const liveCount = intelRows.filter((r) => r.status === "live").length + platRows.filter((r) => r.status === "live").length;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Mobile backdrop */}
          <motion.div
            key="fyn-products-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="lg:hidden"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(23,18,8,0.4)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              zIndex: 999,
            }}
          />

          {/* Desktop dropdown panel */}
          <motion.div
            key="fyn-products-dropdown"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            className="hidden lg:block"
            style={{
              position: "absolute",
              top: 72,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 1000,
              width: "min(1080px, 95vw)",
            }}
            role="menu"
          >
            <div className="fyn-products-panel">
              <div className="fyn-dropdown-grid">
                <div className="fyn-dropdown-col">
                  <div className="fyn-dropdown-header">Intelligence suites</div>
                  {intelRows.map((row, i) => (
                    <ItemRow key={row.id} row={row} index={i} />
                  ))}
                </div>
                <div className="fyn-dropdown-col">
                  <div className="fyn-dropdown-header">Platform features</div>
                  {platRows.map((row, i) => (
                    <ItemRow key={row.id} row={row} index={i} />
                  ))}
                </div>
              </div>
              <div className="fyn-dropdown-footer">
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "rgba(23,18,8,0.45)" }}>
                  {liveCount} live modules across your financial stack
                </span>
                <button
                  type="button"
                  onClick={() => { onClose(); navigate("/#product-ecosystem"); }}
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontSize: 12,
                    fontWeight: 600,
                    color: COLORS.red,
                    background: "rgba(196,30,30,0.07)",
                    borderRadius: 8,
                    padding: "6px 14px",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  View all products
                </button>
              </div>
            </div>
          </motion.div>

          {/* Mobile full-screen drawer */}
          <motion.div
            key="fyn-products-mobile"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="lg:hidden"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: COLORS.panelBg,
              zIndex: 1000,
              overflowY: "auto",
              padding: "72px 20px 32px",
            }}
            role="menu"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                width: 40,
                height: 40,
                borderRadius: 999,
                border: `1px solid ${COLORS.border}`,
                background: "rgba(23,18,8,0.04)",
                color: COLORS.text,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <X size={18} />
            </button>
            <div style={{ marginBottom: 12 }}>
              <div className="fyn-dropdown-header">Intelligence suites</div>
            </div>
            <div className="fyn-dropdown-col">
              {intelRows.map((row, i) => (
                <ItemRow key={row.id} row={row} index={i} />
              ))}
            </div>
            <div style={{ margin: "28px 0 12px" }}>
              <div className="fyn-dropdown-header">Platform features</div>
            </div>
            <div className="fyn-dropdown-col">
              {platRows.map((row, i) => (
                <ItemRow key={row.id} row={row} index={i + intelRows.length} />
              ))}
            </div>
          </motion.div>

          <style>{`
            .fyn-products-panel {
              position: relative;
              background: ${COLORS.panelBg};
              border: 1px solid ${COLORS.borderStrong};
              border-radius: 20px;
              overflow: hidden;
              box-shadow: 0 16px 48px rgba(23,18,8,0.12), 0 0 1px rgba(139,105,20,0.2);
            }
            .fyn-dropdown-header {
              font-family: Inter, sans-serif;
              font-weight: 600;
              font-size: 11px;
              letter-spacing: 1.5px;
              color: rgba(23,18,8,0.4);
              text-transform: uppercase;
              padding: 4px 14px 8px;
            }
            .fyn-dropdown-grid {
              position: relative;
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
              gap: 8px;
              padding: 20px 16px 20px;
            }
            .fyn-dropdown-col { display: flex; flex-direction: column; gap: 2px; }
            .fyn-dropdown-footer {
              background: rgba(23,18,8,0.02);
              border-top: 1px solid rgba(23,18,8,0.06);
              padding: 10px 24px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .fyn-intel-row {
              display: flex;
              align-items: flex-start;
              gap: 14px;
              width: 100%;
              padding: 12px 14px;
              border-radius: 10px;
              background: transparent;
              border: none;
              border-left: 2px solid transparent;
              cursor: pointer;
              transition: background 180ms ease, border-color 180ms ease;
            }
            .fyn-intel-row:hover {
              background: rgba(244,237,218,0.8);
              border-left-color: ${COLORS.red};
            }
            .fyn-intel-node {
              width: 36px; height: 36px;
              flex-shrink: 0;
              border-radius: 9px;
              background: rgba(23,18,8,0.04);
              border: 1px solid rgba(23,18,8,0.08);
              display: flex; align-items: center; justify-content: center;
              transition: background 180ms ease, border-color 180ms ease;
            }
            .fyn-intel-row:hover .fyn-intel-node {
              background: rgba(196,30,30,0.08);
              border-color: rgba(196,30,30,0.3);
            }
            @keyframes fyn-dropdown-pulse {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.4); opacity: 0.5; }
            }
          `}</style>
        </>
      )}
    </AnimatePresence>
  );
}
