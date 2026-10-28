/**
 * The marketing site's palette: the colours the homepage ("/") is built from. They match the shared theme
 * tokens in src/legacy-theme.css (page = --background, ink = --foreground, card = --card, maroon = --primary,
 * gold = --accent). The homepage and the launch page both import this, so they cannot drift apart.
 * The marketing site is light only (the root layout removes the "dark" class before first paint).
 */
export const C = {
  page: "#F2EEE7",
  pageAlt: "#EBE6DD",
  card: "#FFFDF9",
  ink: "#171208",
  inkDeep: "#0E0B06",
  body: "rgba(23,18,8,0.62)",
  muted: "rgba(23,18,8,0.42)",
  line: "rgba(23,18,8,0.09)",
  lineSoft: "rgba(23,18,8,0.055)",
  maroon: "#A93838",
  maroonDeep: "#5C1216",
  coral: "#E2673F",
  gold: "#8B6914",
  green: "#1F5A46",
  onDark: "#F7F1E6",
} as const;

/** Text on the maroon and coral surfaces: the theme's --primary-foreground (white). */
export const ON_PRIMARY = "hsl(var(--primary-foreground))";
