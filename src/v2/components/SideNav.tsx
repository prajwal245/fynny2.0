/**
 * The side navigation: a slim rail (logo on top, one icon per area, help and sign out below) and beside it a panel
 * that groups the pages, with the group you are in open. The panel can fold away to leave only the rail.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, BarChart3, BookOpen, ChevronDown, ChevronLeft, ChevronRight, FileText, LayoutGrid, ListChecks, LogOut, Send, Settings, Users, X } from "lucide-react";
import type { ComponentType } from "react";
import { V } from "../ui";
import { FirstCloseLauncher } from "./FirstCloseGuide";
import iconRed from "@/assets/brand/fynhelp-icon-red-new.png";
import iconCream from "@/assets/brand/fynhelp-icon-cream-new.png";

type Item = { to: string; label: string; icon: ComponentType<{ size?: number }>; exact?: boolean };
type Group = { id: string; label: string; icon: ComponentType<{ size?: number }>; items: Item[]; partnerOnly?: boolean };

export const NAV_GROUPS: Group[] = [
  { id: "home", label: "Portfolio", icon: LayoutGrid, items: [{ to: "/app", label: "Portfolio", icon: LayoutGrid, exact: true }] },
  {
    id: "clients",
    label: "Clients",
    icon: Users,
    items: [
      { to: "/app/clients", label: "Clients", icon: Users },
      { to: "/app/documents", label: "Documents", icon: FileText },
    ],
  },
  {
    id: "checks",
    label: "Checks",
    icon: ListChecks,
    items: [
      { to: "/app/review", label: "Review Queue", icon: ListChecks },
      { to: "/app/exceptions", label: "Exception Queue", icon: AlertTriangle },
    ],
  },
  { id: "chaser", label: "Chaser", icon: Send, items: [{ to: "/app/chaser", label: "Chaser", icon: Send }] },
  { id: "reports", label: "MIS and Reports", icon: BarChart3, items: [{ to: "/app/reports", label: "MIS and Reports", icon: BarChart3 }] },
  { id: "settings", label: "Settings", icon: Settings, partnerOnly: true, items: [{ to: "/app/settings", label: "Settings", icon: Settings }] },
];

const here = (pathname: string, i: Item) => (i.exact ? pathname === i.to : pathname === i.to || pathname.startsWith(i.to + "/"));
const FOLD_KEY = "fynhelp.v2.sidefold";

export function SideNav({
  pathname, partnerView, counts, open, onClose, firmName, canSignOff, role, setRole, onSignOut,
}: {
  pathname: string;
  partnerView: boolean;
  counts: Record<string, number>;
  open: boolean;
  onClose: () => void;
  firmName: string;
  canSignOff: boolean;
  role: "Partner" | "Junior";
  setRole: (r: "Partner" | "Junior") => void;
  onSignOut: () => void;
}) {
  const groups = NAV_GROUPS.filter((g) => !g.partnerOnly || partnerView);
  const active = groups.find((g) => g.items.some((i) => here(pathname, i)))?.id;
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    try { setFolded(window.localStorage.getItem(FOLD_KEY) === "1"); } catch { /* private mode */ }
  }, []);
  const fold = () =>
    setFolded((f) => {
      try { window.localStorage.setItem(FOLD_KEY, f ? "0" : "1"); } catch { /* private mode */ }
      return !f;
    });
  const isOpen = (g: Group) => opened[g.id] ?? g.id === active;
  const total = (g: Group) => g.items.reduce((n, i) => n + (counts[i.to] ?? 0), 0);

  return (
    <div className={`v2-side${open ? " open" : ""}${folded ? " folded" : ""}`}>
      <div className="v2-rail">
        <Link to="/app" className="v2-logo" aria-label="FynHelp home" title="FynHelp" onClick={onClose}>
          <img className="v2-logo-red" src={iconRed} alt="" width={30} height={30} />
          <img className="v2-logo-cream" src={iconCream} alt="" width={30} height={30} />
        </Link>
        <div className="v2-rail-sep" />
        {groups.map((g) => {
          const Icon = g.icon;
          const n = total(g);
          return (
            <Link key={g.id} to={g.items[0].to} title={g.label} aria-label={g.label} data-active={g.id === active} className="v2-rail-btn" onClick={onClose}>
              <Icon size={18} />
              {n > 0 && <i className="v2-rail-dot" />}
            </Link>
          );
        })}
        <div style={{ flex: 1 }} />
        <FirstCloseLauncher compact />
        <a className="v2-rail-btn" href="/guide" target="_blank" rel="noreferrer" title="Resource and Product Guide" aria-label="Resource and Product Guide" data-testid="guide-link">
          <BookOpen size={18} />
        </a>
        <button className="v2-rail-btn" onClick={onSignOut} title="Sign out" aria-label="Sign out">
          <LogOut size={18} />
        </button>
      </div>

      <aside className="v2-panel" aria-label="Pages" aria-hidden={folded ? true : undefined}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "4px 6px 14px", borderBottom: `1px solid ${V.line}`, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div className="truncate" style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: "-0.01em" }}>{firmName || "Your practice"}</div>
            <div style={{ fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: V.muted, marginTop: 2 }}>Practice OS</div>
          </div>
          <button className="v2-icon-btn v2-mobile-only" onClick={onClose} aria-label="Close menu"><X size={16} /></button>
        </div>

        {canSignOff && (
          <div style={{ padding: "0 4px 14px" }}>
            <div style={{ display: "flex", gap: 3, background: V.gray, padding: 3, borderRadius: 999 }}>
              {(["Partner", "Junior"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  style={{
                    flex: 1, border: 0, cursor: "pointer", borderRadius: 999, padding: "6px 0", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                    background: role === r ? "var(--v2-seg)" : "transparent", color: role === r ? V.ink : V.muted,
                    boxShadow: role === r ? "0 6px 14px -8px var(--v2-brand)" : "none", transition: "background .25s ease, color .25s ease",
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: V.muted, marginTop: 6, lineHeight: 1.4 }} data-testid="role-hint">
              {role === "Partner" ? "Reviews, signs off MIS and manages the firm." : "Prepares: documents, review, exceptions and MIS drafts."}
            </div>
          </div>
        )}

        <nav className="v2-nav" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {groups.map((g) => {
            const Icon = g.icon;
            if (g.items.length === 1) {
              const i = g.items[0];
              return (
                <Link key={g.id} to={i.to} onClick={onClose} activeOptions={{ exact: !!i.exact }}>
                  <Icon size={16} />
                  <span>{g.label}</span>
                  {(counts[i.to] ?? 0) > 0 && <span className="v2-count">{counts[i.to]}</span>}
                </Link>
              );
            }
            const o = isOpen(g);
            const n = total(g);
            return (
              <div key={g.id}>
                <button type="button" className="v2-group" data-active={g.id === active} aria-expanded={o} onClick={() => setOpened((s) => ({ ...s, [g.id]: !o }))}>
                  <Icon size={16} />
                  <span>{g.label}</span>
                  {!o && n > 0 && <span className="v2-count">{n}</span>}
                  <ChevronDown size={15} style={{ marginLeft: n > 0 && !o ? 6 : "auto", transition: "transform .3s cubic-bezier(.34,1.56,.64,1)", transform: o ? "rotate(180deg)" : "none" }} />
                </button>
                <AnimatePresence initial={false}>
                  {o && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                      style={{ overflow: "hidden" }}
                    >
                      <div className="v2-sub">
                        {g.items.map((i) => (
                          <Link key={i.to} to={i.to} onClick={onClose} activeOptions={{ exact: !!i.exact }}>
                            <span>{i.label}</span>
                            {(counts[i.to] ?? 0) > 0 && <span className="v2-count">{counts[i.to]}</span>}
                          </Link>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>
      </aside>

      <button className="v2-fold" onClick={fold} aria-label={folded ? "Show the menu" : "Hide the menu"} title={folded ? "Show the menu" : "Hide the menu"}>
        {folded ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </div>
  );
}

export const SIDENAV_STYLES = `
.v2-side { position:sticky; top:0; height:100vh; display:flex; flex:0 0 auto; z-index:50; }
.v2-rail { width:64px; flex:0 0 64px; display:flex; flex-direction:column; align-items:center; gap:6px; padding:14px 0; background:var(--v2-side); backdrop-filter:blur(18px); border-right:1px solid ${V.line}; }
.v2-logo { width:42px; height:42px; display:grid; place-items:center; border-radius:14px; transition:transform .5s cubic-bezier(.34,1.56,.64,1); }
.v2-logo:hover { transform:scale(1.08) rotate(-4deg); }
.v2-logo img { display:block; object-fit:contain; }
.v2-logo-cream { display:none !important; }
:root[data-v2-theme="dark"] .v2-logo-red { display:none !important; }
:root[data-v2-theme="dark"] .v2-logo-cream { display:block !important; }
.v2-rail-sep { width:24px; height:1px; background:${V.line}; margin:6px 0; }
.v2-rail-btn { position:relative; width:42px; height:42px; display:grid; place-items:center; border-radius:14px; border:0; background:transparent; color:${V.muted}; cursor:pointer; text-decoration:none; transition:background .2s ease, color .2s ease, transform .4s cubic-bezier(.34,1.56,.64,1); }
.v2-rail-btn:hover { background:${V.gray}; color:${V.ink}; transform:translateY(-1px); }
.v2-rail-btn[data-active="true"] { background:${V.blue}; color:${V.brand}; box-shadow:inset 3px 0 0 ${V.brand}; }
.v2-rail-btn:focus-visible, .v2-group:focus-visible, .v2-fold:focus-visible { outline:2px solid ${V.brand}; outline-offset:2px; }
.v2-rail-dot { position:absolute; top:9px; right:9px; width:7px; height:7px; border-radius:999px; background:${V.brand}; box-shadow:0 0 0 2px var(--v2-side); }
.v2-panel { width:232px; flex:0 0 232px; display:flex; flex-direction:column; padding:18px 12px 14px; background:var(--v2-side); backdrop-filter:blur(18px); border-right:1px solid ${V.line}; overflow:hidden; transition:margin-left .35s cubic-bezier(.16,1,.3,1), opacity .25s ease; }
.v2-side.folded .v2-panel { margin-left:-232px; opacity:0; pointer-events:none; }
.v2-fold { position:absolute; top:22px; right:-12px; width:24px; height:24px; display:grid; place-items:center; border-radius:999px; border:1px solid ${V.line}; background:${V.bg}; color:${V.muted}; cursor:pointer; z-index:2; transition:transform .3s cubic-bezier(.34,1.56,.64,1), color .2s; }
.v2-fold:hover { color:${V.ink}; transform:scale(1.12); }
.v2-group { display:flex; align-items:center; gap:11px; width:100%; padding:10px 13px; margin-bottom:2px; border-radius:12px; border:0; background:transparent; font:inherit; font-size:14.5px; color:${V.body}; cursor:pointer; text-align:left; transition:background .18s ease, color .18s ease; }
.v2-group:hover { background:${V.gray}; color:${V.ink}; }
.v2-group[data-active="true"] { background:${V.gray}; color:${V.ink}; font-weight:600; }
.v2-group[data-active="true"] > svg:first-child { color:${V.brand}; }
.v2-sub { margin:2px 0 6px 21px; padding-left:12px; border-left:1px solid ${V.line}; display:grid; gap:1px; }
.v2-nav .v2-sub a { padding:8px 11px; font-size:13.5px; margin:0; border-radius:10px; }
.v2-nav .v2-sub a[data-status="active"] { box-shadow:none; background:${V.blue}; color:${V.ink}; }
.v2-count { margin-left:auto; font-size:11px; font-weight:700; background:${V.beige}; color:${V.ink}; border-radius:999px; padding:1px 7px; }
@media (max-width:900px){
  .v2-side { position:fixed; left:0; top:0; z-index:60; transform:translateX(-100%); transition:transform .28s cubic-bezier(.16,1,.3,1); box-shadow:0 0 60px rgba(0,0,0,.35); }
  .v2-side.open { transform:translateX(0); }
  .v2-side.folded .v2-panel { margin-left:0; opacity:1; pointer-events:auto; }
  .v2-fold { display:none; }
}
@media (prefers-reduced-motion: reduce) { .v2-side, .v2-panel, .v2-logo, .v2-rail-btn { transition:none !important; } }
`;
