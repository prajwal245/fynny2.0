// Single source of truth for the 10 Intelligence Suites and their launch status.
// Used by MegaMenu, ProductsPage, SolutionsPage ecosystem map, RoadmapPage, and Footer.

import {
  Droplets,
  TrendingUp,
  PieChart,
  FileText,
  Shield,
  Users,
  Zap,
  BarChart3,
  Building2,
  Briefcase,
  type LucideIcon,
} from "lucide-react";

export type SuiteStatus = "live" | "coming_soon" | "archived";
export type SuiteQuarter = "Live" | "Q2 2026" | "Q3 2026" | "Q4 2026" | "Q1 2027" | "Q2 2027";

export interface SuiteMeta {
  id: string;
  name: string;
  shortLabel: string; // for ecosystem map nodes
  Icon: LucideIcon;
  description: string; // <= ~80 chars one-liner
  status: SuiteStatus;
  quarter: SuiteQuarter;
  /** Where to send users who click an active suite. Coming-soon suites point to homepage ecosystem section. */
  href: string;
}

export const SUITES: SuiteMeta[] = [
  {
    id: "liquidity",
    name: "Liquidity Intelligence",
    shortLabel: "Liquidity",
    Icon: Droplets,
    description: "Real-time cash flow tracking, burn rate alerts, runway forecasting",
    status: "live",
    quarter: "Live",
    href: "/dashboard/liquidity",
  },
  {
    id: "revenue",
    name: "Revenue Intelligence",
    shortLabel: "Revenue",
    Icon: TrendingUp,
    description: "MRR/ARR tracking, cohort analysis, churn prediction, revenue forecasts",
    status: "live",
    quarter: "Live",
    href: "/dashboard/revenue-intelligence",
  },
  {
    id: "cost",
    name: "Cost Intelligence",
    shortLabel: "Cost",
    Icon: PieChart,
    description: "Expense categorization, vendor spend analysis, cost optimization insights",
    status: "live",
    quarter: "Live",
    href: "/dashboard/cost",
  },
  {
    id: "gst",
    name: "GST & Tax Intelligence",
    shortLabel: "GST & Tax",
    Icon: FileText,
    description: "GST compliance tracking, ITC reconciliation, GSTR-2B matching, deadline alerts",
    status: "live",
    quarter: "Live",
    href: "/dashboard/gst",
  },
  {
    id: "governance",
    name: "Governance Intelligence",
    shortLabel: "Governance",
    Icon: Shield,
    description: "Audit readiness, compliance tracking, regulatory alerts, risk monitoring",
    status: "archived",
    quarter: "Live",
    href: "/dashboard/compliance",
  },
  {
    id: "hr",
    name: "HR & Workforce Intelligence",
    shortLabel: "HR",
    Icon: Users,
    description: "Payroll analytics, cost-per-employee, headcount ROI, attrition insights",
    status: "archived",
    quarter: "Live",
    href: "/dashboard/hr",
  },
  {
    id: "simulator",
    name: "Decision Simulator Suite",
    shortLabel: "Simulator",
    Icon: Zap,
    description: "What-if scenarios, financial modeling, strategic decision simulations",
    status: "archived",
    quarter: "Q4 2026",
    href: "/dashboard/decision-simulator",
  },
  {
    id: "market",
    name: "Market & Growth Intelligence",
    shortLabel: "Market",
    Icon: BarChart3,
    description: "Market trends, competitor benchmarking, growth opportunity identification",
    status: "archived",
    quarter: "Q1 2027",
    href: "/dashboard/market-growth",
  },
  {
    id: "banking",
    name: "Banking & Fintech Intelligence",
    shortLabel: "Banking",
    Icon: Building2,
    description: "Multi-bank aggregation, credit analysis, fintech integrations, working capital",
    status: "archived",
    quarter: "Q1 2027",
    href: "/dashboard/banking",
  },
  {
    id: "ca-partner",
    name: "CA & Partner Ecosystem",
    shortLabel: "CA Partner",
    Icon: Briefcase,
    description: "CA collaboration portal, client sharing, compliance delegation, ecosystem tools",
    status: "archived",
    quarter: "Live",
    href: "/ca/login",
  },
];

export const QUARTERS: SuiteQuarter[] = ["Q2 2026", "Q3 2026", "Q4 2026", "Q1 2027", "Q2 2027"];

export const isLive = (s: SuiteMeta) => s.status === "live";
export const isArchived = (s: SuiteMeta) => s.status === "archived";
export const comingSoonSuites = SUITES.filter((s) => s.status === "coming_soon");
export const liveSuites = SUITES.filter((s) => s.status === "live");
export const archivedSuites = SUITES.filter((s) => s.status === "archived");

