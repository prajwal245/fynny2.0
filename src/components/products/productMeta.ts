import { SUITES, type SuiteMeta } from "@/data/suiteStatus";

export type WidgetKey =
  | "liquidity"
  | "revenue"
  | "cost"
  | "gst"
  | "simulator"
  | "fynny"
  | "ca-partner"
  | "generic";

export interface ProductItem extends SuiteMeta {
  widget: WidgetKey;
  longDescription: string;
}

const widgetMap: Record<string, WidgetKey> = {
  liquidity: "liquidity",
  revenue: "revenue",
  cost: "cost",
  gst: "gst",
  simulator: "simulator",
};

const longDesc: Record<string, string> = {
  liquidity:
    "Track every rupee in real time. Predict cash crunches weeks in advance and extend runway with AI-driven recommendations.",
  revenue:
    "Monitor MRR, ARR and churn. Spot at-risk accounts before they leave and forecast growth with confidence.",
  cost:
    "Categorize every expense automatically. Find the 32% you can cut without hurting growth, vendor by vendor.",
  gst:
    "Never miss a filing. Reconcile GSTR-2B in seconds, recover ITC, and stay audit-ready around the clock.",
  governance:
    "Stay compliant across every regulator. Real-time risk scoring, audit trails, and proactive alerts.",
  hr:
    "Headcount ROI, payroll analytics, and attrition signals, built for growing Indian teams.",
  simulator:
    "Model any business decision in seconds. Adjust hires, prices, or spend and see the runway impact instantly.",
  market:
    "Benchmark against your industry. Spot growth opportunities before competitors do.",
  banking:
    "One view across every bank account. Smarter working capital, integrated lending, real-time reconciliation.",
  "ca-partner":
    "Built for India's CAs. White-label workflows, client portfolios, and shared compliance in one place.",
};

export const PRODUCT_ITEMS: ProductItem[] = SUITES.map((s) => ({
  ...s,
  widget: (widgetMap[s.id] ?? "generic") as WidgetKey,
  longDescription: longDesc[s.id] ?? s.description,
}));

// CFO Fynny as a special platform feature item
export const FYNNY_ITEM = {
  id: "fynny",
  name: "CFO Fynny",
  shortLabel: "Fynny",
  description: "Conversational financial intelligence, available 24/7",
  longDescription:
    "Ask Fynny anything about your business, burn rate, runway, vendor cuts, hiring decisions. She replies instantly with actionable advice grounded in your real data.",
  status: "live" as const,
  quarter: "Live" as const,
  href: "/dashboard/fynny-chat",
  widget: "fynny" as WidgetKey,
};

export const BUSINESS_TYPES = [
  { name: "D2C & E-commerce", widget: "revenue" as WidgetKey, status: "live" as const },
  { name: "SaaS & Technology", widget: "revenue" as WidgetKey, status: "live" as const },
  { name: "Manufacturing", widget: "cost" as WidgetKey, status: "live" as const },
  { name: "Professional Services", widget: "liquidity" as WidgetKey, status: "live" as const },
  { name: "Healthcare & Education", widget: "gst" as WidgetKey, status: "live" as const },
];

export const PLATFORM_FEATURES = [
  FYNNY_ITEM,
  {
    id: "ca-partner-feature",
    name: "CA Partner Program",
    description: "White label for accountants",
    longDescription:
      "Manage your entire client portfolio from one dashboard. Compliance, GST, and reports, co-branded.",
    status: "live" as const,
    widget: "ca-partner" as WidgetKey,
    href: "/ca/login",
  },
  {
    id: "investor-view",
    name: "Investor View",
    description: "One-page financial summary built for due diligence",
    longDescription:
      "Generate a live investor-ready dashboard from your real financial data. MRR, runway, burn rate, unit economics, compliance score, and revenue trend — all in one exportable page. Built for founder meetings and due diligence.",
    status: "live" as const,
    widget: "generic" as WidgetKey,
    href: "/dashboard/investor",
  },
];
