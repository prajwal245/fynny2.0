import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import { HelmetProvider } from "react-helmet-async";

import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import SkipToContent from "@/components/system/SkipToContent";
import ScrollManager from "@/components/system/ScrollManager";
import SearchPalette from "@/components/system/SearchPalette";
import FloatingContact from "@/components/system/FloatingContact";
import WaitlistPopup from "@/components/WaitlistPopup";
import NotFound from "@/pages/NotFound";
import { Sentry } from "@/lib/monitoring";
import { usePageTracking } from "@/hooks/usePageTracking";
import { reportLovableError } from "@/lib/lovable-error-reporting";

import appCss from "../styles.css?url";

const SOFTWARE_APP_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "FynHelp",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  description: "AI-powered Financial Intelligence platform for Indian startups and SMEs",
  url: "https://www.fynhelp.com",
  author: { "@type": "Organization", name: "FynHelp Technologies", url: "https://www.fynhelp.com" },
  offers: { "@type": "Offer", price: "0", priceCurrency: "INR", description: "Free early access for 30 days" },
});

const ORGANIZATION_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "FynHelp Technologies",
  url: "https://www.fynhelp.com",
  logo: "https://www.fynhelp.com/logo.png",
  description: "India's Virtual CFO Platform. Built for SMEs.",
  foundingDate: "2024",
  founders: [
    { "@type": "Person", name: "Adireddy Tarun", jobTitle: "CEO & Founder" },
    { "@type": "Person", name: "Nidhi Siddhpura", jobTitle: "CMO & Co-Founder" },
  ],
  address: { "@type": "PostalAddress", addressLocality: "Bengaluru", addressRegion: "Karnataka", addressCountry: "IN" },
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+91-98765-43210",
    contactType: "Customer Support",
    email: "support@fynhelp.com",
    availableLanguage: ["English", "Hindi"],
  },
  sameAs: ["https://linkedin.com/company/fynhelp", "https://twitter.com/fynhelp", "https://youtube.com/@fynhelp"],
});

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { name: "format-detection", content: "telephone=no" },
      { title: "FynHelp — AI CFO for Indian SMEs" },
      { name: "title", content: "FynHelp — AI CFO for Indian SMEs" },
      {
        name: "description",
        content:
          "Real-time AI CFO for Indian startups and SMEs. Track cash flow, runway, GST and revenue with CFO Fynny.",
      },
      {
        name: "keywords",
        content:
          "AI CFO India, financial intelligence, SME cash flow, GST compliance, runway tracker, burn rate, startup finance, Fynny AI, FynHelp",
      },
      { name: "robots", content: "index, follow" },
      { name: "language", content: "English" },
      { name: "author", content: "FynHelp Technologies" },
      { name: "revisit-after", content: "7 days" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://www.fynhelp.com/" },
      { property: "og:title", content: "FynHelp — AI CFO for Indian SMEs" },
      {
        property: "og:description",
        content: "Real-time financial intelligence for Indian startups and SMEs. Meet CFO Fynny.",
      },
      { property: "og:image", content: "https://www.fynhelp.com/og-image.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:locale", content: "en_IN" },
      { property: "og:site_name", content: "FynHelp" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:url", content: "https://www.fynhelp.com/" },
      { name: "twitter:title", content: "FynHelp — AI CFO for Indian SMEs" },
      { name: "twitter:description", content: "Real-time financial intelligence for Indian startups and SMEs." },
      { name: "twitter:image", content: "https://www.fynhelp.com/twitter-image.png" },
      { property: "twitter:creator", content: "@fynhelp" },
      { name: "google-site-verification", content: "lwPij_cJgAb2D1gva7DUy_Bnc4sj99qXMxpdXwKODmg" },
    ],
    links: [
      { rel: "preconnect", href: "https://qfowcjyueonpwmxzthmz.supabase.co", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://wiknwxniwqvsxgyzqqxu.supabase.co", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Instrument+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&family=JetBrains+Mono:wght@400;600&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&f[]=satoshi@400,500,700,900&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,300;1,9..144,400;1,9..144,600&family=Inter:wght@400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&family=Raleway:wght@300;400;500;600;700&family=Roboto:wght@300;400;500;700&family=DM+Sans:wght@400;500;600;700&family=Work+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700;900&family=JetBrains+Mono:wght@400;500&display=swap",
      },
      { rel: "dns-prefetch", href: "https://storage.googleapis.com" },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "shortcut icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "stylesheet", href: appCss },
    ],
    scripts: [
      // ported from main.tsx — force light theme before first paint (dark mode removed)
      {
        children:
          'document.documentElement.classList.remove("dark");document.documentElement.classList.add("light");',
      },
      { type: "application/ld+json", children: SOFTWARE_APP_JSONLD },
      { type: "application/ld+json", children: ORGANIZATION_JSONLD },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RouteTracker() {
  usePageTracking();
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // ported from main.tsx — client-side init (native shell, attribution, analytics, monitoring, push SW)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [{ initMobileApp }, { captureUtm }, { initAnalytics }, { initMonitoring }] = await Promise.all([
        import("@/lib/capacitor"),
        import("@/lib/utm"),
        import("@/lib/analytics"),
        import("@/lib/monitoring"),
      ]);
      if (cancelled) return;
      initMobileApp();
      captureUtm();
      initAnalytics();
      initMonitoring();
    })();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Sentry.ErrorBoundary fallback={ErrorFallback}>
      <QueryClientProvider client={queryClient}>
        <HelmetProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <RouteTracker />
            <SkipToContent />
            <ScrollManager />
            <SearchPalette />
            <FloatingContact />
            <WaitlistPopup />
            <div id="main-content" tabIndex={-1}>
              <Outlet />
            </div>
          </TooltipProvider>
        </HelmetProvider>
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  );
}

const ErrorFallback = () => (
  <div
    style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#F4EDDA",
    }}
  >
    <div style={{ textAlign: "center", maxWidth: 400, padding: "0 24px" }}>
      <p style={{ fontFamily: "Georgia, serif", fontSize: "22px", fontWeight: 500, color: "#171208", marginBottom: "12px" }}>
        Something went wrong
      </p>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: "14px", color: "rgba(23,18,8,0.6)", marginBottom: "24px" }}>
        Our team has been notified and is looking into it.
      </p>
      <button
        onClick={() => (window.location.href = "/")}
        style={{
          padding: "10px 24px",
          background: "#C41E1E",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
          fontFamily: "Inter, sans-serif",
          fontSize: "14px",
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Return to Home
      </button>
    </div>
  </div>
);

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <h1 className="mb-3 text-2xl font-semibold text-foreground">This page didn't load</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Something went wrong on our end. You can try again or head back home.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => {
              void router.invalidate();
              reset();
            }}
          >
            Try again
          </button>
          <a className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground" href="/">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
