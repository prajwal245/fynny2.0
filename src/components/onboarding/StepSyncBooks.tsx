import { useState, useRef } from "react";
import { Check, X, Upload, ChevronDown, ChevronUp } from "lucide-react";
import FloatingSelectionCounter from "./FloatingSelectionCounter";

const SOFTWARE = [
  {
    id: "tally", name: "Tally Prime", initial: "T", color: "#E0341A",
    sub: "ODBC agent, syncs every 2 hours automatically",
    badge: "Most used in India", badgeBg: "hsl(var(--fyn-gold-light))", badgeColor: "hsl(var(--fyn-gold))",
  },
  {
    id: "zoho", name: "Zoho Books", initial: "Z", color: "#E61F25",
    sub: "OAuth, connects instantly",
  },
  {
    id: "quickbooks", name: "QuickBooks India", initial: "QB", color: "#2CA01C",
    sub: "OAuth, connects instantly",
  },
  {
    id: "busy", name: "Busy Accounting", initial: "B", color: "#1565C0",
    sub: "CSV export, manual upload",
    badge: "CSV import", badgeBg: "hsl(var(--fyn-info-bg))", badgeColor: "hsl(var(--fyn-info))",
  },
  {
    id: "marg", name: "Marg ERP", initial: "M", color: "#0D47A1",
    sub: "ODBC connector, same as Tally",
  },
  {
    id: "csv", name: "Excel or CSV upload", initial: "XL", color: "#217346",
    sub: "Universal, works with any software",
    badge: "Universal", badgeBg: "hsl(var(--fyn-success-bg))", badgeColor: "hsl(var(--fyn-success))",
  },
];

interface Props {
  selectedSoftware: string[];
  setSelectedSoftware: (s: string[]) => void;
  onContinue: () => void;
  onBack: () => void;
}

const StepSyncBooks = ({ selectedSoftware, setSelectedSoftware, onContinue, onBack }: Props) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [skipSelected, setSkipSelected] = useState(false);
  const [csvFiles, setCsvFiles] = useState<File[]>([]);
  const csvRef = useRef<HTMLInputElement>(null);

  const toggle = (id: string) => {
    if (selectedSoftware.includes(id)) {
      setSelectedSoftware(selectedSoftware.filter((s) => s !== id));
      if (expandedId === id) setExpandedId(null);
    } else {
      setSelectedSoftware([...selectedSoftware, id]);
      setExpandedId(id);
      setSkipSelected(false);
    }
  };

  const canContinue = selectedSoftware.length > 0 || skipSelected;

  const btnLabel =
    selectedSoftware.length === 0
      ? "Select a source to continue"
      : `Continue with ${selectedSoftware.length} source${selectedSoftware.length > 1 ? "s" : ""} →`;

  return (
    <div>
      <h1 className="text-3xl font-serif mb-2" style={{ color: "hsl(var(--fyn-ink))" }}>
        Sync your accounting software
      </h1>
      <p className="mb-8 text-sm" style={{ color: "hsl(var(--fyn-ink) / 0.60)" }}>
        Connect all the accounting tools your business uses. FynHelp reads your invoices, bills, and ledger entries from each one and merges them automatically.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
        {/* LEFT, Software Selection */}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] mb-3 text-secondary-foreground">
            Your accounting software
          </p>

          <div className="space-y-2">
            {SOFTWARE.map((sw) => {
              const selected = selectedSoftware.includes(sw.id);
              const expanded = expandedId === sw.id && selected;

              return (
                <div key={sw.id}>
                  <button
                    onClick={() => toggle(sw.id)}
                    className="w-full h-[72px] flex items-center gap-3 px-4 rounded-lg border-[1.5px] text-left transition-all duration-200 text-secondary-foreground"
                    style={{
                      borderColor: selected ? "#C41E1E" : "hsl(var(--fyn-ink) / 0.10)",
                      background: selected ? "#FDF2F1" : "#FFFFFF",
                      borderRadius: expanded ? "8px 8px 0 0" : "8px",
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                      style={{ background: sw.color, fontSize: sw.initial.length > 1 ? "10px" : "12px" }}
                    >
                      {sw.initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: "hsl(var(--fyn-ink))" }}>{sw.name}</p>
                      <p className="text-xs text-secondary-foreground">{sw.sub}</p>
                    </div>
                    {sw.badge && (
                      <span
                        className="text-[10px] font-medium tracking-wide px-2.5 py-1 rounded shrink-0"
                        style={{ background: sw.badgeBg, color: sw.badgeColor }}
                      >
                        {sw.badge}
                      </span>
                    )}
                    <div
                      className="w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-colors"
                      style={{
                        borderColor: selected ? "#C41E1E" : "hsl(var(--fyn-ink) / 0.20)",
                        background: selected ? "#C41E1E" : "transparent",
                      }}
                    >
                      {selected && <Check size={10} className="text-white" />}
                    </div>
                  </button>

                  {/* Expansion panels */}
                  {expanded && sw.id === "tally" && (
                    <TallyExpansion />
                  )}
                  {expanded && (sw.id === "zoho" || sw.id === "quickbooks") && (
                    <OAuthExpansion name={sw.name} />
                  )}
                  {expanded && sw.id === "busy" && (
                    <BusyExpansion />
                  )}
                  {expanded && sw.id === "marg" && (
                    <TallyExpansion label="Marg ERP" />
                  )}
                  {expanded && sw.id === "csv" && (
                    <CsvExpansion files={csvFiles} setFiles={setCsvFiles} fileRef={csvRef} />
                  )}
                </div>
              );
            })}

            {/* Skip option */}
            <button
              onClick={() => { setSkipSelected(true); setSelectedSoftware([]); }}
              className="w-full h-[72px] flex items-center gap-3 px-4 rounded-lg text-left transition-all duration-200"
              style={{
                border: skipSelected ? "1.5px solid #C41E1E" : "1.5px dashed hsl(var(--fyn-ink) / 0.15)",
                background: skipSelected ? "#FDF2F1" : "transparent",
              }}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "hsl(var(--fyn-beige-deep))" }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="hsl(var(--fyn-ink) / 0.40)" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="8" cy="8" r="6.5" /><path d="M8 4.5V8L10 10" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: "hsl(var(--fyn-ink))" }}>Skip for now</p>
                <p className="text-xs text-secondary-foreground">You can connect anytime from Settings</p>
              </div>
            </button>
          </div>
        </div>

        {/* RIGHT, Sync status panel */}
        <div className="lg:sticky lg:top-32 self-start">
          <h3 className="text-[15px] font-semibold mb-1" style={{ color: "hsl(var(--fyn-ink))" }}>Syncing from</h3>
          <p className="text-xs mb-4 text-accent">
            {selectedSoftware.length} source{selectedSoftware.length !== 1 ? "s" : ""} connected
          </p>

          {selectedSoftware.length === 0 ? (
            <div className="text-center py-10">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="mx-auto mb-3">
                <rect x="8" y="12" width="32" height="24" rx="3" fill="hsl(var(--fyn-beige-deep))" stroke="hsl(var(--fyn-ink) / 0.20)" strokeWidth="1.5" />
                <line x1="14" y1="20" x2="34" y2="20" stroke="hsl(var(--fyn-ink) / 0.15)" strokeWidth="1.5" />
                <line x1="14" y1="26" x2="28" y2="26" stroke="hsl(var(--fyn-ink) / 0.15)" strokeWidth="1.5" />
                <line x1="14" y1="30" x2="22" y2="30" stroke="hsl(var(--fyn-ink) / 0.15)" strokeWidth="1.5" />
              </svg>
              <p className="text-sm text-secondary-foreground">
                Select your accounting software to begin.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedSoftware.map((id, i) => {
                const sw = SOFTWARE.find((s) => s.id === id)!;
                return (
                  <div
                    key={id}
                    className="flex items-center gap-3 p-2.5 rounded-lg border bg-white"
                    style={{
                      borderColor: "hsl(var(--fyn-ink) / 0.08)",
                      animation: `fade-in 250ms ease-out ${i * 60}ms both`,
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                      style={{ background: sw.color, fontSize: sw.initial.length > 1 ? "9px" : "11px" }}
                    >
                      {sw.initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate" style={{ color: "hsl(var(--fyn-ink))" }}>{sw.name}</p>
                      <p className="text-[11px]" style={{ color: "hsl(var(--fyn-ink) / 0.40)" }}>Ready to sync</p>
                    </div>
                    <button onClick={() => toggle(id)} className="shrink-0 transition-colors hover:text-[#C41E1E]" style={{ color: "hsl(var(--fyn-ink) / 0.30)" }}>
                      <X size={16} />
                    </button>
                  </div>
                );
              })}

              {selectedSoftware.length >= 2 && (
                <div className="mt-3 p-3 rounded text-xs" style={{ background: "hsl(var(--fyn-warning-bg))", color: "hsl(var(--fyn-warning))" }}>
                  FynHelp will automatically detect and deduplicate transactions that appear in multiple sources.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="flex items-center justify-between mt-10 pt-6" style={{ borderTop: "1px solid hsl(var(--fyn-ink) / 0.08)" }}>
        <button onClick={onBack} className="text-[13px] font-medium" style={{ color: "hsl(var(--fyn-ink) / 0.60)" }}>
          ← Back to banks
        </button>
        <div className="flex items-center gap-4">
          <button onClick={() => { setSkipSelected(true); onContinue(); }} className="text-[13px] hover:underline text-secondary-foreground">
            I'll set this up later →
          </button>
          <button
            onClick={onContinue}
            disabled={!canContinue}
            className="px-8 py-3 rounded-lg font-medium text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "hsl(var(--fyn-red))" }}
          >
            {btnLabel}
          </button>
        </div>
      </div>

      {/* BACKEND: GET /api/integrations/tally/test */}
      {/* BACKEND: GET /api/integrations/zoho/oauth-url */}
      {/* BACKEND: GET /api/integrations/quickbooks/oauth-url */}
      {/* BACKEND: POST /api/integrations/busy/import */}
      {/* BACKEND: POST /api/integrations/csv/import */}
      {/* BACKEND: POST /api/integrations/deduplicate */}

      <FloatingSelectionCounter count={selectedSoftware.length} onClearAll={() => setSelectedSoftware([])} />
    </div>
  );
};

/* Expansion sub-components */

const expansionStyle: React.CSSProperties = {
  background: "#FAF7F0",
  border: "1px solid rgba(196,30,30,0.15)",
  borderTop: "none",
  borderRadius: "0 0 8px 8px",
  padding: "14px 16px",
  animation: "accordion-down 300ms ease-out",
};

const TallyExpansion = ({ label = "Tally Prime" }: { label?: string }) => (
  <div style={expansionStyle}>
    <p className="text-xs mb-3" style={{ color: "hsl(var(--fyn-ink) / 0.60)" }}>
      {label} connects via a lightweight ODBC agent installed on the computer where it's running.
    </p>
    <div className="space-y-2 mb-4">
      {[`${label} 2.0 or higher is installed`, "I have administrator access", `${label} is currently open and running`].map((req) => (
        <label key={req} className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "hsl(var(--fyn-ink) / 0.70)" }}>
          <input type="checkbox" className="rounded" /> {req}
        </label>
      ))}
    </div>
    <button className="w-full py-2.5 rounded-lg text-sm font-medium border transition-colors" style={{ borderColor: "hsl(var(--fyn-ink) / 0.20)", color: "hsl(var(--fyn-ink))" }}>
      Download {label} ODBC Agent (Windows, 2.3MB)
    </button>
    <button className="w-full py-2.5 rounded-lg text-sm font-medium text-white mt-2" style={{ background: "hsl(var(--fyn-red))" }}>
      Test Connection
    </button>
  </div>
);

const OAuthExpansion = ({ name }: { name: string }) => (
  <div style={expansionStyle}>
    <p className="text-xs mb-3" style={{ color: "hsl(var(--fyn-ink) / 0.60)" }}>
      Connect your {name} account securely via OAuth. You'll be redirected to authorise access.
    </p>
    <button className="w-full py-2.5 rounded-lg text-sm font-medium text-white" style={{ background: "hsl(var(--fyn-red))" }}>
      Connect {name} →
    </button>
  </div>
);

const BusyExpansion = () => (
  <div style={expansionStyle}>
    <p className="text-xs mb-3" style={{ color: "hsl(var(--fyn-ink) / 0.60)" }}>
      Export your data from Busy and upload it here.
    </p>
    <ol className="text-xs space-y-1 mb-4 list-decimal list-inside" style={{ color: "hsl(var(--fyn-ink) / 0.60)" }}>
      <li>In Busy: Reports → Export → Ledger Report → Export as CSV</li>
      <li>In Busy: Reports → Export → Outstanding Report → Export as CSV</li>
      <li>Upload both files below</li>
    </ol>
    <div className="grid grid-cols-2 gap-3">
      {["Ledger Report CSV", "Outstanding Report CSV"].map((label) => (
        <div key={label} className="border-2 border-dashed rounded-lg h-20 flex items-center justify-center cursor-pointer" style={{ borderColor: "hsl(var(--fyn-ink) / 0.12)" }}>
          <span className="text-xs text-center px-2" style={{ color: "hsl(var(--fyn-ink) / 0.40)" }}>{label}</span>
        </div>
      ))}
    </div>
  </div>
);

const CsvExpansion = ({ files, setFiles, fileRef }: { files: File[]; setFiles: (f: File[]) => void; fileRef: React.RefObject<HTMLInputElement | null> }) => (
  <div style={expansionStyle}>
    <p className="text-xs mb-3" style={{ color: "hsl(var(--fyn-ink) / 0.60)" }}>
      Upload any Excel or CSV file containing your transactions, invoices, or financial data. FynHelp's AI column mapper will detect the structure automatically.
    </p>
    <div
      className="border-2 border-dashed rounded-lg h-[120px] flex flex-col items-center justify-center cursor-pointer"
      style={{ borderColor: "hsl(var(--fyn-ink) / 0.12)", background: "hsl(var(--fyn-beige-card))" }}
      onClick={() => fileRef.current?.click()}
    >
      <Upload size={24} style={{ color: "hsl(var(--fyn-ink) / 0.30)" }} />
      <p className="text-sm mt-2" style={{ color: "hsl(var(--fyn-ink) / 0.60)" }}>Drop your Excel or CSV files here</p>
      <p className="text-xs" style={{ color: "hsl(var(--fyn-ink) / 0.40)" }}>Multiple files accepted · Max 50MB per file</p>
    </div>
    <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" multiple className="hidden" onChange={(e) => {
      if (e.target.files) setFiles([...files, ...Array.from(e.target.files)]);
    }} />
    {files.length > 0 && (
      <div className="flex flex-wrap gap-2 mt-2">
        {files.map((f, i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1 rounded text-xs" style={{ background: "hsl(var(--fyn-beige-dark))" }}>
            {f.name}
            <button onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={10} /></button>
          </div>
        ))}
      </div>
    )}
  </div>
);

export default StepSyncBooks;
