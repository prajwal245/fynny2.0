# Audit: 20 UX Features + 20 Security Controls

Verified by reading source, edge functions, `supabase/config.toml`, storage buckets, and live DB state.

## Part A — UX / Frontend features

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Dark mode toggle | Partial (dead) | `ThemeToggle.tsx` + `useTheme.ts` exist, but `main.tsx` force-sets `light` and removes `dark`; toggle is not mounted anywhere |
| 2 | Simple banner | Yes | `OfflineBanner.tsx`, `DemoModeBanner.tsx`, trial banners in `DashboardLayout` |
| 3 | Site search | Partial | Dashboard header search chip + `⌘K` dispatches `fynhelp:open-search`; no listener/palette implemented. `ui/command.tsx` unused. No public-site search |
| 4 | Scroll-to-top button | No | Only `window.scrollTo` inside CA onboarding steps; no floating button, no scroll-restore on route change |
| 5 | Mobile menus | Yes | `Navbar`, `ProductsMobilePanel`, `GlobalHeader` drawer, `CALayout`, `AdminLayout` |
| 6 | Loading animations | Yes | 68 files with skeletons / `Loader2` / pulse |
| 7 | Hover states | Yes | 154 files |
| 8 | Scroll progress bar | No | No occurrences anywhere (blog article page has none) |
| 9 | Copy button | Partial | 5 places (CA ITC, GST portfolio, media library, investor, CFO report). Not on blog code blocks or API/webhook URLs |
| 10 | Print stylesheet | Partial | 3 legacy dashboard pages only, and those routes are orphaned. No global `@media print` |
| 11 | Sticky headers | Yes | `GlobalHeader`, `CALayout`, `AdminLayout`, offline/demo banners |
| 12 | Skip to content | No | Zero matches in `src` or `index.html` |
| 13 | Password visibility toggle | Partial | Only `ResetPasswordPage`. Missing on `LoginPage` (sign in + sign up), CA login/register, admin login |
| 14 | UTM tracking | No | No `utm_` capture/persistence anywhere; analytics init does not store campaign params |
| 15 | Form success state | Yes | 67 files with success toasts; waitlist has a full success screen |
| 16 | Form error state | Yes | Inline errors + toasts across auth, onboarding, admin CRUD |
| 17 | Confirmation modals | Partial | `AlertDialog` + `ConfirmDelete` in admin content, media library, data import. Missing on destructive CA / settings actions |
| 18 | Last updated date | Partial | Admin content tabs + legacy compliance page. Not on blog articles or resources |
| 19 | Expandable FAQ | Yes | `home/FAQSection.tsx` + pricing FAQ using `ui/accordion` |
| 20 | Floating contact | No | WhatsApp link exists only in the footer; no floating/persistent contact widget |

Score: 8 present, 7 partial, 5 missing.

## Part B — Security controls

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| 1 | HSTS | No | Zero `Strict-Transport-Security`; no `public/_headers`, no CSP meta in `index.html` (CSP was only added inside some edge-function responses) |
| 2 | CSRF tokens | N/A-ish | No cookie-session forms; auth is bearer-JWT in localStorage, so classic CSRF does not apply. OAuth flows do use a `integration_oauth_states` state table |
| 3 | Reset sessions on password change | Partial | `settings/SecurityPage.tsx` signs the local session out after `updateUser`, but other sessions/devices are not revoked |
| 4 | Expire reset links | Yes (provider default) | Supabase recovery-link expiry; `ResetPasswordPage` handles expired/invalid link states. Not explicitly shortened |
| 5 | Prevent user enumeration | Partial | Reset page normalises "not found"; sign-in/sign-up paths still surface provider-specific messages |
| 6 | Whitelist upload types | Frontend only | Every input has `accept=`, but all 10 storage buckets have `allowed_mime_types = NULL` and `file_size_limit = NULL` — server accepts anything |
| 7 | Verify payment webhooks | Yes | `razorpay-webhook` and `stripe-webhook` verify HMAC signatures; both correctly `verify_jwt = false` |
| 8 | Set prices server-side | N/A | No checkout/billing charge flow yet; webhooks only ingest amounts, with sanity bounds |
| 9 | Block prompt injection | Partial | `fynny-chat` caps payload size and grounds the system prompt in live metrics; no explicit injection filter on user text or on `extract-document-ai` OCR output |
| 10 | Cap AI usage | Partial | Gateway 429s are handled and rows are limited; no per-user/per-day AI call quota |
| 11 | Limit request size | Partial | Client-side size checks (10/20/50/500 MB) and a body cap in `fynny-chat`; most other functions accept unbounded bodies |
| 12 | Rate limit password resets | Yes | `verify-captcha-and-rate-limit`: `reset_password` 3/hour, 1h lockout, plus IP-level limit |
| 13 | Sanitize before storing | Partial | Validation on admin/CA inputs; blog editor stores rich HTML with no server-side sanitiser |
| 14 | Lock down CORS | No | 35 edge functions use `Access-Control-Allow-Origin: *` |
| 15 | Disable directory listing | Yes | Static SPA hosting; no listing. `resources` bucket is public-read by object path only |
| 16 | Remove default admin routes | Partial | `/admin/*` is guessable but gated by `AdminGuard` / `is_admin_user()`; `AdminLayout` sidebar role enforcement is still disabled in code |
| 17 | Lock accounts after failed logins | Yes | login 5/15min → 30min lockout; admin 3/15min → 60min |
| 18 | Log security events | Yes | `admin_audit_log`, `resource_access_logs`, auth-link events, webhook event logging |
| 19 | Secure cookie flags | N/A | No app-set cookies; tokens live in localStorage (accepted trade-off for SPA) |
| 20 | Restrict database permissions | Yes | RLS enabled on all 119 public tables; `SECURITY DEFINER` helpers (`has_role`, `is_admin_user`, `user_in_ca_firm`) used in policies |

Score: 7 solid, 8 partial, 2 missing, 3 not applicable.

## Recommended fix order (if you want me to build it)

1. Security P0: bucket MIME + size whitelists, CORS allow-list helper shared by all edge functions, HSTS/CSP via `public/_headers`, re-enable `AdminLayout` role enforcement, server-side HTML sanitising for blog posts.
2. Security P1: global sign-out on password change, uniform auth error copy, per-user AI quota, body-size guard helper.
3. UX P0: skip-to-content link, scroll-to-top + route scroll restore, password visibility toggle on all auth forms, working ⌘K search palette.
4. UX P1: article scroll progress bar, UTM capture, floating contact button, global print stylesheet, decide dark mode (ship or delete the dead toggle).
