/**
 * Reusable detail drawer for the dashboard drill-downs.
 *
 * Open state is controlled via URL search params (?drawer=customer&id=...)
 * so cockpit cards and list rows produce shareable, refresh-safe links.
 *
 * Built on shadcn Sheet (right side, ESC + backdrop close handled).
 */
import { useSearchParams } from "@/lib/router-compat";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useMemo } from "react";
import CustomerDetail from "./detail/CustomerDetail";
import VendorDetail from "./detail/VendorDetail";
import InvoiceDetail from "./detail/InvoiceDetail";
import ExpenseDetail from "./detail/ExpenseDetail";
import GstFilingDetail from "./detail/GstFilingDetail";
import RiskDetail from "./detail/RiskDetail";
import InsuranceDetail from "./detail/InsuranceDetail";
import EmployeeDetail from "./detail/EmployeeDetail";
import DealDetail from "./detail/DealDetail";
import BankTxnDetail from "./detail/BankTxnDetail";

export type DrawerKind =
  | "customer"
  | "vendor"
  | "invoice"
  | "expense"
  | "gst_filing"
  | "risk"
  | "insurance"
  | "employee"
  | "deal"
  | "bank_txn";

export function useDrawer() {
  const [params, setParams] = useSearchParams();
  const drawer = params.get("drawer") as DrawerKind | null;
  const id = params.get("id");
  const open = (kind: DrawerKind, id: string) => {
    const next = new URLSearchParams(params);
    next.set("drawer", kind);
    next.set("id", id);
    setParams(next, { replace: false });
  };
  const close = () => {
    const next = new URLSearchParams(params);
    next.delete("drawer");
    next.delete("id");
    setParams(next, { replace: true });
  };
  return { drawer, id, open, close };
}

export default function DetailDrawer() {
  const { drawer, id, close } = useDrawer();
  const isOpen = !!drawer && !!id;

  const content = useMemo(() => {
    if (!isOpen) return null;
    switch (drawer) {
      case "customer": return <CustomerDetail id={id!} onClose={close} />;
      case "vendor": return <VendorDetail id={id!} onClose={close} />;
      case "invoice": return <InvoiceDetail id={id!} onClose={close} />;
      case "expense": return <ExpenseDetail id={id!} onClose={close} />;
      case "gst_filing": return <GstFilingDetail id={id!} onClose={close} />;
      case "risk": return <RiskDetail id={id!} onClose={close} />;
      case "insurance": return <InsuranceDetail id={id!} onClose={close} />;
      case "employee": return <EmployeeDetail id={id!} onClose={close} />;
      case "deal": return <DealDetail id={id!} onClose={close} />;
      case "bank_txn": return <BankTxnDetail id={id!} onClose={close} />;
      default: return null;
    }
  }, [drawer, id, isOpen, close]);

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && close()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[560px] p-0 bg-fyn-beige border-l border-fyn-ink-10 overflow-y-auto"
      >
        {content}
      </SheetContent>
    </Sheet>
  );
}
