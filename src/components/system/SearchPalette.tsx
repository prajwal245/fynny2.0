import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

type Entry = { label: string; to: string; group: string; keywords?: string };

const ENTRIES: Entry[] = [
  // Intelligence
  { label: "Liquidity", to: "/dashboard/liquidity", group: "Intelligence", keywords: "cash runway bank" },
  { label: "Revenue", to: "/dashboard/revenue", group: "Intelligence", keywords: "mrr churn customers" },
  { label: "Cost", to: "/dashboard/cost", group: "Intelligence", keywords: "spend vendors burn" },
  { label: "GST & Tax", to: "/dashboard/gst", group: "Intelligence", keywords: "gstr filing itc tds" },
  { label: "Governance", to: "/dashboard/governance", group: "Intelligence", keywords: "compliance risk" },
  { label: "HR & Workforce", to: "/dashboard/hr", group: "Intelligence", keywords: "payroll employees" },
  { label: "Investor", to: "/dashboard/investor", group: "Intelligence", keywords: "metrics board update" },
  { label: "Ask Fynny", to: "/dashboard/ask-fynny", group: "Intelligence", keywords: "ai cfo chat" },
  // Workspace
  { label: "Reports", to: "/dashboard/reports", group: "Workspace", keywords: "pdf excel p&l" },
  { label: "Books of Accounts", to: "/dashboard/reports/books", group: "Workspace", keywords: "ledger journal cash book" },
  { label: "Import data", to: "/dashboard/data-import", group: "Workspace", keywords: "csv upload bank statement" },
  { label: "Integrations", to: "/dashboard/settings/integrations", group: "Workspace", keywords: "razorpay stripe shopify" },
  // Settings
  { label: "Personal info", to: "/dashboard/settings/profile", group: "Settings" },
  { label: "Security & password", to: "/dashboard/settings/security", group: "Settings" },
  { label: "Notifications", to: "/dashboard/settings/notifications", group: "Settings" },
  { label: "Business profile", to: "/dashboard/settings/business", group: "Settings" },
  { label: "Team & access", to: "/dashboard/settings/team", group: "Settings" },
  { label: "CA access", to: "/dashboard/settings/ca-access", group: "Settings" },
  { label: "Billing", to: "/dashboard/settings/billing", group: "Settings" },
  // Public
  { label: "Pricing", to: "/pricing", group: "FynHelp" },
  { label: "Resources", to: "/resources", group: "FynHelp" },
  { label: "Blog", to: "/blog", group: "FynHelp" },
];

const GROUPS = Array.from(new Set(ENTRIES.map((e) => e.group)));

export default function SearchPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const openIt = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("fynhelp:open-search", openIt);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("fynhelp:open-search", openIt);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, reports, settings…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {GROUPS.map((g) => (
          <CommandGroup key={g} heading={g}>
            {ENTRIES.filter((e) => e.group === g).map((e) => (
              <CommandItem
                key={e.to}
                value={`${e.label} ${e.keywords ?? ""}`}
                onSelect={() => { setOpen(false); navigate(e.to); }}
              >
                {e.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
