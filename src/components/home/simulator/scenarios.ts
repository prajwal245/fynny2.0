import { formatINR } from "@/lib/indian-format";

export type Tone = "good" | "warn" | "bad" | "neutral";

export interface SliderInput {
  kind: "slider";
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  format?: (v: number) => string;
  suffix?: string;
}

export interface SelectInput {
  kind: "select";
  key: string;
  label: string;
  options: { value: string; label: string; meta?: Record<string, number> }[];
  default: string;
}

export interface DisplayInput {
  kind: "display";
  key: string;
  label: string;
  value: string;
}

export type Input = SliderInput | SelectInput | DisplayInput;

export interface MetricResult {
  label: string;
  value: string;
  tone: Tone;
}

export interface RecResult {
  label: "A" | "B" | "C";
  teaser: string;
  detail: string;
}

export interface ScenarioResult {
  metrics: MetricResult[];
  recs: RecResult[];
}

export interface Scenario {
  id: string;
  name: string;
  question: string;
  inputs: Input[];
  compute: (state: Record<string, number | string>) => ScenarioResult;
}

const inr = (n: number) => formatINR(Math.round(n));
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const num = (s: Record<string, number | string>, k: string): number =>
  typeof s[k] === "number" ? (s[k] as number) : Number(s[k]) || 0;
const str = (s: Record<string, number | string>, k: string): string =>
  typeof s[k] === "string" ? (s[k] as string) : String(s[k] ?? "");

// Baseline business assumptions used as displays (fixed for the demo)
const BASE_RUNWAY = 52;
const DAILY_BURN = 240000 / 30; // ₹2.4L burn / month
const CASH_RESERVE = 1240000;
const MONTHLY_BURN = 240000;

export const SCENARIOS: Scenario[] = [
  /* ---------------- 1. Credit Terms ---------------- */
  {
    id: "credit",
    name: "Credit Terms",
    question: "What happens if I extend credit terms?",
    inputs: [
      { kind: "slider", key: "current", label: "Current credit days", min: 0, max: 90, step: 1, default: 30, suffix: " days" },
      { kind: "slider", key: "new", label: "New credit days", min: 30, max: 180, step: 1, default: 60, suffix: " days" },
      { kind: "slider", key: "revenue", label: "Monthly revenue from customer", min: 100000, max: 10000000, step: 100000, default: 2500000, format: inr },
      { kind: "display", key: "runway", label: "Current runway", value: `${BASE_RUNWAY} days` },
    ],
    compute: (s) => {
      const cur = num(s, "current"), nw = num(s, "new"), rev = num(s, "revenue");
      const gap = ((nw - cur) / 30) * rev;
      const runwayDelta = Math.round(gap / DAILY_BURN);
      const newRunway = Math.max(0, BASE_RUNWAY - runwayDelta);
      const bridging = Math.max(0, gap * 0.73);
      const risk: Tone = newRunway > 60 ? "good" : newRunway > 30 ? "warn" : "bad";
      const riskLabel = risk === "good" ? "LOW" : risk === "warn" ? "MEDIUM" : "HIGH";
      return {
        metrics: [
          { label: "Cash Gap Created", value: gap > 0 ? `−${inr(gap)}` : inr(Math.abs(gap)), tone: gap > 0 ? "bad" : "good" },
          { label: "New Runway", value: `${newRunway} days`, tone: risk },
          { label: "Bridging Needed", value: inr(bridging), tone: bridging > 0 ? "warn" : "good" },
          { label: "Risk Level", value: riskLabel, tone: risk },
        ],
        recs: [
          { label: "A", teaser: `Accept ${nw} days + arrange invoice discounting`, detail: `Financing cost: −${inr(bridging * 0.018)}/month at 1.8% per month` },
          { label: "B", teaser: `Counter-propose ${Math.round((cur + nw) / 2)} days with 2% early payment discount`, detail: `Reduces cash gap by 50%: only ${inr(gap / 2)} exposure` },
          { label: "C", teaser: `Maintain current ${cur}-day terms`, detail: `Zero cash impact, but customer relationship risk` },
        ],
      };
    },
  },

  /* ---------------- 2. Hiring ---------------- */
  {
    id: "hiring",
    name: "Hiring",
    question: "What happens if I make this hire?",
    inputs: [
      {
        kind: "select", key: "role", label: "New hire role", default: "senior_eng",
        options: [
          { value: "senior_eng", label: "Senior Engineer", meta: { salary: 120000 } },
          { value: "manager", label: "Manager", meta: { salary: 180000 } },
          { value: "sales", label: "Sales Rep", meta: { salary: 65000 } },
          { value: "junior_eng", label: "Junior Engineer", meta: { salary: 55000 } },
        ],
      },
      { kind: "slider", key: "salary", label: "Monthly salary", min: 30000, max: 500000, step: 5000, default: 120000, format: inr },
      { kind: "slider", key: "revenueImpact", label: "Expected monthly revenue impact", min: 0, max: 1000000, step: 25000, default: 0, format: inr },
      { kind: "slider", key: "onboarding", label: "Onboarding cost", min: 0, max: 500000, step: 10000, default: 50000, format: inr },
    ],
    compute: (s) => {
      const sal = num(s, "salary"), rev = num(s, "revenueImpact"), onb = num(s, "onboarding");
      const monthlyImpact = sal - rev;
      const runwayDelta = Math.round((monthlyImpact / 30) / DAILY_BURN * 30); // approx days lost
      const newRunway = BASE_RUNWAY - Math.max(0, runwayDelta);
      const breakEven = rev > 0 ? Math.ceil((sal * 12 + onb) / rev) : 999;
      const year1 = sal * 12 + onb;
      const tone: Tone = monthlyImpact > 80000 ? "bad" : monthlyImpact > 0 ? "warn" : "good";
      return {
        metrics: [
          { label: "Monthly Cash Impact", value: monthlyImpact >= 0 ? `−${inr(monthlyImpact)}` : `+${inr(Math.abs(monthlyImpact))}`, tone },
          { label: "Runway Impact", value: `${newRunway} days (Δ${runwayDelta})`, tone },
          { label: "Break-even Period", value: breakEven < 999 ? `${breakEven} months` : "-", tone: breakEven < 12 ? "good" : breakEven < 24 ? "warn" : "bad" },
          { label: "Total Year 1 Cost", value: inr(year1), tone: "warn" },
        ],
        recs: [
          { label: "A", teaser: "Hire now with 3-month probation", detail: `Cash buffer needed: ${inr(monthlyImpact * 4)} for safe runway` },
          { label: "B", teaser: "Delay hiring until Q3 when runway reaches 90 days", detail: `Saves: ${inr(sal * 3 + onb)} in short-term commitment` },
          { label: "C", teaser: "Hire contractor instead", detail: `Cost difference: −${inr(sal * 0.33)}/month, no PF/gratuity exposure` },
        ],
      };
    },
  },

  /* ---------------- 3. Pricing ---------------- */
  {
    id: "pricing",
    name: "Pricing",
    question: "What happens if I change pricing?",
    inputs: [
      { kind: "slider", key: "oldPrice", label: "Current price per unit", min: 1000, max: 50000, step: 100, default: 5000, format: inr },
      { kind: "slider", key: "newPrice", label: "New price per unit", min: 1000, max: 50000, step: 100, default: 5500, format: inr },
      { kind: "slider", key: "units", label: "Current monthly units sold", min: 10, max: 10000, step: 10, default: 500, suffix: " units" },
      { kind: "slider", key: "volChange", label: "Expected volume change", min: -50, max: 50, step: 1, default: -10, suffix: "%" },
      { kind: "slider", key: "margin", label: "Current gross margin", min: 10, max: 80, step: 1, default: 40, suffix: "%" },
    ],
    compute: (s) => {
      const op = num(s, "oldPrice"), np = num(s, "newPrice"), u = num(s, "units"), vc = num(s, "volChange"), m = num(s, "margin") / 100;
      const oldRev = op * u;
      const newUnits = u * (1 + vc / 100);
      const newRev = np * newUnits;
      const oldMargin = oldRev * m;
      const newMargin = newRev * (m + (np - op) / np); // price increase mostly drops to margin
      const marginImpact = newMargin - oldMargin;
      const breakEven = Math.ceil((oldRev * m) / (np * (m + (np - op) / np)));
      const lossRisk: Tone = vc < -20 ? "bad" : vc < -5 ? "warn" : "good";
      const lossLabel = lossRisk === "bad" ? "HIGH" : lossRisk === "warn" ? "MEDIUM" : "LOW";
      return {
        metrics: [
          { label: "New Monthly Revenue", value: inr(newRev), tone: newRev >= oldRev ? "good" : "warn" },
          { label: "Margin Impact", value: `${marginImpact >= 0 ? "+" : "−"}${inr(Math.abs(marginImpact))}/mo`, tone: marginImpact >= 0 ? "good" : "bad" },
          { label: "Break-even Volume", value: `${breakEven} units`, tone: breakEven <= u ? "good" : "warn" },
          { label: "Customer Loss Risk", value: lossLabel, tone: lossRisk },
        ],
        recs: [
          { label: "A", teaser: "Implement tiered pricing (Small/Medium/Enterprise)", detail: "Retains 95% of customers, lifts ARPU by 12%" },
          { label: "B", teaser: "Grandfather existing customers at old price for 6 months", detail: `Revenue impact: −${inr(oldRev * 0.05)} short term, +${inr(newRev * 0.15)} long term` },
          { label: "C", teaser: "Bundle with premium support to justify increase", detail: "Conversion rate: 68% on bundle upsell" },
        ],
      };
    },
  },

  /* ---------------- 4. GST Refund Delay ---------------- */
  {
    id: "gst",
    name: "GST Refund Delay",
    question: "What if my GST refund is delayed?",
    inputs: [
      { kind: "slider", key: "refund", label: "Expected refund amount", min: 100000, max: 10000000, step: 50000, default: 1800000, format: inr },
      { kind: "slider", key: "delay", label: "Expected delay", min: 0, max: 365, step: 5, default: 90, suffix: " days" },
      { kind: "display", key: "burn", label: "Current burn rate", value: `${inr(MONTHLY_BURN)}/mo` },
      { kind: "display", key: "cash", label: "Current cash reserve", value: inr(CASH_RESERVE) },
    ],
    compute: (s) => {
      const refund = num(s, "refund"), delay = num(s, "delay");
      const monthsWithout = CASH_RESERVE / MONTHLY_BURN;
      const monthsWith = (CASH_RESERVE + refund) / MONTHLY_BURN;
      const today = new Date();
      const crunch = new Date(today.getTime() + monthsWithout * 30 * 86400000);
      const crunchStr = crunch.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      const bridge = Math.max(0, (delay / 30) * MONTHLY_BURN - CASH_RESERVE * 0.3);
      const interest = bridge * 0.12 * (delay / 365);
      return {
        metrics: [
          { label: "Runway Without Refund", value: `${monthsWithout.toFixed(1)} months`, tone: monthsWithout > 6 ? "good" : monthsWithout > 3 ? "warn" : "bad" },
          { label: "Cash Crunch Date", value: crunchStr, tone: monthsWithout < 4 ? "bad" : "warn" },
          { label: "Bridge Financing Needed", value: inr(bridge), tone: bridge > 0 ? "bad" : "good" },
          { label: "Interest Cost (12% p.a.)", value: inr(interest), tone: "warn" },
        ],
        recs: [
          { label: "A", teaser: "Apply for GST refund advance loan at 11.5% p.a.", detail: `Total interest: ${inr(bridge * 0.115 * (delay / 365))}, refund auto-deducted` },
          { label: "B", teaser: "Negotiate 45-day payment extension with top 3 vendors", detail: `Saves: ${inr(MONTHLY_BURN * 0.4 * 1.5)} in immediate cash` },
          { label: "C", teaser: "Delay non-critical expenses, accelerate collections", detail: `Extends runway by ~${(monthsWith - monthsWithout).toFixed(1)} months` },
        ],
      };
    },
  },

  /* ---------------- 5. Machinery Purchase ---------------- */
  {
    id: "machinery",
    name: "Machinery Purchase",
    question: "Should I buy this machinery?",
    inputs: [
      { kind: "slider", key: "cost", label: "Machine cost", min: 500000, max: 10000000, step: 50000, default: 2500000, format: inr },
      { kind: "slider", key: "down", label: "Down payment", min: 0, max: 100, step: 5, default: 30, suffix: "%" },
      { kind: "slider", key: "tenure", label: "Loan tenure", min: 12, max: 84, step: 6, default: 36, suffix: " months" },
      { kind: "slider", key: "rate", label: "Interest rate", min: 8, max: 18, step: 0.25, default: 10.5, suffix: "%" },
      { kind: "slider", key: "revImpact", label: "Expected monthly revenue increase", min: 0, max: 5000000, step: 50000, default: 400000, format: inr },
    ],
    compute: (s) => {
      const cost = num(s, "cost"), down = num(s, "down") / 100, tenure = num(s, "tenure"), rate = num(s, "rate") / 100 / 12, rev = num(s, "revImpact");
      const principal = cost * (1 - down);
      const emi = rate > 0 ? (principal * rate * Math.pow(1 + rate, tenure)) / (Math.pow(1 + rate, tenure) - 1) : principal / tenure;
      const payback = rev > 0 ? Math.ceil(cost / rev) : 999;
      const downPay = cost * down;
      const year1Net = -downPay - emi * 12 + rev * 12;
      const totalCost = downPay + emi * tenure;
      const roi = ((rev * 12 - emi * 12) / cost) * 100;
      return {
        metrics: [
          { label: "Monthly EMI", value: inr(emi), tone: "bad" },
          { label: "Payback Period", value: payback < 999 ? `${payback} months` : "-", tone: payback < 18 ? "good" : payback < 36 ? "warn" : "bad" },
          { label: "Net Cash Year 1", value: `${year1Net >= 0 ? "+" : "−"}${inr(Math.abs(year1Net))}`, tone: year1Net >= 0 ? "good" : "warn" },
          { label: "ROI (annualised)", value: fmtPct(roi), tone: roi > 25 ? "good" : roi > 10 ? "warn" : "bad" },
        ],
        recs: [
          { label: "A", teaser: "Lease instead of buy for 24 months", detail: `Cash preserved: ${inr(cost * 0.7)}, total lease ${inr(cost * 0.55)}` },
          { label: "B", teaser: "Finance 80% via vendor at 9.2% (lower rate)", detail: `Saves: ${inr(emi * 0.04 * tenure)} over loan tenure` },
          { label: "C", teaser: "Delay purchase until Q3 when cash reserve hits ₹18L", detail: "Maintains runway safety margin above 60 days" },
        ],
      };
    },
  },

  /* ---------------- 6. Working Capital Loan ---------------- */
  {
    id: "wcl",
    name: "Working Capital Loan",
    question: "Should I take this loan?",
    inputs: [
      { kind: "slider", key: "amount", label: "Loan amount", min: 200000, max: 7500000, step: 50000, default: 1500000, format: inr },
      { kind: "slider", key: "rate", label: "Interest rate", min: 9, max: 20, step: 0.25, default: 12, suffix: "%" },
      { kind: "slider", key: "tenure", label: "Tenure", min: 6, max: 48, step: 3, default: 18, suffix: " months" },
      {
        kind: "select", key: "purpose", label: "Purpose", default: "inventory",
        options: [
          { value: "inventory", label: "Inventory" },
          { value: "expansion", label: "Expansion" },
          { value: "vendor", label: "Vendor Payment" },
          { value: "bridge", label: "Bridge" },
        ],
      },
    ],
    compute: (s) => {
      const amt = num(s, "amount"), r = num(s, "rate") / 100 / 12, n = num(s, "tenure");
      const emi = r > 0 ? (amt * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : amt / n;
      const totalInterest = emi * n - amt;
      const runwayExt = (amt / MONTHLY_BURN);
      const apr = num(s, "rate") * 1.1;
      return {
        metrics: [
          { label: "Monthly EMI", value: inr(emi), tone: "bad" },
          { label: "Total Interest", value: inr(totalInterest), tone: "warn" },
          { label: "Runway Extension", value: `+${runwayExt.toFixed(1)} months`, tone: "good" },
          { label: "Effective APR", value: fmtPct(apr), tone: apr < 13 ? "good" : "warn" },
        ],
        recs: [
          { label: "A", teaser: "Use invoice discounting instead (1.8%/mo vs 12% p.a.)", detail: `Saves: ${inr(totalInterest * 0.05)} in interest costs` },
          { label: "B", teaser: "Apply for ECLGS loan (lower rate: 7.5% p.a.)", detail: `Saves: ${inr(amt * (num(s, "rate") - 7.5) / 100 * (n / 12))} total` },
          { label: "C", teaser: "Negotiate 60-day vendor terms instead", detail: `Avoids loan entirely, saves: ${inr(totalInterest)}` },
        ],
      };
    },
  },

  /* ---------------- 7. Seasonal Push ---------------- */
  {
    id: "seasonal",
    name: "Seasonal Push",
    question: "Should I run this seasonal campaign?",
    inputs: [
      { kind: "slider", key: "budget", label: "Campaign budget", min: 50000, max: 2500000, step: 25000, default: 600000, format: inr },
      { kind: "slider", key: "boost", label: "Expected revenue boost", min: 10, max: 300, step: 5, default: 80, suffix: "%" },
      { kind: "slider", key: "duration", label: "Campaign duration", min: 1, max: 6, step: 1, default: 2, suffix: " months" },
      { kind: "display", key: "rev", label: "Current monthly revenue", value: inr(2500000) },
      { kind: "slider", key: "conv", label: "Conversion rate", min: 1, max: 12, step: 0.5, default: 4, suffix: "%" },
    ],
    compute: (s) => {
      const budget = num(s, "budget"), boost = num(s, "boost") / 100, dur = num(s, "duration"), conv = num(s, "conv") / 100;
      const baseRev = 2500000;
      const projRev = baseRev * (1 + boost) * (conv / 0.04); // conv influences realised boost
      const totalGain = (projRev - baseRev) * dur;
      const roi = ((totalGain - budget) / budget) * 100;
      return {
        metrics: [
          { label: "Projected Revenue", value: `${inr(projRev)}/mo`, tone: projRev > baseRev ? "good" : "warn" },
          { label: "Campaign ROI", value: fmtPct(roi), tone: roi > 100 ? "good" : roi > 0 ? "warn" : "bad" },
          { label: "Cash Required Upfront", value: inr(budget), tone: "warn" },
          { label: "Net Gain Over Campaign", value: `${totalGain - budget >= 0 ? "+" : "−"}${inr(Math.abs(totalGain - budget))}`, tone: totalGain > budget ? "good" : "bad" },
        ],
        recs: [
          { label: "A", teaser: `Stagger campaign spend across ${dur + 1} months`, detail: `Reduces initial cash hit by: ${inr(budget * 0.66)}` },
          { label: "B", teaser: "Use performance marketing (pay on conversion)", detail: `Upfront cost: ${inr(budget * 0.2)} vs ${inr(budget)}` },
          { label: "C", teaser: "Partner with micro-influencer", detail: `${inr(budget * 0.13)} upfront, expected reach ~85% of full campaign` },
        ],
      };
    },
  },

  /* ---------------- 8. M&A ---------------- */
  {
    id: "ma",
    name: "M&A",
    question: "Should I make this acquisition?",
    inputs: [
      { kind: "slider", key: "cost", label: "Acquisition cost", min: 2500000, max: 100000000, step: 500000, default: 15000000, format: inr },
      {
        kind: "select", key: "method", label: "Financing method", default: "cash100",
        options: [
          { value: "cash100", label: "100% Cash" },
          { value: "loan60", label: "60% Loan" },
          { value: "equity", label: "Equity Mix" },
          { value: "earnout", label: "Earnout" },
        ],
      },
      { kind: "slider", key: "targetRev", label: "Target annual revenue", min: 5000000, max: 500000000, step: 1000000, default: 80000000, format: inr },
      { kind: "slider", key: "integration", label: "Integration cost", min: 200000, max: 10000000, step: 100000, default: 1200000, format: inr },
      { kind: "slider", key: "synergy", label: "Expected synergy savings", min: 0, max: 50, step: 1, default: 15, suffix: "%" },
    ],
    compute: (s) => {
      const cost = num(s, "cost"), method = str(s, "method"), targetRev = num(s, "targetRev"), integ = num(s, "integration"), syn = num(s, "synergy") / 100;
      const monthlyRevAdd = targetRev / 12;
      const synergyMonthly = monthlyRevAdd * syn;
      const upfrontMap: Record<string, number> = {
        cash100: cost + integ,
        loan60: cost * 0.4 + integ,
        equity: cost * 0.3 + integ,
        earnout: cost * 0.4 + integ,
      };
      const upfront = upfrontMap[method] ?? cost + integ;
      const breakEven = Math.ceil((cost + integ) / (monthlyRevAdd * 0.15 + synergyMonthly));
      const dilution = method === "equity" ? 22 : 0;
      return {
        metrics: [
          { label: "Immediate Cash Outflow", value: inr(upfront), tone: "bad" },
          { label: "Monthly Revenue Addition", value: inr(monthlyRevAdd), tone: "good" },
          { label: "Break-even Period", value: `${breakEven} months`, tone: breakEven < 24 ? "good" : breakEven < 48 ? "warn" : "bad" },
          { label: "Dilution", value: dilution > 0 ? `${dilution}%` : "0%", tone: dilution > 20 ? "warn" : "good" },
        ],
        recs: [
          { label: "A", teaser: "Finance 70% via debt (preserves cash)", detail: `Monthly EMI: ${inr((cost * 0.7) * 0.012)}, preserves ${inr(cost * 0.7)} cash` },
          { label: "B", teaser: "Earnout structure (40% now, 60% over 3 years on performance)", detail: `Reduces risk: only ${inr(cost * 0.4)} upfront commitment` },
          { label: "C", teaser: "Delay until cash reserve reaches ₹2.5Cr", detail: "Safe acquisition threshold maintains 90+ days runway" },
        ],
      };
    },
  },
];
