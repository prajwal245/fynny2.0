import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Upload, Landmark, CreditCard, FileSpreadsheet, Users, FileText, Mail,
  MessageCircle, Send, Sheet,
} from "lucide-react";
import { useIntegrations } from "@/hooks/useIntegrations";
import ConnectIntegrationModal, { ConnectMethod } from "@/components/integrations/ConnectIntegrationModal";
import BankStatementImport from "@/components/integrations/BankStatementImport";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

/* ============================================================
   FynHelp · Integrations
   ============================================================ */

const PAGE_WRAP: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "40px 48px",
  fontFamily: "'Inter', sans-serif",
};

const CARD: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #D4C9A8",
  borderRadius: 10,
  padding: 28,
  marginBottom: 24,
};

const SectionTitle = ({ title, sub }: { title: string; sub?: string }) => (
  <>
    <h2 style={{ fontWeight: 600, fontSize: 16, color: "#171208", marginBottom: 4 }}>{title}</h2>
    {sub && <p style={{ fontWeight: 400, fontSize: 13, color: "rgba(23,18,8,0.55)", marginBottom: 24 }}>{sub}</p>}
  </>
);

const StatusChip = ({ kind }: { kind: "connected" | "disconnected" | "active" }) => {
  const styles = {
    connected: { bg: "#F0FDF4", color: "#166534", border: "#A7F3D0", dot: "#16A34A", label: "CONNECTED" },
    disconnected: { bg: "#FAF7F0", color: "rgba(23,18,8,0.45)", border: "#D4C9A8", dot: "transparent", label: "NOT CONNECTED" },
    active: { bg: "#EFF6FF", color: "#1E40AF", border: "#BFDBFE", dot: "#3B82F6", label: "ACTIVE" },
  }[kind];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: styles.bg, color: styles.color, border: `1px solid ${styles.border}`,
      borderRadius: 100, padding: "3px 10px",
      fontWeight: 600, fontSize: 10, letterSpacing: "0.06em",
    }}>
      {styles.dot !== "transparent" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: styles.dot }} />}
      {styles.label}
    </span>
  );
};

const ConnectBtn = ({
  children, onClick, primary = false, disabled = false,
}: { children: React.ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      fontWeight: primary ? 600 : 500,
      fontSize: 13,
      color: primary ? "#FFFFFF" : "#C41E1E",
      background: primary ? "#C41E1E" : "#FDF2F1",
      border: primary ? "1px solid #A91818" : "1px solid rgba(196,30,30,0.20)",
      borderRadius: 6, padding: primary ? "9px 18px" : "7px 14px",
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
      boxShadow: primary ? "0 1px 2px rgba(196,30,30,0.20)" : "none",
      letterSpacing: "0.01em",
    }}
  >
    {children}
  </button>
);

const GhostBtn = ({ children, onClick, color = "rgba(23,18,8,0.50)" }: { children: React.ReactNode; onClick?: () => void; color?: string }) => (
  <button
    onClick={onClick}
    style={{
      fontWeight: 500, fontSize: 12, color,
      background: "transparent", border: "none", cursor: "pointer", padding: 0,
    }}
    onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
    onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
  >
    {children}
  </button>
);

/* ---------- Logo box ---------- */
type LogoSpec =
  | { kind: "img"; slug: string; color: string; alt: string }
  | { kind: "icon"; Icon: LucideIcon; color: string };

const LogoBox = ({ logo }: { logo: LogoSpec }) => (
  <div style={{
    width: 40, height: 40, borderRadius: 8,
    border: "0.5px solid rgba(23,18,8,0.08)",
    background: "#FFFFFF", padding: 6, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    marginRight: 8,
  }}>
    {logo.kind === "img" ? (
      <img
        src={`https://cdn.simpleicons.org/${logo.slug}/${logo.color}`}
        alt={logo.alt}
        width={28} height={28}
        style={{ width: 28, height: 28, objectFit: "contain" }}
        loading="lazy"
      />
    ) : (
      <logo.Icon size={24} color={logo.color} />
    )}
  </div>
);

const Row = ({
  logo, name, method, sub, status, action, isLast, note,
}: {
  logo: LogoSpec; name: string; method: string; sub?: string;
  status: React.ReactNode; action?: React.ReactNode; isLast?: boolean; note?: string;
}) => (
  <div style={{ borderBottom: isLast ? "none" : "1px solid #F0EBD8" }}>
    <div style={{ display: "flex", alignItems: "center", minHeight: 72, gap: 12 }}>
      <LogoBox logo={logo} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#171208" }}>{name}</div>
        <div style={{ fontWeight: 400, fontSize: 12, color: "rgba(23,18,8,0.50)" }}>{method}</div>
        {sub && <div style={{ fontWeight: 500, fontSize: 11, color: "#8B6914", marginTop: 2 }}>{sub}</div>}
        {note && <div style={{ fontWeight: 500, fontSize: 11, color: "#8B6914", marginTop: 4 }}>{note}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        {status}
        {action}
      </div>
    </div>
  </div>
);

/* ---------- Logo specs ---------- */
const L = {
  razorpay: { kind: "img", slug: "razorpay", color: "3395FF", alt: "Razorpay" } as LogoSpec,
  stripe:   { kind: "img", slug: "stripe", color: "635BFF", alt: "Stripe" } as LogoSpec,
  payu:     { kind: "icon", Icon: CreditCard, color: "#0A6E3A" } as LogoSpec,
  cashfree: { kind: "icon", Icon: CreditCard, color: "#6933FF" } as LogoSpec,
  phonepe:  { kind: "icon", Icon: CreditCard, color: "#5F259F" } as LogoSpec,
  paytm:    { kind: "img", slug: "paytm", color: "00BAF2", alt: "Paytm" } as LogoSpec,
  instamojo: { kind: "icon", Icon: CreditCard, color: "#E83A65" } as LogoSpec,
  razorpayx: { kind: "img", slug: "razorpay", color: "0F1F4D", alt: "RazorpayX" } as LogoSpec,
  bank:     { kind: "icon", Icon: Landmark, color: "#171208" } as LogoSpec,
  fi:       { kind: "icon", Icon: Landmark, color: "#00C896" } as LogoSpec,
  jupiter:  { kind: "icon", Icon: Landmark, color: "#FF6900" } as LogoSpec,
  shopify:  { kind: "img", slug: "shopify", color: "7AB55C", alt: "Shopify" } as LogoSpec,
  woo:      { kind: "img", slug: "woocommerce", color: "96588A", alt: "WooCommerce" } as LogoSpec,
  amazon:   { kind: "img", slug: "amazon", color: "FF9900", alt: "Amazon" } as LogoSpec,
  fynd:     { kind: "icon", Icon: FileSpreadsheet, color: "#171208" } as LogoSpec,
  zoho:     { kind: "img", slug: "zoho", color: "E42527", alt: "Zoho" } as LogoSpec,
  hubspot:  { kind: "img", slug: "hubspot", color: "FF7A59", alt: "HubSpot" } as LogoSpec,
  qb:       { kind: "img", slug: "quickbooks", color: "2CA01C", alt: "QuickBooks" } as LogoSpec,
  tally:    { kind: "icon", Icon: FileSpreadsheet, color: "#0078D4" } as LogoSpec,
  keka:     { kind: "icon", Icon: Users, color: "#5E35B1" } as LogoSpec,
  greythr:  { kind: "icon", Icon: Users, color: "#16A34A" } as LogoSpec,
  darwinbox: { kind: "icon", Icon: Users, color: "#FF5722" } as LogoSpec,
  slack:    { kind: "img", slug: "slack", color: "4A154B", alt: "Slack" } as LogoSpec,
  telegram: { kind: "icon", Icon: Send, color: "#26A5E4" } as LogoSpec,
  whatsapp: { kind: "img", slug: "whatsapp", color: "25D366", alt: "WhatsApp" } as LogoSpec,
  email:    { kind: "icon", Icon: Mail, color: "#171208" } as LogoSpec,
  sheets:   { kind: "img", slug: "googlesheets", color: "34A853", alt: "Google Sheets" } as LogoSpec,
  upload:   { kind: "icon", Icon: Upload, color: "#8B6914" } as LogoSpec,
  doc:      { kind: "icon", Icon: FileText, color: "#1E40AF" } as LogoSpec,
  busy:     { kind: "icon", Icon: FileSpreadsheet, color: "#1E40AF" } as LogoSpec,
  gst:      { kind: "icon", Icon: FileText, color: "#166534" } as LogoSpec,
  traces:   { kind: "icon", Icon: FileText, color: "#1E40AF" } as LogoSpec,
  manualPay: { kind: "icon", Icon: Users, color: "#8B6914" } as LogoSpec,
};

/* ---------- Provider catalogue (single source of truth) ---------- */
type Provider = {
  slug: string;
  label: string;
  method: string;            // human label
  connect: ConnectMethod;    // modal type
  logo: LogoSpec;
  note?: string;
  alwaysActive?: boolean;    // file uploads / built-ins
  primary?: boolean;         // primary "recommended" red button
  comingSoon?: boolean;      // show Coming Soon badge instead of Connect
};

const lastSynced = "Last synced: just now";

const ALL: Provider[] = [
  // Payments (8)
  { slug: "razorpay", label: "Razorpay", method: "API Key + Secret", connect: "api_key", logo: L.razorpay, note: "⭐ Recommended — most used by Indian startups", primary: true },
  { slug: "stripe", label: "Stripe", method: "API Key + Secret", connect: "api_key", logo: L.stripe, note: "For international payments in USD/EUR" },
  { slug: "payu", label: "PayU", method: "API Key", connect: "api_key", logo: L.payu },
  { slug: "cashfree", label: "Cashfree", method: "API Key", connect: "api_key", logo: L.cashfree },
  { slug: "phonepe_business", label: "PhonePe Business", method: "API Key", connect: "api_key", logo: L.phonepe },
  { slug: "paytm_business", label: "Paytm for Business", method: "API Key", connect: "api_key", logo: L.paytm },
  { slug: "instamojo", label: "Instamojo", method: "API Key", connect: "api_key", logo: L.instamojo, note: "Popular for D2C and service businesses" },
  { slug: "razorpayx", label: "RazorpayX (Current Account)", method: "API Key", connect: "api_key", logo: L.razorpayx, note: "For RazorpayX current account holders" },

  // Banking (8)
  // Banking (8) — Account Aggregator connections require AA-provider registration
  { slug: "bank_aa_hdfc", label: "HDFC Bank", method: "Account Aggregator", connect: "oauth", logo: L.bank, comingSoon: true, note: "Requires Account Aggregator provider registration." },
  { slug: "bank_aa_icici", label: "ICICI Bank", method: "Account Aggregator", connect: "oauth", logo: L.bank, comingSoon: true, note: "Requires Account Aggregator provider registration." },
  { slug: "bank_aa_sbi", label: "SBI", method: "Account Aggregator", connect: "oauth", logo: L.bank, comingSoon: true, note: "Requires Account Aggregator provider registration." },
  { slug: "bank_aa_axis", label: "Axis Bank", method: "Account Aggregator", connect: "oauth", logo: L.bank, comingSoon: true, note: "Requires Account Aggregator provider registration." },
  { slug: "bank_aa_kotak", label: "Kotak Mahindra Bank", method: "Account Aggregator", connect: "oauth", logo: L.bank, comingSoon: true, note: "Requires Account Aggregator provider registration." },
  { slug: "bank_aa_fi", label: "Fi Money", method: "Account Aggregator", connect: "oauth", logo: L.fi, comingSoon: true, note: "Requires Account Aggregator provider registration." },
  { slug: "bank_aa_jupiter", label: "Jupiter", method: "Account Aggregator", connect: "oauth", logo: L.jupiter, comingSoon: true, note: "Requires Account Aggregator provider registration." },
  { slug: "pdf_upload", label: "PDF Bank Statement", method: "File Upload + OCR", connect: "file", logo: L.doc, alwaysActive: true },

  // Accounting (4)
  { slug: "tally", label: "Tally Prime", method: "CSV / XML Upload", connect: "file", logo: L.tally, note: "Export Day Book or Cash/Bank Book from Tally and upload here. See Import page for step-by-step instructions." },
  { slug: "zoho_books", label: "Zoho Books", method: "OAuth 2.0", connect: "oauth", logo: L.zoho },
  { slug: "quickbooks", label: "QuickBooks India", method: "OAuth 2.0", connect: "oauth", logo: L.qb },
  { slug: "busy", label: "Busy Accounting", method: "CSV Upload", connect: "file", logo: L.busy },

  // Payroll & HR (6)
  { slug: "keka_hr", label: "Keka HR", method: "OAuth API", connect: "oauth", logo: L.keka, comingSoon: true, note: "Partner API access required. Apply at https://www.keka.com/partners." },
  { slug: "greythr", label: "GreytHR", method: "OAuth API", connect: "oauth", logo: L.greythr, comingSoon: true, note: "Partner API access required. Apply at https://www.greythr.com/partners." },
  { slug: "razorpay_payroll", label: "Razorpay Payroll", method: "OAuth API", connect: "oauth", logo: L.razorpay, comingSoon: true, note: "Partner API access required. Apply at https://razorpay.com/payroll/partners." },
  { slug: "darwinbox", label: "Darwinbox", method: "OAuth API", connect: "oauth", logo: L.darwinbox, comingSoon: true, note: "Partner API access required. Apply at https://darwinbox.com/partners." },
  { slug: "zoho_payroll", label: "Zoho Payroll", method: "OAuth 2.0", connect: "oauth", logo: L.zoho, note: "Requires an active Zoho Payroll subscription." },
  { slug: "manual_payroll", label: "Manual Payroll Entry", method: "Always available", connect: "oauth", logo: L.manualPay, alwaysActive: true },

  // GST & Compliance (2)
  { slug: "gst_portal", label: "GST Portal via GSP", method: "Direct API", connect: "api_key", logo: L.gst, comingSoon: true, note: "Requires GSP registration with GSTN. Application in progress." },
  { slug: "traces_tds", label: "TRACES (TDS)", method: "Read-only", connect: "api_key", logo: L.traces, comingSoon: true, note: "Requires GSP registration with GSTN. Application in progress." },

  // E-Commerce (4)
  { slug: "shopify", label: "Shopify", method: "OAuth 2.0", connect: "oauth", logo: L.shopify },
  { slug: "woocommerce", label: "WooCommerce", method: "API Key", connect: "api_key", logo: L.woo },
  { slug: "amazon_seller", label: "Amazon Seller Central", method: "SP-API Refresh Token", connect: "api_key", logo: L.amazon },
  { slug: "fynd_unicommerce", label: "Fynd / Unicommerce", method: "API Key", connect: "api_key", logo: L.fynd, note: "For multi-channel D2C brands" },

  // CRM & Sales (2)
  { slug: "zoho_crm", label: "Zoho CRM", method: "OAuth 2.0", connect: "oauth", logo: L.zoho },
  { slug: "hubspot", label: "HubSpot", method: "OAuth 2.0", connect: "oauth", logo: L.hubspot },

  // Alerts & Communication (3)
  { slug: "whatsapp_business", label: "WhatsApp Business (via Gupshup)", method: "API Key", connect: "api_key", logo: L.whatsapp, note: "Paste your Gupshup API key. Alerts will be sent via WhatsApp Business API." },
  { slug: "slack", label: "Slack", method: "Incoming Webhook URL", connect: "bot_token", logo: L.slack, note: "Get FynHelp alerts in your Slack workspace" },
  { slug: "telegram", label: "Telegram", method: "Bot Token", connect: "bot_token", logo: L.telegram, note: "Get Fynny alerts in Telegram" },

  // Productivity & Export (2)
  { slug: "google_sheets", label: "Google Sheets", method: "OAuth 2.0", connect: "oauth", logo: L.sheets, comingSoon: true, note: "Google Sheets export — coming soon. OAuth setup in progress." },
  { slug: "email_reports", label: "Email Reports", method: "Built-in", connect: "oauth", logo: L.email, note: "Weekly financial digest sent every Monday", alwaysActive: true },

  // Data Import (3)
  { slug: "csv_upload", label: "CSV Upload — Bank Statement", method: "File Upload", connect: "file", logo: L.upload, alwaysActive: true },
  { slug: "excel_upload", label: "Excel Upload — Invoices/Expenses", method: "File Upload", connect: "file", logo: L.upload, alwaysActive: true },
];

const TOTAL = 41;

/* ---------- Section layout ---------- */
const SECTIONS: { title: string; sub?: string; slugs: string[] }[] = [
  { title: "Payments", sub: "Sync payment collections, settlements and refunds automatically.",
    slugs: ["razorpay","stripe","payu","cashfree","phonepe_business","paytm_business","instamojo","razorpayx"] },
  { title: "Banking", sub: "Connect your bank accounts via RBI's Account Aggregator. Your login credentials are never shared.",
    slugs: ["bank_aa_hdfc","bank_aa_icici","bank_aa_sbi","bank_aa_axis","bank_aa_kotak","bank_aa_fi","bank_aa_jupiter","pdf_upload"] },
  { title: "Accounting Software", sub: "Sync your invoices, bills, and ledger data automatically.",
    slugs: ["tally","zoho_books","quickbooks","busy"] },
  { title: "Payroll & HR", sub: "Sync payroll data for HR Intelligence and payroll cash planning.",
    slugs: ["keka_hr","greythr","razorpay_payroll","darwinbox","zoho_payroll","manual_payroll"] },
  { title: "GST & Compliance", slugs: ["gst_portal","traces_tds"] },
  { title: "E-Commerce", sub: "Import orders, returns and revenue from your online store.",
    slugs: ["shopify","woocommerce","amazon_seller","fynd_unicommerce"] },
  { title: "CRM & Sales", sub: "Sync customer data, deals and revenue pipeline.",
    slugs: ["zoho_crm","hubspot"] },
  { title: "Alerts & Communication", sub: "Get financial alerts and Fynny AI on your favourite channels.",
    slugs: ["whatsapp_business","slack","telegram"] },
  { title: "Productivity & Export", sub: "Export your financial data to tools you already use.",
    slugs: ["google_sheets","email_reports"] },
  { title: "Data Import", sub: "No integration? Upload your data manually.",
    slugs: ["csv_upload","excel_upload","pdf_upload"] },
];

const PROVIDER_BY_SLUG = new Map(ALL.map((p) => [p.slug, p]));

const IntegrationsPage = () => {
  const { byProvider, connectedCount, connect, disconnect, isConnecting } = useIntegrations();
  const { businessId } = useAuth();
  const qc = useQueryClient();
  const [modal, setModal] = useState<Provider | null>(null);
  const [verifyingRazorpay, setVerifyingRazorpay] = useState(false);
  const [verifyingStripe, setVerifyingStripe] = useState(false);
  const [verifyingWoo, setVerifyingWoo] = useState(false);
  const [verifyingPayU, setVerifyingPayU] = useState(false);
  const [verifyingCashfree, setVerifyingCashfree] = useState(false);
  const [verifyingInstamojo, setVerifyingInstamojo] = useState(false);
  const [verifyingPhonePe, setVerifyingPhonePe] = useState(false);
  const [verifyingPaytm, setVerifyingPaytm] = useState(false);
  const [verifyingRazorpayX, setVerifyingRazorpayX] = useState(false);
  const [verifyingAmazon, setVerifyingAmazon] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<string | null>(null);

  const startOAuth = async (
    fnName: string,
    providerLabel: string,
    providerSlug: string,
    body: Record<string, unknown> = {},
  ) => {
    if (!businessId) {
      toast.error(`Complete onboarding before connecting ${providerLabel}.`);
      return;
    }
    setOauthBusy(providerSlug);
    const t = toast.loading(`Redirecting to ${providerLabel}…`);
    try {
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: { organization_id: businessId, ...body },
      });
      if (error) { toast.error(await extractEdgeError(error, "Failed to start OAuth"), { id: t }); return; }
      if ((data as any)?.error) { toast.error((data as any).error, { id: t }); return; }
      const url = (data as any)?.authorization_url;
      if (!url) { toast.error("No authorization URL returned", { id: t }); return; }
      toast.success(`Opening ${providerLabel}…`, { id: t });
      setModal(null);
      window.location.href = url;
    } catch (e) {
      toast.error((e as Error).message ?? "Unexpected error", { id: t });
    } finally {
      setOauthBusy(null);
    }
  };

  const handleAmazonConnect = async (creds: { seller_id: string; marketplace_id: string; refresh_token: string }) => {
    if (!businessId) { toast.error("Complete onboarding before connecting Amazon."); return; }
    setVerifyingAmazon(true);
    const t = toast.loading("Verifying with Amazon SP-API…");
    try {
      const { data, error } = await supabase.functions.invoke("amazon-verify-keys", {
        body: { organization_id: businessId, ...creds },
      });
      if (error) { toast.error(await extractEdgeError(error, "Verification failed"), { id: t }); return; }
      if ((data as any)?.error) { toast.error((data as any).error, { id: t }); return; }
      toast.success(`Amazon Seller connected (${(data as any)?.seller_id ?? ""}).`, { id: t });
      setModal(null);
      qc.invalidateQueries({ queryKey: ["integrations", businessId] });
    } catch (e) {
      toast.error((e as Error).message ?? "Unexpected error", { id: t });
    } finally {
      setVerifyingAmazon(false);
    }
  };


  const extractEdgeError = async (error: any, fallback: string) => {
    let msg = error?.message ?? fallback;
    try {
      const body = await error?.context?.json?.();
      if (body?.error) msg = body.error;
    } catch { /* ignore */ }
    return msg;
  };

  const handleRazorpayConnect = async (key_id: string, key_secret: string) => {
    if (!businessId) {
      toast.error("Complete onboarding before connecting Razorpay.");
      return;
    }
    setVerifyingRazorpay(true);
    const t = toast.loading("Verifying with Razorpay…");
    try {
      const { data, error } = await supabase.functions.invoke("razorpay-verify-keys", {
        body: { organization_id: businessId, key_id, key_secret },
      });
      if (error) {
        toast.error(await extractEdgeError(error, "Verification failed"), { id: t });
        return;
      }
      if ((data as any)?.error) {
        toast.error((data as any).error, { id: t });
        return;
      }
      const mode = (data as any)?.mode ?? "test";
      const registered = (data as any)?.webhook_registered;
      const warn = (data as any)?.webhook_warning;
      toast.success(
        `Razorpay connected (${mode}). ${registered ? "Webhook registered." : "Webhook not registered — see instructions."}`,
        { id: t },
      );
      if (warn) toast.warning(warn, { duration: 12000 });
      setModal(null);
      qc.invalidateQueries({ queryKey: ["integrations", businessId] });
    } catch (e) {
      toast.error((e as Error).message ?? "Unexpected error", { id: t });
    } finally {
      setVerifyingRazorpay(false);
    }
  };

  const handleStripeConnect = async (key_id: string, key_secret: string) => {
    if (!businessId) {
      toast.error("Complete onboarding before connecting Stripe.");
      return;
    }
    setVerifyingStripe(true);
    const t = toast.loading("Verifying with Stripe…");
    try {
      const { data, error } = await supabase.functions.invoke("stripe-verify-keys", {
        body: { organization_id: businessId, key_id, key_secret },
      });
      if (error) {
        toast.error(await extractEdgeError(error, "Verification failed"), { id: t });
        return;
      }
      if ((data as any)?.error) {
        toast.error((data as any).error, { id: t });
        return;
      }
      const mode = (data as any)?.mode ?? "test";
      const registered = (data as any)?.webhook_registered;
      const warn = (data as any)?.webhook_warning;
      toast.success(
        `Stripe connected (${mode}). ${registered ? "Webhook registered." : "Webhook not registered — see instructions."}`,
        { id: t },
      );
      if (warn) toast.warning(warn, { duration: 12000 });
      setModal(null);
      qc.invalidateQueries({ queryKey: ["integrations", businessId] });
    } catch (e) {
      toast.error((e as Error).message ?? "Unexpected error", { id: t });
    } finally {
      setVerifyingStripe(false);
    }
  };

  const handleWooCommerceConnect = async (
    store_url: string,
    consumer_key: string,
    consumer_secret: string,
  ) => {
    if (!businessId) {
      toast.error("Complete onboarding before connecting WooCommerce.");
      return;
    }
    setVerifyingWoo(true);
    const t = toast.loading("Verifying with your WooCommerce store…");
    try {
      const { data, error } = await supabase.functions.invoke("woocommerce-verify-keys", {
        body: { organization_id: businessId, store_url, consumer_key, consumer_secret },
      });
      if (error) {
        toast.error(await extractEdgeError(error, "Verification failed"), { id: t });
        return;
      }
      if ((data as any)?.error) {
        toast.error((data as any).error, { id: t });
        return;
      }
      const url = (data as any)?.store_url ?? store_url;
      toast.success(`WooCommerce connected — ${url}`, { id: t });
      setModal(null);
      qc.invalidateQueries({ queryKey: ["integrations", businessId] });
    } catch (e) {
      toast.error((e as Error).message ?? "Unexpected error", { id: t });
    } finally {
      setVerifyingWoo(false);
    }
  };

  const handleApiKeyVerify = async (
    fnName: string,
    providerLabel: string,
    key_id: string,
    key_secret: string,
    setBusy: (b: boolean) => void,
    extraBody: Record<string, unknown> = {},
  ) => {
    if (!businessId) {
      toast.error(`Complete onboarding before connecting ${providerLabel}.`);
      return;
    }
    setBusy(true);
    const t = toast.loading(`Verifying with ${providerLabel}…`);
    try {
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: { organization_id: businessId, key_id, key_secret, ...extraBody },
      });
      if (error) {
        toast.error(await extractEdgeError(error, "Verification failed"), { id: t });
        return;
      }
      if ((data as any)?.error) {
        toast.error((data as any).error, { id: t });
        return;
      }
      const mode = (data as any)?.mode ?? "live";
      const warn = (data as any)?.webhook_warning;
      const byApi = (data as any)?.verified_by_api;
      toast.success(
        byApi === false
          ? `${providerLabel} saved (${mode}) — will complete verification on first webhook.`
          : `${providerLabel} connected (${mode}).`,
        { id: t },
      );
      if (warn) toast.warning(warn, { duration: 12000 });
      setModal(null);
      qc.invalidateQueries({ queryKey: ["integrations", businessId] });
    } catch (e) {
      toast.error((e as Error).message ?? "Unexpected error", { id: t });
    } finally {
      setBusy(false);
    }
  };





  // Effective connected count = DB active integrations + always-active built-ins.
  const alwaysActiveSlugs = ALL.filter((p) => p.alwaysActive).map((p) => p.slug);
  const dbActive = ALL.filter((p) => !p.alwaysActive && byProvider.get(p.slug)?.status === "active").length;
  const effectiveConnected = dbActive + alwaysActiveSlugs.length;

  const renderRow = (slug: string, isLast: boolean) => {
    const p = PROVIDER_BY_SLUG.get(slug);
    if (!p) return null;
    const row = byProvider.get(p.slug);
    const isActive = p.alwaysActive || row?.status === "active";

    // Coming-soon providers: honest badge, no Connect button
    if (p.slug === "pdf_upload" || p.comingSoon) {
      const noteText = p.slug === "pdf_upload"
        ? "PDF parsing is in development. Export CSV or Excel from your bank in the meantime."
        : p.note;
      return (
        <Row
          key={p.slug}
          logo={p.logo}
          name={p.label}
          method={p.method}
          note={noteText}
          status={
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D",
              borderRadius: 100, padding: "3px 10px",
              fontWeight: 600, fontSize: 10, letterSpacing: "0.06em",
            }}>COMING SOON</span>
          }
          action={p.slug === "pdf_upload" ? <ConnectBtn disabled>Upload PDF →</ConnectBtn> : null}
          isLast={isLast}
        />
      );
    }

    return (
      <Row
        key={p.slug}
        logo={p.logo}
        name={p.label}
        method={p.method}
        sub={isActive && !p.alwaysActive ? lastSynced : undefined}
        note={p.note}
        status={<StatusChip kind={p.alwaysActive ? "active" : isActive ? "connected" : "disconnected"} />}
        action={
          p.alwaysActive ? null :
          isActive ? (
            <GhostBtn onClick={() => disconnect(p.slug)} color="#C41E1E">Disconnect</GhostBtn>
          ) : (
            <ConnectBtn primary={p.primary} onClick={() => setModal(p)}>
              Connect {p.primary ? p.label : ""} →
            </ConnectBtn>
          )
        }
        isLast={isLast}
      />
    );
  };

  return (
    <div style={PAGE_WRAP}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontWeight: 700, fontSize: 28, color: "#171208", letterSpacing: "-0.02em" }}>Integrations</h1>
          <p style={{ fontWeight: 400, fontSize: 15, color: "#4A4540", marginTop: 6, lineHeight: 1.6 }}>
            Connect FynHelp to your banks, accounting software, payroll tools, and GST systems.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, marginTop: 6 }}>
          <span style={{
            background: "#FAF7F0", border: "1px solid #D4C9A8", borderRadius: 100,
            padding: "4px 12px", fontSize: 12, fontWeight: 600, color: "#171208",
            letterSpacing: "0.01em",
          }}>
            {TOTAL} integrations
          </span>
          <span style={{
            background: "#F0FDF4", border: "1px solid #A7F3D0", borderRadius: 100,
            padding: "4px 12px", fontSize: 12, fontWeight: 600, color: "#166534",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16A34A" }} />
            {effectiveConnected} connected
          </span>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        background: "#F0FDF4", border: "1px solid #A7F3D0", borderRadius: 8,
        padding: "14px 20px", margin: "24px 0 32px",
      }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: "#166534" }}>
          {effectiveConnected} of {TOTAL} integrations connected
        </span>
        <div style={{ flex: 1, maxWidth: 200, height: 6, background: "#D1FAE5", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${Math.round((effectiveConnected / TOTAL) * 100)}%`, height: "100%", background: "#16A34A", transition: "width 300ms" }} />
        </div>
        <span style={{ fontWeight: 500, fontSize: 13, color: "#166534" }}>
          Add more to improve CFO Fynny's accuracy
        </span>
      </div>

      {SECTIONS.map((s) => (
        <div key={s.title} style={CARD}>
          <SectionTitle title={s.title} sub={s.sub} />
          {s.title === "Banking" && (
            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid #F0EBD8" }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#171208", marginBottom: 4 }}>
                Bank Statement Import
              </div>
              <div style={{ fontWeight: 400, fontSize: 12, color: "rgba(23,18,8,0.55)", marginBottom: 14 }}>
                Upload a CSV or Excel export from your bank to import transactions instantly.
              </div>
              <BankStatementImport />
            </div>
          )}
          {s.slugs.map((slug, i) => renderRow(slug, i === s.slugs.length - 1))}
        </div>
      ))}

      {modal && (() => {
        const API_KEY_VERIFIERS: Record<string, { fn: string; label: string; busy: boolean; setBusy: (b: boolean) => void; helper: string }> = {
          payu: { fn: "payu-verify-keys", label: "PayU", busy: verifyingPayU, setBusy: setVerifyingPayU,
            helper: "Paste your PayU Merchant Key and Merchant Salt from PayU Dashboard → Settings → My Account → Merchant Key/Salt." },
          cashfree: { fn: "cashfree-verify-keys", label: "Cashfree", busy: verifyingCashfree, setBusy: setVerifyingCashfree,
            helper: "Paste your Cashfree App ID and Secret Key from Dashboard → Developers → API Keys." },
          instamojo: { fn: "instamojo-verify-keys", label: "Instamojo", busy: verifyingInstamojo, setBusy: setVerifyingInstamojo,
            helper: "Paste your Instamojo Client ID and Client Secret from Dashboard → Integrations → API & Plugins." },
          phonepe_business: { fn: "phonepe-verify-keys", label: "PhonePe Business", busy: verifyingPhonePe, setBusy: setVerifyingPhonePe,
            helper: "Paste your PhonePe Merchant ID and Salt Key from the PhonePe Business dashboard. PhonePe cannot be probed without a live txn — the first webhook confirms your keys." },
          paytm_business: { fn: "paytm-verify-keys", label: "Paytm for Business", busy: verifyingPaytm, setBusy: setVerifyingPaytm,
            helper: "Paste your Paytm MID and Merchant Key from Paytm for Business → Developer Settings → API Keys." },
          razorpayx: { fn: "razorpayx-verify-keys", label: "RazorpayX", busy: verifyingRazorpayX, setBusy: setVerifyingRazorpayX,
            helper: "Paste your Razorpay Key ID (rzp_live_/rzp_test_) and Key Secret. RazorpayX must be enabled on this account." },
        };
        const api = API_KEY_VERIFIERS[modal.slug];
        const anyApiBusy = Object.values(API_KEY_VERIFIERS).some((v) => v.busy);
        return (
        <ConnectIntegrationModal
          open={!!modal}
          onClose={() =>
            (verifyingRazorpay || verifyingStripe || verifyingWoo || verifyingAmazon || anyApiBusy || !!oauthBusy ? null : setModal(null))
          }
          provider={modal.slug}
          providerLabel={modal.label}
          method={modal.connect}
          busy={
            isConnecting ||
            (modal.slug === "razorpay" && verifyingRazorpay) ||
            (modal.slug === "stripe" && verifyingStripe) ||
            (modal.slug === "woocommerce" && verifyingWoo) ||
            (modal.slug === "amazon_seller" && verifyingAmazon) ||
            (oauthBusy === modal.slug) ||
            (!!api && api.busy)
          }
          helperText={
            modal.slug === "razorpay"
              ? "Paste your Razorpay Key ID and Key Secret from Dashboard → Settings → API Keys. We'll verify them with Razorpay before saving."
              : modal.slug === "stripe"
              ? "Paste your Stripe Publishable Key (pk_…) and Secret Key (sk_…) from Dashboard → Developers → API keys. We'll verify them with Stripe before saving."
              : modal.slug === "woocommerce"
              ? "Enter your store URL (https://…) and a REST API Consumer Key + Secret from WooCommerce → Settings → Advanced → REST API. We'll verify against your store before saving."
              : modal.slug === "shopify"
              ? "Enter your Shopify store domain (e.g. your-store.myshopify.com). You'll be redirected to Shopify to authorise FynHelp for read access to orders, products, and inventory."
              : modal.slug === "quickbooks"
              ? "You'll be redirected to Intuit to authorise FynHelp for read access to your QuickBooks accounting data."
              : modal.slug === "hubspot"
              ? "You'll be redirected to HubSpot to authorise FynHelp for read access to your contacts and deals."
              : modal.slug === "zoho_books"
              ? "You'll be redirected to Zoho to authorise FynHelp for read access to your Zoho Books accounting data — invoices, expenses, contacts, and transactions."
              : modal.slug === "zoho_crm"
              ? "You'll be redirected to Zoho to authorise FynHelp for read access to your CRM contacts and deals."
              : modal.slug === "zoho_payroll"
              ? "You'll be redirected to Zoho to authorise FynHelp for read access to your Zoho Payroll data."
              : modal.slug === "amazon_seller"
              ? "Enter your Marketplace ID (e.g. A21TJRUUN4KGV for Amazon.in), Seller ID, and the SP-API Refresh Token from Seller Central → Apps and Services → Develop apps. We'll verify with Amazon before saving."
              : api?.helper
          }
          onConfirm={(metadata) => {
            if (modal.slug === "razorpay") {
              const creds = (metadata as any).__credentials ?? {};
              handleRazorpayConnect(String(creds.key_id ?? ""), String(creds.key_secret ?? ""));
              return;
            }
            if (modal.slug === "stripe") {
              const creds = (metadata as any).__credentials ?? {};
              handleStripeConnect(String(creds.key_id ?? ""), String(creds.key_secret ?? ""));
              return;
            }
            if (modal.slug === "woocommerce") {
              const creds = (metadata as any).__credentials ?? {};
              handleWooCommerceConnect(
                String(creds.store_url ?? ""),
                String(creds.consumer_key ?? ""),
                String(creds.consumer_secret ?? ""),
              );
              return;
            }
            if (modal.slug === "shopify") {
              const creds = (metadata as any).__credentials ?? {};
              startOAuth("shopify-auth", "Shopify", "shopify", { shop_domain: String(creds.shop_domain ?? "") });
              return;
            }
            if (modal.slug === "quickbooks") {
              startOAuth("quickbooks-auth", "QuickBooks", "quickbooks");
              return;
            }
            if (modal.slug === "hubspot") {
              startOAuth("hubspot-auth", "HubSpot", "hubspot");
              return;
            }
            if (modal.slug === "zoho_books") {
              startOAuth("zoho-auth", "Zoho Books", "zoho_books");
              return;
            }
            if (modal.slug === "zoho_crm") {
              startOAuth("zoho-crm-auth", "Zoho CRM", "zoho_crm");
              return;
            }
            if (modal.slug === "zoho_payroll") {
              startOAuth("zoho-payroll-auth", "Zoho Payroll", "zoho_payroll");
              return;
            }
            if (modal.slug === "amazon_seller") {
              const creds = (metadata as any).__credentials ?? {};
              handleAmazonConnect({
                marketplace_id: String(creds.marketplace_id ?? ""),
                seller_id: String(creds.seller_id ?? ""),
                refresh_token: String(creds.refresh_token ?? ""),
              });
              return;
            }
            if (api) {
              const creds = (metadata as any).__credentials ?? {};
              handleApiKeyVerify(api.fn, api.label, String(creds.key_id ?? ""), String(creds.key_secret ?? ""), api.setBusy);
              return;
            }
            // For slack/telegram, promote credentials into metadata so send functions can read them.
            const rawCreds = (metadata as any).__credentials ?? {};
            const { __credentials: _ignored, ...safe } = metadata as Record<string, unknown>;
            if (modal.slug === "slack") {
              (safe as any).token = rawCreds.token;
            } else if (modal.slug === "telegram") {
              (safe as any).token = rawCreds.token;
              (safe as any).chat_id = rawCreds.chat_id;
            }
            connect({ provider: modal.slug, metadata: safe });
            setModal(null);
          }}
        />
        );
      })()}
    </div>
  );
};

export default IntegrationsPage;
