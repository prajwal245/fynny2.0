import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CA, CACard, CAEmpty, CAHeading, inr } from "@/components/ca/portalUi";

export const Route = createFileRoute("/shared/mis/$token")({
  head: () => ({
    meta: [
      { title: "Shared MIS report | FynHelp" },
      { name: "description", content: "A management information report shared with you by your chartered accountant." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Shared MIS report | FynHelp" },
      { property: "og:description", content: "A management information report shared with you by your chartered accountant." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SharedMisPage,
});

interface Shared {
  found: boolean;
  firm_name?: string;
  client_name?: string;
  report_name?: string;
  report_type?: string;
  period?: string;
  generated_at?: string;
  expires_at?: string;
  note?: string | null;
  content?: Record<string, unknown> | null;
}

const money = (v: unknown) => (typeof v === "number" ? inr(v) : "Not available");

function SharedMisPage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<{ loading: boolean; data: Shared | null }>({ loading: true, data: null });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error } = await supabase.rpc("get_shared_mis_report", { p_token: token });
      if (!alive) return;
      setState({ loading: false, data: error ? { found: false } : (data as unknown as Shared) });
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const c = (state.data?.content ?? {}) as Record<string, any>;
  const compliance = c.compliance_summary ?? {};
  const quality = c.data_quality ?? {};

  return (
    <main style={{ background: CA.bg, minHeight: "100vh", padding: "40px 16px" }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        {state.loading ? (
          <CACard style={{ padding: 24 }}>
            <CAEmpty title="Loading report" />
          </CACard>
        ) : !state.data?.found ? (
          <CACard style={{ padding: 24 }}>
            <CAEmpty
              title="This link is no longer valid"
              hint="The share link has expired or was withdrawn. Ask your chartered accountant for a fresh link."
            />
          </CACard>
        ) : (
          <>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontFamily: CA.sans, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: CA.teal, fontWeight: 700 }}>
                Shared by {state.data.firm_name}
              </div>
              <CAHeading style={{ marginTop: 6 }}>{state.data.report_name ?? "Management report"}</CAHeading>
              <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted, marginTop: 6 }}>
                {state.data.client_name} · Period {state.data.period ?? "Not specified"}
              </div>
            </div>

            <CACard style={{ padding: 22 }}>
              <Row label="Revenue" value={money(c.revenue)} />
              <Row label="Expenses" value={money(c.expenses)} />
              <Row label="Gross profit" value={money(c.gross_profit)} />
              <Row label="GST collected" value={money(c.gst_collected)} />
              <Row label="GST paid" value={money(c.gst_paid)} />
              <Row label="Input tax credit available" value={money(c.itc_available)} />
              <Row label="Input tax credit claimed" value={money(c.itc_claimed)} />
              <Row label="Input tax credit balance" value={money(c.itc_balance)} />
              <Row label="Filings completed" value={String(compliance.filed ?? 0)} />
              <Row label="Filings pending" value={String(compliance.pending ?? 0)} />
              <Row label="Filings overdue" value={String(compliance.overdue ?? 0)} />
              <Row label="Documents reviewed" value={String(quality.doc_count ?? 0)} last />
            </CACard>

            {state.data.note && (
              <CACard style={{ padding: 18, marginTop: 14 }}>
                <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.ink, lineHeight: 1.6 }}>{state.data.note}</div>
              </CACard>
            )}

            <div style={{ fontFamily: CA.sans, fontSize: 12, color: CA.faint, marginTop: 18, textAlign: "center" }}>
              This link expires on{" "}
              {state.data.expires_at
                ? new Date(state.data.expires_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                : "a future date"}
              . Prepared with FynHelp.
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        padding: "10px 0",
        borderBottom: last ? "none" : `0.5px solid ${CA.line}`,
      }}
    >
      <span style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted }}>{label}</span>
      <span style={{ fontFamily: CA.mono, fontSize: 13, fontVariantNumeric: "tabular-nums", color: CA.ink }}>{value}</span>
    </div>
  );
}
