import { useEffect, useState } from "react";

/** Thin reading-progress bar. Mount on long-form pages (blog articles, docs). */
export default function ScrollProgress() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setPct(h > 0 ? Math.min(100, (window.scrollY / h) * 100) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      className="fyn-no-print"
      aria-hidden
      style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, zIndex: 90, background: "transparent" }}
    >
      <div style={{ height: "100%", width: `${pct}%`, background: "#A93838", transition: "width 80ms linear" }} />
    </div>
  );
}
