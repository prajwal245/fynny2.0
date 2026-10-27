import type { CSSProperties } from "react";

/** Writes a style the way the design does ("a: b; c: d") and returns the React object. */
export const css = (text: string): CSSProperties => {
  const out: Record<string, string> = {};
  for (const part of text.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) continue;
    out[k.startsWith("--") ? k : k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  }
  return out as CSSProperties;
};
