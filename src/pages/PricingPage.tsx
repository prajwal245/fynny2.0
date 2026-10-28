import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { PRICING_FAQS } from "@/content/faqs";
import SiteShell, { Section, Reveal } from "@/components/site/SiteShell";
import { C } from "@/components/site/siteTheme";
import { SIGNUP_URL, trackCta } from "@/components/site/cta";
import { openDemo } from "@/components/site/BookDemo";
import { CurrencySwitch, INR_PER_USD, money, useCurrency, type Currency } from "@/lib/currency";
import { SUPPORT_WHATSAPP } from "@/content/legal/company";
import {
  GST_PERCENT,
  OVERAGE_BLOCK_DOCS,
  OVERAGE_BLOCK_PRICE,
  PLAN_ORDER,
  PLANS,
  TRIAL_DAYS,
  TRIAL_MAX_ACTIVE_CLIENTS,
  TRIAL_MAX_DOCUMENTS,
  cheapestPlan,
  monthlyBill,
  type PlanKey,
} from "@/lib/practice/billing/plans";
import { CREDIT_PACKS, PLAN_CREDITS, TRIAL_CREDITS } from "@/lib/practice/billing/credits";

/* ================================================================
   FynHelp pricing (16 Oct 2026): per active client, unlimited users.
   Every figure on this page comes from the billing plans, so the page
   and the invoice can never disagree.
================================================================ */

const STYLES = `
.fh-pphero { padding:120px 0 24px; text-align:center; }
@media (max-width:768px){ .fh-pphero{ padding:96px 0 12px; } }
.fh-pphero h1 { font-size:clamp(34px,5.6vw,64px); max-width:960px; margin:16px auto 0 !important; }
.fh-pphero .sub { color:${C.body}; font-size:17px; line-height:1.6; max-width:640px; margin:18px auto 0; }
.fh-toggles { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-top:28px; }
.fh-cycle { display:inline-flex; background:#E4DCCB; border-radius:999px; padding:4px; gap:2px; }
.fh-cycle button { border:0; background:transparent; font-family:inherit; font-size:14px; font-weight:600; color:${C.body}; padding:9px 22px; border-radius:999px; cursor:pointer; transition:.2s; display:flex; align-items:center; gap:8px; }
.fh-cycle button.on { background:${C.card}; color:${C.ink}; box-shadow:0 1px 5px rgba(23,18,8,.14); }
.fh-savepill { font-size:10px; font-weight:700; background:${C.gold}; color:#F7F1E6; padding:2px 9px; border-radius:999px; letter-spacing:.04em; }

.fh-price-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:20px; margin-top:36px; align-items:stretch; }
@media (max-width:960px){ .fh-price-grid{ grid-template-columns:1fr; max-width:460px; margin-left:auto; margin-right:auto; } }
.fh-pcard { background:${C.card}; border:1px solid ${C.line}; border-radius:22px; padding:28px 26px 24px; display:flex; flex-direction:column; position:relative; transition:transform .45s cubic-bezier(.16,1,.3,1), box-shadow .45s, border-color .3s; height:100%; }
.fh-pcard:hover { transform:translateY(-5px); box-shadow:0 30px 55px -42px rgba(23,18,8,.55); }
.fh-pcard.pop { border:1.5px solid ${C.maroon}; box-shadow:0 26px 60px -34px rgba(92,18,22,.5); }
.fh-pcard.pick { border-color:${C.gold}; box-shadow:0 0 0 3px rgba(139,105,20,.18); }
.fh-pbadge { position:absolute; top:-13px; left:50%; transform:translateX(-50%); background:${C.maroon}; color:#F7F1E6; font-size:10px; font-weight:600; letter-spacing:.16em; padding:6px 16px; border-radius:999px; text-transform:uppercase; white-space:nowrap; }
.fh-pcard .tier { font-size:19px; font-weight:600; letter-spacing:-0.02em; }
.fh-pcard .for { color:${C.body}; font-size:13.5px; margin-top:4px; }
.fh-price { display:flex; align-items:baseline; gap:6px; margin-top:18px; flex-wrap:wrap; }
.fh-price .amount { font-size:42px; font-weight:600; letter-spacing:-0.05em; font-variant-numeric:tabular-nums; }
.fh-price .per { color:${C.muted}; font-size:14px; }
.fh-pbill { font-size:12.5px; color:${C.body}; margin-top:6px; min-height:36px; line-height:1.5; }
.fh-pbill b { color:${C.green}; font-weight:600; }
.fh-quota { background:rgba(169,56,56,.07); border-radius:14px; padding:14px 16px; margin-top:16px; display:grid; gap:6px; font-size:13px; }
.fh-quota .row { display:flex; justify-content:space-between; gap:12px; }
.fh-quota .row span:last-child { font-weight:600; font-variant-numeric:tabular-nums; text-align:right; }
.fh-plist { list-style:none; padding:0; margin:16px 0 18px; display:grid; gap:8px; font-size:13.5px; color:${C.body}; }
.fh-plist li { display:flex; gap:9px; line-height:1.45; }
.fh-plist li::before { content:"✓"; color:${C.maroon}; font-weight:700; flex:0 0 auto; }
.fh-pcard .spacer { flex:1; }
.fh-pcard .fh-btn { justify-content:center; width:100%; }

.fh-chips { display:flex; flex-wrap:wrap; justify-content:center; gap:10px; margin-top:30px; }
.fh-chip { background:${C.card}; border:1px solid ${C.line}; border-radius:999px; padding:8px 16px; font-size:13px; font-weight:500; color:${C.ink}; }

.fh-defs { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:34px; }
@media (max-width:760px){ .fh-defs{ grid-template-columns:1fr; } }
.fh-def { background:${C.card}; border:1px solid ${C.line}; border-radius:18px; padding:22px 24px; }
.fh-def h3 { font-size:17px; margin-bottom:8px !important; }
.fh-def p { color:${C.body}; font-size:14.5px; line-height:1.65; margin:0; }

.fh-tool { background:${C.card}; border:1px solid ${C.line}; border-radius:22px; padding:26px; margin-top:34px; display:grid; gap:20px; }
.fh-tool label { display:grid; gap:6px; font-size:13px; font-weight:500; color:${C.body}; }
.fh-tool input[type=number] { font:inherit; font-size:18px; font-weight:600; padding:10px 14px; border-radius:12px; border:1px solid ${C.line}; background:#fff; color:${C.ink}; width:100%; font-variant-numeric:tabular-nums; }
.fh-tool input[type=range] { width:100%; accent-color:${C.maroon}; }
.fh-tool .grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
@media (max-width:860px){ .fh-tool .grid{ grid-template-columns:1fr 1fr; } }
@media (max-width:480px){ .fh-tool .grid{ grid-template-columns:1fr; } }
.fh-outs { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
@media (max-width:860px){ .fh-outs{ grid-template-columns:1fr 1fr; } }
.fh-out { background:${C.page}; border-radius:14px; padding:14px 16px; }
.fh-out .k { font-size:11px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:${C.muted}; }
.fh-out .v { font-size:24px; font-weight:600; letter-spacing:-0.03em; margin-top:4px; font-variant-numeric:tabular-nums; transition:color .3s; }
.fh-out.hl { background:${C.maroonDeep}; color:#F7F1E6; }
.fh-out.hl .k { color:rgba(247,241,230,.6); }
.fh-note { font-size:12.5px; color:${C.muted}; line-height:1.6; }

.fh-tablewrap { overflow-x:auto; margin-top:30px; -webkit-overflow-scrolling:touch; }
.fh-tablewrap table { width:100%; border-collapse:separate; border-spacing:0; background:${C.card}; border:1px solid ${C.line}; border-radius:18px; overflow:hidden; font-size:14px; min-width:620px; }
.fh-tablewrap th, .fh-tablewrap td { padding:12px 16px; text-align:left; border-bottom:1px solid ${C.line}; vertical-align:top; }
.fh-tablewrap tr:last-child td { border-bottom:0; }
.fh-tablewrap thead th { background:${C.pageAlt}; font-weight:600; font-size:13px; }
.fh-tablewrap td.n, .fh-tablewrap th.n { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.fh-tablewrap tr.quiet td { background:rgba(139,105,20,.06); }
.fh-tablewrap .y { color:${C.maroon}; font-weight:700; }
.fh-tablewrap .no { color:${C.muted}; }
.fh-soon { font-size:11px; font-weight:600; color:${C.gold}; background:rgba(139,105,20,.1); border-radius:999px; padding:2px 8px; white-space:nowrap; }

.fh-ba { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:34px; }
@media (max-width:760px){ .fh-ba{ grid-template-columns:1fr; } }
.fh-ba .before, .fh-ba .after { border-radius:20px; padding:26px 28px; height:100%; text-align:left; }
.fh-pphero { position:relative; }
.fh-pphero::before { content:''; position:absolute; inset:-40px 0 auto; height:420px; background:radial-gradient(55% 80% at 50% 0%, rgba(226,103,63,.12), transparent 70%); pointer-events:none; }
.fh-pphero .fh-wrap { position:relative; z-index:2; }
.fh-ba .before { background:${C.card}; border:1px solid ${C.line}; }
.fh-ba .after { background:${C.maroonDeep}; color:#F7F1E6; }
.fh-ba h3 { font-size:17px; margin-bottom:12px !important; }
.fh-ba ul { margin:0; padding-left:18px; display:grid; gap:8px; font-size:14.5px; line-height:1.55; }
.fh-ba .before ul { color:${C.body}; }

.fh-collapse { margin-top:30px; text-align:center; }
.fh-collapse .fh-tablewrap { text-align:left; }
.fh-collapse > summary { list-style:none; cursor:pointer; display:inline-flex; align-items:center; gap:8px; font-weight:600; font-size:15px; color:${C.maroon}; }
.fh-collapse > summary::-webkit-details-marker { display:none; }
.fh-collapse > summary::after { content:"＋"; font-size:14px; transition:transform .3s; }
.fh-collapse[open] > summary::after { content:"－"; }

.fh-trustgrid { display:grid; grid-template-columns:repeat(5,1fr); gap:14px; margin-top:34px; }
@media (max-width:960px){ .fh-trustgrid{ grid-template-columns:1fr 1fr; } }
@media (max-width:480px){ .fh-trustgrid{ grid-template-columns:1fr; } }
.fh-trust { background:${C.card}; border:1px solid ${C.line}; border-radius:16px; padding:18px; }
.fh-trust h4 { font-size:14.5px; margin-bottom:6px !important; }
.fh-trust p { font-size:13px; color:${C.body}; line-height:1.55; margin:0; }

.fh-steps { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-top:34px; counter-reset:s; }
@media (max-width:860px){ .fh-steps{ grid-template-columns:1fr; } }
.fh-step { background:${C.card}; border:1px solid ${C.line}; border-radius:18px; padding:22px; counter-increment:s; }
.fh-step::before { content:counter(s); display:grid; place-items:center; width:32px; height:32px; border-radius:50%; background:${C.maroon}; color:#F7F1E6; font-weight:700; font-size:14px; margin-bottom:12px; }
.fh-step h4 { font-size:16px; margin-bottom:6px !important; }
.fh-step p { font-size:14px; color:${C.body}; line-height:1.6; margin:0; }

.fh-founder { max-width:760px; margin:34px auto 0; background:${C.card}; border:1px solid ${C.line}; border-radius:22px; padding:28px; font-size:15.5px; line-height:1.7; color:${C.body}; }
.fh-founder p { margin:0 0 12px; }

.fh-faq { max-width:760px; margin:34px auto 0; }
.fh-faq details { background:${C.card}; border:1px solid ${C.line}; border-radius:14px; padding:17px 22px; margin-bottom:10px; }
.fh-faq summary { font-weight:600; font-size:15px; cursor:pointer; list-style:none; display:flex; justify-content:space-between; align-items:center; gap:12px; }
.fh-faq summary::-webkit-details-marker { display:none; }
.fh-faq summary::after { content:"+"; font-weight:400; color:${C.muted}; font-size:19px; }
.fh-faq details[open] summary::after { content:"–"; }
.fh-faq details p { color:${C.body}; font-size:14.5px; line-height:1.7; margin:10px 0 0; }

.fh-final { background:${C.maroonDeep}; border-radius:26px; color:#F7F1E6; text-align:center; padding:52px 26px; }
.fh-final h2 { font-size:clamp(26px,3.6vw,40px); }
.fh-final p { color:rgba(247,241,230,.72); font-size:15px; margin:14px auto 26px; max-width:620px; line-height:1.65; }
.fh-final .row { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
.fh-final .fh-btn-ghost { color:#F7F1E6; border-color:rgba(247,241,230,.35); }
.fh-final .small { font-size:13.5px; margin-top:18px; color:rgba(247,241,230,.7); }
.fh-final .small a, .fh-final .small button { color:#F7F1E6; font-weight:600; background:none; border:0; padding:0; font:inherit; cursor:pointer; text-decoration:underline; text-underline-offset:3px; }
`;

const gstNote = (cur: Currency) => (cur === "INR" ? `+ ${GST_PERCENT}% GST` : "+ GST");

/** Features that differ between plans, shown on the cards. Only what works today. */
const CARD_FEATURES: Record<PlanKey, string[]> = {
  starter: ["Extraction, reconciliation and source-linked MIS", "Gmail intake and Chaser by email, no limit", `${PLAN_CREDITS.starter} WhatsApp reminder credits a month`, "MIS exports with a “Prepared with FynHelp” footer"],
  professional: ["Everything in Essential", `${PLAN_CREDITS.professional} WhatsApp reminder credits a month`, "MIS exports in your firm’s name", "Help importing your clients"],
  scale: ["Everything in Firm", `${PLAN_CREDITS.scale.toLocaleString("en-IN")} WhatsApp reminder credits a month`, "Priority WhatsApp support and a named contact", "Assisted import of up to 100 clients"],
};

type Cell = boolean | string | { soon: true };
const FEATURE_ROWS: [string, Cell, Cell, Cell][] = [
  ["Extraction, reconciliation and source-linked MIS", true, true, true],
  ["Full audit trail", true, true, true],
  ["Roles for partner, manager and junior", true, true, true],
  ["Gmail intake", true, true, true],
  ["Chaser by email", true, true, true],
  ["Chaser by WhatsApp (1 credit per reminder)", `${PLAN_CREDITS.starter} credits a month`, `${PLAN_CREDITS.professional} credits a month`, `${PLAN_CREDITS.scale.toLocaleString("en-IN")} credits a month`],
  ["Extra WhatsApp credits", "From ₹1 each", "From ₹1 each", "Down to ₹0.80 each"],
  ["MIS exports (PDF and Excel)", "“Prepared with FynHelp” footer", "Firm branding", "Firm branding"],
  ["Shareable MIS links", { soon: true }, { soon: true }, { soon: true }],
  ["Team and branch permissions", false, false, { soon: true }],
  ["Audit log export", false, false, { soon: true }],
  ["Onboarding", PLANS.starter.onboarding, PLANS.professional.onboarding, PLANS.scale.onboarding],
  ["Support", PLANS.starter.support, PLANS.professional.support, PLANS.scale.support],
];

const EXAMPLES: { label: string; plan: PlanKey; active: number; quiet?: boolean }[] = [
  { label: "10 active clients", plan: "starter", active: 10 },
  { label: "22 active clients", plan: "starter", active: 22 },
  { label: "55 active clients", plan: "professional", active: 55 },
  { label: "140 active clients", plan: "scale", active: 140 },
  { label: "60 clients, 45 active in a quiet month", plan: "professional", active: 45, quiet: true },
];

function cellView(c: Cell) {
  if (c === true) return <span className="y" aria-label="Included">✓</span>;
  if (c === false) return <span className="no" aria-label="Not included">—</span>;
  if (typeof c === "object") return <span className="fh-soon">Coming soon</span>;
  return <span>{c}</span>;
}

export default function PricingPage() {
  const cur = useCurrency();
  const [annual, setAnnual] = useState(true);
  const [helperClients, setHelperClients] = useState(30);
  const [roi, setRoi] = useState({ clients: 30, hours: 1.5, rate: 250, fee: 0 });
  const m = (n: number) => money(n, cur);

  const helper = useMemo(() => {
    const n = Math.max(1, Math.min(2000, Math.round(helperClients || 1)));
    const best = cheapestPlan(n);
    const bill = monthlyBill(best.plan, "monthly", { activeClients: n, documents: 0 });
    return { n, plan: best.plan, bill };
  }, [helperClients]);

  const roiOut = useMemo(() => {
    const clients = Math.max(1, Math.round(roi.clients || 1));
    const hours = Math.max(0, roi.hours || 0) * clients;
    const value = hours * Math.max(0, roi.rate || 0);
    const revenue = Math.max(0, roi.fee || 0) * clients;
    const best = cheapestPlan(clients);
    const cost = monthlyBill(best.plan, "monthly", { activeClients: clients, documents: 0 }).subtotal;
    return { clients, hours, value, revenue, plan: best.plan, cost, multiple: cost > 0 ? (value + revenue) / cost : 0 };
  }, [roi]);

  const start = (where: string) => () => trackCta("start", where);

  return (
    <SiteShell>
      <style>{STYLES}</style>

      {/* 1. HERO */}
      <section className="fh-pphero">
        <div className="fh-wrap">
          <Reveal>
            <span className="fh-kicker">Pricing</span>
            <h1>
              Close every client's books in days, not weeks. <span className="ital">Pay only for the clients you close.</span>
            </h1>
            <p className="sub">Three plans priced per active client, with unlimited users on every plan. Clients you don't touch in a month are free.</p>
            <div className="fh-toggles">
              <div className="fh-cycle" role="group" aria-label="Billing period">
                <button type="button" className={annual ? "" : "on"} aria-pressed={!annual} onClick={() => setAnnual(false)}>
                  Monthly
                </button>
                <button type="button" className={annual ? "on" : ""} aria-pressed={annual} onClick={() => setAnnual(true)} data-testid="toggle-annual">
                  Annual <span className="fh-savepill">2 months free</span>
                </button>
              </div>
              <CurrencySwitch className="fh-cycle" value={cur} />
            </div>
            {cur === "USD" && (
              <p className="fh-note" style={{ marginTop: 10 }}>
                Dollar prices are a guide at ₹{INR_PER_USD} to $1; you are billed in rupees through Razorpay.
              </p>
            )}
          </Reveal>
        </div>
      </section>

      {/* 2. PLAN CARDS */}
      <section className="fh-wrap" aria-label="Plans">
        <div className="fh-price-grid">
          {PLAN_ORDER.map((k, i) => {
            const p = PLANS[k];
            const perMonth = annual ? Math.round(p.annual / 12) : p.monthly;
            const pop = k === "professional";
            return (
              <Reveal key={k} delay={i * 80}>
                <div className={`fh-pcard${pop ? " pop" : ""}${helper.plan === k ? " pick" : ""}`} data-testid={`plan-${k}`}>
                  {pop && <span className="fh-pbadge">Most popular</span>}
                  <div className="tier">{p.name}</div>
                  <div className="for">{p.recommendedFor}</div>
                  <div className="fh-price">
                    <span className="amount num">{m(perMonth)}</span>
                    <span className="per">/ month {gstNote(cur)}</span>
                  </div>
                  <div className="fh-pbill">
                    {annual ? (
                      <>
                        {m(p.annual)} billed yearly · <b>save {m(p.monthly * 12 - p.annual)}</b>
                      </>
                    ) : (
                      <>Billed monthly · cancel any time</>
                    )}
                  </div>
                  <div className="fh-quota">
                    <div className="row"><span>Active clients included</span><span>{p.clientsIncluded}</span></div>
                    <div className="row"><span>Each extra active client</span><span>{m(p.extraClient)}{p.maxActiveClients ? `, up to ${p.maxActiveClients}` : ""}</span></div>
                    <div className="row"><span>Per client at base</span><span>≈ {m(Math.round(p.monthly / p.clientsIncluded))}</span></div>
                    <div className="row"><span>Documents per active client</span><span>{p.docsPerClient}, pooled</span></div>
                    <div className="row"><span>Users</span><span>Unlimited</span></div>
                  </div>
                  <ul className="fh-plist">
                    {CARD_FEATURES[k].map((f) => <li key={f}>{f}</li>)}
                  </ul>
                  <div className="spacer" />
                  <Link to={SIGNUP_URL} className={`fh-btn ${pop ? "fh-btn-coral" : "fh-btn-primary"}`} onClick={start(`pricing-plan-${p.name.toLowerCase()}`)}>
                    Start free, no card
                  </Link>
                </div>
              </Reveal>
            );
          })}
        </div>

        {/* 3. PROOF CHIPS */}
        <Reveal>
          <div className="fh-chips">
            {["Unlimited users", "Pay per active client", "Your client data never trains AI", "Works with Tally and Zoho, no migration"].map((c) => (
              <span key={c} className="fh-chip">{c}</span>
            ))}
          </div>
          <p className="fh-note" style={{ textAlign: "center", marginTop: 14 }}>
            All prices exclude {GST_PERCENT}% GST. Every invoice is a GST invoice, so your firm can claim input tax credit.
          </p>
        </Reveal>
      </section>

      {/* 4. DEFINITIONS */}
      <Section kicker="How billing works" title="Two words," italic="in plain terms." center>
        <div className="fh-defs">
          <Reveal>
            <div className="fh-def">
              <h3>Active client</h3>
              <p>A client is active in a month if FynHelp processes at least one document or runs one reconciliation for them. Clients you don't touch that month are free, and so are archived clients.</p>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="fh-def">
              <h3>WhatsApp credit</h3>
              <p>One credit sends one WhatsApp reminder from FynHelp's number. Email reminders cost nothing, and a firm that links its own WhatsApp number pays no credits. Every plan includes credits each month, and unused credits roll over for 12 months. More credits: {CREDIT_PACKS.map((p) => `${p.credits.toLocaleString("en-IN")} for ${m(p.price)}`).join(", ")}. Optional automatic top-up with a monthly limit you set, so a reminder never silently stops.</p>
            </div>
            <div className="fh-def">
              <h3>Document</h3>
              <p>One uploaded file. A bank statement counts as one document however many lines it has; one invoice is one document. Past your pooled allowance, {m(OVERAGE_BLOCK_PRICE)} per {OVERAGE_BLOCK_DOCS} documents on the next invoice. Work is never blocked.</p>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* 5. PLAN HELPER */}
      <Section kicker="Plan helper" title="How many clients do you" italic="close each month?" center alt>
        <Reveal>
          <div className="fh-tool" style={{ maxWidth: 760, marginInline: "auto" }} data-testid="plan-helper">
            <label>
              Active clients in a month
              <input type="number" min={1} max={2000} value={helperClients} onChange={(e) => setHelperClients(Number(e.target.value))} aria-label="Active clients in a month" data-testid="helper-input" />
              <input type="range" min={1} max={200} value={Math.min(200, helperClients)} onChange={(e) => setHelperClients(Number(e.target.value))} aria-hidden />
            </label>
            <div className="fh-outs" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
              <div className="fh-out hl"><div className="k">Cheapest plan</div><div className="v" data-testid="helper-plan">{PLANS[helper.plan].name}</div></div>
              <div className="fh-out"><div className="k">A month, before GST</div><div className="v" data-testid="helper-total">{m(helper.bill.subtotal)}</div></div>
              <div className="fh-out"><div className="k">Per client</div><div className="v">{m(Math.round(helper.bill.subtotal / helper.n))}</div></div>
            </div>
            <p className="fh-note" style={{ margin: 0 }}>
              Monthly billing. {helper.bill.extraClients > 0 ? `Includes ${helper.bill.extraClients} extra active clients at ${m(PLANS[helper.plan].extraClient)} each. ` : ""}
              With GST: {m(helper.bill.total)}. Essential stops at {PLANS.starter.maxActiveClients} active clients; Scale is cheaper than Firm from 83.
            </p>
          </div>
        </Reveal>
      </Section>

      {/* 6. ROI CALCULATOR */}
      <Section kicker="Is it worth it" title="What your team’s time" italic="is worth." center>
        <Reveal>
          <div className="fh-tool" data-testid="roi">
            <div className="grid">
              <label>Active clients<input type="number" min={1} value={roi.clients} onChange={(e) => setRoi({ ...roi, clients: Number(e.target.value) })} /></label>
              <label>Hours saved per client a month<input type="number" min={0} step={0.5} value={roi.hours} onChange={(e) => setRoi({ ...roi, hours: Number(e.target.value) })} /></label>
              <label>Cost of a team hour (₹)<input type="number" min={0} step={50} value={roi.rate} onChange={(e) => setRoi({ ...roi, rate: Number(e.target.value) })} /></label>
              <label>Monthly MIS fee you could charge a client (₹, optional)<input type="number" min={0} step={500} value={roi.fee} onChange={(e) => setRoi({ ...roi, fee: Number(e.target.value) })} /></label>
            </div>
            <div className="fh-outs">
              <div className="fh-out"><div className="k">Hours saved a month</div><div className="v">{roiOut.hours.toLocaleString("en-IN")}</div></div>
              <div className="fh-out"><div className="k">Value of that time</div><div className="v">{m(roiOut.value + roiOut.revenue)}</div></div>
              <div className="fh-out"><div className="k">{PLANS[roiOut.plan].name} costs</div><div className="v">{m(roiOut.cost)}</div></div>
              <div className="fh-out hl"><div className="k">Return</div><div className="v" data-testid="roi-multiple">{roiOut.multiple.toFixed(1)}×</div></div>
            </div>
            <p className="fh-note" style={{ margin: 0 }}>
              Every default here is an estimate, not a measurement: change them to your firm's numbers. Plan cost is the cheapest plan for that many active clients, monthly, before GST.
            </p>
          </div>
        </Reveal>
      </Section>

      {/* 7. WORKED EXAMPLES */}
      <Section kicker="Worked examples" title="What a month" italic="actually costs." center alt>
        <Reveal>
          <div className="fh-tablewrap">
            <table>
              <thead>
                <tr><th>Firm</th><th>Calculation</th><th className="n">Monthly bill</th><th className="n">Per client</th></tr>
              </thead>
              <tbody>
                {EXAMPLES.map((e) => {
                  const p = PLANS[e.plan];
                  const bill = monthlyBill(e.plan, "monthly", { activeClients: e.active, documents: 0 });
                  const extra = e.active - p.clientsIncluded;
                  return (
                    <tr key={e.label} className={e.quiet ? "quiet" : undefined}>
                      <td>{e.label}</td>
                      <td>{p.name}: {m(p.monthly)}{extra > 0 ? ` + ${extra} × ${m(p.extraClient)}` : " base"}</td>
                      <td className="n"><b>{m(bill.subtotal)}</b></td>
                      <td className="n">{m(Math.round(bill.subtotal / e.active))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="fh-note" style={{ textAlign: "center", marginTop: 12 }}>
            Before GST. The highlighted row: in a quiet month, the firm pays only for the clients it works on.
          </p>
        </Reveal>
      </Section>

      {/* 8. BEFORE AND AFTER */}
      <Section kicker="Your month-end" title="Before and" italic="after." center>
        <div className="fh-ba">
          <Reveal>
            <div className="before">
              <h3>Today</h3>
              <ul>
                <li>Chasing statements on WhatsApp, then email, then WhatsApp again</li>
                <li>Matching bank lines against Tally in Excel, line by line</li>
                <li>Partner review sends work back, with no record of why</li>
                <li>An MIS with no trail back to the numbers behind it</li>
              </ul>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="after">
              <h3>With FynHelp</h3>
              <ul>
                <li>Documents arrive by Gmail, WhatsApp or upload and are read on their own</li>
                <li>Bank matched to books in five passes; you see only the exceptions, each with a reason</li>
                <li>Corrections and sign-off are recorded on an audit trail</li>
                <li>Every MIS figure opens the lines behind it</li>
              </ul>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* 9. FULL FEATURE TABLE */}
      <section className="fh-wrap" style={{ paddingBottom: 40 }}>
        <details className="fh-collapse" data-testid="feature-table">
          <summary>Compare every feature</summary>
          <div className="fh-tablewrap">
            <table>
              <thead>
                <tr><th>Feature</th>{PLAN_ORDER.map((k) => <th key={k}>{PLANS[k].name}</th>)}</tr>
              </thead>
              <tbody>
                {FEATURE_ROWS.map(([name, ...cells]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    {cells.map((c, i) => <td key={i}>{cellView(c)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      {/* 10. TRUST */}
      <Section kicker="Trust" title="Your clients’ books," italic="kept that way." center alt>
        <div className="fh-trustgrid">
          {[
            ["Audit trail", "Every match, correction and sign-off is recorded with who did it and when."],
            ["No AI training", "Your clients’ documents are never used to train AI models."],
            ["Encryption", "Data is encrypted in transit and at rest; files sit in private storage."],
            ["Role-based access", "Partners, managers and juniors see and do only what their role allows."],
            ["DPDP Act readiness", "Consent, purpose limits and deletion are built in, following India’s DPDP Act."],
          ].map(([t, d], i) => (
            <Reveal key={t} delay={i * 50}>
              <div className="fh-trust"><h4>{t}</h4><p>{d}</p></div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* 11. HOW THE TRIAL WORKS */}
      <Section kicker="Free trial" title="How the trial" italic="works." center>
        <div className="fh-steps">
          <Reveal>
            <div className="fh-step">
              <h4>Sign up, no card</h4>
              <p>A sample firm is there to explore. Your {TRIAL_DAYS}-day clock starts only when you upload your first document.</p>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="fh-step">
              <h4>Close one real month</h4>
              <p>Run one reconciliation and make one MIS on your own data within the {TRIAL_DAYS} days, and see a full month-end before you pay.</p>
            </div>
          </Reveal>
          <Reveal delay={160}>
            <div className="fh-step">
              <h4>Choose a plan, or don't</h4>
              <p>The trial covers {TRIAL_MAX_ACTIVE_CLIENTS} active clients and {TRIAL_MAX_DOCUMENTS} documents with every Firm feature, including {TRIAL_CREDITS} free WhatsApp reminder credits. Without a plan, your data stays readable for 30 days.</p>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* 12. PROOF: founder note until there are real design-partner quotes */}
      <Section kicker="Early days" title="A note from" italic="the founders." center alt>
        <Reveal>
          <div className="fh-founder">
            <p>FynHelp is new. We would rather show you the product on your own files than quote customers we don't have yet.</p>
            <p>We are working with a small group of CA firms as design partners: they get a founder on WhatsApp, a say in what we build next, and the founding-firm price lock. If that sounds like your firm, tell us about your month-end.</p>
            <p style={{ margin: 0 }}>
              <button type="button" className="fh-btn fh-btn-primary" onClick={() => openDemo("pricing-design-partner")}>
                Become a design partner
              </button>
            </p>
          </div>
        </Reveal>
      </Section>

      {/* 13. FAQ */}
      <Section id="faq" kicker="FAQ" title="Fair questions," italic="straight answers." center>
        <div className="fh-faq">
          {PRICING_FAQS.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* 14. CALLS TO ACTION */}
      <section style={{ padding: "0 22px 96px" }}>
        <div className="fh-wrap" style={{ padding: 0 }}>
          <Reveal>
            <div className="fh-final">
              <h2>Start with one client this month.</h2>
              <p>Annual plans are 2 months free, with a full refund within 30 days. The first 50 firms on an annual plan keep their price for 24 months.</p>
              <div className="row">
                <Link to={SIGNUP_URL} className="fh-btn fh-btn-coral" onClick={start("pricing-final")}>Start free, no card</Link>
                <button type="button" className="fh-btn fh-btn-ghost" onClick={() => openDemo("pricing-setup-call")}>Book a 15-minute setup call</button>
              </div>
              <div className="small">
                40+ clients? <button type="button" onClick={() => openDemo("pricing-pilot")}>Book a guided pilot</button>: 30 days for {m(4999)}, fully credited to an annual plan.
                {SUPPORT_WHATSAPP && (
                  <>
                    {" "}· <a href={`https://wa.me/${SUPPORT_WHATSAPP.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp support</a>
                  </>
                )}
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </SiteShell>
  );
}
