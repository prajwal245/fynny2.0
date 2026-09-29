/**
 * FynHelp CFO-grade design system.
 * Navy + Gold palette for trust, authority, and premium feel.
 */
import type { Variants } from "framer-motion";

// ─── Typography ──────────────────────────────────────────────────────
export const typography = {
  display: {
    fontFamily: "'Space Grotesk', 'DM Sans', sans-serif",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    lineHeight: 1.1,
  },
  heading: {
    fontFamily: "'Plus Jakarta Sans Variable', 'DM Sans', sans-serif",
    fontWeight: 600,
    letterSpacing: "-0.01em",
    lineHeight: 1.2,
  },
  body: {
    fontFamily: "'DM Sans', system-ui, sans-serif",
    fontWeight: 400,
    letterSpacing: "0em",
    lineHeight: 1.6,
  },
  numbers: {
    fontFamily: "'SF Mono', 'Monaco', 'Menlo', monospace",
    fontWeight: 600,
    letterSpacing: "-0.01em",
    lineHeight: 1.3,
    fontFeatureSettings: '"tnum", "lnum"',
  },
} as const;

// ─── Colors ──────────────────────────────────────────────────────────
// FynHelp brand palette only, no navy, indigo, teal, or purple.
export const colors = {
  // Primary: Brand Red (FynHelp accent / CTAs / alerts)
  primary: {
    50:  "#F9DCDC",
    100: "#F2B5B5",
    300: "#E06A6A",
    400: "#D14444",
    500: "#C41E1E", // Main brand color
    600: "#a51818",
    700: "#8a1414",
    900: "#5a0d0d",
  },

  // Accent: Brand Gold (labels, borders, subtle highlights)
  accent: {
    50:  "#F5E9C8",
    300: "#C9A84C",
    500: "#8B6914", // Main accent
    600: "#735611",
    700: "#5b440d",
    900: "#3a2b08",
  },

  // Status colors, kept on brand. No green/blue.
  success: { light: "#C9A84C", main: "#8B6914", dark: "#5b440d" },
  warning: { light: "#C9A84C", main: "#8B6914", dark: "#5b440d" },
  danger:  { light: "#E06A6A", main: "#C41E1E", dark: "#8a1414" },
  info:    { light: "#C9A84C", main: "#8B6914", dark: "#5b440d" },

  // Backgrounds, warm dark ink hierarchy
  bg: {
    primary:   "#1A1008",
    secondary: "#1F0E07",
    tertiary:  "#2A1209",
    card:      "#1F0E07",
  },

  // Text hierarchy, beige on ink
  text: {
    primary:   "#F4EDDA",
    secondary: "rgba(244,237,218,0.55)",
    tertiary:  "rgba(244,237,218,0.40)",
    muted:     "rgba(244,237,218,0.30)",
  },
} as const;

// ─── Framer Motion variants ──────────────────────────────────────────
export const cardHover: Variants = {
  rest:  { y: 0,  rotateX: 0, rotateY: 0, scale: 1,    transition: { duration: 0.3 } },
  hover: { y: -8, rotateX: 2, rotateY: 2, scale: 1.02, transition: { duration: 0.3, ease: "easeOut" } },
};

export const buttonRotate: Variants = {
  rest:  { rotateY: 0,  rotateX: 0,  scale: 1 },
  hover: { rotateY: 15, rotateX: -5, scale: 1.05, transition: { duration: 0.3, ease: "easeOut" } },
  tap:   { rotateY: 0,  rotateX: 0,  scale: 0.95 },
};

export const fadeInUp: Variants = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export const staggerContainer: Variants = {
  hidden:  { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
};

export const pulseGlow = {
  animate: {
    opacity: [0.3, 0.6, 0.3],
    scale:   [1, 1.05, 1],
    transition: { duration: 3, repeat: Infinity, ease: "easeInOut" as const },
  },
};

export const shimmer = {
  animate: {
    x: ["-100%", "100%"],
    transition: { duration: 2, repeat: Infinity, ease: "linear" as const },
  },
};
