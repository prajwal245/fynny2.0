/**
 * Master Data — customers/vendors, items and FX rates.
 * Backed by ca_parties, ca_items and ca_fx_rates. No fabricated rows.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { useCARole } from "@/hooks/useCARole";
import { useCAClientOptions } from "@/hooks/useCAClientOptions";
import { logCAAudit } from "@/lib/caAudit";
import { CA, CACard, CAButton, CABadge, CAEmpty, CAField, caInputStyle, caTh, caTd, inr, dateIN } from "@/components/ca/portalUi";
import { ModuleHeader } from "@/components/ca/os/primitives";

type Tab = "parties" | "items" | "currency" | "custom";

interface Party {
  id: string; name: string; party_type: string; gstin: string | null; pan: string | null;
  email: string | null; phone: string | null; payment_terms_days: number; is_active: boolean;
}
interface Item {
  id: string; name: string; sku: string | null; hsn_code: string | null; uom: string;
  unit_price: number | null; gst_rate: number; category: string | null; is_active: boolean;
}
interface FxRate {
  id: string; base_currency: string; quote_currency: string; rate: number; rate_date: string; source: string;
}
interface FieldDef {
  id: string; field_key: string; label: string; field_type: string; options: unknown; is_required: boolean; sort_order: number;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "parties", label: "Customers & Vendors" },
  { key: "items", label: "Items" },
  { key: "currency", label: "Currency & FX" },
  { key: "custom", label: "Custom fields" },
];


export default function CAMastersPage() {
  useEffect(() => { console.log("[fyn:ca:os-complete] CAMastersPage mounted"); }, []);
  const { firmId, userId } = useCAPortal();
  const { can } = useCARole();
  const { clients } = useCAClientOptions();
  const [tab, setTab] = useState<Tab>("parties");
  const [businessId, setBusinessId] = useState("");
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [rates, setRates] = useState<FxRate[]>([]);
  const [defs, setDefs] = useState<FieldDef[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const editable = can("manage_clients");

  const [pForm, setPForm] = useState({ name: "", party_type: "customer", gstin: "", pan: "", email: "", phone: "", payment_terms_days: "30" });
  const [iForm, setIForm] = useState({ name: "", sku: "", hsn_code: "", uom: "NOS", unit_price: "", gst_rate: "18", category: "" });
  const [fForm, setFForm] = useState({ base_currency: "USD", quote_currency: "INR", rate: "", rate_date: new Date().toISOString().slice(0, 10) });
  const [cForm, setCForm] = useState({ label: "", field_type: "text", options: "", is_required: false });

  useEffect(() => {
    if (!businessId && clients.length) setBusinessId(clients[0].business_id);
  }, [clients, businessId]);

  const load = useCallback(async () => {
    if (!firmId) return;
    if (businessId) {
      const [{ data: p }, { data: i }, { data: v }] = await Promise.all([
        supabase.from("ca_parties").select("id, name, party_type, gstin, pan, email, phone, payment_terms_days, is_active")
          .eq("ca_firm_id", firmId).eq("business_id", businessId).order("name"),
        supabase.from("ca_items").select("id, name, sku, hsn_code, uom, unit_price, gst_rate, category, is_active")
          .eq("ca_firm_id", firmId).eq("business_id", businessId).order("name"),
        supabase.from("ca_custom_field_values").select("field_id, value")
          .eq("ca_firm_id", firmId).eq("business_id", businessId),
      ]);
      setParties((p ?? []) as Party[]);
      setItems((i ?? []) as Item[]);
      const map: Record<string, string> = {};
      for (const row of (v ?? []) as { field_id: string; value: string | null }[]) map[row.field_id] = row.value ?? "";
      setValues(map);
    }
    const [{ data: f }, { data: d }] = await Promise.all([
      supabase.from("ca_fx_rates").select("id, base_currency, quote_currency, rate, rate_date, source")
        .eq("ca_firm_id", firmId).order("rate_date", { ascending: false }).limit(60),
      supabase.from("ca_custom_field_defs").select("id, field_key, label, field_type, options, is_required, sort_order")
        .eq("ca_firm_id", firmId).eq("is_active", true).order("sort_order").order("label"),
    ]);
    setRates((f ?? []) as FxRate[]);
    setDefs((d ?? []) as FieldDef[]);
  }, [firmId, businessId]);

  const addFieldDef = async () => {
    if (!firmId || !cForm.label.trim()) return toast.error("Label is required");
    const key = cForm.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const opts = cForm.field_type === "select"
      ? cForm.options.split(",").map((o) => o.trim()).filter(Boolean)
      : [];
    const { error } = await supabase.from("ca_custom_field_defs").insert({
      ca_firm_id: firmId, field_key: key, label: cForm.label.trim(), field_type: cForm.field_type,
      options: opts, is_required: cForm.is_required, sort_order: defs.length,
    });
    if (error) return toast.error(error.message);
    await logCAAudit({ firmId, entityType: "custom_field", action: "custom_field_created", detail: { key, type: cForm.field_type } });
    toast.success("Custom field added");
    setCForm({ label: "", field_type: "text", options: "", is_required: false });
    await load();
  };

  const removeFieldDef = async (id: string) => {
    const { error } = await supabase.from("ca_custom_field_defs").update({ is_active: false }).eq("id", id);
    if (error) return toast.error(error.message);
    setDefs((prev) => prev.filter((d) => d.id !== id));
  };

  const saveFieldValue = async (fieldId: string, value: string) => {
    if (!firmId || !businessId) return;
    const { error } = await supabase.from("ca_custom_field_values").upsert(
      { ca_firm_id: firmId, business_id: businessId, field_id: fieldId, value, updated_by: userId ?? null, updated_at: new Date().toISOString() },
      { onConflict: "field_id,business_id" },
    );
    if (error) return toast.error(error.message);
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    toast.success("Saved");
  };


  useEffect(() => { void load(); }, [load]);

  const addParty = async () => {
    if (!firmId || !businessId || !pForm.name.trim()) return toast.error("Name is required");
    const { error } = await supabase.from("ca_parties").insert({
      ca_firm_id: firmId, business_id: businessId, name: pForm.name.trim(), party_type: pForm.party_type,
      gstin: pForm.gstin.trim() || null, pan: pForm.pan.trim() || null, email: pForm.email.trim() || null,
      phone: pForm.phone.trim() || null, payment_terms_days: Number(pForm.payment_terms_days || 30),
    });
    if (error) return toast.error(error.message);
    await logCAAudit({ firmId, businessId, entityType: "party", action: "party_created", detail: { name: pForm.name, type: pForm.party_type } });
    toast.success("Party added");
    setPForm({ name: "", party_type: "customer", gstin: "", pan: "", email: "", phone: "", payment_terms_days: "30" });
    await load();
  };

  const addItem = async () => {
    if (!firmId || !businessId || !iForm.name.trim()) return toast.error("Name is required");
    const { error } = await supabase.from("ca_items").insert({
      ca_firm_id: firmId, business_id: businessId, name: iForm.name.trim(), sku: iForm.sku.trim() || null,
      hsn_code: iForm.hsn_code.trim() || null, uom: iForm.uom.trim() || "NOS",
      unit_price: iForm.unit_price ? Number(iForm.unit_price) : null, gst_rate: Number(iForm.gst_rate || 18),
      category: iForm.category.trim() || null,
    });
    if (error) return toast.error(error.message);
    await logCAAudit({ firmId, businessId, entityType: "item", action: "item_created", detail: { name: iForm.name } });
    toast.success("Item added");
    setIForm({ name: "", sku: "", hsn_code: "", uom: "NOS", unit_price: "", gst_rate: "18", category: "" });
    await load();
  };

  const addRate = async () => {
    if (!firmId || !fForm.rate) return toast.error("Rate is required");
    const { error } = await supabase.from("ca_fx_rates").insert({
      ca_firm_id: firmId, base_currency: fForm.base_currency.toUpperCase(),
      quote_currency: fForm.quote_currency.toUpperCase(), rate: Number(fForm.rate),
      rate_date: fForm.rate_date, created_by: userId ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success("Rate recorded");
    setFForm({ ...fForm, rate: "" });
    await load();
  };

  const clientPicker = (
    <CACard style={{ padding: 16, marginBottom: 18 }}>
      <CAField label="Client">
        <select value={businessId} onChange={(e) => setBusinessId(e.target.value)} style={{ ...caInputStyle, maxWidth: 340 }}>
          {clients.length === 0 && <option value="">No clients yet</option>}
          {clients.map((c) => <option key={c.business_id} value={c.business_id}>{c.client_name}</option>)}
        </select>
      </CAField>
    </CACard>
  );

  return (
    <div>
      <ModuleHeader
        title="Master Data"
        subtitle="Counterparty, item and currency masters that dimension every transaction — customers, vendors, HSN-coded items and dated exchange rates."
        right={editable ? undefined : <CABadge tone="grey">Read only</CABadge>}
      />

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            fontFamily: CA.sans, fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
            color: tab === t.key ? "#fff" : CA.muted, background: tab === t.key ? CA.teal : "#fff",
            border: `0.5px solid ${tab === t.key ? CA.teal : CA.line}`, borderRadius: 999, padding: "7px 16px", cursor: "pointer",
          }}>{t.label}</button>
        ))}
      </div>

      {tab !== "currency" && clientPicker}

      {tab === "parties" && (
        <>
          {editable && (
            <CACard style={{ padding: 18, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                <CAField label="Name"><input value={pForm.name} onChange={(e) => setPForm({ ...pForm, name: e.target.value })} style={caInputStyle} /></CAField>
                <CAField label="Type">
                  <select value={pForm.party_type} onChange={(e) => setPForm({ ...pForm, party_type: e.target.value })} style={caInputStyle}>
                    <option value="customer">Customer</option><option value="vendor">Vendor</option><option value="both">Both</option>
                  </select>
                </CAField>
                <CAField label="GSTIN"><input value={pForm.gstin} onChange={(e) => setPForm({ ...pForm, gstin: e.target.value })} style={caInputStyle} /></CAField>
                <CAField label="PAN"><input value={pForm.pan} onChange={(e) => setPForm({ ...pForm, pan: e.target.value })} style={caInputStyle} /></CAField>
                <CAField label="Email"><input value={pForm.email} onChange={(e) => setPForm({ ...pForm, email: e.target.value })} style={caInputStyle} /></CAField>
                <CAField label="Payment terms (days)"><input type="number" value={pForm.payment_terms_days} onChange={(e) => setPForm({ ...pForm, payment_terms_days: e.target.value })} style={caInputStyle} /></CAField>
              </div>
              <div style={{ marginTop: 14 }}><CAButton onClick={addParty}>Add party</CAButton></div>
            </CACard>
          )}
          <CACard style={{ padding: 4 }}>
            {parties.length === 0 ? <CAEmpty title="No customers or vendors yet" hint="Add the client's counterparties to dimension receivables and payables." /> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["Name", "Type", "GSTIN", "PAN", "Contact", "Terms"].map((h) => <th key={h} style={caTh}>{h}</th>)}</tr></thead>
                  <tbody>
                    {parties.map((p) => (
                      <tr key={p.id}>
                        <td style={caTd}>{p.name}</td>
                        <td style={caTd}><CABadge tone={p.party_type === "vendor" ? "amber" : "teal"}>{p.party_type}</CABadge></td>
                        <td style={{ ...caTd, fontFamily: CA.mono, fontSize: 12 }}>{p.gstin ?? "—"}</td>
                        <td style={{ ...caTd, fontFamily: CA.mono, fontSize: 12 }}>{p.pan ?? "—"}</td>
                        <td style={caTd}>{p.email ?? p.phone ?? "—"}</td>
                        <td style={caTd}>{p.payment_terms_days}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CACard>
        </>
      )}

      {tab === "items" && (
        <>
          {editable && (
            <CACard style={{ padding: 18, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
                <CAField label="Item name"><input value={iForm.name} onChange={(e) => setIForm({ ...iForm, name: e.target.value })} style={caInputStyle} /></CAField>
                <CAField label="SKU"><input value={iForm.sku} onChange={(e) => setIForm({ ...iForm, sku: e.target.value })} style={caInputStyle} /></CAField>
                <CAField label="HSN / SAC"><input value={iForm.hsn_code} onChange={(e) => setIForm({ ...iForm, hsn_code: e.target.value })} style={caInputStyle} /></CAField>
                <CAField label="UOM"><input value={iForm.uom} onChange={(e) => setIForm({ ...iForm, uom: e.target.value })} style={caInputStyle} /></CAField>
                <CAField label="Unit price (₹)"><input type="number" value={iForm.unit_price} onChange={(e) => setIForm({ ...iForm, unit_price: e.target.value })} style={caInputStyle} /></CAField>
                <CAField label="GST rate (%)"><input type="number" value={iForm.gst_rate} onChange={(e) => setIForm({ ...iForm, gst_rate: e.target.value })} style={caInputStyle} /></CAField>
              </div>
              <div style={{ marginTop: 14 }}><CAButton onClick={addItem}>Add item</CAButton></div>
            </CACard>
          )}
          <CACard style={{ padding: 4 }}>
            {items.length === 0 ? <CAEmpty title="No items yet" hint="Add the goods or services this client sells to enable item-level analysis." /> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["Item", "SKU", "HSN/SAC", "UOM", "Unit price", "GST"].map((h) => <th key={h} style={caTh}>{h}</th>)}</tr></thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id}>
                        <td style={caTd}>{i.name}</td>
                        <td style={{ ...caTd, fontFamily: CA.mono, fontSize: 12 }}>{i.sku ?? "—"}</td>
                        <td style={{ ...caTd, fontFamily: CA.mono, fontSize: 12 }}>{i.hsn_code ?? "—"}</td>
                        <td style={caTd}>{i.uom}</td>
                        <td style={caTd}>{i.unit_price === null ? "—" : inr(i.unit_price)}</td>
                        <td style={caTd}>{i.gst_rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CACard>
        </>
      )}

      {tab === "currency" && (
        <>
          {editable && (
            <CACard style={{ padding: 18, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
                <CAField label="Base currency"><input value={fForm.base_currency} onChange={(e) => setFForm({ ...fForm, base_currency: e.target.value })} style={caInputStyle} /></CAField>
                <CAField label="Quote currency"><input value={fForm.quote_currency} onChange={(e) => setFForm({ ...fForm, quote_currency: e.target.value })} style={caInputStyle} /></CAField>
                <CAField label="Rate"><input type="number" step="0.0001" value={fForm.rate} onChange={(e) => setFForm({ ...fForm, rate: e.target.value })} style={caInputStyle} /></CAField>
                <CAField label="Rate date"><input type="date" value={fForm.rate_date} onChange={(e) => setFForm({ ...fForm, rate_date: e.target.value })} style={caInputStyle} /></CAField>
              </div>
              <div style={{ marginTop: 14 }}><CAButton onClick={addRate}>Record rate</CAButton></div>
            </CACard>
          )}
          <CACard style={{ padding: 4 }}>
            {rates.length === 0 ? <CAEmpty title="No exchange rates recorded" hint="Record dated rates to translate foreign-currency transactions into INR." /> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["Pair", "Rate", "Date", "Source"].map((h) => <th key={h} style={caTh}>{h}</th>)}</tr></thead>
                  <tbody>
                    {rates.map((r) => (
                      <tr key={r.id}>
                        <td style={{ ...caTd, fontFamily: CA.mono }}>{r.base_currency}/{r.quote_currency}</td>
                        <td style={{ ...caTd, fontFamily: CA.mono, fontVariantNumeric: "tabular-nums" }}>{Number(r.rate).toFixed(4)}</td>
                        <td style={caTd}>{dateIN(r.rate_date)}</td>
                        <td style={caTd}>{r.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CACard>
        </>
      )}

      {tab === "custom" && (
        <>
          {editable && (
            <CACard style={{ padding: 18, marginBottom: 16 }}>
              <div style={{ fontFamily: CA.serif, fontSize: 16, fontWeight: 700, color: CA.ink, marginBottom: 12 }}>Define a firm-wide custom field</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                <CAField label="Label"><input value={cForm.label} onChange={(e) => setCForm({ ...cForm, label: e.target.value })} placeholder="e.g. Relationship manager" style={caInputStyle} /></CAField>
                <CAField label="Type">
                  <select value={cForm.field_type} onChange={(e) => setCForm({ ...cForm, field_type: e.target.value })} style={caInputStyle}>
                    {["text", "number", "date", "select", "boolean"].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </CAField>
                {cForm.field_type === "select" && (
                  <CAField label="Options (comma separated)"><input value={cForm.options} onChange={(e) => setCForm({ ...cForm, options: e.target.value })} style={caInputStyle} /></CAField>
                )}
                <CAField label="Required">
                  <select value={cForm.is_required ? "yes" : "no"} onChange={(e) => setCForm({ ...cForm, is_required: e.target.value === "yes" })} style={caInputStyle}>
                    <option value="no">No</option><option value="yes">Yes</option>
                  </select>
                </CAField>
              </div>
              <div style={{ marginTop: 14 }}><CAButton onClick={addFieldDef}>Add field</CAButton></div>
            </CACard>
          )}

          <CACard style={{ padding: 18 }}>
            <div style={{ fontFamily: CA.serif, fontSize: 16, fontWeight: 700, color: CA.ink, marginBottom: 12 }}>
              Values for this client
            </div>
            {defs.length === 0 ? (
              <CAEmpty title="No custom fields defined" hint="Define fields once for the firm, then capture their value on every client." />
            ) : !businessId ? (
              <CAEmpty title="Select a client" hint="Pick a client above to capture custom field values." />
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {defs.map((d) => (
                  <div key={d.id} style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <CAField label={`${d.label}${d.is_required ? " *" : ""}`}>
                        {d.field_type === "select" ? (
                          <select
                            value={values[d.id] ?? ""} disabled={!editable}
                            onChange={(e) => saveFieldValue(d.id, e.target.value)} style={caInputStyle}
                          >
                            <option value="">—</option>
                            {(Array.isArray(d.options) ? (d.options as string[]) : []).map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : d.field_type === "boolean" ? (
                          <select
                            value={values[d.id] ?? ""} disabled={!editable}
                            onChange={(e) => saveFieldValue(d.id, e.target.value)} style={caInputStyle}
                          >
                            <option value="">—</option><option value="true">Yes</option><option value="false">No</option>
                          </select>
                        ) : (
                          <input
                            type={d.field_type === "number" ? "number" : d.field_type === "date" ? "date" : "text"}
                            defaultValue={values[d.id] ?? ""} disabled={!editable}
                            onBlur={(e) => { if (e.target.value !== (values[d.id] ?? "")) saveFieldValue(d.id, e.target.value); }}
                            style={caInputStyle}
                          />
                        )}
                      </CAField>
                    </div>
                    <CABadge tone="grey">{d.field_type}</CABadge>
                    {editable && (
                      <button onClick={() => removeFieldDef(d.id)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: CA.sans, fontSize: 12, fontWeight: 600, color: CA.muted, paddingBottom: 10 }}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CACard>
        </>
      )}
    </div>
  );

}
