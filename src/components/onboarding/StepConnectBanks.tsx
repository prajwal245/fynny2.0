import { useState, useRef } from "react";
import { Check, X, Search } from "lucide-react";
import FloatingSelectionCounter from "./FloatingSelectionCounter";

const BANKS = [
  { name: "HDFC Bank", color: "#004C8F" },
  { name: "ICICI Bank", color: "#F7941D" },
  { name: "State Bank of India", color: "#2D6DB5" },
  { name: "Axis Bank", color: "#800000" },
  { name: "Kotak Mahindra Bank", color: "#EE3124" },
  { name: "Yes Bank", color: "#1F3A8A" },
  { name: "IndusInd Bank", color: "#98272A" },
  { name: "Punjab National Bank", color: "#003087" },
  { name: "Bank of Baroda", color: "#F58220" },
  { name: "Canara Bank", color: "#003C71" },
  { name: "Union Bank of India", color: "#00529B" },
  { name: "UCO Bank", color: "#1A4E8C" },
  { name: "IDFC First Bank", color: "#A61F25" },
  { name: "Federal Bank", color: "#E31E26" },
  { name: "RBL Bank", color: "#171208" },
  { name: "Bandhan Bank", color: "#171208" },
  { name: "South Indian Bank", color: "#171208" },
  { name: "Karur Vysya Bank", color: "#171208" },
  { name: "City Union Bank", color: "#171208" },
  { name: "Dhanlaxmi Bank", color: "#171208" },
  { name: "Saraswat Bank", color: "#171208" },
  { name: "NSDL Payments Bank", color: "#171208" },
  { name: "Airtel Payments Bank", color: "#171208" },
  { name: "Paytm Payments Bank", color: "#171208" },
];

interface Props {
  selectedBanks: string[];
  setSelectedBanks: (banks: string[]) => void;
  onContinue: () => void;
  onSkip: () => void;
}

const StepConnectBanks = ({ selectedBanks, setSelectedBanks, onContinue, onSkip }: Props) => {
  const [search, setSearch] = useState("");
  const [showPdfUpload, setShowPdfUpload] = useState(false);
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [showSkipWarning, setShowSkipWarning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = BANKS.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()));

  const toggle = (name: string) => {
    setSelectedBanks(
      selectedBanks.includes(name)
        ? selectedBanks.filter((b) => b !== name)
        : [...selectedBanks, name]
    );
  };

  const handleContinue = () => {
    if (selectedBanks.length === 0) return;
    onContinue();
  };

  const btnLabel =
    selectedBanks.length === 0
      ? "Select at least one bank to continue"
      : `Continue with ${selectedBanks.length} bank${selectedBanks.length > 1 ? "s" : ""} →`;

  return (
    <div>
      <h1 className="text-3xl font-serif mb-2" style={{ color: "hsl(var(--fyn-ink))" }}>
        Connect your bank accounts
      </h1>
      <p className="mb-8 text-sm text-secondary-foreground">
        Connect all your business bank accounts at once. FynHelp aggregates them into one unified cash view.
        Uses RBI's Account Aggregator, your login credentials are never shared with us.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
        {/* LEFT, Bank Selection */}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] mb-3 text-secondary-foreground">
            Select your banks
          </p>

          {/* Search */}
          <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(var(--fyn-ink) / 0.40)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bank name..."
              className="w-full h-9 pl-9 pr-8 text-sm rounded border text-secondary-foreground"
              style={{
                background: "hsl(var(--fyn-beige-card))",
                borderColor: "hsl(var(--fyn-ink) / 0.10)",
              }}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X size={14} style={{ color: "hsl(var(--fyn-ink) / 0.40)" }} />
              </button>
            )}
          </div>

          {/* Bank grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[360px] overflow-y-auto pr-1">
            {filtered.map((bank) => {
              const selected = selectedBanks.includes(bank.name);
              const initial = bank.name.split(" ").map((w) => w[0]).join("").slice(0, 2);
              return (
                <button
                  key={bank.name}
                  onClick={() => toggle(bank.name)}
                  className="h-16 flex items-center gap-2.5 px-3.5 rounded-lg border-[1.5px] text-left transition-all duration-200"
                  style={{
                    borderColor: selected ? "#C41E1E" : "hsl(var(--fyn-ink) / 0.10)",
                    background: selected ? "#FDF2F1" : "#FFFFFF",
                  }}
                >
                  <div className="relative shrink-0">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ background: bank.color }}
                    >
                      {initial}
                    </div>
                    {selected && (
                      <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#C41E1E]" />
                    )}
                  </div>
                  <span className="text-[13px] font-medium flex-1 leading-tight" style={{ color: "hsl(var(--fyn-ink))" }}>
                    {bank.name}
                  </span>
                  <div
                    className="w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-colors duration-200"
                    style={{
                      borderColor: selected ? "#C41E1E" : "hsl(var(--fyn-ink) / 0.20)",
                      background: selected ? "#C41E1E" : "transparent",
                    }}
                  >
                    {selected && <Check size={10} className="text-white" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* PDF upload link */}
          <button
            onClick={() => setShowPdfUpload(!showPdfUpload)}
            className="mt-4 text-[13px] hover:underline transition-colors text-secondary-foreground"
          >
            Can't find your bank? Upload a PDF statement instead →
          </button>

          {showPdfUpload && (
            <div className="mt-3 overflow-hidden" style={{ animation: "accordion-down 300ms ease-out" }}>
              <div
                className="border-2 border-dashed rounded-lg h-16 flex items-center justify-center cursor-pointer"
                style={{ borderColor: "hsl(var(--fyn-ink) / 0.15)" }}
                onClick={() => fileRef.current?.click()}
              >
                <span className="text-sm" style={{ color: "hsl(var(--fyn-ink) / 0.40)" }}>
                  Drop your PDF bank statement here
                </span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) setPdfFiles([...pdfFiles, ...Array.from(e.target.files)]);
                }}
              />
              {pdfFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {pdfFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded text-sm" style={{ background: "hsl(var(--fyn-beige-dark))" }}>
                      <span style={{ color: "hsl(var(--fyn-ink))" }}>{f.name}</span>
                      <span className="text-xs" style={{ color: "hsl(var(--fyn-ink) / 0.40)" }}>
                        {(f.size / 1024).toFixed(0)}KB
                      </span>
                      <button onClick={() => setPdfFiles(pdfFiles.filter((_, j) => j !== i))}>
                        <X size={12} style={{ color: "hsl(var(--fyn-ink) / 0.40)" }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs mt-2" style={{ color: "hsl(var(--fyn-ink) / 0.40)" }}>All Indian bank formats supported</p>
            </div>
          )}
        </div>

        {/* RIGHT, Connected banks panel */}
        <div className="lg:sticky lg:top-32 self-start">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[15px] font-semibold" style={{ color: "hsl(var(--fyn-ink))" }}>Connected accounts</h3>
          </div>
          <p className="text-xs mb-4 text-secondary-foreground">
            {selectedBanks.length} account{selectedBanks.length !== 1 ? "s" : ""} selected
          </p>

          {selectedBanks.length === 0 ? (
            <div className="text-center py-10">
              <div className="flex justify-center mb-3">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="18" cy="24" r="14" fill="hsl(var(--fyn-beige-dark))" stroke="hsl(var(--fyn-ink) / 0.20)" strokeWidth="1.5" />
                  <circle cx="30" cy="24" r="14" fill="hsl(var(--fyn-beige-dark))" stroke="hsl(var(--fyn-ink) / 0.20)" strokeWidth="1.5" />
                  <circle cx="24" cy="20" r="14" fill="hsl(var(--fyn-beige-dark))" stroke="hsl(var(--fyn-ink) / 0.20)" strokeWidth="1.5" />
                </svg>
              </div>
              <p className="text-sm text-secondary-foreground">
                Select banks on the left to connect them.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedBanks.map((name, i) => {
                const bank = BANKS.find((b) => b.name === name);
                const initial = name.split(" ").map((w) => w[0]).join("").slice(0, 2);
                return (
                  <div
                    key={name}
                    className="flex items-center gap-3 p-2.5 rounded-lg border bg-white"
                    style={{
                      borderColor: "hsl(var(--fyn-ink) / 0.08)",
                      animation: `fade-in 250ms ease-out ${i * 60}ms both`,
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ background: bank?.color || "#171208" }}
                    >
                      {initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate" style={{ color: "hsl(var(--fyn-ink))" }}>{name}</p>
                      <p className="text-[11px]" style={{ color: "hsl(var(--fyn-ink) / 0.40)" }}>Ready to connect</p>
                    </div>
                    <button onClick={() => toggle(name)} className="shrink-0 transition-colors hover:text-[#C41E1E]" style={{ color: "hsl(var(--fyn-ink) / 0.30)" }}>
                      <X size={16} />
                    </button>
                  </div>
                );
              })}

              {selectedBanks.length === 1 && (
                <div className="mt-3 p-3 rounded text-xs" style={{ background: "hsl(var(--fyn-gold-light))", color: "hsl(var(--fyn-gold))" }}>
                  Tip: Businesses with 2+ bank accounts connected get 40% more accurate cash flow projections.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="flex items-center justify-between mt-10 pt-6" style={{ borderTop: "1px solid hsl(var(--fyn-ink) / 0.08)" }}>
        <button
          onClick={onSkip}
          className="px-5 py-2.5 rounded-lg text-sm font-medium"
          style={{
            background: "#FFFFFF",
            color: "hsl(var(--fyn-ink))",
            border: "1.5px solid rgba(23,18,8,0.18)",
            cursor: "pointer",
          }}
        >
          Skip for now →
        </button>
        <button
          onClick={handleContinue}
          disabled={selectedBanks.length === 0}
          className="px-8 py-3 rounded-lg font-medium text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "hsl(var(--fyn-red))" }}
        >
          {btnLabel}
        </button>
      </div>

      {/* BACKEND: POST /api/onboarding/connect-bank */}
      {/* Initiates RBI Account Aggregator consent flow */}
      {/* Required: business_id, bank_ids[] */}
      {/* Returns: consent_url per bank */}
      {/* BACKEND: GET /api/onboarding/bank-status?business_id=X */}
      {/* Polls connection status every 3s while CONNECTING */}

      <FloatingSelectionCounter count={selectedBanks.length} onClearAll={() => setSelectedBanks([])} />
    </div>
  );
};

export default StepConnectBanks;
