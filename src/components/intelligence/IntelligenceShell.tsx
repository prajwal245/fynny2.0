/**
 * Tab navigation shell for the 8 intelligence tabs.
 * Used by /demo/* and /dashboard/* via IntelligenceProvider mode.
 */
import { useState } from "react";
import { Link } from "@/lib/router-compat";
import { Droplets, TrendingUp, DollarSign, FileText, Shield, Users, BarChart3, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import LiquidityTab from "./tabs/LiquidityTab";
import RevenueTab from "./tabs/RevenueTab";
import CostTab from "./tabs/CostTab";
import GstTab from "./tabs/GstTab";
import GovernanceTab from "./tabs/GovernanceTab";
import HrTab from "./tabs/HrTab";
import InvestorTab from "./tabs/InvestorTab";
import AskFynnyTab from "./tabs/AskFynnyTab";
import { IntelPage, ModeBanner, ACCENT, LiveTimestamp, ChartGradients } from "./_primitives";
import { useMode } from "./DataSource";
import { HeaderToolbar } from "./actions";
import LiveAlerts from "./LiveAlerts";

const TABS = [
  { id: "liquidity",  label: "Liquidity",      icon: Droplets,       Comp: LiquidityTab },
  { id: "revenue",    label: "Revenue",        icon: TrendingUp,     Comp: RevenueTab },
  { id: "cost",       label: "Cost",           icon: DollarSign,     Comp: CostTab },
  { id: "gst",        label: "GST & Tax",      icon: FileText,       Comp: GstTab },
  { id: "governance", label: "Governance",     icon: Shield,         Comp: GovernanceTab },
  { id: "hr",         label: "HR & Workforce", icon: Users,          Comp: HrTab },
  { id: "investor",   label: "Investor",       icon: BarChart3,      Comp: InvestorTab },
  { id: "fynny",      label: "Ask Fynny",      icon: MessageSquare,  Comp: AskFynnyTab },

] as const;

export type TabId = typeof TABS[number]["id"];

export default function IntelligenceShell({ initialTab = "liquidity" }: { initialTab?: TabId }) {
  const [active, setActive] = useState<TabId>(initialTab);
  const Active = TABS.find((t) => t.id === active)?.Comp ?? LiquidityTab;
  const mode = useMode();

  return (
    <IntelPage>
      <ChartGradients />
      <ModeBanner />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <nav className="flex items-center gap-1 bg-white rounded-lg p-1 overflow-x-auto" style={{ border: "1px solid rgba(23,18,8,0.08)" }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = active === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
                  isActive ? "text-white" : "text-[rgba(23,18,8,0.62)] hover:text-fyn-ink hover:bg-[rgba(23,18,8,0.04)]",
                )}
                style={isActive ? { background: ACCENT.red } : undefined}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          <LiveTimestamp />
          <HeaderToolbar />
        </div>
      </div>

      {/* Alerts generated from real runway / GST / cost-anomaly data (live only) */}
      <LiveAlerts />

      <div key={active}>
        <Active />
      </div>


    </IntelPage>
  );
}

