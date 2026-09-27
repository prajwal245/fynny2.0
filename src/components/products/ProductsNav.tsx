import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import ProductsDropdown from "./ProductsDropdown";
import ProductsMobilePanel, { type MobileIcon } from "./ProductsMobilePanel";
import ProductWidgetModal, { type ModalProduct } from "./ProductWidgetModal";
import {
  PRODUCT_ITEMS,
  PLATFORM_FEATURES,
  BUSINESS_TYPES,
} from "./productMeta";
import { FYN } from "./widgets/Shared";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  /** Render a mobile-only trigger row inside the mobile drawer */
  variant?: "desktop" | "mobile";
  /** Mobile drawer open state, used to render the floating icon panel only when relevant */
  mobileMenuOpen?: boolean;
  onCloseMobileMenu?: () => void;
}

/**
 * ProductsNav, orchestrates the Products dropdown trigger, dropdown UI,
 * mobile floating icon panel, and the per-product widget modal.
 */
export default function ProductsNav({
  variant = "desktop",
  mobileMenuOpen = false,
  onCloseMobileMenu,
}: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ModalProduct | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleEnter = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const handleLeave = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 600);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const openProduct = (p: ModalProduct) => {
    setOpen(false);
    onCloseMobileMenu?.();
    setActive(p);
  };

  const handleIntelligence = (id: string) => {
    const item = PRODUCT_ITEMS.find((p) => p.id === id);
    if (!item) return;

    // If user is already logged in, navigate directly to their dashboard tab
    if (user && item.status === "live") {
      setOpen(false);
      onCloseMobileMenu?.();
      navigate(item.href);
      return;
    }

    // Not logged in or coming-soon — show the modal as before
    openProduct({
      name: item.name,
      description: item.longDescription,
      widget: item.widget,
      href: item.href,
      status: item.status as "live" | "coming_soon",
    });
  };

  const handleBusiness = (idx: number) => {
    const b = BUSINESS_TYPES[idx];
    if (!b) return;
    openProduct({
      name: `${b.name}, Built for you`,
      description: `See how FYNHelp tailors financial intelligence for ${b.name.toLowerCase()} businesses.`,
      widget: b.widget,
      href: "/dashboard/cockpit",
      status: "live",
    });
  };

  const handlePlatform = async (id: string) => {
    const f = PLATFORM_FEATURES.find((x) => x.id === id);
    if (!f) return;

    // CFO Fynny — navigate directly, skip the modal
    if (id === "fynny") {
      setOpen(false);
      onCloseMobileMenu?.();
      if (user) {
        navigate("/dashboard/fynny-chat");
      } else {
        navigate("/waitlist");
      }
      return;
    }

    // CA Partner Program — navigate directly, skip the modal
    if (id === "ca-partner-feature") {
      setOpen(false);
      onCloseMobileMenu?.();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: caFirm } = await supabase
          .from("ca_firms")
          .select("id")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (caFirm) {
          navigate("/ca/dashboard");
          return;
        }
        navigate("/ca/login");
        return;
      }
      navigate("/ca/login");
      return;
    }

    if (id === "investor-view") {
      setOpen(false);
      onCloseMobileMenu?.();
      if (user) {
        navigate("/dashboard/investor");
      } else {
        navigate("/waitlist");
      }
      return;
    }


    openProduct({
      name: f.name,
      description: f.longDescription,
      widget: f.widget as any,
      href: f.href,
      status: f.status,
    });
  };

  const intelligenceItems = PRODUCT_ITEMS.filter((p) => p.status !== "archived").map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status as "live" | "coming_soon",
  }));
  const platformItems = PLATFORM_FEATURES.filter((f) => (f as any).status !== "archived").map((f) => ({
    id: f.id,
    name: f.name,
    description: f.description,
    status: f.status as "live" | "coming_soon",
  }));

  // Build mobile icon set (Intelligence Suites first, then platform features)
  const mobileIcons: MobileIcon[] = [
    ...PRODUCT_ITEMS.filter((p) => p.status !== "archived").map((p) => ({
      id: p.id,
      name: p.shortLabel,
      Icon: p.Icon,
      status: p.status as "live" | "coming_soon",
      onClick: () => handleIntelligence(p.id),
    })),
  ];

  if (variant === "mobile") {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between text-white/80 hover:text-white text-base font-medium py-3 border-b border-white/5"
          aria-expanded={open}
        >
          <span>Products</span>
          <ChevronDown
            size={18}
            style={{
              transition: "transform 0.3s",
              transform: open ? "rotate(180deg)" : "rotate(0)",
            }}
          />
        </button>
        <ProductsMobilePanel open={mobileMenuOpen && open} icons={mobileIcons} />
        <ProductWidgetModal product={active} onClose={() => setActive(null)} />
      </>
    );
  }

  return (
    <div
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`fyn-products-trigger nav-link-underline text-sm font-medium py-6 inline-flex items-center gap-1 transition-colors ${
          open ? "text-white" : "text-white/70 hover:text-white"
        }`}
        style={{
          fontFamily: "'Raleway', sans-serif",
          fontWeight: 600,
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
      >
        Products
        <ChevronDown
          size={14}
          style={{
            transition: "transform 0.3s",
            transform: open ? "rotate(180deg)" : "rotate(0)",
          }}
        />
      </button>

      <ProductsDropdown
        open={open}
        intelligenceItems={intelligenceItems}
        businessItems={BUSINESS_TYPES.map((b) => ({ name: b.name, status: b.status }))}
        platformItems={platformItems}
        onSelectIntelligence={handleIntelligence}
        onSelectBusiness={handleBusiness}
        onSelectPlatform={handlePlatform}
        onClose={() => setOpen(false)}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      />

      <ProductWidgetModal product={active} onClose={() => setActive(null)} />
    </div>
  );
}
