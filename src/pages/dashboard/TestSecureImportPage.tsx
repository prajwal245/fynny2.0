import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExternal } from "@/integrations/supabase/external";

type DataType = "transactions" | "invoices" | "vendor_payments";

interface TestResult {
  status: "success" | "error";
  payload: unknown;
  error?: string;
}

export default function TestSecureImportPage() {
  const { businessId } = useAuth();
  const [dataType, setDataType] = useState<DataType>("transactions");
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("1000");
  const [description, setDescription] = useState("Test import");
  const [category, setCategory] = useState("office");
  const [overrideBusinessId, setOverrideBusinessId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const callFn = async (overrides?: {
    amount?: string;
    date?: string;
    businessId?: string | null;
  }) => {
    setLoading(true);
    setResult(null);
    const bId = overrides?.businessId !== undefined ? overrides.businessId : (overrideBusinessId ?? businessId);
    console.log("[TestSecureImport] businessId from useAuth:", businessId);
    console.log("[TestSecureImport] business_id sent in body:", bId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setResult({ status: "error", payload: null, error: "Not signed in, please log in first." });
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke("secure-data-import", {
        body: {
          data_type: dataType,
          business_id: bId,
          records: [
            {
              transaction_date: overrides?.date ?? date,
              amount: Number(overrides?.amount ?? amount),
              description,
              category,
            },
          ],
        },
      });
      if (error) {
        setResult({ status: "error", payload: data ?? null, error: error.message });
      } else {
        setResult({ status: "success", payload: data });
      }
    } catch (e) {
      setResult({ status: "error", payload: null, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  const futureDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-serif font-bold text-fyn-ink">Test: secure-data-import</h1>
          <p className="text-sm text-fyn-ink/70 mt-1">
            Business ID: <code className="font-mono">{businessId ?? "(none)"}</code>
          </p>
        </div>

        <div className="bg-fyn-beige/40 border border-fyn-ink/10 rounded-lg p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Data type</Label>
              <Select value={dataType} onValueChange={(v) => setDataType(v as DataType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transactions">transactions</SelectItem>
                  <SelectItem value="invoices">invoices</SelectItem>
                  <SelectItem value="vendor_payments">vendor_payments</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Transaction date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Amount</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label>Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          <Button onClick={() => callFn()} disabled={loading} className="w-full">
            {loading ? "Calling..." : "Test Secure Import"}
          </Button>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fyn-ink/70">
            Quick test cases
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => callFn({ amount: "1500", date: today })} disabled={loading}>
              ✓ Valid data
            </Button>
            <Button variant="outline" onClick={() => callFn({ amount: "0" })} disabled={loading}>
              ✗ Zero amount
            </Button>
            <Button variant="outline" onClick={() => callFn({ date: futureDate })} disabled={loading}>
              ✗ Future date
            </Button>
            <Button variant="outline" onClick={() => callFn({ businessId: "" })} disabled={loading}>
              ✗ Empty business_id
            </Button>
          </div>
        </div>

        {result && (
          <div
            className={`rounded-lg p-4 border ${
              result.status === "success"
                ? "bg-green-50 border-green-300"
                : "bg-red-50 border-red-300"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">
                {result.status === "success" ? "✓ Success" : "✗ Error"}
              </span>
              {result.error && <span className="text-sm text-red-700">{result.error}</span>}
            </div>
            {(() => {
              const p = result.payload as { inserted_count?: number; errors?: unknown } | null;
              return (
                <>
                  {p?.inserted_count !== undefined && (
                    <div className="text-sm mb-2">
                      Inserted: <strong>{p.inserted_count}</strong>
                    </div>
                  )}
                  {p?.errors !== undefined && (
                    <div className="text-sm mb-2">
                      Validation errors:
                      <pre className="text-xs bg-white/60 p-2 rounded mt-1 overflow-auto">
                        {JSON.stringify(p.errors, null, 2)}
                      </pre>
                    </div>
                  )}
                </>
              );
            })()}
            <details>
              <summary className="text-xs cursor-pointer text-fyn-ink/70">Full response</summary>
              <pre className="text-xs bg-white/60 p-2 rounded mt-1 overflow-auto">
                {JSON.stringify(result.payload, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
