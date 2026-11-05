import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApiUsage } from "@/lib/admin/admin.functions";
import { adminCall } from "@/components/admin/adminClient";
import { Empty, ErrorNote, Kpi, PageHead, Panel, Table, Td, muted } from "./ui";

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const num = (n: number) => n.toLocaleString("en-IN");

export default function ApiUsagePage() {
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ["admin", "api-usage", days], queryFn: () => adminCall(() => adminApiUsage({ data: { days } })), refetchInterval: 120_000 });
  const d = q.data;
  const total = d ? d.document.costUsd + d.chat.costUsd : 0;
  return (
    <div>
      <PageHead
        title="API usage & cost"
        sub="What document reading (AI and OCR), Fynny chat and WhatsApp follow-ups are using. Costs are estimates from list prices and the token counts providers report."
        action={
          <select className="rounded-lg border px-2 py-1.5 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
            <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
          </select>
        }
      />
      <ErrorNote error={q.error} />
      {d && !d.costTracking && (
        <p className="text-sm rounded-xl p-3 mb-4" style={{ background: "rgba(234,196,60,.18)" }} data-testid="cost-migration">
          Calls are counted, but cost and tokens are not recorded yet. Run <code>supabase/apply_nov_2026.sql</code> in the Supabase SQL Editor to switch cost tracking on; it applies to calls made after that.
        </p>
      )}
      {d && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <Kpi label="Est. AI cost" value={usd(total)} hint={`Documents ${usd(d.document.costUsd)} · Chat ${usd(d.chat.costUsd)}`} />
            <Kpi label="Document AI + OCR calls" value={num(d.document.calls)} hint={`${num(d.document.failed)} failed · ${num(d.document.ocrCalls)} OCR`} />
            <Kpi label="Tokens in / out" value={`${num(d.document.tokensIn)} / ${num(d.document.tokensOut)}`} hint="document reading and reports" />
            <Kpi label="WhatsApp follow-ups sent" value={num(d.whatsapp.total)} hint={Object.entries(d.whatsapp.byTemplate).map(([k, v]) => `${k}: ${v}`).join(" · ") || "none yet"} />
          </div>
          {d.document.withoutUsage > 0 && d.costTracking && (
            <p className="text-xs mb-3" style={{ color: muted }}>{num(d.document.withoutUsage)} successful calls reported no token counts (made before tracking, or the provider did not send them), so their cost is not included.</p>
          )}
          <Panel title="By provider, model and purpose">
            {d.byModel.length === 0 ? <Empty>No AI or OCR calls in this period.</Empty> : (
              <Table head={["Provider", "Model", "Purpose", "Calls", "Failed", "Tokens in", "Tokens out", "Est. cost", "Avg time"]} testId="api-by-model">
                {d.byModel.map((m, i) => (
                  <tr key={i}><Td>{m.provider}</Td><Td>{m.model}</Td><Td>{m.purpose}</Td><Td className="tabular-nums">{num(m.calls)}</Td><Td className="tabular-nums">{num(m.failed)}</Td><Td className="tabular-nums">{num(m.tokensIn)}</Td><Td className="tabular-nums">{num(m.tokensOut)}</Td><Td className="tabular-nums">{usd(m.costUsd)}</Td><Td className="tabular-nums">{m.avgMs ? `${(m.avgMs / 1000).toFixed(1)}s` : "-"}</Td></tr>
                ))}
              </Table>
            )}
          </Panel>
          <Panel title="Top firms by AI spend">
            {d.topFirms.length === 0 ? <Empty>No firm has used document AI in this period.</Empty> : (
              <Table head={["Firm", "Calls", "Failed", "Est. cost"]} testId="api-by-firm">
                {d.topFirms.map((f) => <tr key={f.firmId}><Td>{f.name}</Td><Td className="tabular-nums">{num(f.calls)}</Td><Td className="tabular-nums">{num(f.failed)}</Td><Td className="tabular-nums">{usd(f.costUsd)}</Td></tr>)}
              </Table>
            )}
          </Panel>
          <Panel title="By day (India time)">
            {d.byDay.length === 0 ? <Empty>Nothing yet.</Empty> : (
              <Table head={["Day", "Calls", "Failed", "Est. cost"]}>
                {d.byDay.slice(0, 31).map((r) => <tr key={r.day}><Td>{r.day}</Td><Td className="tabular-nums">{num(r.calls)}</Td><Td className="tabular-nums">{num(r.failed)}</Td><Td className="tabular-nums">{usd(r.costUsd)}</Td></tr>)}
              </Table>
            )}
          </Panel>
          <p className="text-xs" style={{ color: muted }}>Fynny chat: {num(d.chat.calls)} calls, {num(d.chat.failed)} failed. Rates can be changed with AI_PRICING_JSON; OCR.space counts as calls (set OCR_SPACE_COST_USD_PER_CALL on a paid plan). Gemini and Groq bills are in their own consoles; this page is the in-app estimate.</p>
        </>
      )}
    </div>
  );
}
