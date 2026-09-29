import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "@/lib/router-compat";
import { Helmet } from "react-helmet-async";
import Layout from "@/components/Layout";

const TAB_SEO: Record<string, { title: string; description: string }> = {
  videos: {
    title: "Resources — Video Guides for Indian SMEs | FynHelp",
    description: "Short video walkthroughs on cash flow, GST, and running finance like a founder — built for Indian SMEs.",
  },
  templates: {
    title: "Free Finance Templates for Indian SMEs | FynHelp",
    description: "Download ready-to-use cash flow, GST, invoicing, and payroll templates for Indian businesses.",
  },
  glossary: {
    title: "Financial Glossary for Indian SMEs | FynHelp",
    description: "Plain-English definitions of finance, GST, and compliance terms every Indian business owner should know.",
  },
  blog: {
    title: "FynHelp Blog — Financial Intelligence for Indian SMEs",
    description: "Guides and insights on cash flow, runway, GST compliance, and finance operations for Indian SMEs.",
  },
  community: {
    title: "FynHelp Community for Indian Founders & CAs",
    description: "Join Indian founders, finance leads, and CAs sharing playbooks on cash flow, compliance, and growth.",
  },
};
import { isSelfHostedVideo } from "@/lib/videoSource";
import { supabase } from "@/integrations/supabase/client";
import { Search, X } from "lucide-react";
import {
  IconRocket,
  IconFileDownload,
  IconBook,
  IconNews,
  IconMessages,
  IconBuildingBank,
  IconRefresh,
  IconMessageChatbot,
  IconChartArrowsVertical,
  IconCalendarEvent,
  IconGauge,
  IconMessage,
  IconBellRinging,
  IconFileSpreadsheet,
  IconPlayerPlayFilled,
  IconClock,
  IconDownload,
  IconMessageCircle2,
  type IconProps,
} from "@tabler/icons-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const downloadHref = (id: string) =>
  `${SUPABASE_URL}/functions/v1/download-resource?id=${encodeURIComponent(id)}`;

/* --------------------------- Palette --------------------------- */
const C = {
  bg: "#F2EEE7",
  card: "#FFFDF9",
  panel: "#EBE6DD",
  panelBorder: "rgba(23,18,8,0.09)",
  ink: "#171208",
  body: "rgba(23,18,8,0.62)",
  muted: "rgba(23,18,8,0.42)",
  red: "#A93838",
  redDark: "#5C1216",
  coral: "#E2673F",
  green: "#1F5A46",
  black: "#0E0B06",
  border: "rgba(23,18,8,0.09)",
};

type IconCmp = React.ComponentType<IconProps>;

/* --------------------------- Types --------------------------- */
type TabKey = "getting-started" | "templates" | "glossary" | "blog" | "community";

interface VideoItem {
  id: string;
  step: string;
  title: string;
  description: string;
  duration: string;
  icon: IconCmp;
  category: string;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
}
interface ArticleItem {
  id: string;
  title: string;
  excerpt: string;
  views: string;
  date: string;
}
interface TemplateItem {
  id: string;
  title: string;
  description: string;
  format: string;
  downloads: string | null;
  href: string;
  icon?: string | null;
}
interface GlossaryItem {
  id: string;
  term: string;
  short: string;
  full: string;
}
interface CommunityItem {
  id: string;
  author: string;
  initials: string;
  color: string;
  title: string;
  preview: string;
  replies: number;
  ago: string;
  tags: string[];
}

/* --------------------------- Seed data --------------------------- */
const VIDEOS: VideoItem[] = [
  { id: "v1", step: "DAY 1", title: "Connecting your bank account", description: "Link HDFC, ICICI, SBI and 50+ Indian banks securely via account aggregator.", duration: "5 min", icon: IconBuildingBank, category: "Bank connection" },
  { id: "v2", step: "DAY 1", title: "Syncing Tally or accounting software", description: "One-click sync with Tally Prime, Zoho Books, QuickBooks and more.", duration: "15 min", icon: IconRefresh, category: "Sync" },
  { id: "v3", step: "DAY 1", title: "Setting up GSTIN & compliance calendar", description: "Add your GSTIN and auto-populate every filing deadline for the year.", duration: "10 min", icon: IconCalendarEvent, category: "Compliance" },
  { id: "v4", step: "WEEK 1", title: "Understanding your first dashboard", description: "Read your cash flow, runway, and receivables panels like a CFO.", duration: "20 min", icon: IconGauge, category: "Dashboard" },
  { id: "v5", step: "WEEK 1", title: "First conversation with CFO Fynny", description: "Ask questions in Hindi or English and get founder-grade answers.", duration: "10 min", icon: IconMessageChatbot, category: "AI CFO" },
  { id: "v6", step: "WEEK 2", title: "Running your first hiring simulation", description: "Model the impact of a new hire on burn, runway and breakeven.", duration: "15 min", icon: IconChartArrowsVertical, category: "Simulation" },
  { id: "v7", step: "WEEK 2", title: "ITC reconciliation walkthrough", description: "Match GSTR-2B against your purchase register in minutes.", duration: "8 min", icon: IconFileSpreadsheet, category: "GST" },
  { id: "v8", step: "MONTH 1", title: "WhatsApp alerts setup", description: "Get daily cash, GST and overdue invoice nudges on WhatsApp.", duration: "3 min", icon: IconBellRinging, category: "Alerts" },
];

const VIDEO_ICON_BY_CATEGORY: Record<string, IconCmp> = {
  "Bank connection": IconBuildingBank,
  Sync: IconRefresh,
  Compliance: IconCalendarEvent,
  Dashboard: IconGauge,
  "AI CFO": IconMessageChatbot,
  Simulation: IconChartArrowsVertical,
  GST: IconFileSpreadsheet,
  Alerts: IconBellRinging,
};

const ARTICLES: ArticleItem[] = [
  { id: "a1", title: "5 signs you need an AI CFO before your next funding round", excerpt: "Financial intelligence is no longer a luxury. Here's how to know it's time to upgrade from spreadsheets.", views: "1.2K", date: "May 1, 2026" },
  { id: "a2", title: "Section 43B(h): The MSME payment law every founder must know", excerpt: "How a small change in the Income Tax Act gives MSMEs unprecedented leverage over delayed payments.", views: "2.4K", date: "Apr 28, 2026" },
  { id: "a3", title: "How we cut DSO from 67 days to 41 in 90 days", excerpt: "A founder's playbook for tightening receivables without alienating your best customers.", views: "890", date: "Apr 22, 2026" },
  { id: "a4", title: "GST 2.0: What the new rate rationalisation means for you", excerpt: "The biggest GST overhaul in 5 years is here. Here's a clear breakdown for SME owners.", views: "3.1K", date: "Apr 15, 2026" },
  { id: "a5", title: "The compliance calendar every Indian SME should run", excerpt: "20+ filings, 12 months, 1 dashboard. The complete deadline map for FY 2026-27.", views: "1.8K", date: "Apr 8, 2026" },
  { id: "a6", title: "Why your CA shouldn't also be your CFO", excerpt: "Compliance and strategy are two different jobs. Here's why founders confuse them, and what it costs.", views: "1.4K", date: "Apr 1, 2026" },
];

type ArticleCategory = "GST" | "Cash flow" | "MSME" | "Startup finance" | "Compliance";
const ARTICLE_CATEGORY: Record<string, ArticleCategory> = {
  a1: "Startup finance", a2: "MSME", a3: "Cash flow", a4: "GST", a5: "Compliance", a6: "Startup finance",
};

const GLOSSARY: GlossaryItem[] = [
  { id: "g-arr", term: "ARR", short: "Annual Recurring Revenue.", full: "Annual Recurring Revenue, the predictable subscription or contract revenue your business expects to earn over a 12-month period. ARR = MRR × 12." },
  { id: "g-burn", term: "Burn Rate", short: "Monthly cash spend rate.", full: "The speed at which your business spends its cash reserves. Net burn = cash out − cash in. Tracked monthly to project runway." },
  { id: "g-cac", term: "CAC", short: "Customer Acquisition Cost.", full: "Customer Acquisition Cost, total sales and marketing spend divided by the number of new customers acquired in the same period." },
  { id: "g-churn", term: "Churn", short: "Customer or revenue loss rate.", full: "The rate at which customers stop doing business with you, expressed as a percentage of your base per month or year. Revenue churn weights customers by their billing." },
  { id: "g-dso", term: "DSO", short: "Days Sales Outstanding.", full: "Days Sales Outstanding, the average number of days it takes to collect payment after a sale. Indian SME average is around 42 days." },
  { id: "g-ebitda", term: "EBITDA", short: "Earnings before interest, tax, depreciation, amortization.", full: "Earnings Before Interest, Taxes, Depreciation and Amortization, a proxy for operating cash profitability that strips out financing and accounting effects." },
  { id: "g-grossmargin", term: "Gross Margin", short: "Revenue minus cost of goods sold.", full: "Revenue minus the direct cost of producing what you sold, expressed as a percentage of revenue. A core measure of unit economics." },
  { id: "g-gstr1", term: "GSTR-1", short: "GST outward supply return.", full: "Monthly or quarterly return that lists every outward supply (sale) made by a registered taxpayer. Drives the buyer's GSTR-2B." },
  { id: "g-itc", term: "ITC", short: "Input Tax Credit (GST).", full: "Input Tax Credit, GST paid on business purchases that you can offset against the GST you owe on sales, subject to GSTR-2B matching." },
  { id: "g-ltv", term: "LTV", short: "Lifetime Value of customer.", full: "Lifetime Value, the total gross profit you expect from a customer over the entire relationship. LTV/CAC > 3 is a healthy benchmark." },
  { id: "g-mrr", term: "MRR", short: "Monthly Recurring Revenue.", full: "Monthly Recurring Revenue, the predictable revenue your business earns every month from active subscriptions or contracts." },
  { id: "g-nps", term: "NPS", short: "Net Promoter Score.", full: "Net Promoter Score, a customer satisfaction metric on a 0–10 scale. Promoters (9–10) minus Detractors (0–6), expressed as a percentage." },
  { id: "g-pl", term: "P&L", short: "Profit & Loss statement.", full: "Profit & Loss statement, a summary of revenue, costs and expenses over a period, ending with net profit or loss." },
  { id: "g-runway", term: "Runway", short: "Months until cash depletes.", full: "The number of months your business can operate at its current net burn before running out of cash. Runway = cash on hand ÷ monthly net burn." },
  { id: "g-wc", term: "Working Capital", short: "Current assets minus current liabilities.", full: "Current assets minus current liabilities, the short-term liquidity cushion your business operates with day to day." },
];

const COMMUNITY: CommunityItem[] = [
  { id: "c1", author: "Rajesh Kumar", initials: "R", color: C.red, title: "How do I reconcile ITC mismatches in GSTR-2A vs 2B?", preview: "I'm seeing a ~₹40K gap between 2A and 2B for March. Some vendors filed late. Best way to handle this cleanly?", replies: 12, ago: "2h ago", tags: ["GST", "Compliance"] },
  { id: "c2", author: "Priya Sharma", initials: "P", color: C.red, title: "Best practices for tracking marketplace settlements?", preview: "Amazon and Flipkart settlements come in batched. How are folks reconciling fees, returns and TCS?", replies: 8, ago: "5h ago", tags: ["Cash Flow", "Taxes"] },
  { id: "c3", author: "Ankit Mehta", initials: "A", color: C.ink, title: "Should I hire full-time accountant or quarterly CA?", preview: "₹3 Cr ARR, 14 people. CA fees feel high but FT accountant feels overkill. What did you do at this stage?", replies: 15, ago: "1d ago", tags: ["Funding", "Runway"] },
  { id: "c4", author: "Neha Gupta", initials: "N", color: C.red, title: "Razorpay settlement reconciliation tips?", preview: "Settlement files don't tag back to invoice numbers. Anyone built a clean mapping or using a tool for it?", replies: 6, ago: "2d ago", tags: ["Cash Flow"] },
  { id: "c5", author: "Vikram Singh", initials: "V", color: C.red, title: "How to handle RCM (Reverse Charge Mechanism) entries?", preview: "Started using a freelance designer abroad. Do I need to self-invoice every payment under RCM?", replies: 9, ago: "3d ago", tags: ["GST", "Compliance"] },
  { id: "c6", author: "Kavita Reddy", initials: "K", color: C.ink, title: "Cash vs accrual accounting for small businesses?", preview: "Turnover ₹80L. Currently on cash basis. CA is pushing me to move to accrual. Worth the switch now?", replies: 4, ago: "4d ago", tags: ["MSME", "Forecasting"] },
  { id: "c7", author: "Amit Patel", initials: "A", color: C.red, title: "TDS deduction rates for FY 2026-27?", preview: "Looking for a clean updated table for 194C, 194J, 194Q. Some thresholds changed in the latest budget.", replies: 11, ago: "5d ago", tags: ["Taxes", "Compliance"] },
  { id: "c8", author: "Deepak Jain", initials: "D", color: C.red, title: "Invoice numbering best practices for GST compliance?", preview: "Multi-state ops, multiple GSTINs. How are you structuring invoice series so audit doesn't flag gaps?", replies: 7, ago: "1w ago", tags: ["GST", "MSME"] },
  { id: "c9", author: "Sanjay Kumar", initials: "S", color: C.ink, title: "How to claim GST refund on exports?", preview: "First year of LUT-based exports. Refund stuck for 3 months. Anything I should pre-empt before filing?", replies: 13, ago: "1w ago", tags: ["GST", "Cash Flow"] },
  { id: "c10", author: "Ritu Agarwal", initials: "R", color: C.red, title: "Difference between GSTR-3B and GSTR-1?", preview: "Junior team keeps confusing the two. Looking for a 1-page explainer I can share internally.", replies: 5, ago: "2w ago", tags: ["GST"] },
];

const TABS: { key: TabKey; label: string; shortLabel: string; icon: IconCmp; badge: string; placeholder: string }[] = [
  { key: "getting-started", label: "Getting Started", shortLabel: "Start", icon: IconRocket, badge: `${VIDEOS.length} videos`, placeholder: "Search videos..." },
  { key: "templates", label: "Templates", shortLabel: "Templates", icon: IconFileDownload, badge: "5 files", placeholder: "Search templates..." },
  { key: "glossary", label: "Glossary", shortLabel: "Glossary", icon: IconBook, badge: `${GLOSSARY.length}+ terms`, placeholder: "Search terms..." },
  { key: "blog", label: "Blog", shortLabel: "Blog", icon: IconNews, badge: "New", placeholder: "Search articles..." },
  { key: "community", label: "Community", shortLabel: "Community", icon: IconMessages, badge: `${COMMUNITY.length} threads`, placeholder: "Search discussions..." },
];

const STEP_ORDER = ["DAY 1", "WEEK 1", "WEEK 2", "WEEK 3", "MONTH 1"];

/* --------------------------- Styles --------------------------- */

const STYLES = `
  .rs-page { background: ${C.bg}; color: ${C.ink}; font-family: 'Satoshi', system-ui, sans-serif; min-height: 100vh; }
  .rs-page * { box-sizing: border-box; }
  .rs-page :where(h1,h2,h3,h4,h5,h6) { font-family: 'Clash Display', sans-serif; font-weight: 600; letter-spacing: -0.035em; line-height: 1.06; color: ${C.ink}; margin: 0; }
  .rs-container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
  .num { font-variant-numeric: tabular-nums; }

  .rs-hero { padding: 80px 0 32px; }
  .rs-hero h1 { font-size: clamp(40px, 6vw, 72px); }
  .rs-hero p { margin-top: 16px; font-size: 18px; color: ${C.body}; max-width: 640px; line-height: 1.55; }

  /* Search pill */
  .rs-search { position: relative; max-width: 520px; margin-top: 28px; }
  .rs-search input { width: 100%; padding: 14px 20px 14px 46px; border-radius: 100px; border: 1px solid ${C.border}; background: ${C.card}; font-family: 'Satoshi',sans-serif; font-size: 14.5px; color: ${C.ink}; outline: none; transition: border-color .2s, box-shadow .2s; }
  .rs-search input:focus { border-color: ${C.red}; box-shadow: 0 0 0 3px rgba(184,51,58,0.10); }
  .rs-search .icon { position: absolute; left: 18px; top: 50%; transform: translateY(-50%); color: ${C.muted}; pointer-events: none; }

  /* Tabs (pill) */
  .rs-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 28px; }
  .rs-tab { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 100px; background: ${C.card}; border: 1px solid ${C.border}; color: ${C.body}; font-family: 'Satoshi',sans-serif; font-weight: 600; font-size: 13.5px; cursor: pointer; transition: background .2s, color .2s, transform .2s; }
  .rs-tab:hover { background: ${C.panel}; color: ${C.ink}; }
  .rs-tab.active { background: ${C.ink}; color: ${C.bg}; border-color: ${C.ink}; }
  .rs-tab .badge { padding: 2px 8px; border-radius: 100px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.04em; background: rgba(0,0,0,0.06); color: ${C.muted}; }
  .rs-tab.active .badge { background: rgba(255,255,255,0.15); color: rgba(255,255,255,0.9); }

  /* Content */
  .rs-content { padding: 40px 0 96px; }
  .rs-step-h { display: inline-flex; align-items: center; gap: 10px; font-family: 'Clash Display', sans-serif; font-weight: 600; font-size: 20px; letter-spacing: -0.02em; color: ${C.ink}; margin: 0 0 16px; }
  .rs-step-h .dot { width: 6px; height: 6px; border-radius: 50%; background: ${C.red}; }

  .rs-grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }

  /* Cards (pop) */
  .rs-card { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 16px; overflow: hidden; transition: transform .3s cubic-bezier(.34,1.56,.64,1), box-shadow .3s; display: flex; flex-direction: column; }
  .rs-card:hover { transform: translateY(-4px); box-shadow: 0 22px 50px -20px rgba(0,0,0,0.15); }

  /* Video card */
  .rs-thumb { position: relative; height: 140px; background: ${C.panel}; border-bottom: 1px solid ${C.border}; display: flex; align-items: center; justify-content: center; color: ${C.ink}; }
  .rs-thumb .thumb-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .rs-thumb .play { position: relative; z-index: 1; width: 52px; height: 52px; border-radius: 50%; background: ${C.red}; color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 24px rgba(184,51,58,0.35); }
  .rs-thumb .dur { position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.7); color: #fff; padding: 4px 10px; border-radius: 100px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; font-variant-numeric: tabular-nums; }
  .rs-thumb .cat-icon { position: absolute; top: 12px; left: 12px; background: ${C.card}; border: 1px solid ${C.border}; padding: 6px; border-radius: 8px; color: ${C.ink}; }

  .rs-card-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
  .rs-card-step { font-size: 10.5px; font-weight: 700; color: ${C.red}; letter-spacing: 0.14em; }
  .rs-card-title { font-family: 'Clash Display', sans-serif; font-weight: 600; font-size: 17px; letter-spacing: -0.02em; color: ${C.ink}; line-height: 1.3; }
  .rs-card-desc { font-size: 13.5px; color: ${C.body}; line-height: 1.55; }
  .rs-card-foot { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 6px; }
  .rs-mono { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: ${C.muted}; display: inline-flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }

  /* Template card */
  .rs-fmt { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 100px; background: ${C.red}; color: #fff; font-size: 10.5px; font-weight: 800; letter-spacing: 0.12em; }
  .rs-fmt.xlsx { background: ${C.green}; }
  .rs-fmt.docx { background: ${C.ink}; }
  .rs-download { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 100px; background: ${C.ink}; color: ${C.bg}; text-decoration: none; font-family: 'Satoshi',sans-serif; font-weight: 700; font-size: 12.5px; transition: background .2s; }
  .rs-download:hover { background: ${C.red}; }

  /* Blog card */
  .rs-blog-card { cursor: pointer; }
  .rs-blog-cat { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; color: ${C.red}; text-transform: uppercase; }
  .rs-blog-cat .d { width: 6px; height: 6px; border-radius: 50%; background: ${C.red}; }
  .rs-blog-cat.gold { color: ${C.ink}; } .rs-blog-cat.gold .d { background: ${C.ink}; }
  .rs-blog-cover { position: relative; aspect-ratio: 16 / 9; background: ${C.panel}; border-bottom: 1px solid ${C.border}; overflow: hidden; }
  .rs-blog-cover img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .5s cubic-bezier(.2,.8,.3,1); }
  .rs-blog-card:hover .rs-blog-cover img { transform: scale(1.04); }
  .rs-blog-cover .ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: 'Clash Display', sans-serif; font-size: 13px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(23,18,8,0.28); background: linear-gradient(135deg, ${C.panel} 0%, ${C.bg} 100%); }
  .rs-blog-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .rs-blog-pill { display: inline-flex; align-items: center; padding: 4px 11px; border-radius: 100px; background: rgba(184,51,58,0.10); color: ${C.red}; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; }
  .rs-blog-dot { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: ${C.muted}; font-variant-numeric: tabular-nums; }
  .rs-blog-title { font-family: 'Clash Display', sans-serif; font-weight: 600; font-size: 18px; letter-spacing: -0.02em; color: ${C.ink}; line-height: 1.28; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .rs-blog-ex { font-size: 13.5px; color: ${C.body}; line-height: 1.55; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .rs-blog-read { display: inline-flex; align-items: center; gap: 7px; margin-top: auto; padding-top: 10px; color: ${C.red}; font-weight: 700; font-size: 13px; }
  .rs-blog-read .arw { transition: transform .25s ease; }
  .rs-blog-card:hover .rs-blog-read .arw { transform: translateX(4px); }

  /* Glossary */
  .rs-gl-list { display: flex; flex-direction: column; gap: 10px; max-width: 860px; margin: 0 auto; }
  .rs-gl { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 14px; overflow: hidden; transition: transform .3s cubic-bezier(.34,1.56,.64,1); }
  .rs-gl:hover { transform: translateY(-2px); }
  .rs-gl summary { list-style: none; cursor: pointer; padding: 18px 22px; display: grid; grid-template-columns: 120px 1fr auto; gap: 18px; align-items: center; }
  .rs-gl summary::-webkit-details-marker { display: none; }
  .rs-gl-term { font-family: 'Clash Display', sans-serif; font-size: 18px; font-weight: 600; letter-spacing: -0.02em; color: ${C.ink}; }
  .rs-gl-short { font-size: 14px; color: ${C.body}; line-height: 1.5; }
  .rs-gl-toggle { width: 32px; height: 32px; border-radius: 50%; border: 1px solid ${C.border}; color: ${C.red}; display: inline-flex; align-items: center; justify-content: center; transition: transform .3s; font-size: 20px; line-height: 1; }
  .rs-gl[open] .rs-gl-toggle { transform: rotate(45deg); }
  .rs-gl-full { padding: 0 22px 22px 22px; font-size: 14px; color: ${C.body}; line-height: 1.65; }
  @media (max-width: 640px) { .rs-gl summary { grid-template-columns: 1fr auto; } .rs-gl-short { grid-column: 1 / -1; } }

  /* Community */
  .rs-community { display: flex; flex-direction: column; gap: 12px; max-width: 900px; margin: 0 auto; }
  .rs-c { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 16px; padding: 20px; display: flex; gap: 14px; transition: transform .3s cubic-bezier(.34,1.56,.64,1); }
  .rs-c:hover { transform: translateY(-3px); }
  .rs-avatar { width: 40px; height: 40px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; font-family: 'Satoshi',sans-serif; }
  .rs-c-title { font-family: 'Clash Display', sans-serif; font-weight: 600; font-size: 16px; letter-spacing: -0.02em; color: ${C.ink}; margin: 4px 0 6px; }
  .rs-c-preview { font-size: 13.5px; color: ${C.body}; line-height: 1.5; margin: 0 0 10px; }
  .rs-tag { padding: 3px 10px; border-radius: 100px; background: ${C.panel}; border: 1px solid ${C.panelBorder}; font-size: 10.5px; font-weight: 700; color: ${C.body}; letter-spacing: 0.06em; }

  /* Empty */
  .rs-empty { text-align: center; padding: 72px 20px; color: ${C.muted}; }
  .rs-empty h3 { font-size: 22px; margin-bottom: 8px; }

  /* Reveal — pop (matches HomePage) */
  .pop { opacity: 0; transform: translateY(52px) scale(.86) rotate(-1.5deg); transition: opacity .8s cubic-bezier(.16,1,.3,1), transform .9s cubic-bezier(.34,1.56,.64,1); will-change: opacity, transform; }
  .pop.in { opacity: 1; transform: none; }
  @media (prefers-reduced-motion: reduce) { .pop { opacity: 1 !important; transform: none !important; transition: none !important; } }

  html, body, #root { max-width: 100%; overflow-x: hidden; }
`;

/* --------------------------- Page --------------------------- */

const ResourcesPage = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const rawTab = params.get("tab") as TabKey | null;
  const initialTab: TabKey = TABS.find((t) => t.key === rawTab) ? (rawTab as TabKey) : "getting-started";

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [videoModal, setVideoModal] = useState<VideoItem | null>(null);
  const [glossaryModal, setGlossaryModal] = useState<GlossaryItem | null>(null);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [blogPosts, setBlogPosts] = useState<any[]>([]);
  const [dbGlossary, setDbGlossary] = useState<any[]>([]);
  const [dbVideos, setDbVideos] = useState<VideoItem[]>([]);

  useEffect(() => {
    supabase
      .from("blog_posts")
      .select("id, slug, title, excerpt, category, views, reading_time_minutes, published_at, tags, cover_image_url, author_name")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .then(({ data }) => setBlogPosts(data ?? []));
  }, []);

  useEffect(() => {
    supabase
      .from("resource_glossary")
      .select("id, term, short_definition, full_definition")
      .eq("is_published", true)
      .is("archived_at", null)
      .order("sort_order")
      .then(({ data }) => setDbGlossary(data ?? []));
  }, []);

  useEffect(() => {
    supabase
      .from("resource_videos")
      .select("id, step, title, description, duration, category, video_url, thumbnail_url")
      .eq("is_published", true)
      .is("archived_at", null)
      .order("sort_order")
      .then(({ data }) => {
        const rows = (data ?? []).map((row): VideoItem => ({
          id: row.id,
          step: row.step,
          title: row.title,
          description: row.description ?? "",
          duration: row.duration ?? "5 min",
          category: row.category ?? "",
          icon: VIDEO_ICON_BY_CATEGORY[row.category ?? ""] ?? IconRocket,
          videoUrl: row.video_url,
          thumbnailUrl: row.thumbnail_url,
        }));
        setDbVideos(rows);
      });
  }, []);

  useEffect(() => {
    const cur = params.get("tab");
    if (cur !== activeTab) {
      const next = new URLSearchParams(params);
      next.set("tab", activeTab);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    const next = (params.get("tab") as TabKey | null) ?? "getting-started";
    const safe: TabKey = TABS.find((t) => t.key === next) ? next : "getting-started";
    if (safe !== activeTab) {
      setActiveTab(safe);
      setSearch("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setSearch("");
    setDebounced("");
  }, [activeTab]);

  useEffect(() => {
    supabase
      .from("resources")
      .select("id, title, description, format, icon_url")
      .eq("is_published", true)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        const rows = (data ?? []).map((row): TemplateItem => ({
          id: row.id,
          title: row.title,
          description: row.description ?? "",
          format: row.format ?? "PDF",
          downloads: null,
          href: downloadHref(row.id),
          icon: row.icon_url,
        }));
        setTemplates(rows);
      });
  }, []);

  const matchesSearch = (haystack: string) => !debounced || haystack.toLowerCase().includes(debounced);

  const allVideos = dbVideos.length > 0 ? dbVideos : VIDEOS;
  const filteredVideos = useMemo(
    () => allVideos.filter((v) => matchesSearch(`${v.title} ${v.description} ${v.step}`)),
    [debounced, allVideos],
  );
  const groupedVideos = useMemo(() => {
    return STEP_ORDER.map((step) => ({
      step,
      items: filteredVideos.filter((v) => v.step === step),
    })).filter((g) => g.items.length > 0);
  }, [filteredVideos]);

  const filteredTemplates = useMemo(
    () => templates.filter((t) => matchesSearch(`${t.title} ${t.description} ${t.format}`)),
    [templates, debounced],
  );
  const filteredGlossary = useMemo(() => {
    const source: GlossaryItem[] =
      dbGlossary.length > 0
        ? dbGlossary.map((g: any) => ({
            id: g.id,
            term: g.term,
            short: g.short_definition,
            full: g.full_definition,
          }))
        : GLOSSARY;
    return [...source]
      .sort((a, b) => a.term.localeCompare(b.term))
      .filter((g) => matchesSearch(`${g.term} ${g.short} ${g.full}`));
  }, [debounced, dbGlossary]);

  const filteredBlogPosts = useMemo(
    () => blogPosts.filter((a: any) => matchesSearch(`${a.title} ${a.excerpt} ${a.category}`)),
    [blogPosts, debounced],
  );
  const filteredCommunity = useMemo(
    () => COMMUNITY.filter((c) => matchesSearch(`${c.title} ${c.preview} ${c.author}`)),
    [debounced],
  );

  const currentTabConfig = TABS.find((t) => t.key === activeTab)!;

  // Bidirectional reveal on scroll
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = pageRef.current;
    if (!root) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>(".rs-card, .rs-gl, .rs-c"));
    targets.forEach((el, i) => {
      el.classList.add("pop");
      const idx = Array.from(el.parentElement?.children || []).indexOf(el);
      el.style.transitionDelay = `${Math.min(idx, 8) * 60}ms`;
    });
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.target.classList.toggle("in", e.isIntersecting)),
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [activeTab, filteredVideos.length, filteredTemplates.length, filteredGlossary.length, filteredBlogPosts.length, filteredCommunity.length]);

  const fmtClass = (fmt: string) => {
    const f = fmt.toLowerCase();
    if (f.includes("xls")) return "rs-fmt xlsx";
    if (f.includes("doc")) return "rs-fmt docx";
    return "rs-fmt";
  };

  const seoTab = TAB_SEO[activeTab] ?? TAB_SEO.videos;

  return (
    <Layout>
      <Helmet>
        <title>{seoTab.title}</title>
        <meta name="description" content={seoTab.description} />
        <link rel="canonical" href={`https://www.fynhelp.com/resources?tab=${activeTab}`} />
        <meta property="og:title" content={seoTab.title} />
        <meta property="og:description" content={seoTab.description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://www.fynhelp.com/resources?tab=${activeTab}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seoTab.title} />
        <meta name="twitter:description" content={seoTab.description} />
      </Helmet>
      <div ref={pageRef} className="rs-page">
        <style>{STYLES}</style>

        {/* HERO */}
        <section className="rs-hero">
          <div className="rs-container">
            <h1>Learn, reference, and connect.</h1>
            <p>Video guides, templates, financial glossary, blog, and community — everything an Indian SME needs to run finance like a founder.</p>

            <div className="rs-search">
              <Search size={18} className="icon" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={currentTabConfig.placeholder}
                aria-label={currentTabConfig.placeholder}
              />
            </div>

            <div className="rs-tabs" role="tablist">
              {TABS.map((t) => {
                const isActive = activeTab === t.key;
                const Icon = t.icon;
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={`rs-tab${isActive ? " active" : ""}`}
                    aria-pressed={isActive}
                    role="tab"
                  >
                    <Icon size={15} stroke={2} />
                    <span>{t.label}</span>
                    <span className="badge">{t.key === "getting-started" ? `${allVideos.length} videos` : t.badge}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* CONTENT */}
        <section className="rs-content">
          <div className="rs-container">
            {activeTab === "getting-started" && (
              filteredVideos.length === 0 ? (
                <EmptyState label="videos" />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
                  {groupedVideos.map((g) => (
                    <div key={g.step}>
                      <h2 className="rs-step-h"><span className="dot" />{g.step}</h2>
                      <div className="rs-grid">
                        {g.items.map((v) => (
                          <article key={v.id} className="rs-card" onClick={() => setVideoModal(v)} style={{ cursor: "pointer" }}>
                            <div className="rs-thumb">
                              {v.thumbnailUrl && (
                                <img src={v.thumbnailUrl} alt={`${v.title} thumbnail`} loading="lazy" className="thumb-img" />
                              )}
                              <div className="cat-icon"><v.icon size={16} stroke={1.75} /></div>
                              <div className="dur">{v.duration}</div>
                              <div className="play"><IconPlayerPlayFilled size={20} /></div>
                            </div>
                            <div className="rs-card-body">
                              <div className="rs-card-step">{v.step} · {v.category}</div>
                              <h3 className="rs-card-title">{v.title}</h3>
                              <div className="rs-card-desc">{v.description}</div>
                              <div className="rs-card-foot">
                                <span className="rs-mono"><IconClock size={13} stroke={1.75} /> {v.duration}</span>
                                <span style={{ color: C.red, fontWeight: 700, fontSize: 12.5 }}>Watch →</span>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {activeTab === "templates" && (
              filteredTemplates.length === 0 ? (
                <EmptyState label="templates" />
              ) : (
                <div className="rs-grid">
                  {filteredTemplates.map((t) => (
                    <article key={t.id} className="rs-card">
                      <div className="rs-card-body">
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                          <span className={fmtClass(t.format)}>{t.format}</span>
                          {t.downloads && <span className="rs-mono">↓ {t.downloads}</span>}
                        </div>
                        <h3 className="rs-card-title" style={{ marginTop: 12 }}>{t.title}</h3>
                        {t.description && <div className="rs-card-desc">{t.description}</div>}
                        <div className="rs-card-foot">
                          <a
                            href={t.href}
                            download
                            rel="noopener noreferrer"
                            className="rs-download"
                          >
                            <IconDownload size={14} stroke={2} /> Download
                          </a>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )
            )}

            {activeTab === "glossary" && (
              filteredGlossary.length === 0 ? (
                <EmptyState label="terms" />
              ) : (
                <div className="rs-gl-list">
                  {filteredGlossary.map((g) => (
                    <details key={g.id} className="rs-gl">
                      <summary>
                        <span className="rs-gl-term num">{g.term}</span>
                        <span className="rs-gl-short">{g.short}</span>
                        <span className="rs-gl-toggle">+</span>
                      </summary>
                      <div className="rs-gl-full">
                        {g.full}
                        <div style={{ marginTop: 14 }}>
                          <button
                            onClick={() => setGlossaryModal(g)}
                            style={{
                              background: "transparent", border: `1px solid ${C.border}`,
                              padding: "6px 14px", borderRadius: 100, color: C.red, fontWeight: 700,
                              fontFamily: "'Satoshi',sans-serif", fontSize: 12.5, cursor: "pointer",
                            }}
                          >
                            See how FynHelp uses this →
                          </button>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              )
            )}

            {activeTab === "blog" && (
              filteredBlogPosts.length === 0 ? (
                <EmptyState label="articles" />
              ) : (
                <div className="rs-grid">
                  {filteredBlogPosts.map((a: any) => (
                    <article
                      key={a.id}
                      className="rs-card rs-blog-card"
                      onClick={() => navigate(`/blog/${a.slug}`)}
                    >
                      <div className="rs-blog-cover">
                        {a.cover_image_url ? (
                          <img src={a.cover_image_url} alt={a.title} loading="lazy" />
                        ) : (
                          <div className="ph">{a.category}</div>
                        )}
                      </div>
                      <div className="rs-card-body">
                        <div className="rs-blog-meta">
                          <span className="rs-blog-pill">{a.category}</span>
                          {a.published_at && (
                            <span className="rs-blog-dot">
                              {new Date(a.published_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                            </span>
                          )}
                          {a.reading_time_minutes ? <span className="rs-blog-dot">{a.reading_time_minutes} min read</span> : null}
                        </div>
                        <h3 className="rs-blog-title" style={{ marginTop: 2 }}>{a.title}</h3>
                        <div className="rs-blog-ex">{a.excerpt}</div>
                        <span className="rs-blog-read">Read article <span className="arw">→</span></span>
                      </div>
                    </article>
                  ))}
                </div>
              )
            )}

            {activeTab === "community" && (
              filteredCommunity.length === 0 ? (
                <EmptyState label="discussions" />
              ) : (
                <div className="rs-community">
                  {filteredCommunity.map((c) => (
                    <article key={c.id} className="rs-c">
                      <div className="rs-avatar" style={{ background: c.color }}>{c.initials}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                          <span style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{c.author}</span>
                          <span className="rs-mono">{c.ago}</span>
                        </div>
                        <h3 className="rs-c-title">{c.title}</h3>
                        <p className="rs-c-preview">{c.preview}</p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {c.tags.map((tag) => <span key={tag} className="rs-tag">{tag}</span>)}
                          </div>
                          <span className="rs-mono"><IconMessageCircle2 size={13} /> {c.replies} replies</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )
            )}
          </div>
        </section>

        {/* Video modal */}
        {videoModal && (
          <div
            onClick={() => setVideoModal(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 50,
              background: "rgba(14,14,14,0.85)", backdropFilter: "blur(8px)",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: C.card, borderRadius: 18, maxWidth: 640, width: "100%",
                overflow: "hidden", border: `1px solid ${C.border}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 22px", borderBottom: `1px solid ${C.border}` }}>
                <h3 style={{ fontFamily: "'Clash Display',sans-serif", fontSize: 18 }}>{videoModal.title}</h3>
                <button onClick={() => setVideoModal(null)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted }} aria-label="Close">
                  <X size={18} />
                </button>
              </div>
              {videoModal.videoUrl && isSelfHostedVideo(videoModal.videoUrl) ? (
                <div style={{ background: "#000", aspectRatio: "16 / 9" }}>
                  <video
                    src={videoModal.videoUrl}
                    poster={videoModal.thumbnailUrl ?? undefined}
                    controls
                    autoPlay
                    playsInline
                    preload="metadata"
                    style={{ width: "100%", height: "100%", display: "block" }}
                  />
                </div>
              ) : videoModal.videoUrl ? (
                <div style={{ background: "#000", aspectRatio: "16 / 9" }}>
                  <iframe
                    src={videoModal.videoUrl}
                    title={videoModal.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                    allowFullScreen
                    style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                  />
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: "center", background: C.panel }}>
                  <div style={{ display: "inline-flex", padding: 14, borderRadius: 12, background: C.card, border: `1px solid ${C.border}`, marginBottom: 14, color: C.red }}>
                    <IconMessage size={22} stroke={1.75} />
                  </div>
                  <p style={{ fontSize: 14, color: C.body, lineHeight: 1.6, margin: 0, maxWidth: 460, marginInline: "auto" }}>
                    Our tutorial library is being recorded and will be published here. In the meantime, explore our written
                    guides and templates in the tabs above.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Glossary modal */}
        {glossaryModal && (
          <div
            onClick={() => setGlossaryModal(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 50,
              background: "rgba(14,14,14,0.7)", backdropFilter: "blur(6px)",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: C.card, borderRadius: 18, width: "100%", maxWidth: 640,
                maxHeight: "85vh", overflowY: "auto", border: `1px solid ${C.border}`, position: "relative",
              }}
            >
              <button
                onClick={() => setGlossaryModal(null)}
                aria-label="Close"
                style={{
                  position: "absolute", top: 14, right: 14, width: 32, height: 32,
                  background: C.panel, border: `1px solid ${C.border}`, borderRadius: 50,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.ink,
                }}
              >
                <X size={16} />
              </button>
              <div style={{ padding: "28px 28px 20px" }}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: C.red, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
                  Financial term
                </div>
                <h2 style={{ fontFamily: "'Clash Display',sans-serif", fontSize: 30, letterSpacing: "-0.03em", color: C.ink }}>
                  {glossaryModal.term}
                </h2>
                <p style={{ marginTop: 14, fontSize: 15, color: C.body, lineHeight: 1.7 }}>
                  {glossaryModal.full}
                </p>
              </div>
              <div style={{ padding: "20px 28px 28px", borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: "'Satoshi',sans-serif", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>
                  Related terms
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {GLOSSARY.filter((g) => g.id !== glossaryModal.id).slice(0, 5).map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setGlossaryModal(g)}
                      style={{
                        background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 100,
                        padding: "6px 12px", cursor: "pointer",
                        fontFamily: "'Satoshi',sans-serif", fontSize: 12, fontWeight: 700, color: C.ink,
                      }}
                    >
                      {g.term}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rs-empty">
      <div style={{ display: "inline-flex", padding: 16, borderRadius: 14, background: C.card, border: `1px solid ${C.border}`, marginBottom: 14, color: C.red }}>
        <Search size={26} />
      </div>
      <h3>No {label} found</h3>
      <p style={{ fontSize: 14 }}>Try different keywords or switch tabs.</p>
    </div>
  );
}

export default ResourcesPage;
