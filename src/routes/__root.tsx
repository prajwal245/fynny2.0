import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { HelmetProvider } from "react-helmet-async";

import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import SkipToContent from "@/components/system/SkipToContent";
import ScrollManager from "@/components/system/ScrollManager";
import SearchPalette from "@/components/system/SearchPalette";
import FloatingContact from "@/components/system/FloatingContact";
import NotFound from "@/pages/NotFound";
import { Sentry } from "@/lib/monitoring";
import { usePageTracking } from "@/hooks/usePageTracking";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import "@/v2/sessionWatch";

import appCss from "../styles.css?url";
import { DEFAULT_OG, ORG_NAME, SITE_NAME, absoluteUrl, organizationLd, websiteLd } from "@/lib/seo";

// Site-wide defaults only. Every public page sets its own title, description,
// canonical and social tags through seo() (src/lib/seo.ts); the deepest
// route wins when tag names collide.
const DEFAULT_TITLE = "FynHelp — Month-end close software for CA firms in India";
const DEFAULT_DESCRIPTION =
  "FynHelp helps CA firms in India close every client's month: documents collected, bank reconciled to Tally or Zoho books, and a source-traceable MIS ready for partner sign-off.";
const GOOGLE_SITE_VERIFICATION =
  (import.meta.env.VITE_GOOGLE_SITE_VERIFICATION as string | undefined) || "lwPij_cJgAb2D1gva7DUy_Bnc4sj99qXMxpdXwKODmg";

// Fonts the marketing site and the app need for first paint, in one request.
const CORE_FONTS =
  "https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Fraunces:ital,wght@0,400;0,600;1,300;1,400&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap";
// Fonts only older pages use: loaded after first paint so they never block it.
const LATER_FONTS = [
  "https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Raleway:wght@400;500;600;700&family=Roboto:wght@400;500;700&family=DM+Sans:wght@400;500;600;700&family=Work+Sans:wght@400;500;600&family=Playfair+Display:wght@700;900&family=JetBrains+Mono:wght@400;500;600&family=Sora:wght@400;600;700&family=Bebas+Neue&display=swap",
  "https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&f[]=satoshi@400,500,700&display=swap",
];
const LOAD_LATER_FONTS = `(function(){var u=${JSON.stringify(LATER_FONTS)};function go(){u.forEach(function(h){var l=document.createElement("link");l.rel="stylesheet";l.href=h;document.head.appendChild(l);});}if(document.readyState==="complete")go();else window.addEventListener("load",go);})();`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0, viewport-fit=cover" },
      { name: "format-detection", content: "telephone=no" },
      { name: "theme-color", content: "#F2EEE7" },
      { title: DEFAULT_TITLE },
      { name: "description", content: DEFAULT_DESCRIPTION },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1" },
      { name: "author", content: ORG_NAME },
      { name: "application-name", content: SITE_NAME },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:locale", content: "en_IN" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: DEFAULT_TITLE },
      { property: "og:description", content: DEFAULT_DESCRIPTION },
      { property: "og:image", content: absoluteUrl(DEFAULT_OG.path) },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: DEFAULT_OG.alt },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: absoluteUrl(DEFAULT_OG.path) },
      { name: "google-site-verification", content: GOOGLE_SITE_VERIFICATION },
      { "script:ld+json": organizationLd() },
      { "script:ld+json": websiteLd() },
    ],
    links: [
      { rel: "preconnect", href: "https://qfowcjyueonpwmxzthmz.supabase.co", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: CORE_FONTS },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "alternate", type: "text/plain", href: "/llms.txt", title: "FynHelp product summary for AI assistants" },
      { rel: "stylesheet", href: appCss },
    ],
    scripts: [
      // ported from main.tsx — force light theme before first paint (dark mode removed)
      {
        children:
          'document.documentElement.classList.remove("dark");document.documentElement.classList.add("light");',
      },
      { children: LOAD_LATER_FONTS },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className="light" suppressHydrationWarning>
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

/** Marketing-site widgets (search, contact bubble, waitlist) stay out of the practice app. */
function SiteOnly({ children }: { children: React.ReactNode }) {
  const inApp = useRouterState({ select: (s) => s.location.pathname.startsWith("/v2") });
  return inApp ? null : <>{children}</>;
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
            <SiteOnly>
              <SearchPalette />
              <FloatingContact />
            </SiteOnly>
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

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
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
