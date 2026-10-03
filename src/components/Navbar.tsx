/**
 * Site header: four links, one sign-in, two actions. Every link goes to a
 * real page about the product that exists today; no mega-menus.
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "@/lib/router-compat";
import { Menu, X } from "lucide-react";
import FynLogo from "@/components/FynLogo";
import { C } from "@/components/site/siteTheme";
import {
  CTA_DEMO,
  CTA_START,
  SIGNUP_URL,
  trackCta,
} from "@/components/site/cta";
import { DemoLink } from "@/components/site/BookDemo";

const SIGNIN_URL = "/v2/onboarding?mode=signin";

const LINKS: { label: string; href: string }[] = [
  { label: "Product", href: "/pipeline" },
  { label: "Pricing", href: "/pricing" },
  { label: "Security", href: "/security" },
  { label: "About", href: "/about" },
];

const STYLES = `
.sh { position:sticky; top:env(safe-area-inset-top,0px); z-index:50; background:rgba(242,238,231,.86); backdrop-filter:saturate(1.4) blur(12px); -webkit-backdrop-filter:saturate(1.4) blur(12px); border-bottom:1px solid transparent; transition:border-color .2s, box-shadow .2s; font-family:'Instrument Sans','Inter',system-ui,sans-serif; }
.sh.scrolled { border-bottom-color:${C.line}; box-shadow:0 8px 24px -20px rgba(23,18,8,.35); }
.sh-in { max-width:1200px; margin:0 auto; padding:0 22px; height:66px; display:flex; align-items:center; gap:28px; }
.sh-logo { display:inline-flex; align-items:center; gap:9px; flex:0 0 auto; text-decoration:none; }
.sh-word { font-size:20px; font-weight:700; letter-spacing:-0.035em; color:${C.ink}; }
.sh-nav { display:flex; align-items:center; gap:4px; flex:1; }
.sh-link { font-size:15px; font-weight:500; color:${C.body}; text-decoration:none; padding:8px 12px; border-radius:999px; transition:color .15s, background .15s; }
.sh-link:hover { color:${C.ink}; background:rgba(23,18,8,.05); }
.sh-link[aria-current="page"] { color:${C.ink}; }
.sh-right { display:flex; align-items:center; gap:10px; }
.sh-btn { display:inline-flex; align-items:center; justify-content:center; height:40px; padding:0 18px; border-radius:999px; font-size:14.5px; font-weight:600; text-decoration:none; white-space:nowrap; transition:transform .15s, background .15s, border-color .15s; }
.sh-btn:hover { transform:translateY(-1px); }
.sh-primary { background:${C.ink}; color:${C.onDark}; }
.sh-primary:hover { background:${C.inkDeep}; }
.sh-ghost { color:${C.ink}; border:1px solid rgba(23,18,8,.16); background:transparent; }
.sh-ghost:hover { border-color:rgba(23,18,8,.4); }
.sh a:focus-visible, .sh button:focus-visible { outline:2px solid ${C.coral}; outline-offset:2px; }
.sh-menu-btn { display:none; width:40px; height:40px; border-radius:999px; border:1px solid rgba(23,18,8,.16); background:transparent; color:${C.ink}; align-items:center; justify-content:center; cursor:pointer; }
.sh-sheet { position:fixed; inset:66px 0 0 0; background:${C.page}; z-index:49; padding:12px 22px calc(24px + env(safe-area-inset-bottom,0px)); display:flex; flex-direction:column; gap:4px; overflow-y:auto; }
.sh-sheet a.sh-m { font-size:20px; font-weight:600; color:${C.ink}; text-decoration:none; padding:14px 2px; border-bottom:1px solid ${C.line}; letter-spacing:-0.01em; }
.sh-sheet .sh-actions { display:grid; gap:10px; margin-top:22px; }
.sh-sheet .sh-btn { height:50px; font-size:16px; }
@media (max-width: 900px) {
  .sh-nav, .sh-right .sh-hide-m { display:none; }
  .sh-menu-btn { display:inline-flex; }
  .sh-in { gap:12px; justify-content:space-between; }
  .sh-right .sh-btn { height:38px; padding:0 14px; font-size:14px; }
}
@media (prefers-reduced-motion: reduce) { .sh-btn, .sh-link { transition:none; } .sh-btn:hover { transform:none; } }
`;

export default function Navbar() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the phone menu on navigation, lock the page behind it, Esc closes.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined;

  return (
    <>
      <header className={`sh${scrolled || open ? " scrolled" : ""}`}>
        <style>{STYLES}</style>
        <div className="sh-in">
          <Link to="/" className="sh-logo" aria-label="FynHelp home">
            <FynLogo iconOnly size="sm" />
            <span className="sh-word">FynHelp</span>
          </Link>

          <nav className="sh-nav" aria-label="Main">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                to={l.href}
                className="sh-link"
                aria-current={current(l.href)}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="sh-right">
            <Link
              to={SIGNIN_URL}
              className="sh-link sh-hide-m"
              onClick={() => trackCta("signin", "nav")}
            >
              Sign in
            </Link>
            <DemoLink location="nav" className="sh-btn sh-ghost sh-hide-m">
              {CTA_DEMO}
            </DemoLink>
            <Link
              to={SIGNUP_URL}
              className="sh-btn sh-primary"
              onClick={() => trackCta("start", "nav")}
            >
              {CTA_START}
            </Link>
            <button
              type="button"
              className="sh-menu-btn"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="sh-sheet"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/* Outside <header>: its backdrop blur would trap a fixed panel inside the bar. */}
      {open && (
        <div className="sh-sheet" id="sh-sheet">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              to={l.href}
              className="sh-m"
              aria-current={current(l.href)}
            >
              {l.label}
            </Link>
          ))}
          <Link
            to={SIGNIN_URL}
            className="sh-m"
            onClick={() => trackCta("signin", "nav-mobile")}
          >
            Sign in
          </Link>
          <div className="sh-actions">
            <Link
              to={SIGNUP_URL}
              className="sh-btn sh-primary"
              onClick={() => trackCta("start", "nav-mobile")}
            >
              {CTA_START}
            </Link>
            <DemoLink location="nav-mobile" className="sh-btn sh-ghost">
              {CTA_DEMO}
            </DemoLink>
          </div>
        </div>
      )}
    </>
  );
}
