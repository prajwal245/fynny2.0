import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "@/lib/router-compat";
import { Lock, Download, ArrowRight, Shield } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { SCENARIOS, type Tone, type ScenarioResult } from "./simulator/scenarios";
import SignupGateModal from "./simulator/SignupGateModal";

const toneClasses: Record<Tone, { bg: string; border: string; text: string }> = {
  good: { bg: "bg-fyn-success/8", border: "border-fyn-success/25", text: "text-fyn-success" },
  warn: { bg: "bg-fyn-warning/8", border: "border-fyn-warning/25", text: "text-fyn-warning" },
  bad: { bg: "bg-fyn-red/8", border: "border-fyn-red/25", text: "text-fyn-red" },
  neutral: { bg: "bg-fyn-ink/5", border: "border-fyn-ink/10", text: "text-fyn-ink" },
};

/* Animated counter for numeric values inside metric cards */
function AnimatedValue({ value }: { value: string }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  useEffect(() => {
    if (prevRef.current === value) return;
    prevRef.current = value;
    setDisplay(value);
  }, [value]);
  return (
    <span
      key={display}
      className="inline-block animate-[fade-in_0.25s_ease-out]"
      style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700 }}
    >
      {display}
    </span>
  );
}

export default function SimulatorSection() {
  const ref = useScrollReveal();
  const [activeIdx, setActiveIdx] = useState(0);
  const scenario = SCENARIOS[activeIdx];

  // Per-scenario input state (keyed by scenario id), preserves values when switching
  const [stateMap, setStateMap] = useState<Record<string, Record<string, number | string>>>(() => {
    const m: Record<string, Record<string, number | string>> = {};
    SCENARIOS.forEach((sc) => {
      const init: Record<string, number | string> = {};
      sc.inputs.forEach((inp) => {
        if (inp.kind === "slider") init[inp.key] = inp.default;
        else if (inp.kind === "select") init[inp.key] = inp.default;
      });
      m[sc.id] = init;
    });
    return m;
  });

  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);

  const state = stateMap[scenario.id];
  const result: ScenarioResult = useMemo(() => scenario.compute(state), [scenario, state]);

  const updateInput = (key: string, value: number | string) => {
    setStateMap((m) => ({ ...m, [scenario.id]: { ...m[scenario.id], [key]: value } }));
  };

  // If "role" select changes in Hiring scenario, auto-update salary
  const onSelectChange = (key: string, value: string) => {
    updateInput(key, value);
    if (scenario.id === "hiring" && key === "role") {
      const opt = (scenario.inputs.find((i) => i.kind === "select" && i.key === "role") as
        | { options: { value: string; meta?: Record<string, number> }[] }
        | undefined)?.options.find((o) => o.value === value);
      if (opt?.meta?.salary) updateInput("salary", opt.meta.salary);
    }
  };

  const isUnlocked = !!unlocked[scenario.id];

  return (
    <section className="bg-fyn-beige py-24" ref={ref}>
      <div className="fyn-container">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          {/* Left, Copy + Scenario tabs */}
          <div className="reveal-left">
            <span className="fyn-caption text-fyn-gold block mb-4 text-base">Decision Simulator</span>
            <h2
              className="text-3xl lg:text-[44px] leading-[1.15] text-fyn-ink mb-6"
              style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700 }}
            >
              Simulate every business decision before you make it.
            </h2>
            <p
              className="text-fyn-ink/65 text-lg leading-relaxed mb-8"
              style={{ fontFamily: "'Roboto', sans-serif" }}
            >
              Every major decision has a cash consequence. Extending credit terms. Hiring a senior engineer.
              Buying a new machine. FynHelp's Decision Simulator models any scenario against your live business
              data and shows you the exact cash impact.
            </p>

            <div className="flex flex-wrap gap-2 mb-8">
              {SCENARIOS.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setActiveIdx(i)}
                  className={`text-sm px-4 py-2 rounded-md transition-all duration-200 ${
                    activeIdx === i
                      ? "bg-fyn-ink text-white"
                      : "bg-fyn-ink/5 border border-fyn-ink/10 text-fyn-ink/65 hover:border-fyn-ink/30 hover:text-fyn-ink"
                  }`}
                  style={{ fontFamily: "'Raleway', sans-serif" }}
                >
                  {s.name}
                </button>
              ))}
            </div>

            <p
              className="text-sm italic mb-6 text-fyn-ink/55"
              style={{ fontFamily: "'Roboto', sans-serif" }}
            >
              Real scenarios built by our CA team from 500+ SME interviews.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 bg-fyn-red text-white font-semibold px-7 py-3 rounded-lg hover:bg-fyn-red/90 transition-colors"
              style={{ fontFamily: "'Raleway', sans-serif" }}
            >
              Try it with your data <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Right, Calculator */}
          <div className="bg-fyn-beige-card border border-fyn-ink/10 rounded-xl p-6 md:p-7 reveal-right">
            <h3
              className="text-xl text-fyn-ink mb-6"
              style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600 }}
            >
              {scenario.question}
            </h3>

            {/* Inputs */}
            <div className="space-y-5 mb-7">
              {scenario.inputs.map((inp) => {
                if (inp.kind === "display") {
                  return (
                    <div key={inp.key} className="flex justify-between items-center py-2 border-b border-dashed border-fyn-ink/10">
                      <span className="text-fyn-ink/55 text-xs uppercase tracking-wider" style={{ fontFamily: "'Raleway', sans-serif" }}>
                        {inp.label}
                      </span>
                      <span className="text-fyn-ink text-sm font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {inp.value}
                      </span>
                    </div>
                  );
                }
                if (inp.kind === "select") {
                  return (
                    <div key={inp.key}>
                      <label className="text-fyn-ink/55 text-[11px] uppercase tracking-wider block mb-2" style={{ fontFamily: "'Raleway', sans-serif" }}>
                        {inp.label}
                      </label>
                      <select
                        value={String(state[inp.key])}
                        onChange={(e) => onSelectChange(inp.key, e.target.value)}
                        className="w-full px-3 py-2 rounded-md border border-fyn-ink/15 bg-white/60 text-fyn-ink text-sm focus:outline-hidden focus:border-fyn-red focus:ring-2 focus:ring-fyn-red/15"
                        style={{ fontFamily: "'Roboto', sans-serif" }}
                      >
                        {inp.options.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  );
                }
                // slider
                const v = Number(state[inp.key]);
                const display = inp.format ? inp.format(v) : `${v}${inp.suffix ?? ""}`;
                return (
                  <div key={inp.key}>
                    <div className="flex justify-between mb-2">
                      <label className="text-fyn-ink/55 text-[11px] uppercase tracking-wider" style={{ fontFamily: "'Raleway', sans-serif" }}>
                        {inp.label}
                      </label>
                      <span className="text-fyn-ink text-sm font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {display}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={inp.min}
                      max={inp.max}
                      step={inp.step}
                      value={v}
                      onChange={(e) => updateInput(inp.key, +e.target.value)}
                      className="w-full h-2 rounded-full appearance-none bg-fyn-ink/10 cursor-grab active:cursor-grabbing
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-fyn-red [&::-webkit-slider-thumb]:shadow-md
                        [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:border-0
                        [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-fyn-red"
                    />
                  </div>
                );
              })}
            </div>

            {/* Live metrics */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {result.metrics.map((m) => {
                const c = toneClasses[m.tone];
                return (
                  <div key={m.label} className={`${c.bg} border ${c.border} rounded-lg p-4 text-center transition-colors duration-300`}>
                    <p className={`${c.text} text-xl md:text-2xl leading-tight`}>
                      <AnimatedValue value={m.value} />
                    </p>
                    <p className="text-fyn-ink/50 text-[11px] mt-1.5 uppercase tracking-wider" style={{ fontFamily: "'Raleway', sans-serif" }}>
                      {m.label}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Recommendations */}
            <div className="relative">
              <div className={`space-y-2 transition-all duration-300 ${isUnlocked ? "" : "select-none"}`}>
                {result.recs.map((r, i) => (
                  <div
                    key={r.label}
                    className="flex items-start gap-3 p-3 rounded-lg border border-fyn-ink/8 bg-white/40 hover:border-fyn-ink/20 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full bg-fyn-ink text-white flex items-center justify-center shrink-0 text-xs font-semibold">
                      {r.label}
                    </div>
                    <div className="flex-1">
                      <p className="text-fyn-ink text-sm font-medium" style={{ fontFamily: "'Raleway', sans-serif" }}>
                        {r.teaser}
                      </p>
                      <p
                        className={`text-fyn-ink/60 text-xs mt-0.5 transition-all duration-300 ${
                          isUnlocked ? "" : "blur-[5px] select-none"
                        }`}
                        style={{ fontFamily: "'Roboto', sans-serif" }}
                      >
                        {isUnlocked ? r.detail : "•••••• detailed financial impact analysis ••••••"}
                      </p>
                    </div>
                    {!isUnlocked && i === 0 && (
                      <Lock className="w-4 h-4 text-fyn-ink/40 shrink-0 mt-1" />
                    )}
                  </div>
                ))}
              </div>

              {/* Lock overlay CTA */}
              {!isUnlocked && (
                <div className="absolute inset-0 flex items-end justify-center pb-2 pointer-events-none">
                  <button
                    onClick={() => setModalOpen(true)}
                    className="pointer-events-auto inline-flex items-center gap-2 bg-fyn-ink text-white text-sm font-medium px-5 py-2.5 rounded-full shadow-lg hover:bg-fyn-red transition-colors"
                    style={{ fontFamily: "'Raleway', sans-serif" }}
                  >
                    <Lock className="w-3.5 h-3.5" /> Unlock Full Analysis
                  </button>
                </div>
              )}

              {/* Post-unlock actions */}
              {isUnlocked && (
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-fyn-ink/10">
                  <button
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-fyn-ink/15 text-fyn-ink text-sm hover:bg-fyn-ink/5 transition-colors"
                    style={{ fontFamily: "'Raleway', sans-serif" }}
                    onClick={() => window.print()}
                  >
                    <Download className="w-4 h-4" /> Download PDF Report
                  </button>
                  <Link
                    to="/waitlist"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-fyn-red text-white text-sm hover:bg-fyn-red/90 transition-colors"
                    style={{ fontFamily: "'Raleway', sans-serif" }}
                  >
                    Try with Your Real Data <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Security & Trust nav button */}
        <div className="flex justify-center mt-12">
          <button
            onClick={() => {
              document.getElementById("security")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="inline-flex items-center gap-2 rounded-lg transition-colors hover:bg-fyn-red/10"
            style={{
              background: "hsl(var(--card))",
              border: "1.5px solid hsl(var(--primary))",
              color: "hsl(var(--primary))",
              padding: "12px 24px",
              fontFamily: "Inter, sans-serif",
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            <Shield className="w-4 h-4" strokeWidth={2} />
            Security &amp; Trust
          </button>
        </div>
      </div>

      <SignupGateModal
        open={modalOpen}
        scenarioName={scenario.name}
        onClose={() => setModalOpen(false)}
        onUnlocked={() => setUnlocked((u) => ({ ...u, [scenario.id]: true }))}
      />
    </section>
  );
}
