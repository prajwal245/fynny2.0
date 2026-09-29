import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  hx: number; // home x
  hy: number; // home y
  vx: number;
  vy: number;
  size: number;
  color: string;
};

const BEIGE_VARIANTS = [
  [244, 237, 218],
  [240, 230, 210],
  [235, 224, 200],
];
const RED = [196, 30, 30];
const GOLD = [139, 105, 20];

function makeColor() {
  const r = Math.random();
  if (r < 0.6) {
    const c = BEIGE_VARIANTS[Math.floor(Math.random() * BEIGE_VARIANTS.length)];
    const o = 0.2 + Math.random() * 0.3;
    return `rgba(${c[0]},${c[1]},${c[2]},${o})`;
  } else if (r < 0.85) {
    const o = 0.15 + Math.random() * 0.25;
    return `rgba(${RED[0]},${RED[1]},${RED[2]},${o})`;
  } else {
    const o = 0.15 + Math.random() * 0.25;
    return `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${o})`;
  }
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let particles: Particle[] = [];
    let width = window.innerWidth;
    let height = window.innerHeight;
    const mouse = { x: -9999, y: -9999, active: false };
    const LINK_DIST = 120;
    const CELL = LINK_DIST;

    const getCount = () => (window.innerWidth > 768 ? 20000 : 8000);

    const initParticles = () => {
      const count = getCount();
      particles = new Array(count).fill(0).map(() => {
        const x = Math.random() * width;
        const y = Math.random() * height;
        return {
          x,
          y,
          hx: x,
          hy: y,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          size: 1 + Math.random() * 1.5,
          color: makeColor(),
        };
      });
    };

    const getDocHeight = () =>
      Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        window.innerHeight
      );

    const resize = () => {
      width = window.innerWidth;
      height = getDocHeight();
      canvas.width = width;
      canvas.height = height;
      initParticles();
    };

    const updateHeightOnly = () => {
      const newH = getDocHeight();
      if (Math.abs(newH - height) > 4) {
        height = newH;
        canvas.height = newH;
      }
    };

    resize();

    let resizeTimer: number | undefined;
    const onResize = () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 200);
    };

    let scrollTimer: number | undefined;
    const onScroll = () => {
      if (scrollTimer) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(updateHeightOnly, 150);
    };

    const onMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY + window.scrollY;
      mouse.active = true;
    };
    const onMouseLeave = () => {
      mouse.active = false;
      mouse.x = -9999;
      mouse.y = -9999;
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseout", onMouseLeave);

    let rafId = 0;
    const tick = () => {
      ctx.clearRect(0, 0, width, height);

      const REPEL_RADIUS = 160;
      const REPEL_RADIUS_SQ = REPEL_RADIUS * REPEL_RADIUS;
      const SPRING = 0.012;   // pull back to home
      const DAMPING = 0.88;   // velocity damping (water viscosity)

      // Update particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Spring back toward home position
        p.vx += (p.hx - p.x) * SPRING;
        p.vy += (p.hy - p.y) * SPRING;

        // Mouse repulsion, smooth eased displacement (water ripple)
        if (mouse.active) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < REPEL_RADIUS_SQ && d2 > 0.01) {
            const dist = Math.sqrt(d2);
            const t = 1 - dist / REPEL_RADIUS;
            // eased falloff: smoothstep-like for water feel
            const force = t * t * 2.2;
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
          }
        }

        // Apply velocity with viscous damping
        p.vx *= DAMPING;
        p.vy *= DAMPING;
        p.x += p.vx;
        p.y += p.vy;

        // Soft boundary clamp
        if (p.x < 0) { p.x = 0; p.vx *= -0.5; }
        else if (p.x > width) { p.x = width; p.vx *= -0.5; }
        if (p.y < 0) { p.y = 0; p.vy *= -0.5; }
        else if (p.y > height) { p.y = height; p.vy *= -0.5; }
      }

      // Draw particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Connections via spatial hash grid for performance
      const cols = Math.max(1, Math.ceil(width / CELL));
      const rows = Math.max(1, Math.ceil(height / CELL));
      const grid: number[][] = new Array(cols * rows);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const cx = Math.min(cols - 1, Math.max(0, Math.floor(p.x / CELL)));
        const cy = Math.min(rows - 1, Math.max(0, Math.floor(p.y / CELL)));
        const idx = cy * cols + cx;
        if (!grid[idx]) grid[idx] = [];
        grid[idx].push(i);
      }

      ctx.lineWidth = 0.5;
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const cellIdx = cy * cols + cx;
          const cell = grid[cellIdx];
          if (!cell) continue;
          for (let ny = cy; ny <= cy + 1; ny++) {
            for (let nx = cx - 1; nx <= cx + 1; nx++) {
              if (ny === cy && nx < cx) continue;
              if (nx < 0 || nx >= cols || ny >= rows) continue;
              const neighbor = grid[ny * cols + nx];
              if (!neighbor) continue;
              for (let a = 0; a < cell.length; a++) {
                const i = cell[a];
                const startB = neighbor === cell ? a + 1 : 0;
                for (let b = startB; b < neighbor.length; b++) {
                  const j = neighbor[b];
                  const p1 = particles[i];
                  const p2 = particles[j];
                  const dx = p1.x - p2.x;
                  const dy = p1.y - p2.y;
                  const d2 = dx * dx + dy * dy;
                  if (d2 < LINK_DIST * LINK_DIST) {
                    const dist = Math.sqrt(d2);
                    const op = 0.12 * (1 - dist / LINK_DIST);
                    ctx.strokeStyle = `rgba(196,30,30,${op})`;
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                  }
                }
              }
            }
          }
        }
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseout", onMouseLeave);
      if (resizeTimer) window.clearTimeout(resizeTimer);
      if (scrollTimer) window.clearTimeout(scrollTimer);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      id="particleCanvas"
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        zIndex: 50,
        pointerEvents: "none",
        mixBlendMode: "screen",
        opacity: 0.55,
      }}
    />
  );
}
