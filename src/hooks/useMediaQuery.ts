import { useEffect, useState } from "react";

/**
 * SSR-safe media query hook. Returns false on the server and on the first
 * client render, then settles to the real value after hydration.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** True below the CA portal's desktop breakpoint (sidebar becomes a drawer). */
export const useIsCompactPortal = () => useMediaQuery("(max-width: 1023px)");

/** True on phone-sized screens, where wide tables render as cards. */
export const useIsPhone = () => useMediaQuery("(max-width: 767px)");
