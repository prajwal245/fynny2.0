import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { buttonRotate, colors } from "@/lib/design-system";

interface RotatingButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  className?: string;
}

export function RotatingButton({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  className = "",
}: RotatingButtonProps) {
  const gradients: Record<NonNullable<RotatingButtonProps["variant"]>, string> = {
    primary:   `linear-gradient(135deg, ${colors.primary[500]} 0%, ${colors.primary[700]} 100%)`,
    secondary: `linear-gradient(135deg, ${colors.accent[500]} 0%, ${colors.accent[700]} 100%)`,
    danger:    `linear-gradient(135deg, ${colors.danger.main} 0%, ${colors.danger.dark} 100%)`,
  };

  const glowColor =
    variant === "primary"
      ? colors.primary[500]
      : variant === "secondary"
      ? colors.accent[500]
      : colors.danger.main;

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      variants={buttonRotate}
      initial="rest"
      whileHover={disabled ? undefined : "hover"}
      whileTap={disabled ? undefined : "tap"}
      animate="rest"
      style={{
        transformStyle: "preserve-3d",
        perspective: 1000,
        background: gradients[variant],
      }}
      className={`relative px-8 py-4 rounded-xl text-white font-semibold overflow-hidden shadow-2xl transition-opacity ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      } ${className}`}
    >
      {/* Inner glow layer */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-white/25 via-white/5 to-transparent rounded-xl pointer-events-none"
        style={{ transform: "translateZ(10px)" }}
      />

      {/* Text layer */}
      <span
        className="relative z-10 inline-flex items-center gap-2"
        style={{ transform: "translateZ(20px)" }}
      >
        {children}
      </span>

      {/* Shimmer sweep on hover */}
      <motion.div
        className="absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none"
        initial={{ x: "-100%" }}
        whileHover={{ x: "300%" }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />

      {/* Shadow / glow layer */}
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-xl blur-xl pointer-events-none -z-10"
        style={{
          background: glowColor,
          opacity: 0.35,
          transform: "translateZ(-10px)",
        }}
        animate={{ opacity: [0.25, 0.45, 0.25] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.button>
  );
}

export default RotatingButton;
