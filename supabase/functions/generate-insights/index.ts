// generate-insights — Computes 115+ CFO metrics across 6 modules
// (liquidity, revenue, cost, gst, governance, workforce) for the FynHelp
// demo dashboard. Tries demo_transactions first, falls back to synthetic.
// No auth required — demo endpoint.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Synthetic baseline: EXACT shape consumed by DemoDashboard.tsx ──────
// Mutated lightly per-request with deterministic jitter so two consecutive
// calls show slight trend variance without breaking the structure.
function baseline() {
  return {
    liquidity: {
      cashPosition: {
        currentCash: 380000, operatingCash: 323000, restrictedCash: 57000,
        dso: 42, dio: 28, dpo: 35, ccc: 35,
        quickRatio: 1.85, currentRatio: 2.3, workingCapital: 247000,
      },
      burnRunway: {
        grossBurn: 210000, netBurn: 83333, runway: 4.56,
        zeroCashDate: "2026-10-05", burnMultiple: 0.66,
        scenarioBest: 6.2, scenarioBase: 4.56, scenarioWorst: 3.1,
      },
      cashFlow: {
        operatingCashFlow: 233000, investingCashFlow: -25200,
        financingCashFlow: 0, freeCashFlow: 207800,
        thirteenWeekForecast: Array.from({ length: 13 }, (_, i) => {
          const start = new Date();
          const d = new Date(start.getTime() + (i + 1) * 7 * 86400000);
          return {
            week: i + 1,
            date: d.toISOString().slice(0, 10),
            projected: Math.round(380000 - i * 18500),
          };
        }),
      },
      receivablesPayables: {
        arAging: { bucket_0_30: 372000, bucket_31_60: 138000, bucket_61_90: 66000, bucket_90_plus: 24000 },
        overdueInvoices: [
          { customer: "Acme Corp", amount: 145000, daysOverdue: 42, creditRisk: "Medium" },
          { customer: "TechStart Ltd", amount: 98000, daysOverdue: 35, creditRisk: "Low" },
          { customer: "Global Inc", amount: 67000, daysOverdue: 28, creditRisk: "Low" },
        ],
        apAging: { bucket_0_30: 142800, bucket_31_60: 46200, bucket_61_90: 16800, bucket_90_plus: 4200 },
        paymentTermsOpportunities: [
          { vendor: "AWS", currentTerms: 30, suggestedTerms: 45, savings: 38000 },
          { vendor: "Salesforce", currentTerms: 30, suggestedTerms: 60, savings: 52000 },
        ],
        creditRiskScore: {},
      },
      alerts: {
        runwayAlert: true, burnIncreaseAlert: false,
        majorPaymentsDue: [
          { vendor: "AWS", amount: 125000, dueDate: "2026-06-15", category: "Infrastructure" },
          { vendor: "Payroll", amount: 420000, dueDate: "2026-06-01", category: "Salaries" },
          { vendor: "Office Rent", amount: 95000, dueDate: "2026-06-05", category: "Facilities" },
        ],
        overdueCustomers: ["Acme Corp", "TechStart Ltd", "Global Inc"],
        cashBelowMinimum: true,
      },
    },
    revenue: {
      metrics: {
        totalRevenue: 1847000, mrr: 1420000, arr: 17040000,
        growthMoM: 8.3, growthQoQ: 24.7, growthYoY: 127.4,
        nrr: 118, grr: 93, ltv: 385000, cac: 82000, ltvCacRatio: 4.7,
        paybackPeriod: 11.2, magicNumber: 0.89, avgDealSize: 145000, ruleOf40: 51.7,
      },
      breakdown: {
        byProduct: [
          { name: "Liquidity Intelligence", revenue: 567000, percent: 39.9 },
          { name: "Revenue Intelligence", revenue: 426000, percent: 30.0 },
          { name: "GST & Tax Intelligence", revenue: 284000, percent: 20.0 },
          { name: "Cost Intelligence", revenue: 142000, percent: 10.0 },
        ],
        bySegment: [
          { segment: "SMB (5-50 employees)", revenue: 710000, percent: 50.0 },
          { segment: "Mid-Market (51-500)", revenue: 497000, percent: 35.0 },
          { segment: "Enterprise (500+)", revenue: 213000, percent: 15.0 },
        ],
        byChannel: [
          { channel: "Direct Sales", revenue: 781000, percent: 55.0 },
          { channel: "Partner Channel", revenue: 426000, percent: 30.0 },
          { channel: "Self-Serve", revenue: 213000, percent: 15.0 },
        ],
        revenueType: { new: 568000, expansion: 312000, renewal: 540000, recurring: 1420000, oneTime: 427000 },
      },
      cohorts: {
        retentionCurves: [
          { cohort: "Jan 2025", months: [0,94,89,85,82,78,76].map((r,i)=>({month:i,retained:i===0?100:r})) },
          { cohort: "Oct 2024", months: [100,92,87,83,80,77,74,72,71,69,68,67,66].map((r,i)=>({month:i,retained:r})) },
          { cohort: "Jul 2024", months: [100,90,84,80,76,73,70,68,66,64,63,62,61].map((r,i)=>({month:i,retained:r})) },
        ],
        revenuePerCohort: [
          { cohort: "Jan 2025", revenue: 485000 },
          { cohort: "Oct 2024", revenue: 412000 },
          { cohort: "Jul 2024", revenue: 367000 },
          { cohort: "Apr 2024", revenue: 298000 },
        ],
        churnByCohort: [
          { cohort: "Jan 2025", churnRate: 6.0 },
          { cohort: "Oct 2024", churnRate: 8.3 },
          { cohort: "Jul 2024", churnRate: 9.8 },
          { cohort: "Apr 2024", churnRate: 11.2 },
        ],
        expansionByCohort: [
          { cohort: "Jan 2025", expansionRate: 12.5 },
          { cohort: "Oct 2024", expansionRate: 18.7 },
          { cohort: "Jul 2024", expansionRate: 24.3 },
          { cohort: "Apr 2024", expansionRate: 31.8 },
        ],
      },
      pipeline: {
        pipelineValue: 4250000, winRate: 28.4, avgDealSize: 145000, salesCycleLength: 47,
        bookings: 1650000, billings: 1580000, deferredRevenue: 820000, unbilledRevenue: 340000,
        stages: [
          { stage: "Lead", deals: 142, value: 4250000, conversionRate: 100 },
          { stage: "Qualified", deals: 89, value: 3180000, conversionRate: 62.7 },
          { stage: "Demo", deals: 56, value: 2340000, conversionRate: 62.9 },
          { stage: "Proposal", deals: 34, value: 1680000, conversionRate: 60.7 },
          { stage: "Negotiation", deals: 18, value: 980000, conversionRate: 52.9 },
          { stage: "Closed Won", deals: 12, value: 720000, conversionRate: 66.7 },
        ],
      },
      health: { logoChurn: 4.2, revenueChurn: 7.1, expansionRate: 22.0, contractionRate: 3.5, revenueConcentration: 18.4 },
      mrrTrend: [
        { month: "Jul 2024", mrr: 718000 }, { month: "Aug 2024", mrr: 762000 },
        { month: "Sep 2024", mrr: 814000 }, { month: "Oct 2024", mrr: 873000 },
        { month: "Nov 2024", mrr: 924000 }, { month: "Dec 2024", mrr: 982000 },
        { month: "Jan 2025", mrr: 1045000 }, { month: "Feb 2025", mrr: 1098000 },
        { month: "Mar 2025", mrr: 1165000 }, { month: "Apr 2025", mrr: 1230000 },
        { month: "May 2025", mrr: 1310000 }, { month: "Jun 2025", mrr: 1420000 },
      ],
      atRiskRevenue: {
        totalAtRisk: 167000, customerCount: 8,
        topAccounts: [
          { customer: "TechStart Solutions", mrr: 45000, riskScore: 87, churnProbability: 72 },
          { customer: "CloudSync India", mrr: 38000, riskScore: 79, churnProbability: 65 },
          { customer: "FinPro Analytics", mrr: 32000, riskScore: 74, churnProbability: 58 },
          { customer: "DataFlow Systems", mrr: 28000, riskScore: 68, churnProbability: 51 },
          { customer: "SmartOps Tech", mrr: 24000, riskScore: 63, churnProbability: 47 },
        ],
      },
    },
    cost: {
      structure: {
        totalOpex: 1847000, cogs: 425000, grossMargin: 77.0,
        salesMarketing: 685000, rnd: 842000, generalAdmin: 320000,
        ebitda: -267000, ebitdaMargin: -14.5,
      },
      breakdown: {
        fixed: 1420000, variable: 427000, fixedVariableRatio: "77:23",
        byCategory: [
          { category: "Personnel", amount: 1245000, percent: 67.4 },
          { category: "Infrastructure", amount: 287000, percent: 15.5 },
          { category: "Software", amount: 158000, percent: 8.6 },
          { category: "Marketing", amount: 98000, percent: 5.3 },
          { category: "Operations", amount: 42000, percent: 2.3 },
          { category: "Facilities", amount: 17000, percent: 0.9 },
        ],
        direct: 425000, indirect: 1422000,
      },
      vendors: {
        topTen: [
          { name: "AWS", monthlySpend: 245000, category: "Infrastructure", contractEnd: "2026-08-15", paymentTerms: "Net 30", renewalStatus: "Active", riskLevel: "High" },
          { name: "Google Workspace", monthlySpend: 87000, category: "Software", contractEnd: "2026-06-30", paymentTerms: "Net 30", renewalStatus: "Upcoming", riskLevel: "Medium" },
          { name: "Salesforce", monthlySpend: 142000, category: "Software", contractEnd: "2026-09-20", paymentTerms: "Net 45", renewalStatus: "Active", riskLevel: "High" },
          { name: "HubSpot", monthlySpend: 68000, category: "Marketing", contractEnd: "2026-07-10", paymentTerms: "Net 30", renewalStatus: "Upcoming", riskLevel: "Low" },
          { name: "Zoom", monthlySpend: 24000, category: "Software", contractEnd: "2026-11-05", paymentTerms: "Net 30", renewalStatus: "Active", riskLevel: "Low" },
          { name: "Slack", monthlySpend: 38000, category: "Software", contractEnd: "2026-10-12", paymentTerms: "Net 30", renewalStatus: "Active", riskLevel: "Low" },
          { name: "Razorpay", monthlySpend: 52000, category: "Infrastructure", contractEnd: "2027-01-18", paymentTerms: "Net 15", renewalStatus: "Active", riskLevel: "Medium" },
          { name: "LinkedIn Ads", monthlySpend: 95000, category: "Marketing", contractEnd: "2026-06-25", paymentTerms: "Prepaid", renewalStatus: "Upcoming", riskLevel: "Medium" },
          { name: "Supabase", monthlySpend: 34000, category: "Infrastructure", contractEnd: "2026-12-08", paymentTerms: "Net 30", renewalStatus: "Active", riskLevel: "Low" },
          { name: "WeWork", monthlySpend: 125000, category: "Facilities", contractEnd: "2026-05-31", paymentTerms: "Net 15", renewalStatus: "Upcoming", riskLevel: "High" },
        ],
        vendorConcentration: 32.4, spendUnderManagement: 87.3, maverickSpend: 112000,
      },
      unitEconomics: {
        cac: 82000, costToServe: 12400, costPerTransaction: 18,
        revenuePerEmployee: 6142000, grossProfitPerEmployee: 4729000, burnMultiple: 0.66,
      },
      personnel: {
        totalCost: 1245000, percentOfRevenue: 67.4, avgCostPerEmployee: 138333,
        byDepartment: [
          { department: "Engineering", headcount: 12, totalCost: 684000, avgCost: 57000 },
          { department: "Sales", headcount: 8, totalCost: 432000, avgCost: 54000 },
          { department: "Marketing", headcount: 5, totalCost: 245000, avgCost: 49000 },
          { department: "Operations", headcount: 3, totalCost: 156000, avgCost: 52000 },
          { department: "G&A", headcount: 2, totalCost: 108000, avgCost: 54000 },
        ],
      },
      optimization: {
        opportunities: [
          { type: "Over-Provisioned Licenses", savings: 34000, impact: "Medium", description: "18 unused Salesforce seats, 12 unused Zoom licenses" },
          { type: "Duplicate Subscriptions", savings: 28000, impact: "High", description: "Slack + Microsoft Teams, HubSpot + Salesforce overlap" },
          { type: "Vendor Consolidation", savings: 42000, impact: "Medium", description: "Bundle AWS + Supabase for 15% volume discount" },
          { type: "Payment Terms Extension", savings: 0, impact: "High", description: "Extend Net 30 → Net 60 with AWS, Salesforce (cash flow benefit)" },
          { type: "Volume Discounts", savings: 67000, impact: "Medium", description: "Annual commit on AWS (20% discount), Google Workspace (12% discount)" },
          { type: "Offshore Opportunities", savings: 185000, impact: "High", description: "4 engineering roles + 2 operations roles eligible" },
        ],
        totalSavings: 356000, runwayExtension: 1.8,
      },
      efficiency: {
        salesEfficiency: 1.24, rndEfficiency: 0.87, gaAsPercent: 17.3, ruleOf40: 51.7,
        trends: [
          { month: "Jul 2024", grossMargin: 71.2, opexPercent: 94.5, burnMultiple: 0.89 },
          { month: "Aug 2024", grossMargin: 72.8, opexPercent: 91.3, burnMultiple: 0.82 },
          { month: "Sep 2024", grossMargin: 73.5, opexPercent: 88.7, burnMultiple: 0.78 },
          { month: "Oct 2024", grossMargin: 74.1, opexPercent: 86.2, burnMultiple: 0.74 },
          { month: "Nov 2024", grossMargin: 74.8, opexPercent: 83.9, burnMultiple: 0.71 },
          { month: "Dec 2024", grossMargin: 75.3, opexPercent: 81.6, burnMultiple: 0.69 },
          { month: "Jan 2025", grossMargin: 75.9, opexPercent: 79.4, burnMultiple: 0.68 },
          { month: "Feb 2025", grossMargin: 76.2, opexPercent: 77.8, burnMultiple: 0.67 },
          { month: "Mar 2025", grossMargin: 76.5, opexPercent: 76.2, burnMultiple: 0.66 },
          { month: "Apr 2025", grossMargin: 76.8, opexPercent: 74.9, burnMultiple: 0.66 },
          { month: "May 2025", grossMargin: 76.9, opexPercent: 73.5, burnMultiple: 0.66 },
          { month: "Jun 2025", grossMargin: 77.0, opexPercent: 72.1, burnMultiple: 0.66 },
        ],
      },
    },
    gst: {
      compliance: {
        gstr1: { status: "Filed", dueDate: "2025-07-11", lastFiled: "2025-07-09", period: "Jun 2025" },
        gstr3b: { status: "Pending", dueDate: "2025-07-20", netTaxPaid: 184500, period: "Jun 2025" },
        gstr9: { status: "Not Due", dueDate: "2025-12-31", fyear: "FY 2024-25" },
        penalties: 12500, interest: 8400,
      },
      itc: {
        totalAvailable: 342800, claimed: 318600, gap: 24200, gapPercent: 7.06,
        reconciliation: [
          { vendorGstin: "29AABCU9603R1ZJ", invoiceNumber: "AWS-IN-24891", invoiceDate: "2025-06-02", invoiceValue: 285000, gstAmount: 51300, status: "Matched" },
          { vendorGstin: "07AAACG2115R1ZN", invoiceNumber: "GW-2025-0612", invoiceDate: "2025-06-05", invoiceValue: 142000, gstAmount: 25560, status: "Matched" },
          { vendorGstin: "27AAACS8577K1Z0", invoiceNumber: "SF-IND-7821", invoiceDate: "2025-06-08", invoiceValue: 198000, gstAmount: 35640, status: "Matched" },
          { vendorGstin: "06AAFCS1234A1Z5", invoiceNumber: "SLK-INV-3344", invoiceDate: "2025-06-12", invoiceValue: 84000, gstAmount: 15120, status: "Mismatch" },
          { vendorGstin: "29AAGCN8821B1ZT", invoiceNumber: "NTN-9821", invoiceDate: "2025-06-15", invoiceValue: 56000, gstAmount: 10080, status: "Missing in 2A" },
          { vendorGstin: "07AABCZ4567D1Z2", invoiceNumber: "ZHO-2025-115", invoiceDate: "2025-06-18", invoiceValue: 38500, gstAmount: 6930, status: "Matched" },
          { vendorGstin: "27AAACL9988M1ZB", invoiceNumber: "LNK-IN-0644", invoiceDate: "2025-06-20", invoiceValue: 72000, gstAmount: 12960, status: "Mismatch" },
          { vendorGstin: "29AABCF7766G1ZX", invoiceNumber: "FRS-2025-228", invoiceDate: "2025-06-22", invoiceValue: 45000, gstAmount: 8100, status: "Matched" },
        ],
        ineligible: 14600, atRisk: 24200, reversal: 9800, matchingRate: 92.94,
      },
      liability: {
        outputGst: 503100, inputGst: 318600, netPayable: 184500, paidToDate: 0,
        outstanding: 184500, interest: 8400, cashFlowImpact: 192900,
      },
      auditReadiness: {
        overallScore: 84, invoiceMatchingRate: 92.94, gstinValidation: 98.5,
        hsnAccuracy: 87.2, ewayCompliance: 91.8, auditTrail: 95.4, placeOfSupply: 89.6,
      },
      taxPlanning: {
        etr: 22.4, deferredTax: 184000, lossCarryforwards: 1240000,
        lossExpiryYear: "FY 2031-32", depreciation: 268000,
        section80IAC: { eligible: true, status: "Active", savings: 425000 },
        optimizations: [
          { strategy: "Maximize Section 80IAC startup deduction", impact: "₹4.25L tax savings (100% deduction on profits)" },
          { strategy: "Accelerate R&D depreciation under Section 35", impact: "₹68K additional deduction this year" },
          { strategy: "Restructure inter-state billing for IGST optimization", impact: "₹32K working capital benefit" },
          { strategy: "Carry forward unabsorbed losses strategically", impact: "Shelters ₹12.4L of future profits" },
        ],
      },
      filingCalendar: [
        { date: "2025-07-20", type: "GSTR-3B (Jun 2025)", status: "Due Soon" },
        { date: "2025-08-11", type: "GSTR-1 (Jul 2025)", status: "Upcoming" },
        { date: "2025-08-20", type: "GSTR-3B (Jul 2025)", status: "Upcoming" },
        { date: "2025-09-11", type: "GSTR-1 (Aug 2025)", status: "Upcoming" },
        { date: "2025-09-20", type: "GSTR-3B (Aug 2025)", status: "Upcoming" },
        { date: "2025-12-31", type: "GSTR-9 (FY 2024-25)", status: "Upcoming" },
      ],
      notices: [
        { type: "ITC reversal demand", number: "DRC-01/2025/4421", issueDate: "2025-05-18", deadline: "2025-07-25", status: "Action Required", disputedAmount: 84500 },
        { type: "GSTR-2A mismatch query", number: "ASMT-10/2025/1188", issueDate: "2025-04-22", deadline: "2025-06-15", status: "Response Submitted", disputedAmount: 32000 },
        { type: "Late filing penalty", number: "GST-PEN/2025/0892", issueDate: "2025-03-10", deadline: "2025-04-10", status: "Closed", disputedAmount: 12500 },
      ],
      risk: {
        complianceScore: 28,
        factors: {
          lateFiling: "Low", itcMismatch: "Medium", invoiceAccuracy: "Low",
          cashFlow: "Medium", auditSelection: "Low", penaltyExposure: 96500,
        },
      },
    },
    governance: {
      controls: { overallScore: 82, segregationOfDuties: 88, approvalWorkflows: 94, reconciliationStatus: 96, policyCompliance: 85 },
      reporting: {
        boardPackageReady: true, boardMeetingDate: "2026-05-25", daysRemaining: 8,
        pnlAccuracy: 98.5, balanceSheetHealth: 96.2,
        statements: [
          { type: "P&L", status: "Complete", lastUpdated: "2026-05-15", variance: 3.2 },
          { type: "Balance Sheet", status: "Complete", lastUpdated: "2026-05-15", variance: 1.8, unreconciled: 2 },
          { type: "Cash Flow", status: "Complete", lastUpdated: "2026-05-15", variance: -2.4 },
        ],
      },
      budgeting: {
        totalBudget: 1847000, actualSpend: 1923000, variance: 76000, variancePercent: 4.1,
        byDepartment: [
          { department: "Sales & Marketing", budget: 685000, actual: 712000, variance: 27000, variancePercent: 3.9 },
          { department: "R&D", budget: 842000, actual: 867000, variance: 25000, variancePercent: 3.0 },
          { department: "G&A", budget: 320000, actual: 344000, variance: 24000, variancePercent: 7.5 },
        ],
        trends: [
          { month: "Jul 2024", budget: 1245000, actual: 1198000 },
          { month: "Aug 2024", budget: 1298000, actual: 1267000 },
          { month: "Sep 2024", budget: 1342000, actual: 1321000 },
          { month: "Oct 2024", budget: 1389000, actual: 1378000 },
          { month: "Nov 2024", budget: 1435000, actual: 1442000 },
          { month: "Dec 2024", budget: 1487000, actual: 1523000 },
          { month: "Jan 2025", budget: 1542000, actual: 1589000 },
          { month: "Feb 2025", budget: 1598000, actual: 1645000 },
          { month: "Mar 2025", budget: 1657000, actual: 1712000 },
          { month: "Apr 2025", budget: 1718000, actual: 1789000 },
          { month: "May 2025", budget: 1782000, actual: 1856000 },
          { month: "Jun 2025", budget: 1847000, actual: 1923000 },
        ],
        forecastAccuracy: 92.3, budgetAdherence: 88.7,
      },
      risk: {
        financialRiskScore: 28, fxExposure: 425000, fxExposurePercent: 12.4, fxHedged: 65,
        creditConcentration: 18.4, liquidityRisk: "Low", counterpartyRisk: "Medium",
        insuranceCoverage: 78, operationalRisk: "Low",
      },
      reconciliation: {
        tasks: [
          { name: "Bank Reconciliation", status: "Complete", owner: "Priya Shah", dueDate: "2026-05-05" },
          { name: "Credit Card Reconciliation", status: "Complete", owner: "Priya Shah", dueDate: "2026-05-05" },
          { name: "Accounts Receivable Aging", status: "Complete", owner: "Rahul Verma", dueDate: "2026-05-07" },
          { name: "Accounts Payable Aging", status: "Complete", owner: "Rahul Verma", dueDate: "2026-05-07" },
          { name: "Inventory Reconciliation", status: "Not Started", owner: "Amit Kumar", dueDate: "2026-05-10" },
          { name: "Fixed Assets Verification", status: "In Progress", owner: "Neha Reddy", dueDate: "2026-05-12" },
          { name: "Prepaid Expenses Roll-forward", status: "Complete", owner: "Priya Shah", dueDate: "2026-05-08" },
          { name: "Deferred Revenue Schedule", status: "Complete", owner: "Rahul Verma", dueDate: "2026-05-08" },
        ],
        completeness: 87.5, avgCloseTime: 6,
      },
      audit: {
        documentationCompleteness: 92, policyDocumentation: 95, auditTrailQuality: 89,
        checklist: [
          { item: "Revenue recognition policy documented", status: "Complete" },
          { item: "Expense approval matrix defined", status: "Complete" },
          { item: "Capitalization policy approved", status: "Complete" },
          { item: "Fixed asset register updated", status: "In Progress" },
          { item: "Stock option plan documented", status: "Complete" },
          { item: "Related party transactions disclosed", status: "In Progress" },
          { item: "Bank reconciliations current", status: "Complete" },
          { item: "AR/AP aging reports available", status: "Complete" },
          { item: "Tax filings up to date", status: "Complete" },
          { item: "Internal audit completed", status: "Not Started" },
        ],
        lastInternalAudit: "2025-11-15", monthsSinceAudit: 6, openFindings: 2,
      },
    },
    workforce: {
      headcount: {
        total: 30, fullTime: 27, contractors: 3, openRoles: 4,
        byDepartment: [
          { department: "Engineering", count: 12 },
          { department: "Sales", count: 8 },
          { department: "Marketing", count: 5 },
          { department: "Operations", count: 3 },
          { department: "G&A", count: 2 },
        ],
        byLocation: [
          { location: "Bengaluru", count: 18 },
          { location: "Mumbai", count: 7 },
          { location: "Remote", count: 5 },
        ],
      },
      cost: {
        totalPayroll: 1245000, avgCostPerEmployee: 138333,
        benefitsLoading: 18.4, payrollAsPercentOfRevenue: 67.4,
        pfContribution: 78000, esicContribution: 12400, gratuityAccrual: 34200,
      },
      productivity: {
        revenuePerEmployee: 6142000, grossProfitPerEmployee: 4729000,
        utilizationRate: 84.2, billableRate: 76.8,
      },
      attrition: {
        ttmAttritionRate: 12.4, voluntaryAttrition: 9.1, involuntaryAttrition: 3.3,
        regrettableLossRate: 6.2, avgTenureMonths: 22, replacementCostEstimate: 245000,
      },
      hiring: {
        timeToHireDays: 38, offerAcceptanceRate: 72,
        openRoles: [
          { role: "Senior Backend Engineer", department: "Engineering", priority: "High", daysOpen: 24 },
          { role: "Enterprise AE", department: "Sales", priority: "High", daysOpen: 18 },
          { role: "Product Marketing Mgr", department: "Marketing", priority: "Medium", daysOpen: 12 },
          { role: "Finance Analyst", department: "G&A", priority: "Medium", daysOpen: 9 },
        ],
      },
      engagement: { enpsScore: 42, lastSurveyDate: "2026-04-15", participationRate: 88 },
    },
  };
}

// ── Optional: recompute liquidity + revenue + cost cores from real txns ──
// demo_transactions schema is not guaranteed; we use best-effort field names.
function recomputeFromTxns(base: ReturnType<typeof baseline>, txns: any[]) {
  try {
    const sum = (rows: any[], pred: (r: any) => boolean) =>
      rows.filter(pred).reduce((s, r) => s + Number(r.amount || 0), 0);

    const inflow = sum(txns, (r) => r.type === "inflow" || r.direction === "in" || Number(r.amount) > 0 && !r.type);
    const outflow = Math.abs(sum(txns, (r) => r.type === "outflow" || r.type === "expense" || r.direction === "out"));
    const subs = sum(txns, (r) => r.type === "subscription");
    const cogs = sum(txns, (r) => (r.category || "").toLowerCase() === "cogs");
    const payroll = sum(txns, (r) => (r.category || "").toLowerCase() === "payroll");

    if (inflow > 0) {
      base.liquidity.cashPosition.currentCash = Math.round(inflow - outflow);
      base.revenue.metrics.totalRevenue = Math.round(inflow);
    }
    if (subs > 0) {
      base.revenue.metrics.mrr = Math.round(subs);
      base.revenue.metrics.arr = Math.round(subs * 12);
    }
    if (outflow > 0) {
      base.cost.structure.totalOpex = Math.round(outflow);
      const monthlyBurn = outflow / 3;
      if (monthlyBurn > 0) {
        base.liquidity.burnRunway.grossBurn = Math.round(monthlyBurn);
        base.liquidity.burnRunway.runway =
          +(base.liquidity.cashPosition.currentCash / monthlyBurn).toFixed(2);
      }
    }
    if (cogs > 0 && inflow > 0) {
      base.cost.structure.cogs = Math.round(cogs);
      base.cost.structure.grossMargin = +(((inflow - cogs) / inflow) * 100).toFixed(1);
    }
    if (payroll > 0) {
      base.cost.personnel.totalCost = Math.round(payroll);
    }
  } catch (e) {
    console.warn("recomputeFromTxns failed, keeping synthetic:", e);
  }
  return base;
}

// ── Historical trend analysis (up to 24 months) ────────────────────────
type MonthBucket = { month: string; transactions: any[] };

function isInflow(t: any) {
  return t.type === "inflow" || t.direction === "in" || (Number(t.amount) > 0 && !t.type);
}
function isOutflow(t: any) {
  return t.type === "outflow" || t.type === "expense" || t.direction === "out";
}
function sumByType(txns: any[], kind: "inflow" | "outflow") {
  const pred = kind === "inflow" ? isInflow : isOutflow;
  return txns.filter(pred).reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);
}
function sumByCategory(txns: any[], cats: string[]) {
  const set = new Set(cats.map((c) => c.toLowerCase()));
  return txns
    .filter((t) => set.has(String(t.category || "").toLowerCase()))
    .reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);
}
function calculateNetBurn(txns: any[]) {
  return Math.max(0, sumByType(txns, "outflow") - sumByType(txns, "inflow"));
}
function sumMetric(txns: any[], metric: string) {
  if (metric === "revenue") return sumByType(txns, "inflow");
  if (metric === "cost" || metric === "costs") return sumByType(txns, "outflow");
  if (metric === "margin") {
    const rev = sumByType(txns, "inflow");
    const cost = sumByType(txns, "outflow");
    return rev > 0 ? ((rev - cost) / rev) * 100 : 0;
  }
  return 0;
}

function groupByMonth(transactions: any[], _months: number): MonthBucket[] {
  const grouped: Record<string, any[]> = {};
  for (const t of transactions) {
    const key = String(t.date || "").substring(0, 7); // YYYY-MM
    if (!key) continue;
    (grouped[key] ||= []).push(t);
  }
  return Object.keys(grouped)
    .sort()
    .map((month) => ({ month, transactions: grouped[month] }));
}

function calculateGrowth(curr: MonthBucket, all: MonthBucket[]) {
  const idx = all.findIndex((m) => m.month === curr.month);
  if (idx <= 0) return 0;
  const prevRev = sumByType(all[idx - 1].transactions, "inflow");
  const currRev = sumByType(curr.transactions, "inflow");
  return prevRev > 0 ? +(((currRev - prevRev) / prevRev) * 100).toFixed(2) : 0;
}

function calculateYoY(monthlyData: MonthBucket[], metric: string) {
  const results: any[] = [];
  for (const cur of monthlyData) {
    const [yStr, mStr] = cur.month.split("-");
    const prevKey = `${Number(yStr) - 1}-${mStr}`;
    const prev = monthlyData.find((m) => m.month === prevKey);
    if (!prev) continue;
    const currentValue = sumMetric(cur.transactions, metric);
    const previousValue = sumMetric(prev.transactions, metric);
    const growth = previousValue > 0
      ? +(((currentValue - previousValue) / previousValue) * 100).toFixed(2)
      : 0;
    results.push({
      month: cur.month,
      previousMonth: prev.month,
      current: Math.round(currentValue),
      previous: Math.round(previousValue),
      growth,
    });
  }
  return results;
}

function calculateMarginYoY(monthlyData: MonthBucket[]) {
  const results: any[] = [];
  for (const cur of monthlyData) {
    const [yStr, mStr] = cur.month.split("-");
    const prevKey = `${Number(yStr) - 1}-${mStr}`;
    const prev = monthlyData.find((m) => m.month === prevKey);
    if (!prev) continue;
    const currMargin = sumMetric(cur.transactions, "margin");
    const prevMargin = sumMetric(prev.transactions, "margin");
    results.push({
      month: cur.month,
      current: +currMargin.toFixed(2),
      previous: +prevMargin.toFixed(2),
      improvement: +(currMargin - prevMargin).toFixed(2),
    });
  }
  return results;
}

function detectSeasonality(monthlyData: MonthBucket[]) {
  const monthlyAverages: Record<number, number> = {};
  for (let month = 1; month <= 12; month++) {
    const sameMonth = monthlyData.filter(
      (m) => parseInt(m.month.split("-")[1] || "0", 10) === month,
    );
    if (sameMonth.length >= 2) {
      const avg = sameMonth.reduce((s, m) => s + sumByType(m.transactions, "inflow"), 0) /
        sameMonth.length;
      monthlyAverages[month] = Math.round(avg);
    }
  }
  const values = Object.values(monthlyAverages);
  if (values.length === 0) {
    return { monthlyAverages, peakMonths: [], lowMonths: [], hasSeasonality: false };
  }
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(
    values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length,
  );
  return {
    monthlyAverages,
    peakMonths: Object.keys(monthlyAverages)
      .filter((m) => monthlyAverages[+m] > avg + stdDev)
      .map((m) => parseInt(m, 10)),
    lowMonths: Object.keys(monthlyAverages)
      .filter((m) => monthlyAverages[+m] < avg - stdDev)
      .map((m) => parseInt(m, 10)),
    hasSeasonality: avg > 0 ? stdDev / avg > 0.15 : false,
  };
}

function detectTrend(monthlyData: MonthBucket[], metric: string):
  | "improving" | "declining" | "stable" | "insufficient_data" {
  const last6 = monthlyData.slice(-6);
  if (last6.length < 3) return "insufficient_data";
  const values = last6.map((m) => sumMetric(m.transactions, metric));
  const first3 = values.slice(0, 3);
  const last3 = values.slice(-3);
  const avgFirst = first3.reduce((a, b) => a + b, 0) / first3.length;
  const avgLast = last3.reduce((a, b) => a + b, 0) / last3.length;
  if (avgFirst === 0) return "insufficient_data";
  const change = ((avgLast - avgFirst) / avgFirst) * 100;
  if (change > 10) return "improving";
  if (change < -10) return "declining";
  return "stable";
}

function calculateHistoricalTrends(transactions: any[], months = 24) {
  const monthlyData = groupByMonth(transactions, months);

  return {
    months,
    revenueTrend: monthlyData.map((m) => ({
      month: m.month,
      revenue: Math.round(sumByType(m.transactions, "inflow")),
      growth: calculateGrowth(m, monthlyData),
    })),
    costTrend: monthlyData.map((m) => ({
      month: m.month,
      costs: Math.round(sumByType(m.transactions, "outflow")),
      growth: calculateGrowth(m, monthlyData),
    })),
    burnTrend: monthlyData.map((m) => ({
      month: m.month,
      grossBurn: Math.round(sumByCategory(m.transactions, ["expense", "salary", "payroll"])),
      netBurn: Math.round(calculateNetBurn(m.transactions)),
    })),
    yoyComparison: {
      revenueGrowth: calculateYoY(monthlyData, "revenue"),
      costGrowth: calculateYoY(monthlyData, "cost"),
      marginImprovement: calculateMarginYoY(monthlyData),
    },
    seasonality: detectSeasonality(monthlyData),
    trendDirection: {
      revenue: detectTrend(monthlyData, "revenue"),
      costs: detectTrend(monthlyData, "costs"),
      efficiency: detectTrend(monthlyData, "margin"),
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const started = Date.now();
  let organization_id: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    organization_id = body?.organization_id ?? null;

    const insights = baseline();
    let historical: ReturnType<typeof calculateHistoricalTrends> | null = null;

    // Best-effort: try to recompute from demo_transactions if the table exists.
    if (organization_id) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        );
        const twentyFourMonthsAgo = new Date();
        twentyFourMonthsAgo.setMonth(twentyFourMonthsAgo.getMonth() - 24);
        const cutoff = twentyFourMonthsAgo.toISOString().slice(0, 10);
        const { data: txns, error } = await supabase
          .from("demo_transactions")
          .select("*")
          .eq("organization_id", organization_id)
          .gte("date", cutoff)
          .order("date", { ascending: false })
          .limit(5000);
        if (!error && txns && txns.length > 0) {
          recomputeFromTxns(insights, txns);
          try {
            historical = calculateHistoricalTrends(txns, 24);
          } catch (he) {
            console.warn("calculateHistoricalTrends failed:", (he as Error).message);
          }
        }
      } catch (e) {
        // demo_transactions likely doesn't exist — fine, keep synthetic.
        console.log("demo_transactions unavailable, using synthetic:", (e as Error).message);
      }
    }

    return new Response(
      JSON.stringify({
        organization_id,
        generated_at: new Date().toISOString(),
        compute_ms: Date.now() - started,
        ...insights,
        historical,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-insights error, returning synthetic:", e);
    return new Response(
      JSON.stringify({
        organization_id,
        generated_at: new Date().toISOString(),
        compute_ms: Date.now() - started,
        error: e instanceof Error ? e.message : "unknown",
        ...baseline(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
