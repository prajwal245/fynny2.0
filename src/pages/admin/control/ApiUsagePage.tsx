import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApiUsage } from "@/lib/admin/admin.functions";
import { adminCall } from "@/components/admin/adminClient";
import { Empty, ErrorNote, Kpi, PageHead, Panel, Table, Td, muted } from "./ui";

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number) => n.toLocaleString("en-IN");

export default function ApiUsagePage() {
  const [days, setDays] = useState(30);
  const [basis, setBasis] = useState<"ist" | "pacific">("ist");
  const [billed, setBilled] = useState("");
  const q = useQuery({ queryKey: ["admin", "api-usage", days, basis], queryFn: () => adminCall(() => adminApiUsage({ data: { days, basis } })), refetchInterval: 120_000 });
  const d = q.data;
  const billedNum = Number(billed);
  return (
    <div>
      <PageHead
        title="API usage & cost"
        sub="What document reading (AI and OCR), Fynny chat and WhatsApp follow-ups are using. Costs are estimates from list prices and the token counts providers report."
        action={
          <span className="flex gap-2">
            <select className="rounded-lg border px-2 py-1.5 text-sm" value={basis} onChange={(e) => setBasis(e.target.value as "ist" | "pacific")} aria-label="Day basis">
              <option value="ist">Days in India time</option><option value="pacific">Days as Google bills (Pacific)</option>
            </select>
          <select className="rounded-lg border px-2 py-1.5 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
            <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
          </select>
          </span>
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
            <Kpi label="Est. AI cost" value={inr(d.totalInr)} hint={`${usd(d.totalUsd)} · documents ${inr(d.document.costInr)} · chat ${inr(d.chat.costInr)} (at ₹${d.usdInr}/$)`} />
            <Kpi label="Document AI + OCR calls" value={num(d.document.calls)} hint={`${num(d.document.failed)} failed (${num(d.document.billedFailed)} still billed) · ${num(d.document.ocrCalls)} OCR`} />
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
                  <tr key={i}><Td>{m.provider}</Td><Td>{m.model}</Td><Td>{m.purpose}</Td><Td className="tabular-nums">{num(m.calls)}</Td><Td className="tabular-nums">{num(m.failed)}</Td><Td className="tabular-nums">{num(m.tokensIn)}</Td><Td className="tabular-nums">{num(m.tokensOut)}</Td><Td className="tabular-nums">{inr(m.costInr)} <span style={{ color: muted }}>({usd(m.costUsd)})</span></Td><Td className="tabular-nums">{m.avgMs ? `${(m.avgMs / 1000).toFixed(1)}s` : "-"}</Td></tr>
                ))}
              </Table>
            )}
          </Panel>
          <Panel title="Top firms by AI spend">
            {d.topFirms.length === 0 ? <Empty>No firm has used document AI in this period.</Empty> : (
              <Table head={["Firm", "Calls", "Failed", "Est. cost"]} testId="api-by-firm">
                {d.topFirms.map((f) => <tr key={f.firmId}><Td>{f.name}</Td><Td className="tabular-nums">{num(f.calls)}</Td><Td className="tabular-nums">{num(f.failed)}</Td><Td className="tabular-nums">{inr(f.costInr)}</Td></tr>)}
              </Table>
            )}
          </Panel>
          <Panel title={basis === "ist" ? "By day (India time)" : "By day (Pacific time, as Google bills)"}>
            {d.byDay.length === 0 ? <Empty>Nothing yet.</Empty> : (
              <Table head={["Day", "Document calls", "Failed", "Documents", "Chat", "Total"]} testId="api-by-day">
                {d.byDay.slice(0, 31).map((r) => <tr key={r.day}><Td>{r.day}</Td><Td className="tabular-nums">{num(r.calls)}</Td><Td className="tabular-nums">{num(r.failed)}</Td><Td className="tabular-nums">{usd(r.costUsd)}</Td><Td className="tabular-nums">{usd(r.chatUsd)}</Td><Td className="tabular-nums">{inr(r.totalInr)} <span style={{ color: muted }}>({usd(r.totalUsd)})</span></Td></tr>)}
              </Table>
            )}
          </Panel>
          <Panel title="Check against Google's bill">
            <div className="p-3 text-sm space-y-2" data-testid="reconcile">
              <p style={{ color: muted }}>Enter what Google billed for a day (₹ from the Cloud billing report, or the AI Studio usage page). Google bills by Pacific day, so switch the day basis above to match. Anything not tracked is shown as the gap.</p>
              <label className="flex flex-wrap items-center gap-2">Billed ₹
                <input className="rounded-lg border px-2 py-1 w-28" inputMode="decimal" value={billed} onChange={(e) => setBilled(e.target.value)} aria-label="Billed amount in rupees" />
              </label>
              {billedNum > 0 && (
                <p>
                  Tracked over this period: <b>{inr(d.totalInr)}</b>. Gap against the bill: <b>{inr(Math.max(0, billedNum - d.totalInr))}</b>
                  {billedNum > d.totalInr ? " is not showing here. Likely causes: calls made by edge functions not yet redeployed, chat calls without token counts, or a model missing from the price list." : ". Tracked spend covers the bill."}
                </p>
              )}
              {d.unpricedModels.length > 0 && <p style={{ color: "#b45309" }}>Priced at a high fallback rate (not on the price list): {d.unpricedModels.join(", ")}.</p>}
              {d.chat.withoutTokens > 0 && <p style={{ color: muted }}>{num(d.chat.withoutTokens)} chat calls logged no token count, so they cost ₹0 here.</p>}
              <p style={{ color: muted }}>Costs are recomputed from the recorded tokens at the Nov 2026 list prices, including thinking tokens. Calls logged before the fix may have under-counted thinking tokens, so older days can still sit below the bill; (stored figure for documents was {usd(d.document.loggedCostUsd)}).</p>
            </div>
          </Panel>
          <p className="text-xs" style={{ color: muted }}>Fynny chat: {num(d.chat.calls)} calls, {num(d.chat.failed)} failed. Rates can be changed with AI_PRICING_JSON; OCR.space counts as calls (set OCR_SPACE_COST_USD_PER_CALL on a paid plan). Gemini and Groq bills are in their own consoles; this page is the in-app estimate.</p>
        </>
      )}
    </div>
  );
}
