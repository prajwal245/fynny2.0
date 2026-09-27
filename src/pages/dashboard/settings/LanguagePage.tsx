import { useState } from "react";
import { toast } from "sonner";

const Card = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => (
  <div className="bg-card border rounded-lg p-6 mb-6" style={{ borderColor: "#E0D9C8" }}>
    <h3 className="font-semibold text-[15px]" style={{ color: "#171208" }}>{title}</h3>
    {sub && <p className="text-[12px] mt-1 mb-4" style={{ color: "rgba(23,18,8,0.60)" }}>{sub}</p>}
    <div className="mt-4 space-y-4">{children}</div>
  </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="block text-[13px] font-medium mb-1.5" style={{ color: "#171208" }}>{label}</label>
    {children}
  </div>
);

const selectCls =
  "w-full h-10 px-3 rounded-md border bg-card text-[14px] focus:outline-hidden focus:ring-2 focus:ring-[#A93838]/30";

const SaveBtn = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="px-5 py-2.5 rounded-md text-sm font-semibold text-white"
    style={{ background: "#A93838" }}>Save changes</button>
);

const LanguagePage = () => {
  const [language, setLanguage] = useState("en");
  const [tz, setTz] = useState("Asia/Kolkata");
  const [dateFmt, setDateFmt] = useState("DD/MM/YYYY");
  const [numFmt, setNumFmt] = useState("indian");
  const [fyStart, setFyStart] = useState("April");

  return (
    <div className="max-w-3xl">
      <h2 className="font-serif text-2xl font-bold mb-1" style={{ color: "#171208" }}>Language & Region</h2>
      <p className="text-[13px] mb-6" style={{ color: "rgba(23,18,8,0.60)" }}>Set your preferred language, timezone and number formats.</p>

      <Card title="Language">
        <Field label="Display language">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className={selectCls} style={{ borderColor: "#E0D9C8" }}>
            <option value="en">English</option>
            <option value="hi" disabled>Hindi (coming soon)</option>
            <option value="ta" disabled>Tamil (coming soon)</option>
            <option value="te" disabled>Telugu (coming soon)</option>
            <option value="kn" disabled>Kannada (coming soon)</option>
          </select>
        </Field>
        <SaveBtn onClick={() => toast.success("Language saved")} />
      </Card>

      <Card title="Regional Settings">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Country"><input disabled value="India" className={selectCls} style={{ borderColor: "#E0D9C8", background: "#FAF7F0" }} /></Field>
          <Field label="Currency"><input disabled value="INR ₹" className={selectCls} style={{ borderColor: "#E0D9C8", background: "#FAF7F0" }} /></Field>
          <Field label="Timezone">
            <select value={tz} onChange={(e) => setTz(e.target.value)} className={selectCls} style={{ borderColor: "#E0D9C8" }}>
              <option value="Asia/Kolkata">Asia/Kolkata (IST UTC+5:30)</option>
              <option value="Asia/Dubai">Asia/Dubai (GST UTC+4:00)</option>
              <option value="UTC">UTC</option>
            </select>
          </Field>
          <Field label="Date format">
            <select value={dateFmt} onChange={(e) => setDateFmt(e.target.value)} className={selectCls} style={{ borderColor: "#E0D9C8" }}>
              <option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option>
            </select>
          </Field>
          <Field label="Number format">
            <select value={numFmt} onChange={(e) => setNumFmt(e.target.value)} className={selectCls} style={{ borderColor: "#E0D9C8" }}>
              <option value="indian">Indian (1,00,000)</option>
              <option value="intl">International (100,000)</option>
            </select>
          </Field>
          <Field label="Financial year start">
            <select value={fyStart} onChange={(e) => setFyStart(e.target.value)} className={selectCls} style={{ borderColor: "#E0D9C8" }}>
              <option>April</option><option>January</option><option>July</option>
            </select>
          </Field>
        </div>
        <SaveBtn onClick={() => toast.success("Regional settings saved")} />
      </Card>
    </div>
  );
};

export default LanguagePage;
