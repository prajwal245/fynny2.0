import { useEffect, useRef } from "react";

/**
 * Fixed full-viewport canvas backdrop for the homepage.
 * - Faint ledger grid drifting with scroll
 * - Soft red/gold color blooms migrating slowly
 * - Data motes linking to nearby motes, attracted to cursor
 * Respects prefers-reduced-motion.
 */
export default function LedgerCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
    const mouse = { x: -9999, y: -9999, active: false };
    let scrollY = window.scrollY;

    type Mote = { x: number; y: number; hx: number; hy: number; vx: number; vy: number; r: number; hue: "red" | "gold" | "ink" };
    type Bloom = { x: number; y: number; vx: number; vy: number; r: number; color: string };

    let motes: Mote[] = [];
    let blooms: Bloom[] = [];

    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      const count = W > 1024 ? 90 : W > 640 ? 55 : 32;
      motes = new Array(count).fill(0).map(() => {
        const x = Math.random() * W;
        const y = Math.random() * H;
        const h = Math.random();
        return {
          x, y, hx: x, hy: y,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15,
          r: 0.8 + Math.random() * 1.4,
          hue: h < 0.55 ? "ink" : h < 0.82 ? "gold" : "red",
        };
      });

      blooms = [
        { x: W * 0.2, y: H * 0.3, vx: 0.12, vy: 0.06, r: Math.max(W, H) * 0.45, color: "rgba(184,51,58,0.10)" },
        { x: W * 0.75, y: H * 0.55, vx: -0.09, vy: 0.11, r: Math.max(W, H) * 0.50, color: "rgba(139,105,20,0.09)" },
        { x: W * 0.5, y: H * 0.85, vx: 0.07, vy: -0.08, r: Math.max(W, H) * 0.40, color: "rgba(184,51,58,0.07)" },
      ];
    };

    const onResize = () => resize();
    const onScroll = () => { scrollY = window.scrollY; };
    const onMove = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; };
    const onLeave = () => { mouse.active = false; mouse.x = -9999; mouse.y = -9999; };

    resize();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseout", onLeave);

    const moteColor = (h: Mote["hue"], a: number) =>
      h === "red" ? `rgba(184,51,58,${a})` : h === "gold" ? `rgba(139,105,20,${a})` : `rgba(17,17,17,${a})`;

    let raf = 0;
    const GRID = 48;
    const LINK = 110;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // Ledger grid — drifts with scroll
      const off = ((scrollY * 0.25) % GRID + GRID) % GRID;
      ctx.strokeStyle = "rgba(17,17,17,0.045)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -off; x < W + GRID; x += GRID) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, H);
      }
      for (let y = -off; y < H + GRID; y += GRID) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(W, y + 0.5);
      }
      ctx.stroke();

      // Heavier ledger rules every 5 lines
      ctx.strokeStyle = "rgba(139,105,20,0.06)";
      ctx.beginPath();
      for (let y = -off; y < H + GRID; y += GRID * 5) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(W, y + 0.5);
      }
      ctx.stroke();

      // Blooms
      for (const b of blooms) {
        if (!reduced) {
          b.x += b.vx; b.y += b.vy;
          if (b.x < -b.r * 0.5 || b.x > W + b.r * 0.5) b.vx *= -1;
          if (b.y < -b.r * 0.5 || b.y > H + b.r * 0.5) b.vy *= -1;
        }
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, b.color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      // Motes update
      const SPRING = 0.008, DAMP = 0.92, REP = 130, REP2 = REP * REP;
      for (const p of motes) {
        if (!reduced) {
          p.vx += (p.hx - p.x) * SPRING;
          p.vy += (p.hy - p.y) * SPRING;
          if (mouse.active) {
            const dx = p.x - mouse.x, dy = p.y - mouse.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < REP2 && d2 > 0.01) {
              // Attracted to cursor (per spec)
              const d = Math.sqrt(d2);
              const t = 1 - d / REP;
              const f = t * t * 0.6;
              p.vx -= (dx / d) * f;
              p.vy -= (dy / d) * f;
            }
          }
          p.vx *= DAMP; p.vy *= DAMP;
          p.x += p.vx; p.y += p.vy;
        }
      }

      // Links
      ctx.lineWidth = 0.6;
      for (let i = 0; i < motes.length; i++) {
        const a = motes[i];
        for (let j = i + 1; j < motes.length; j++) {
          const b = motes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK * LINK) {
            const op = 0.10 * (1 - Math.sqrt(d2) / LINK);
            ctx.strokeStyle = `rgba(139,105,20,${op})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Motes draw
      for (const p of motes) {
        ctx.fillStyle = moteColor(p.hue, 0.55);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onLeave);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
