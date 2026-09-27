import { AnimatePresence, motion } from "framer-motion";
import { StatusBadge } from "./ProductsDropdown";
import { FYN } from "./widgets/Shared";
import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";

export interface MobileIcon {
  id: string;
  name: string;
  Icon?: LucideIcon;
  status: "live" | "coming_soon";
  onClick: () => void;
}

interface Props {
  open: boolean;
  icons: MobileIcon[];
}

export default function ProductsMobilePanel({ open, icons }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="lg:hidden"
          style={{
            position: "fixed",
            top: 72,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(26,26,26,0.85)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            zIndex: 90,
            overflowY: "auto",
            padding: "20px 16px 40px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
              maxWidth: 420,
              margin: "0 auto",
            }}
          >
            {icons.map((it, i) => {
              const Icon = it.Icon ?? Sparkles;
              const float = 2.8 + (i % 3) * 0.2;
              return (
                <motion.button
                  key={it.id}
                  type="button"
                  onClick={it.onClick}
                  initial={{ opacity: 0, x: 80, scale: 0.8, filter: "blur(8px)" }}
                  animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{
                    duration: 0.4,
                    delay: i * 0.06,
                    ease: [0.34, 1.56, 0.64, 1],
                  }}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    position: "relative",
                    aspectRatio: "1 / 1",
                    background: "linear-gradient(145deg, #FFFFFF 0%, #FAFAF8 100%)",
                    borderRadius: 20,
                    boxShadow:
                      "0 10px 30px rgba(196,30,30,0.15), 0 0 1px rgba(196,30,30,0.2), inset 0 1px 0 rgba(255,255,255,0.9)",
                    border: "1px solid rgba(196,30,30,0.1)",
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    textAlign: "center",
                    gap: 8,
                  }}
                >
                  <motion.div
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: float, repeat: Infinity, ease: "easeInOut" }}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
                  >
                    <Icon size={36} color={FYN.red} />
                    <span
                      style={{
                        fontFamily: "'Raleway', sans-serif",
                        fontWeight: 600,
                        fontSize: 12,
                        color: FYN.ink,
                        lineHeight: 1.25,
                      }}
                    >
                      {it.name}
                    </span>
                  </motion.div>
                  <span style={{ position: "absolute", top: 8, right: 8 }}>
                    <StatusBadge status={it.status} small />
                  </span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
