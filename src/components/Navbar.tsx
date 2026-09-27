import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "@/lib/router-compat";
import {
  Menu,
  X,
  ChevronDown,
  Store,
  Briefcase,
  PlayCircle,
  FileSearch,
  GitCompareArrows,
  PenLine,
  Send,
  Rocket,
  ShoppingBag,
  Factory,
  ShieldCheck,
  LayoutDashboard,
  FileStack,
  Brain,
  CalendarCheck,
  FileCheck,
  AlertTriangle,
  Users,
  BarChart3,
  FileText,
} from "lucide-react";
import FynLogo from "@/components/FynLogo";
import { supabase } from "@/integrations/supabase/client";
import { isAdminEmail } from "@/lib/adminEmails";


/* ────────────────────────────────────────────────────────────────
   Data
──────────────────────────────────────────────────────────────── */

import type { LucideIcon } from "lucide-react";
type IconType = LucideIcon;

type ModuleKey = "extract" | "recon" | "narrate" | "chaser";

type ModuleStat = { label: string; value: string; sub?: string; tone?: "healthy" | "warning" | "critical" | "neutral" };
type ModulePreview = { title: string; sub: string; stats: ModuleStat[]; footer?: string };

const PRODUCT_MODULES: { key: ModuleKey; icon: IconType; label: string; href: string; desc: string; preview: ModulePreview }[] = [
  {
    key: "extract",
    icon: FileSearch,
    label: "Extract",
    href: "/agents/extract",
    desc: "Documents to structured lines",
    preview: {
      title: "Extract",
      sub: "Reading INV-4515.pdf",
      stats: [
        { label: "Amount",    value: "₹1,24,500", sub: "Field lifted",      tone: "healthy" },
        { label: "GSTIN",     value: "27AAB…1Z5", sub: "Format valid",      tone: "healthy" },
        { label: "Fields",    value: "3",         sub: "Extracted",         tone: "neutral" },
        { label: "Confidence",value: "98%",       sub: "Shown, not hidden", tone: "healthy" },
      ],
      footer: "Classified · read · structured",
    },
  },
  {
    key: "recon",
    icon: GitCompareArrows,
    label: "Recon",
    href: "/agents/recon",
    desc: "Bank matched to ledger",
    preview: {
      title: "Recon",
      sub: "Matching 423 transactions",
      stats: [
        { label: "Matched",    value: "421",     sub: "Exact · fuzzy · rules", tone: "healthy" },
        { label: "Exceptions", value: "2",       sub: "Visible, not hidden",   tone: "warning" },
        { label: "INV-2288",   value: "₹41,200", sub: "Locked to bank line",   tone: "healthy" },
        { label: "Unmatched",  value: "₹4,120",  sub: "Queued with reason",    tone: "warning" },
      ],
      footer: "A step, not a failure",
    },
  },
  {
    key: "narrate",
    icon: PenLine,
    label: "Narrate",
    href: "/agents/narrate",
    desc: "Drafts with sources attached",
    preview: {
      title: "Narrate",
      sub: "Drafting GSTR-3B note",
      stats: [
        { label: "Draft",    value: "ITC reversed", sub: "Under Rule 42",        tone: "neutral" },
        { label: "Amount",   value: "₹12,480",      sub: "Working shown",        tone: "neutral" },
        { label: "Source",   value: "GSTR-2B_Aug",  sub: "Clipped to the draft", tone: "healthy" },
        { label: "Posted",   value: "0 unseen",     sub: "You approve first",    tone: "healthy" },
      ],
      footer: "Deliberate · reviewable",
    },
  },
  {
    key: "chaser",
    icon: Send,
    label: "Chaser",
    href: "/agents/chaser",
    desc: "Polite follow-ups that send themselves",
    preview: {
      title: "Chaser",
      sub: "Nudging 4 clients",
      stats: [
        { label: "Nudges sent", value: "4",      sub: "Polite, on schedule",  tone: "neutral" },
        { label: "Replied",     value: "2",      sub: "Payment promised",     tone: "healthy" },
        { label: "Asked again", value: "1",      sub: "Once more, then you",  tone: "warning" },
        { label: "Escalated",   value: "1",      sub: "With full history",    tone: "warning" },
      ],
      footer: "Sends · fades · asks once more",
    },
  },
];

const PRODUCT_USECASES: { icon: IconType; label: string; href: string }[] = [
  { icon: Rocket,      label: "Startups & founders",       href: "/use-cases" },
  { icon: ShoppingBag, label: "D2C brands",                href: "/use-cases" },
  { icon: Factory,     label: "Trading & manufacturing",   href: "/use-cases" },
  { icon: ShieldCheck, label: "Security & compliance",     href: "/security" },
];

const CA_PRACTICE: { icon: IconType; label: string; href: string; desc: string }[] = [
  { icon: FileSearch,       label: "Document intake",       href: "/ca-firms", desc: "workflow" },
  { icon: GitCompareArrows, label: "Reconciliation",         href: "/ca-firms", desc: "workflow" },
  { icon: AlertTriangle,    label: "Exception queue",        href: "/ca-firms", desc: "workflow" },
  { icon: Send,             label: "Chaser automation",      href: "/ca-firms", desc: "workflow" },
  { icon: CalendarCheck,    label: "Compliance calendar",    href: "/ca-firms", desc: "workflow" },
  { icon: FileCheck,        label: "Month-end close",        href: "/ca-firms", desc: "workflow" },
  { icon: LayoutDashboard,  label: "Portfolio dashboard",    href: "/ca-firms", desc: "intelligence" },
  { icon: Brain,            label: "Learning brain",         href: "/ca-firms", desc: "intelligence" },
  { icon: BarChart3,        label: "Practice analytics",     href: "/ca-firms", desc: "intelligence" },
  { icon: FileText,         label: "MIS reports",            href: "/ca-firms", desc: "intelligence" },
  { icon: Users,            label: "Client portal",          href: "/ca-firms", desc: "intelligence" },
  { icon: ShieldCheck,      label: "Audit trail",            href: "/ca-firms", desc: "intelligence" },
];

const CA_PREVIEW_STATS: ModuleStat[] = [
  { label: "Active clients",        value: "48",    sub: "3 new this month",       tone: "neutral"  },
  { label: "Filings this week",     value: "12",    sub: "GSTR-3B 8 · GSTR-1 4",  tone: "warning"  },
  { label: "Exceptions open",       value: "5",     sub: "Ranked by rupee impact", tone: "critical" },
  { label: "ITC at risk",           value: "₹8.4L", sub: "Across 6 clients",       tone: "warning"  },
];

const TOP_LINKS: { label: string; href: string }[] = [
  { label: "Pipeline",  href: "/pipeline" },
  { label: "Pricing",   href: "/pricing" },
  { label: "Resources", href: "/resources" },
  { label: "About",     href: "/about" },
  { label: "Contact",   href: "/contact" },
];

/* ────────────────────────────────────────────────────────────────
   Component
──────────────────────────────────────────────────────────────── */

type MenuKey = "products" | "ca" | "signin" | null;

const NAV_HEIGHT = 76;

const Navbar = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const [previewModule, setPreviewModule] = useState<ModuleKey>("extract");
  const [mProducts, setMProducts] = useState(false);
  const [mCA, setMCA] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  const scheduleClose = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenMenu(null), 220);
  };
  const openNow = (key: MenuKey) => {
    clearTimeout(closeTimer.current);
    setOpenMenu(key);
  };

  useEffect(() => {
    setMobileOpen(false);
    setOpenMenu(null);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setIsAdmin(isAdminEmail(data.user?.email));
    });
    return () => { cancelled = true; };
  }, []);

  const isActive = (href: string) => location.pathname === href;


  // Top-level trigger button
  const Trigger = ({
    label,
    menuKey,
    active,
  }: {
    label: string;
    menuKey: Exclude<MenuKey, null>;
    active?: boolean;
  }) => {
    const isOpen = openMenu === menuKey;
    return (
      <button
        onMouseEnter={() => openNow(menuKey)}
        onMouseLeave={scheduleClose}
        onClick={() => setOpenMenu(isOpen ? null : menuKey)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="relative flex items-center gap-1.5 py-6 text-[15.5px] font-medium text-white/75 hover:text-white transition-colors"
      >
        <span className={active || isOpen ? "text-white" : ""}>{label}</span>
        <ChevronDown
          size={13}
          className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
        <span
          className={`absolute left-0 right-0 -bottom-[1px] h-[2px] rounded-full transition-all duration-200 ${
            active || isOpen ? "bg-fyn-red opacity-100" : "opacity-0"
          }`}
        />
      </button>
    );
  };

  const PlainLink = ({ href, label }: { href: string; label: string }) => (
    <Link
      to={href}
      className="relative py-6 text-[15.5px] font-medium text-white/75 hover:text-white transition-colors"
    >
      <span className={isActive(href) ? "text-white" : ""}>{label}</span>
      <span
        className={`absolute left-0 right-0 -bottom-[1px] h-[2px] rounded-full transition-all duration-200 ${
          isActive(href) ? "bg-fyn-red opacity-100" : "opacity-0"
        }`}
      />
    </Link>
  );

  /* ── Dashboard-styled preview panel (matches IntelCard from real product) ── */

  const toneColor = (t?: ModuleStat["tone"]) =>
    t === "critical" ? "#A93838" : t === "warning" ? "#8B6914" : t === "healthy" ? "#1F5A46" : "transparent";

  const DashboardPreviewCard = ({
    eyebrow,
    title,
    sub,
    stats,
    footer,
    ctaLabel,
    ctaHref,
  }: {
    eyebrow: string;
    title: string;
    sub: string;
    stats: ModuleStat[];
    footer?: string;
    ctaLabel: string;
    ctaHref: string;
  }) => (
    <Link
      to={ctaHref}
      className="group flex flex-col rounded-lg overflow-hidden bg-white transition-all hover:-translate-y-0.5"
      style={{
        border: "1px solid rgba(23,18,8,0.10)",
        borderLeft: "3px solid #A93838",
        boxShadow: "0 8px 24px -8px rgba(23,18,8,0.16), 0 2px 8px rgba(23,18,8,0.06)",
      }}
    >
      {/* Header strip — mimics IntelCard title area */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: "1px solid rgba(23,18,8,0.06)" }}>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fyn-ink/45">
            {eyebrow} · live preview
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-[15px] font-semibold text-fyn-ink" style={{ fontFamily: "Georgia, ui-serif, serif" }}>{title}</span>
            <span className="text-[11.5px] text-[rgba(23,18,8,0.62)]">{sub}</span>
          </div>
        </div>
        <span className="flex items-center gap-1 text-[10px] text-fyn-ink/50">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Demo data
        </span>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-px bg-[rgba(23,18,8,0.06)]">
        {stats.map((s) => (
          <div key={s.label} className="bg-white px-4 py-3">
            <div className="text-[10px] font-medium uppercase tracking-wider text-[rgba(23,18,8,0.62)]">{s.label}</div>
            <div
              className="mt-1 font-mono text-[17px] font-semibold tabular-nums text-fyn-ink"
              style={{ color: s.tone === "critical" ? "#A93838" : "#171208" }}
            >
              {s.value}
            </div>
            {s.sub && (
              <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-[rgba(23,18,8,0.62)]">
                {s.tone && s.tone !== "neutral" && (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: toneColor(s.tone) }} />
                )}
                {s.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 bg-[#FAF7F0]" style={{ borderTop: "1px solid rgba(23,18,8,0.06)" }}>
        <span className="text-[11px] text-[rgba(23,18,8,0.62)] truncate pr-3">{footer}</span>
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-fyn-red group-hover:gap-2 transition-all whitespace-nowrap">
          {ctaLabel} <span aria-hidden>→</span>
        </span>
      </div>
    </Link>
  );

  /* ── Mega menu shells ─────────────────────────────────────── */



  const ProductsMenu = (
    <div
      onMouseEnter={() => openNow("products")}
      onMouseLeave={scheduleClose}
      className="absolute inset-x-0 top-full"
      style={{
        background: "hsl(var(--fyn-beige))",
        borderTop: "1px solid rgba(23,18,8,0.08)",
        boxShadow: "0 24px 48px -12px rgba(23,18,8,0.18)",
        animation: "fade-in 180ms ease-out",
      }}
    >
      <div className="max-w-[1400px] mx-auto px-14 py-10 grid grid-cols-[1fr_1fr_360px] gap-14">
        {/* Column 1 */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fyn-ink/50 mb-4">
            By module
          </div>
          <div className="flex flex-col gap-1.5">
            {PRODUCT_MODULES.map((m) => {
              const isActivePreview = previewModule === m.key;
              return (
                <Link
                  key={m.label}
                  to={m.href}
                  onMouseEnter={() => setPreviewModule(m.key)}
                  onFocus={() => setPreviewModule(m.key)}
                  className={`flex items-start gap-3 rounded-lg px-3 py-3 transition-colors ${
                    isActivePreview ? "bg-white" : "hover:bg-fyn-ink/5"
                  }`}
                  style={isActivePreview ? { boxShadow: "0 1px 3px rgba(23,18,8,0.06)" } : undefined}
                >
                  <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-fyn-red/10 text-fyn-red">
                    <m.icon size={16} />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[15px] font-semibold text-fyn-ink">{m.label}</span>
                    <span className="text-[13.5px] text-fyn-ink/60">{m.desc}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Column 2 */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fyn-ink/50 mb-4">
            By use case
          </div>
          <div className="flex flex-col gap-1.5">
            {PRODUCT_USECASES.map((u) => (
              <Link
                key={u.label}
                to={u.href}
                className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-fyn-ink/5 transition-colors"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-fyn-gold/15 text-fyn-gold">
                  <u.icon size={16} />
                </span>
                <span className="text-[15px] font-medium text-fyn-ink">{u.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Column 3 — live dashboard preview (styled to match real product) */}
        {(() => {
          const active = PRODUCT_MODULES.find((m) => m.key === previewModule) ?? PRODUCT_MODULES[0];
          return (
            <div className="flex flex-col gap-3">
              <DashboardPreviewCard
                eyebrow={active.preview.title}
                title={active.preview.title}
                sub={active.preview.sub}
                stats={active.preview.stats}
                footer={active.preview.footer}
                ctaLabel="Open live demo"
                ctaHref={active.href}
              />
              <Link
                to="/waitlist"
                className="group inline-flex items-center gap-1.5 self-end text-[12.5px] font-semibold text-fyn-ink/70 hover:text-fyn-red transition-colors"
              >
                <PlayCircle size={14} /> Or start from demo login <span aria-hidden>→</span>
              </Link>
            </div>
          );
        })()}
      </div>
    </div>
  );

  const CAMenu = (
    <div
      onMouseEnter={() => openNow("ca")}
      onMouseLeave={scheduleClose}
      className="absolute inset-x-0 top-full"
      style={{
        background: "hsl(var(--fyn-beige))",
        borderTop: "1px solid rgba(23,18,8,0.08)",
        boxShadow: "0 24px 48px -12px rgba(23,18,8,0.18)",
        animation: "fade-in 180ms ease-out",
      }}
    >
      <div className="max-w-[1400px] mx-auto px-14 py-10 grid grid-cols-[1fr_400px] gap-14">
        <div className="grid grid-cols-[1fr_1fr] gap-8">
          <div>
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-fyn-ink/35 mb-3">
              Workflow
            </div>
            <div className="flex flex-col gap-1.5">
              {CA_PRACTICE.filter((c) => c.desc === "workflow").map((c) => (
                <Link
                  key={c.label}
                  to={c.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-fyn-ink/5 transition-colors"
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-md"
                    style={{ background: "rgba(169,56,56,0.09)", color: "#A93838" }}
                  >
                    <c.icon size={16} />
                  </span>
                  <span className="text-[15px] font-semibold text-fyn-ink">{c.label}</span>
                </Link>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-fyn-ink/35 mb-3">
              Intelligence
            </div>
            <div className="flex flex-col gap-1.5">
              {CA_PRACTICE.filter((c) => c.desc === "intelligence").map((c) => (
                <Link
                  key={c.label}
                  to={c.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-fyn-ink/5 transition-colors"
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-md"
                    style={{ background: "rgba(139,105,20,0.09)", color: "#8B6914" }}
                  >
                    <c.icon size={16} />
                  </span>
                  <span className="text-[15px] font-semibold text-fyn-ink">{c.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <DashboardPreviewCard
            eyebrow="CA Portal"
            title="Portfolio"
            sub="Live snapshot"
            stats={CA_PREVIEW_STATS}
            footer="393 auto-matched · 1 open"
            ctaLabel="Explore CA portal"
            ctaHref="/ca-firms"
          />
          <Link
            to="/ca/register"
            className="group inline-flex items-center gap-1.5 self-end text-[12.5px] font-semibold text-fyn-ink/70 hover:text-fyn-red transition-colors"
          >
            <Briefcase size={14} /> Register as CA <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </div>
  );

  const SignInMenu = (
    <div
      onMouseEnter={() => openNow("signin")}
      onMouseLeave={scheduleClose}
      className="absolute right-0 top-full"
      style={{
        width: 300,
        marginTop: 10,
        background: "#FFFFFF",
        border: "1px solid rgba(23,18,8,0.08)",
        borderRadius: 14,
        boxShadow: "0 20px 48px -12px rgba(23,18,8,0.28)",
        padding: 8,
        animation: "fade-in 180ms ease-out",
        zIndex: 60,
      }}
    >
      <Link
        to="/login"
        className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-fyn-ink/5 transition-colors"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-fyn-red/10 text-fyn-red">
          <Store size={16} />
        </span>
        <span className="flex flex-col">
          <span className="text-[15px] font-semibold text-fyn-ink">Client login</span>
          <span className="text-[12.5px] text-fyn-ink/60">Business owners & founders</span>
        </span>
      </Link>
      <div className="my-1 h-px bg-fyn-ink/8" />
      <Link
        to="/ca/login"
        className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-fyn-ink/5 transition-colors"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-fyn-gold/15 text-fyn-gold">
          <Briefcase size={16} />
        </span>
        <span className="flex flex-col">
          <span className="text-[15px] font-semibold text-fyn-ink">CA login</span>
          <span className="text-[12.5px] text-fyn-ink/60">Chartered accountants & firms</span>
        </span>
      </Link>
    </div>
  );

  /* ── Render ───────────────────────────────────────────────── */

  return (
    <>
      <nav
        className="fixed top-0 inset-x-0 z-50 bg-fyn-ink border-b border-white/10"
        style={{ minHeight: NAV_HEIGHT }}
      >
        <div
          ref={containerRef}
          className="relative w-full flex items-center justify-between px-6 md:px-10 lg:px-14"
          style={{ minHeight: NAV_HEIGHT }}
        >
          {/* Logo */}
          <Link to="/" className="flex items-center shrink-0 mr-6 lg:mr-10 group">
            <FynLogo variant="light" size="md" />
          </Link>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-10 flex-1">
            <Trigger label="Products"    menuKey="products" />
            <Trigger label="CA partners" menuKey="ca" />
            {TOP_LINKS.map((l) => (
              <PlainLink key={l.href} href={l.href} label={l.label} />
            ))}
          </div>

          {/* Right cluster */}
          <div className="hidden lg:flex items-center gap-4 shrink-0">



            <div className="relative">
              <button
                onMouseEnter={() => openNow("signin")}
                onMouseLeave={scheduleClose}
                onClick={() => setOpenMenu(openMenu === "signin" ? null : "signin")}
                aria-haspopup="true"
                aria-expanded={openMenu === "signin"}
                className="flex items-center gap-1.5 text-[15px] font-medium text-white/85 hover:text-white transition-colors py-2"
              >
                Sign in
                <ChevronDown
                  size={13}
                  className={`transition-transform duration-200 ${openMenu === "signin" ? "rotate-180" : ""}`}
                />
              </button>
              {openMenu === "signin" && SignInMenu}
            </div>
            <Link
              to="/waitlist"
              className="bg-fyn-red hover:bg-fyn-red-dark text-white text-[15px] font-semibold px-5 py-2.5 rounded-lg shadow-xs transition-colors"
            >
              Join waitlist
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            className="lg:hidden text-white p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          {/* Mega menus */}
          {openMenu === "products" && ProductsMenu}
          {openMenu === "ca" && CAMenu}
        </div>
      </nav>

      {/* Spacer */}
      <div style={{ height: NAV_HEIGHT, background: "#171208" }} />

      {/* Mobile drawer */}
      <div
        className={`lg:hidden fixed inset-0 z-40 transition-opacity duration-300 ${
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
        <div
          className={`absolute right-0 top-0 bottom-0 w-[320px] bg-fyn-ink overflow-y-auto transition-transform duration-300 ${
            mobileOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex flex-col gap-1 pt-24 px-6 pb-10">
            {/* Products accordion */}
            <button
              onClick={() => setMProducts((v) => !v)}
              className="flex items-center justify-between py-3 border-b border-white/10 text-white text-base font-medium"
              aria-expanded={mProducts}
            >
              Products
              <ChevronDown
                size={18}
                className={`transition-transform ${mProducts ? "rotate-180" : ""}`}
              />
            </button>
            {mProducts && (
              <div className="pl-3 pb-2 border-b border-white/5 flex flex-col">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/40 mt-3 mb-1">
                  By module
                </div>
                {PRODUCT_MODULES.map((m) => (
                  <Link
                    key={m.label}
                    to={m.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2.5 py-2.5 text-white/80 text-[14px]"
                  >
                    <m.icon size={16} className="text-fyn-red" />
                    {m.label}
                  </Link>
                ))}
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/40 mt-3 mb-1">
                  By use case
                </div>
                {PRODUCT_USECASES.map((u) => (
                  <Link
                    key={u.label}
                    to={u.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2.5 py-2.5 text-white/80 text-[14px]"
                  >
                    <u.icon size={16} className="text-fyn-gold" />
                    {u.label}
                  </Link>
                ))}
                <Link
                  to="/waitlist"
                  onClick={() => setMobileOpen(false)}
                  className="mt-3 mb-1 flex items-center gap-2 text-fyn-red text-[13.5px] font-semibold"
                >
                  <PlayCircle size={16} /> Demo login →
                </Link>
              </div>
            )}

            {/* CA partners accordion */}
            <button
              onClick={() => setMCA((v) => !v)}
              className="flex items-center justify-between py-3 border-b border-white/10 text-white text-base font-medium"
              aria-expanded={mCA}
            >
              CA partners
              <ChevronDown
                size={18}
                className={`transition-transform ${mCA ? "rotate-180" : ""}`}
              />
            </button>
            {mCA && (
              <div className="pl-3 pb-2 border-b border-white/5 flex flex-col">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/40 mt-3 mb-1">
                  Workflow
                </div>
                {CA_PRACTICE.filter((c) => c.desc === "workflow").map((c) => (
                  <Link
                    key={c.label}
                    to={c.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2.5 py-2.5 text-white/80 text-[14px]"
                  >
                    <c.icon size={16} className="text-fyn-red" />
                    {c.label}
                  </Link>
                ))}
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/40 mt-3 mb-1">
                  Intelligence
                </div>
                {CA_PRACTICE.filter((c) => c.desc === "intelligence").map((c) => (
                  <Link
                    key={c.label}
                    to={c.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2.5 py-2.5 text-white/80 text-[14px]"
                  >
                    <c.icon size={16} className="text-fyn-gold" />
                    {c.label}
                  </Link>
                ))}
                <Link
                  to="/ca/register"
                  onClick={() => setMobileOpen(false)}
                  className="mt-3 mb-1 flex items-center gap-2 text-fyn-red text-[13.5px] font-semibold"
                >
                  <Briefcase size={16} /> Register as CA →
                </Link>
              </div>
            )}

            {TOP_LINKS.map((l) => (
              <Link
                key={l.href}
                to={l.href}
                onClick={() => setMobileOpen(false)}
                className="py-3 border-b border-white/10 text-white text-base font-medium"
              >
                {l.label}
              </Link>
            ))}

            <div className="mt-6 space-y-3">
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center gap-2 py-3 rounded-lg border border-white/20 text-white text-[14px] font-semibold"
              >
                <Store size={16} /> Client login
              </Link>
              <Link
                to="/ca/login"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center gap-2 py-3 rounded-lg border border-white/20 text-white text-[14px] font-semibold"
              >
                <Briefcase size={16} /> CA login
              </Link>
              <Link
                to="/waitlist"
                onClick={() => setMobileOpen(false)}
                className="block bg-fyn-red text-white text-center py-3 rounded-lg font-semibold"
              >
                Join waitlist
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Navbar;
